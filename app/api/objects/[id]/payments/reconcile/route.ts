import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const schema=z.object({paymentId:z.string().uuid(),kind:z.enum(["payment","advance"]),status:z.enum(["confirmed","conflict"])});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"finance.worker_accrual.edit");const {id}=await params;const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({ok:true,demo:true});
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds"
        FROM objects o WHERE o.id=${id}::uuid
      `;
      if(!scope||!canReadRow(actor.access,"finance.worker_accrual.edit",scope,actor))throw new AccessDeniedError("finance.worker_accrual.edit");
      const rows=body.kind==="payment"
        ?await tx<Array<{id:string}>>`UPDATE worker_payments SET reconciliation_status=${body.status},updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${body.paymentId}::uuid AND object_id=${id}::uuid RETURNING id`
        :await tx<Array<{id:string}>>`UPDATE advance_payments SET reconciliation_status=${body.status} WHERE id=${body.paymentId}::uuid AND object_id=${id}::uuid RETURNING id`;
      if(!rows.length)throw new Error("Выплата не найдена");
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,'payment_reconciled','Обновлена сверка выплаты',${tx.json(body)})`;
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте выплату",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сверить выплату"},{status:500});
  }
}
