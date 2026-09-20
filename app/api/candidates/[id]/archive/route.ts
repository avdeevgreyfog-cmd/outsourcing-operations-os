import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({archived:z.boolean()});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.candidate.edit");
    if(actor.demo)return NextResponse.json({error:"В GitHub Demo архив сохраняется локально"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{id:string;organizationId:string;ownerUserId:string|null;regionId:string|null;objectId:string|null;clientId:string|null;assigneeUserIds:string[];activeApplications:number;workerId:string|null}>>\`
        SELECT c.id,c.organization_id "organizationId",COALESCE(ca.owner_user_id,c.current_recruiter_user_id) "ownerUserId",
          COALESCE(n.region_id,o.region_id) "regionId",ca.object_id "objectId",o.client_company_id "clientId",
          ARRAY_REMOVE(ARRAY[c.current_recruiter_user_id::text,c.original_recruiter_user_id::text,ca.owner_user_id::text,ca.manager_user_id::text],NULL) "assigneeUserIds",
          (SELECT count(*)::int FROM candidate_applications x WHERE x.candidate_id=c.id AND x.stage NOT IN ('rejected','no_show','reserve')) "activeApplications",
          wp.id "workerId"
        FROM candidates c
        LEFT JOIN LATERAL (SELECT x.* FROM candidate_applications x WHERE x.candidate_id=c.id ORDER BY x.updated_at DESC LIMIT 1) ca ON true
        LEFT JOIN needs n ON n.id=ca.need_id LEFT JOIN objects o ON o.id=ca.object_id
        LEFT JOIN worker_profiles wp ON wp.origin_candidate_id=c.id
        WHERE c.id=\${id}::uuid
      \`;
      if(!scope||!canReadRow(actor.access,"recruiting.candidate.edit",scope,actor))throw new AccessDeniedError("recruiting.candidate.edit");
      if(body.archived&&scope.activeApplications>0)throw new Error("Сначала завершите активные заявки кандидата");
      if(body.archived&&scope.workerId)throw new Error("Карточку действующего сотрудника нельзя отправить в архив кандидатов");
      await tx\`UPDATE candidates SET archived_at=\${body.archived?new Date().toISOString():null}::timestamptz,updated_at=now() WHERE id=\${id}::uuid\`;
      await tx\`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(\${actor.organizationId}::uuid,\${actor.userId}::uuid,'candidate',\${id}::uuid,\${body.archived?"archived":"restored"},
          \${body.archived?"Кандидат перенесён в архив":"Кандидат восстановлен из архива"},'{}'::jsonb)
      \`;
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректное действие"},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось изменить архивное состояние"},{status:500});
  }
}
