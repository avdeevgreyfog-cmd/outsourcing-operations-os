import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError,requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const rowSchema=z.object({
  workerId:z.string().uuid(),amount:z.number().positive().max(10000000),paymentDate:z.string().date(),reference:z.string().trim().max(500).nullable().optional(),
});
const schema=z.object({
  rows:z.array(rowSchema).min(1).max(200),
  paymentKind:z.enum(["salary","advance","other"]).default("salary"),
  paymentMethod:z.enum(["transfer","cash","other"]).nullable().optional(),
});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"finance.object_payment.record");const {id}=await params;const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({ok:true,count:body.rows.length,demo:true});
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [object]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${id}::uuid
      `;
      if(!object||!canReadRow(actor.access,"finance.object_payment.record",object,actor))throw new AccessDeniedError("finance.object_payment.record");
      let count=0;
      for(const row of body.rows){
        const [worker]=await tx<Array<{id:string}>>`
          SELECT w.id FROM worker_profiles w WHERE w.id=${row.workerId}::uuid AND EXISTS(
            SELECT 1 FROM worker_object_assignments a WHERE a.worker_id=w.id AND a.object_id=${id}::uuid
          ) LIMIT 1
        `;
        if(!worker)throw new Error("Один из сотрудников не относится к этому объекту");
        if(body.paymentKind==="salary"){
          const [accrual]=await tx<Array<{id:string}>>`
            SELECT id FROM worker_accruals WHERE worker_id=${row.workerId}::uuid AND object_id=${id}::uuid AND status IN ('approved','closed')
            ORDER BY period_end DESC,created_at DESC LIMIT 1
          `;
          await tx`
            INSERT INTO worker_payments(organization_id,worker_id,object_id,accrual_id,amount,payment_date,status,reference,record_source,reconciliation_status,payment_method,created_by_user_id,updated_by_user_id)
            VALUES(${actor.organizationId}::uuid,${row.workerId}::uuid,${id}::uuid,${accrual?.id??null}::uuid,${row.amount},${row.paymentDate}::date,'paid',${row.reference??null},'object_manager','unreconciled',${body.paymentMethod??null},${actor.userId}::uuid,${actor.userId}::uuid)
          `;
        }else{
          await tx`
            INSERT INTO advance_payments(organization_id,worker_id,object_id,amount,payment_date,status,reference,payment_purpose,record_source,reconciliation_status,payment_method,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${row.workerId}::uuid,${id}::uuid,${row.amount},${row.paymentDate}::date,'paid',${row.reference??null},${body.paymentKind==="advance"?"advance":"other"},'object_manager','unreconciled',${body.paymentMethod??null},${actor.userId}::uuid)
          `;
        }
        count++;
      }
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,'worker_payments_recorded',${`Внесены выплаты сотрудникам: ${count}`},${tx.json({count,paymentKind:body.paymentKind,paymentMethod:body.paymentMethod??null})})`;
      return {ok:true,count};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте выплаты",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить выплаты"},{status:500});
  }
}