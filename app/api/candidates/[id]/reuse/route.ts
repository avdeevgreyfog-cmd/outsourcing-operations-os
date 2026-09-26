import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("apply"),needId:z.string().uuid()}),
  z.object({action:z.literal("archive")}),
]);

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"recruiting.candidate.edit");
    if(actor.demo)return NextResponse.json({ok:true,demo:true});
    const {id}=await params;
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [candidate]=await tx<Array<{id:string;status:string;currentRecruiterUserId:string|null;originalRecruiterUserId:string|null;activeApplications:number}>>`
        SELECT c.id,c.status,c.current_recruiter_user_id "currentRecruiterUserId",c.original_recruiter_user_id "originalRecruiterUserId",
          (SELECT count(*)::int FROM candidate_applications ca WHERE ca.candidate_id=c.id AND ca.stage IN ('new','interview','documents','clearance','preparation','first_shift','retention_7','reserve')) "activeApplications"
        FROM candidates c WHERE c.id=${id}::uuid FOR UPDATE
      `;
      if(!candidate)throw new Error("Кандидат не найден");
      const candidateScope={organizationId:actor.organizationId,ownerUserId:candidate.currentRecruiterUserId??candidate.originalRecruiterUserId??undefined,assigneeUserIds:[candidate.currentRecruiterUserId,candidate.originalRecruiterUserId].filter((value):value is string=>Boolean(value))};
      if(!canReadRow(actor.access,"recruiting.candidate.edit",candidateScope,actor))throw new AccessDeniedError("recruiting.candidate.edit");

      if(body.action==="archive"){
        if(candidate.activeApplications>0)throw new Error("У кандидата есть активный подбор. Сначала завершите текущую заявку.");
        await tx`UPDATE candidates SET status='completed',current_recruiter_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${id}::uuid`;
        await tx`
          INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate',${id}::uuid,'repeat_recruiting_archived','Кандидат отправлен в архив после повторного подбора','{}'::jsonb)
        `;
        return {status:"archived"};
      }

      const [need]=await tx<Array<{id:string;objectId:string;ownerUserId:string|null;managerUserId:string|null;regionId:string|null;clientId:string|null;conditions:Record<string,unknown>;assigneeUserIds:string[]}>>`
        SELECT n.id,n.object_id "objectId",n.owner_user_id "ownerUserId",n.manager_user_id "managerUserId",COALESCE(n.region_id,o.region_id) "regionId",
          o.client_company_id "clientId",n.conditions_snapshot conditions,
          ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=n.id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL) "assigneeUserIds"
        FROM needs n JOIN objects o ON o.id=n.object_id
        WHERE n.id=${body.needId}::uuid AND n.status NOT IN ('cancelled','archived','filled')
      `;
      if(!need)throw new Error("Потребность недоступна или уже закрыта");
      if(!canReadRow(actor.access,"recruiting.candidate.edit",{organizationId:actor.organizationId,objectId:need.objectId,ownerUserId:need.ownerUserId??undefined,regionId:need.regionId??undefined,clientId:need.clientId??undefined,assigneeUserIds:need.assigneeUserIds},actor))throw new AccessDeniedError("recruiting.candidate.edit");
      const [existing]=await tx<Array<{id:string}>>`
        SELECT id FROM candidate_applications
        WHERE candidate_id=${id}::uuid AND need_id=${need.id}::uuid
          AND stage IN ('new','interview','documents','clearance','preparation','first_shift','retention_7','reserve')
        LIMIT 1
      `;
      if(existing)throw new Error("Кандидат уже находится в активном подборе на эту потребность");
      const [application]=await tx<Array<{id:string}>>`
        INSERT INTO candidate_applications(organization_id,candidate_id,need_id,object_id,stage,owner_user_id,manager_user_id,conditions_snapshot,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${need.id}::uuid,${need.objectId}::uuid,'new',${actor.userId}::uuid,${need.managerUserId}::uuid,${tx.json((need.conditions??{}) as never)},${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`
        INSERT INTO candidate_stage_history(organization_id,application_id,from_stage,to_stage,changed_by_user_id,reason)
        VALUES(${actor.organizationId}::uuid,${application.id}::uuid,NULL,'new',${actor.userId}::uuid,'Повторный подбор бывшего сотрудника')
      `;
      await tx`UPDATE candidates SET status='active',current_recruiter_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${id}::uuid`;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate',${id}::uuid,'repeat_recruiting_started','Бывший сотрудник возвращён в подбор',${tx.json({applicationId:application.id,needId:need.id,objectId:need.objectId})})
      `;
      return {status:"applied",applicationId:application.id};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте действие повторного подбора",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось обновить повторный подбор"},{status:500});
  }
}
