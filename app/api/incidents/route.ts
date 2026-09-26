import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const schema=z.object({
  objectId:z.string().uuid(),workerId:z.string().uuid().nullable().optional(),incidentType:z.enum(["discipline","attendance","quality","safety","property","client","other"]),
  severity:z.enum(["normal","medium","high","critical"]).default("normal"),title:z.string().trim().min(2).max(240),description:z.string().trim().min(2).max(4000),
  occurredAt:z.string().datetime(),financialEffectAmount:z.number().min(0).max(10000000).nullable().optional(),
  financialEffectKind:z.enum(["worker_adjustment","company_expense","client_claim"]).nullable().optional(),
  financialEffectBasis:z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});requireCapability(actor,"operations.object.edit");const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({error:"В демо-режиме инциденты доступны только для просмотра"},{status:409});
    const row=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid
      `;
      if(!scope||!canReadRow(actor.access,"operations.object.edit",scope,actor))throw new AccessDeniedError("operations.object.edit");
      if(body.workerId){const [worker]=await tx`SELECT 1 FROM worker_profiles w JOIN worker_object_assignments a ON a.worker_id=w.id WHERE w.id=${body.workerId}::uuid AND a.object_id=${body.objectId}::uuid ORDER BY a.effective_from DESC LIMIT 1`;if(!worker)throw new Error("Сотрудник не относится к этому объекту");}
      const financialStatus=Number(body.financialEffectAmount??0)>0?"proposed":"none";
      const financialKind=Number(body.financialEffectAmount??0)>0?(body.financialEffectKind??"worker_adjustment"):null;
      const [created]=await tx<Array<{id:string}>>`
        INSERT INTO incidents(organization_id,object_id,worker_id,incident_type,severity,status,title,description,occurred_at,responsible_user_id,financial_effect_amount,financial_effect_status,financial_effect_kind,financial_effect_basis,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.objectId}::uuid,${body.workerId??null}::uuid,${body.incidentType},${body.severity},'open',${body.title},${body.description},${body.occurredAt}::timestamptz,${actor.userId}::uuid,${body.financialEffectAmount??null},${financialStatus},${financialKind},${body.financialEffectBasis??null},${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${body.objectId}::uuid,'incident_created',${`Зафиксирован инцидент: ${body.title}`},${tx.json({incidentId:created.id,workerId:body.workerId??null,financialEffectAmount:body.financialEffectAmount??null})})`;
      return created;
    }));
    return NextResponse.json(row,{status:201});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные инцидента",issues:error.issues},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать инцидент"},{status:500});}
}