import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";

const schema=z.object({defaultDailyPaymentShifts:z.number().int().min(0).max(31),applyToActive:z.boolean().default(false)});

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"finance.object_payment.record");const {id}=await params;const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({ok:true,demo:true});
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds"
        FROM objects o WHERE o.id=${id}::uuid
      `;
      if(!scope||!canReadRow(actor.access,"finance.object_payment.record",scope,actor))throw new AccessDeniedError("finance.object_payment.record");
      await tx`UPDATE objects SET default_daily_payment_shifts=${body.defaultDailyPaymentShifts},updated_at=now() WHERE id=${id}::uuid`;
      let updated=0;
      if(body.applyToActive){
        const rows=await tx<Array<{id:string}>>`
          UPDATE worker_object_assignments SET daily_payment_shifts=${body.defaultDailyPaymentShifts}
          WHERE object_id=${id}::uuid AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
          RETURNING id
        `;updated=rows.length;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,'daily_payment_policy_updated',
          ${`Схема ежедневных выплат: первые ${body.defaultDailyPaymentShifts} смен`},
          ${tx.json({defaultDailyPaymentShifts:body.defaultDailyPaymentShifts,applyToActive:body.applyToActive,updatedAssignments:updated})})
      `;
      return {ok:true,updatedAssignments:updated};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте схему выплат",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить схему выплат"},{status:500});
  }
}
