import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import type { Actor } from "@/lib/access/types";
import type { Sql } from "postgres";

const createSchema=z.object({
  operationType:z.enum(["employee_trip","hired_transport"]),
  objectId:z.string().uuid().nullable().optional(),
  workerId:z.string().uuid().nullable().optional(),
  partnerId:z.string().uuid().nullable().optional(),
  transportKind:z.enum(["train","plane","bus","taxi","transfer","shuttle","cargo","other"]),
  routeFrom:z.string().trim().max(240).nullable().optional(),
  routeTo:z.string().trim().max(240).nullable().optional(),
  departureAt:z.string().datetime().nullable().optional(),
  arrivalAt:z.string().datetime().nullable().optional(),
  scheduleText:z.string().trim().max(500).nullable().optional(),
  capacity:z.number().int().positive().nullable().optional(),
  paymentModel:z.enum(["ticket","ride","day","month","service","reimbursement"]).nullable().optional(),
  amount:z.number().min(0).nullable().optional(),
  paymentDue:z.string().date().nullable().optional(),
  prepaidUntil:z.string().date().nullable().optional(),
  notes:z.string().trim().max(1500).nullable().optional(),
});
const patchSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("status"),id:z.string().uuid(),status:z.enum(["booked","in_transit","completed","cancelled"])}),
  z.object({action:z.literal("record_payment"),id:z.string().uuid(),amount:z.number().positive(),paymentDate:z.string().date(),prepaidUntil:z.string().date().nullable().optional(),reference:z.string().trim().max(240).nullable().optional()}),
]);

async function objectScope(tx:Sql,actor:Actor,objectId:string){
  const [row]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
    SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
      ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
    FROM objects o WHERE o.id=${objectId}::uuid
  `;
  if(!row||!canReadRow(actor.access,"supply.transport.manage",row,actor))throw new AccessDeniedError("supply.transport.manage");
  return row;
}

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.transport.manage");if(actor.demo)return NextResponse.json({ok:true},{status:201});
    const body=createSchema.parse(await request.json());
    if(body.operationType==="employee_trip"&&!body.workerId)return NextResponse.json({error:"Для поездки сотрудника укажите сотрудника"},{status:400});
    if(body.operationType==="hired_transport"&&!body.objectId)return NextResponse.json({error:"Для заказного транспорта укажите объект"},{status:400});
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      let effectiveObjectId=body.objectId??null;
      let ownerUserId=actor.userId;
      if(body.objectId){
        const scope=await objectScope(tx,actor,body.objectId);ownerUserId=scope.ownerUserId??actor.userId;
      }
      if(body.workerId){
        const [worker]=await tx`
          SELECT w.organization_id "organizationId",a.object_id "objectId",COALESCE(a.manager_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
            ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
          FROM worker_profiles w
          LEFT JOIN LATERAL (
            SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id
            ORDER BY (x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) DESC,x.effective_from DESC LIMIT 1
          ) a ON true
          LEFT JOIN objects o ON o.id=a.object_id
          WHERE w.id=${body.workerId}::uuid
        `;
        if(!worker||!canReadRow(actor.access,"supply.transport.manage",{...worker,objectId:worker.objectId??undefined,ownerUserId:worker.ownerUserId??undefined,regionId:worker.regionId??undefined},actor))throw new AccessDeniedError("supply.transport.manage");
        if(!effectiveObjectId)effectiveObjectId=worker.objectId??null;
        ownerUserId=worker.ownerUserId??ownerUserId;
      }
      const [row]=await tx`
        INSERT INTO transport_operations(organization_id,operation_type,object_id,worker_id,partner_id,owner_user_id,transport_kind,route_from,route_to,departure_at,arrival_at,schedule_text,capacity,payment_model,amount,payment_due,prepaid_until,status,notes,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.operationType},${effectiveObjectId}::uuid,${body.workerId??null}::uuid,${body.partnerId??null}::uuid,${ownerUserId}::uuid,
          ${body.transportKind},${body.routeFrom??null},${body.routeTo??null},${body.departureAt??null}::timestamptz,${body.arrivalAt??null}::timestamptz,
          ${body.scheduleText??null},${body.capacity??null},${body.paymentModel??null},${body.amount??null},${body.paymentDue??null}::date,${body.prepaidUntil??null}::date,'planned',${body.notes??null},${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'transport_operation',${row.id}::uuid,'created','Создана транспортная операция',${tx.json({operationType:body.operationType,objectId:effectiveObjectId,workerId:body.workerId??null})})
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные транспорта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить транспорт"},{status:500});
  }
}

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.transport.manage");if(actor.demo)return NextResponse.json({ok:true});
    const body=patchSchema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [row]=await tx`
        SELECT t.id,t.status,t.object_id "objectId",t.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=t.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds",
          t.partner_id "partnerId",sp.name partner,t.notes
        FROM transport_operations t
        LEFT JOIN objects o ON o.id=t.object_id
        LEFT JOIN supply_partners sp ON sp.id=t.partner_id
        WHERE t.id=${body.id}::uuid FOR UPDATE OF t
      `;
      if(!row||!canReadRow(actor.access,"supply.transport.manage",{organizationId:actor.organizationId,...row,objectId:row.objectId??undefined,regionId:row.regionId??undefined},actor))throw new AccessDeniedError("supply.transport.manage");
      if(body.action==="status"){
        await tx`UPDATE transport_operations SET status=${body.status},updated_at=now() WHERE id=${row.id}::uuid`;
        return {id:row.id,status:body.status};
      }
      if(!row.objectId)throw new Error("Для фиксации расхода транспорт должен быть связан с объектом");
      const [expense]=await tx`
        INSERT INTO object_expenses(organization_id,object_id,expense_date,category,amount,vendor,reference,plan_fact,transport_operation_id,supply_partner_id,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${row.objectId}::uuid,${body.paymentDate}::date,'transport',${body.amount},${row.partner??null},${body.reference??"Транспорт"},'fact',${row.id}::uuid,${row.partnerId??null}::uuid,${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`UPDATE transport_operations SET prepaid_until=COALESCE(${body.prepaidUntil??null}::date,prepaid_until),updated_at=now() WHERE id=${row.id}::uuid`;
      return {id:row.id,expenseId:expense.id};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте действие",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось изменить транспорт"},{status:500});
  }
}
