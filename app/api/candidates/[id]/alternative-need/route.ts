import { NextResponse } from "next/server";
import type { JSONValue } from "postgres";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  applicationId:z.string().uuid(),
  needId:z.string().uuid(),
  comment:z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.candidate.edit");
    if(actor.demo)return NextResponse.json({error:"В GitHub Demo альтернативная вакансия сохраняется локально"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [current]=await tx<Array<{id:string;candidateId:string;needId:string;stage:string;ownerUserId:string|null;objectId:string|null;regionId:string|null;clientId:string|null;assigneeUserIds:string[];sourceSnapshot:JSONValue|null}>>`
        SELECT ca.id,ca.candidate_id "candidateId",ca.need_id "needId",ca.stage,ca.owner_user_id "ownerUserId",ca.object_id "objectId",
          COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
          ARRAY[ca.owner_user_id::text,ca.manager_user_id::text]
            || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL) "assigneeUserIds",
          ca.source_snapshot "sourceSnapshot"
        FROM candidate_applications ca JOIN needs n ON n.id=ca.need_id LEFT JOIN objects o ON o.id=ca.object_id
        WHERE ca.id=${body.applicationId}::uuid AND ca.candidate_id=${id}::uuid
        FOR UPDATE OF ca
      `;
      if(!current||!canReadRow(actor.access,"recruiting.candidate.edit",current,actor))throw new AccessDeniedError("recruiting.candidate.edit");
      if(current.needId===body.needId)throw new Error("Выберите другую потребность");
      const [target]=await tx<Array<{id:string;objectId:string|null;regionId:string|null;clientId:string|null;ownerUserId:string|null;managerUserId:string|null;conditions:JSONValue;assigneeUserIds:string[]}>>`
        SELECT n.id,n.object_id "objectId",COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
          n.owner_user_id "ownerUserId",n.manager_user_id "managerUserId",n.conditions_snapshot conditions,
          ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=n.id AND na.unassigned_at IS NULL)
            || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=n.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
        FROM needs n LEFT JOIN objects o ON o.id=n.object_id
        WHERE n.id=${body.needId}::uuid AND n.status IN ('open','in_progress')
      `;
      if(!target||!canReadRow(actor.access,"recruiting.candidate.edit",target,actor))throw new AccessDeniedError("recruiting.candidate.edit");
      const [duplicate]=await tx<Array<{id:string}>>`SELECT id FROM candidate_applications WHERE candidate_id=${id}::uuid AND need_id=${body.needId}::uuid`;
      if(duplicate)throw new Error("У кандидата уже есть заявка на эту потребность");

      await tx`
        INSERT INTO candidate_stage_history(organization_id,application_id,from_stage,to_stage,reason,reason_code,changed_by_user_id)
        VALUES(${actor.organizationId}::uuid,${current.id}::uuid,${current.stage},'rejected',${body.comment??"Переведён на другую вакансию"},'alternative_need',${actor.userId}::uuid)
      `;
      await tx`
        UPDATE candidate_applications SET stage='rejected',rejection_reason_code='alternative_need',
          rejection_reason=${body.comment??"Переведён на другую вакансию"},next_action_at=NULL,updated_at=now()
        WHERE id=${current.id}::uuid
      `;

      const [created]=await tx<Array<{id:string}>>`
        INSERT INTO candidate_applications(organization_id,candidate_id,need_id,object_id,stage,next_action_at,owner_user_id,manager_user_id,
          conditions_snapshot,source_snapshot,workflow_details,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${target.id}::uuid,${target.objectId}::uuid,'interview',now(),
          ${target.ownerUserId??actor.userId}::uuid,${target.managerUserId}::uuid,${sql.json(target.conditions)},${sql.json(current.sourceSnapshot??{})},
          ${sql.json({actionCode:"alternative_offer",outcomeCode:"needs_discussion",nextActionText:"Обсудить альтернативную вакансию"})},${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`
        INSERT INTO candidate_stage_history(organization_id,application_id,from_stage,to_stage,reason,changed_by_user_id)
        VALUES(${actor.organizationId}::uuid,${created.id}::uuid,NULL,'interview','Создана заявка на альтернативную вакансию',${actor.userId}::uuid)
      `;
      await tx`
        INSERT INTO candidate_action_events(organization_id,application_id,stage,action_code,outcome_code,comment,next_action_at,performed_by_user_id,metadata)
        VALUES(${actor.organizationId}::uuid,${created.id}::uuid,'interview','alternative_offer','needs_discussion',${body.comment??null},now(),${actor.userId}::uuid,
          ${sql.json({fromApplicationId:current.id,fromNeedId:current.needId,toNeedId:target.id})})
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate',${id}::uuid,'alternative_need',
          'Кандидат переведён на альтернативную вакансию',${sql.json({fromApplicationId:current.id,toApplicationId:created.id,fromNeedId:current.needId,toNeedId:target.id})})
      `;
      return {applicationId:created.id,needId:target.id};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте выбранную потребность",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось предложить другую вакансию"},{status:500});
  }
}
