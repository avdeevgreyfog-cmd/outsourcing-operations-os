import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import type { Sql } from "postgres";

const createSchema=z.object({
  workerId:z.string().uuid(),
  siteId:z.string().uuid(),
  unitId:z.string().uuid().nullable().optional(),
  bedLabel:z.string().trim().max(80).nullable().optional(),
  checkIn:z.string().date(),
  plannedCheckOut:z.string().date().nullable().optional(),
});
const patchSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("plan_checkout"),id:z.string().uuid(),plannedCheckOut:z.string().date(),note:z.string().trim().max(1000).nullable().optional()}),
  z.object({action:z.literal("confirm_checkin"),id:z.string().uuid(),actualCheckIn:z.string().date()}),
  z.object({action:z.literal("confirm_checkout"),id:z.string().uuid(),actualCheckOut:z.string().date(),note:z.string().trim().max(1000).nullable().optional()}),
  z.object({action:z.literal("cancel"),id:z.string().uuid(),note:z.string().trim().max(1000).nullable().optional()}),
]);

async function getStayScope(tx:Sql,id:string){
  const [row]=await tx`
    SELECT st.id,st.organization_id "organizationId",st.worker_id "workerId",st.site_id "siteId",st.object_id "objectId",
      COALESCE(o.owner_user_id,hs.responsible_user_id) "ownerUserId",o.region_id "regionId",
      ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=st.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
      || CASE WHEN hs.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[hs.responsible_user_id::text] END "assigneeUserIds",
      st.status,st.check_in "checkIn",st.planned_check_out "plannedCheckOut",st.actual_check_in "actualCheckIn",st.actual_check_out "actualCheckOut"
    FROM housing_stays st
    JOIN housing_sites hs ON hs.id=st.site_id
    LEFT JOIN objects o ON o.id=st.object_id
    WHERE st.id=${id}::uuid
    FOR UPDATE OF st
  `;
  return row as {id:string;organizationId:string;workerId:string;siteId:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];status:string;checkIn:string;plannedCheckOut:string|null;actualCheckIn:string|null;actualCheckOut:string|null}|undefined;
}

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.housing.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const body=createSchema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [worker]=await tx<Array<{id:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT w.id,a.object_id "objectId",COALESCE(a.manager_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM worker_profiles w
        LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments wa WHERE wa.worker_id=w.id AND wa.effective_from<=current_date AND (wa.effective_to IS NULL OR wa.effective_to>=current_date) ORDER BY wa.effective_from DESC LIMIT 1) a ON true
        LEFT JOIN objects o ON o.id=a.object_id
        WHERE w.id=${body.workerId}::uuid
      `;
      if(!worker||!worker.objectId||!canReadRow(actor.access,"supply.housing.manage",{organizationId:actor.organizationId,objectId:worker.objectId,ownerUserId:worker.ownerUserId,regionId:worker.regionId,assigneeUserIds:worker.assigneeUserIds},actor))throw new AccessDeniedError("supply.housing.manage");

      const [site]=await tx<Array<{id:string;organizationId:string;capacity:number;bookedCapacity:number|null;objectIds:string[]}>>`
        SELECT hs.id,hs.organization_id "organizationId",
          COALESCE((SELECT sum(hu.capacity)::int FROM housing_units hu WHERE hu.site_id=hs.id AND hu.active),0)::int capacity,
          (SELECT hc.booked_capacity FROM housing_contracts hc WHERE hc.site_id=hs.id AND hc.active ORDER BY hc.valid_from DESC,hc.created_at DESC LIMIT 1) "bookedCapacity",
          ARRAY(SELECT hso.object_id::text FROM housing_site_objects hso WHERE hso.site_id=hs.id AND hso.active) "objectIds"
        FROM housing_sites hs WHERE hs.id=${body.siteId}::uuid AND hs.active
      `;
      if(!site)throw new Error("Место проживания не найдено");
      if(!site.objectIds.includes(worker.objectId))throw new Error("Жильё не связано с текущим объектом сотрудника");

      let unitCapacity:number|null=null;
      if(body.unitId){
        const [unit]=await tx<Array<{id:string;capacity:number}>>`SELECT id,capacity FROM housing_units WHERE id=${body.unitId}::uuid AND site_id=${body.siteId}::uuid AND active`;
        if(!unit)throw new Error("Комната или блок не найдены в выбранном жилье");
        unitCapacity=unit.capacity;
      }
      const end=body.plannedCheckOut??null;
      const [occupancy]=await tx<Array<{siteCount:number;unitCount:number}>>`
        SELECT
          count(*) FILTER (WHERE st.site_id=${body.siteId}::uuid)::int "siteCount",
          count(*) FILTER (WHERE ${body.unitId??null}::uuid IS NOT NULL AND st.unit_id=${body.unitId??null}::uuid)::int "unitCount"
        FROM housing_stays st
        WHERE st.status IN ('planned','active')
          AND st.check_in<=COALESCE(${end}::date,'infinity'::date)
          AND COALESCE(st.planned_check_out,st.actual_check_out,'infinity'::date)>=${body.checkIn}::date
      `;
      const siteLimit=Math.min(site.capacity,site.bookedCapacity??site.capacity);
      if((occupancy?.siteCount??0)>=siteLimit)throw new Error("В забронированной квоте жилья нет свободных мест на этот период");
      if(unitCapacity!=null&&(occupancy?.unitCount??0)>=unitCapacity)throw new Error("В выбранной комнате нет свободных мест на этот период");
      const [active]=await tx<Array<{id:string}>>`SELECT id FROM housing_stays WHERE worker_id=${body.workerId}::uuid AND status IN ('planned','active') LIMIT 1`;
      if(active)throw new Error("У сотрудника уже есть активное или плановое заселение");

      const [stay]=await tx<Array<{id:string}>>`
        INSERT INTO housing_stays(organization_id,worker_id,object_id,site_id,unit_id,bed_label,check_in,check_out,planned_check_out,actual_check_in,status,created_by_user_id,updated_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.workerId}::uuid,${worker.objectId}::uuid,${body.siteId}::uuid,${body.unitId??null}::uuid,${body.bedLabel??null},
          ${body.checkIn}::date,${body.plannedCheckOut??null}::date,${body.plannedCheckOut??null}::date,
          CASE WHEN ${body.checkIn}::date<=current_date THEN ${body.checkIn}::date ELSE NULL END,
          CASE WHEN ${body.checkIn}::date<=current_date THEN 'active' ELSE 'planned' END,${actor.userId}::uuid,${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_stay',${stay.id}::uuid,'created','Создано заселение сотрудника',${tx.json({siteId:body.siteId,workerId:body.workerId,checkIn:body.checkIn,plannedCheckOut:body.plannedCheckOut??null})})
      `;
      return stay;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные заселения",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось заселить сотрудника"},{status:500});
  }
}

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.housing.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const body=patchSchema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const stay=await getStayScope(tx,body.id);
      if(!stay||!canReadRow(actor.access,"supply.housing.manage",{organizationId:stay.organizationId,objectId:stay.objectId??undefined,ownerUserId:stay.ownerUserId??undefined,regionId:stay.regionId??undefined,assigneeUserIds:stay.assigneeUserIds},actor))throw new AccessDeniedError("supply.housing.manage");
      if(body.action==="plan_checkout"){
        await tx`UPDATE housing_stays SET planned_check_out=${body.plannedCheckOut}::date,check_out=${body.plannedCheckOut}::date,checkout_note=${body.note??null},updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${stay.id}::uuid`;
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_stay',${stay.id}::uuid,'checkout_planned',${"Запланировано выселение: "+body.plannedCheckOut},${tx.json({siteId:stay.siteId,workerId:stay.workerId,plannedCheckOut:body.plannedCheckOut})})`;
        return {id:stay.id,status:stay.status};
      }
      if(body.action==="confirm_checkin"){
        if(stay.status==="cancelled"||stay.status==="completed")throw new Error("Заселение уже закрыто");
        await tx`UPDATE housing_stays SET actual_check_in=${body.actualCheckIn}::date,status='active',updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${stay.id}::uuid`;
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_stay',${stay.id}::uuid,'checkin_confirmed',${"Подтверждено заселение: "+body.actualCheckIn},${tx.json({siteId:stay.siteId,workerId:stay.workerId,actualCheckIn:body.actualCheckIn})})`;
        return {id:stay.id,status:"active"};
      }
      if(body.action==="confirm_checkout"){
        if(stay.status==="cancelled")throw new Error("Заселение отменено");
        await tx`UPDATE housing_stays SET actual_check_out=${body.actualCheckOut}::date,check_out=${body.actualCheckOut}::date,status='completed',checkout_note=${body.note??null},updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${stay.id}::uuid`;
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_stay',${stay.id}::uuid,'checkout_confirmed',${"Подтверждено выселение: "+body.actualCheckOut},${tx.json({siteId:stay.siteId,workerId:stay.workerId,actualCheckOut:body.actualCheckOut})})`;
        return {id:stay.id,status:"completed"};
      }
      await tx`UPDATE housing_stays SET status='cancelled',checkout_note=${body.note??null},updated_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${stay.id}::uuid`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_stay',${stay.id}::uuid,'cancelled','Заселение отменено',${tx.json({siteId:stay.siteId,workerId:stay.workerId})})`;
      return {id:stay.id,status:"cancelled"};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте действие",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось изменить заселение"},{status:500});
  }
}
