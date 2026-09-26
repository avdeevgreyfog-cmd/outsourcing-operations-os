import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const rowSchema=z.object({workerId:z.string().uuid(),workDate:z.string().date(),amount:z.number().positive().max(10000000),paid:z.boolean()});
const schema=z.union([rowSchema,z.object({rows:z.array(rowSchema).min(1).max(200)})]);

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 try{
  const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
  requireCapability(actor,"finance.daily_payment.confirm");
  const {id}=await params;const body=schema.parse(await request.json());
  const rows="rows" in body?body.rows:[body];
  if(actor.demo)return NextResponse.json({ok:true,demo:true,count:rows.length});
  await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
    const [scope]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
      SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds"
      FROM objects o WHERE o.id=${id}::uuid
    `;
    if(!scope||!canReadRow(actor.access,"finance.daily_payment.confirm",scope,actor))throw new AccessDeniedError("finance.daily_payment.confirm");
    for(const item of rows){
      const [assignment]=await tx<Array<{shiftLimit:number;effectiveFrom:string}>>`
        SELECT daily_payment_shifts "shiftLimit",effective_from::text "effectiveFrom"
        FROM worker_object_assignments
        WHERE worker_id=${item.workerId}::uuid AND object_id=${id}::uuid
          AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
        ORDER BY effective_from DESC LIMIT 1
      `;
      if(!assignment||assignment.shiftLimit<=0)throw new Error("Для сотрудника не настроены ежедневные выплаты первых смен");
      const worked=await tx<Array<{workDate:string}>>`
        SELECT te.work_date::text "workDate" FROM time_entries te
        WHERE te.worker_id=${item.workerId}::uuid AND te.object_id=${id}::uuid
          AND te.work_date>=${assignment.effectiveFrom}::date AND te.fact_hours>0
        GROUP BY te.work_date ORDER BY te.work_date LIMIT ${assignment.shiftLimit}
      `;
      if(!worked.some(row=>row.workDate===item.workDate))throw new Error("Одна из дат не входит в первые оплачиваемые смены сотрудника");
      const status=item.paid?"paid":"planned";
      await tx`
        INSERT INTO advance_payments(
          organization_id,worker_id,object_id,amount,payment_date,status,reference,payment_purpose,work_date,
          confirmed_by_user_id,confirmed_at,record_source,reconciliation_status,created_by_user_id
        )
        VALUES(
          ${actor.organizationId}::uuid,${item.workerId}::uuid,${id}::uuid,${item.amount},${item.workDate}::date,${status},
          ${`Ежедневная выплата за ${item.workDate}`},'daily_shift',${item.workDate}::date,
          ${item.paid?actor.userId:null}::uuid,${item.paid?new Date().toISOString():null}::timestamptz,'object_manager',
          ${item.paid?"unreconciled":"confirmed"},${actor.userId}::uuid
        )
        ON CONFLICT (worker_id,object_id,work_date) WHERE payment_purpose='daily_shift' AND work_date IS NOT NULL
        DO UPDATE SET amount=EXCLUDED.amount,status=EXCLUDED.status,confirmed_by_user_id=EXCLUDED.confirmed_by_user_id,
          confirmed_at=EXCLUDED.confirmed_at,reference=EXCLUDED.reference,record_source='object_manager',
          reconciliation_status=CASE WHEN EXCLUDED.status='paid' THEN 'unreconciled' ELSE 'confirmed' END
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${item.workerId}::uuid,'daily_payment_confirmed',
          ${item.paid?'Подтверждена ежедневная выплата':'Снято подтверждение ежедневной выплаты'},
          ${tx.json({objectId:id,workDate:item.workDate,amount:item.amount,paid:item.paid})})
      `;
    }
  }));
  return NextResponse.json({ok:true,count:rows.length});
 }catch(error){
  if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте выплату",issues:error.issues},{status:400});
  if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
  console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить выплату"},{status:500});
 }
}
