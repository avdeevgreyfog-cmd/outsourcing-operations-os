import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError} from "@/lib/access/server";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const schema=z.object({
  status:z.enum(["open","in_progress","resolved","closed"]).optional(),
  resolution:z.string().trim().max(4000).nullable().optional(),
  severity:z.enum(["normal","medium","high","critical"]).optional(),
  financialEffectStatus:z.enum(["proposed","approved","rejected","applied"]).optional(),
});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    const {id}=await params;const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({error:"В демо-режиме инциденты доступны только для просмотра"},{status:409});
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [row]=await tx<Array<{
        objectId:string;organizationId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];
        workerId:string|null;title:string;financialEffectAmount:number|string|null;financialEffectStatus:string;financialEffectKind:string|null;financialEffectBasis:string|null;
      }>>`
        SELECT i.object_id "objectId",i.organization_id "organizationId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds",
          i.worker_id "workerId",i.title,i.financial_effect_amount "financialEffectAmount",i.financial_effect_status "financialEffectStatus",
          i.financial_effect_kind "financialEffectKind",i.financial_effect_basis "financialEffectBasis"
        FROM incidents i JOIN objects o ON o.id=i.object_id WHERE i.id=${id}::uuid FOR UPDATE
      `;
      if(!row)throw new Error("Инцидент не найден");
      const operational=hasCapability(actor.access,"operations.object.edit")&&canReadRow(actor.access,"operations.object.edit",row,actor);
      const finance=hasCapability(actor.access,"finance.worker_accrual.edit")&&canReadRow(actor.access,"finance.worker_accrual.edit",row,actor);
      if(!operational&&!finance)throw new AccessDeniedError("operations.object.edit");
      if(body.financialEffectStatus!==undefined&&!finance)throw new AccessDeniedError("finance.worker_accrual.edit");

      if(body.financialEffectStatus==="applied"){
        if(row.financialEffectStatus!=="approved")throw new Error("Сначала финансовое последствие нужно согласовать");
        const amount=Math.abs(Number(row.financialEffectAmount??0));
        if(!amount)throw new Error("У финансового последствия не указана сумма");
        if(row.financialEffectKind==="worker_adjustment"){
          if(!row.workerId)throw new Error("Для корректировки сотрудника не выбран сотрудник");
          await tx`
            INSERT INTO pay_adjustments(organization_id,worker_id,object_id,adjustment_type,amount,basis,incident_id,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${row.workerId}::uuid,${row.objectId}::uuid,'other',${-amount},
              ${row.financialEffectBasis??("Инцидент: "+row.title)},${id}::uuid,${actor.userId}::uuid)
            ON CONFLICT (organization_id,incident_id) WHERE incident_id IS NOT NULL DO NOTHING
          `;
        }else if(row.financialEffectKind==="company_expense"){
          await tx`
            INSERT INTO object_expenses(organization_id,object_id,expense_date,category,amount,reference,plan_fact,incident_id,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${row.objectId}::uuid,current_date,'incident',${amount},
              ${row.financialEffectBasis??("Инцидент: "+row.title)},'fact',${id}::uuid,${actor.userId}::uuid)
            ON CONFLICT (organization_id,incident_id) WHERE incident_id IS NOT NULL DO NOTHING
          `;
        }else if(row.financialEffectKind==="client_claim"){
          throw new Error("Претензию клиенту можно согласовать здесь, но применять нужно в клиентском финансовом контуре");
        }else throw new Error("Не указан тип финансового последствия");
      }

      await tx`
        UPDATE incidents SET
          status=COALESCE(${body.status??null},status),severity=COALESCE(${body.severity??null},severity),
          resolution=CASE WHEN ${body.resolution===undefined} THEN resolution ELSE ${body.resolution??null} END,
          resolved_at=CASE WHEN ${body.status??null} IN ('resolved','closed') THEN now() WHEN ${body.status??null} IN ('open','in_progress') THEN NULL ELSE resolved_at END,
          financial_effect_status=COALESCE(${body.financialEffectStatus??null},financial_effect_status),updated_at=now()
        WHERE id=${id}::uuid
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${row.objectId}::uuid,'incident_updated','Обновлён инцидент объекта',${tx.json({incidentId:id,...body})})
      `;
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось обновить инцидент"},{status:500});
  }
}
