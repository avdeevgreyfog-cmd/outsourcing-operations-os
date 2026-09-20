import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("plan"),effectiveDate:z.string().date(),reasonCode:z.enum(["employee_request","employer_decision","project_end","transfer_out","no_show","medical","other"]),reason:z.string().trim().max(1200).nullable().optional()}),
  z.object({action:z.literal("complete"),effectiveDate:z.string().date(),reasonCode:z.enum(["employee_request","employer_decision","project_end","transfer_out","no_show","medical","other"]),reason:z.string().trim().max(1200).nullable().optional()}),
  z.object({action:z.literal("cancel"),exitId:z.string().uuid()}),
]);

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.offboarding.manage");if(actor.demo)return NextResponse.json({error:"В демо-режиме завершение работы не сохраняется"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [worker]=await tx<Array<{id:string;fullName:string;objectId:string|null;specialtyId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT w.id,w.full_name "fullName",a.object_id "objectId",a.specialty_id "specialtyId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM worker_profiles w
        LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id AND x.effective_to IS NULL ORDER BY x.effective_from DESC LIMIT 1) a ON true
        LEFT JOIN objects o ON o.id=a.object_id
        WHERE w.id=${id}::uuid FOR UPDATE OF w
      `;
      if(!worker)throw new Error("Сотрудник не найден");
      const scope={organizationId:actor.organizationId,objectId:worker.objectId??undefined,ownerUserId:worker.ownerUserId??undefined,regionId:worker.regionId??undefined,assigneeUserIds:worker.assigneeUserIds};
      if(!canReadRow(actor.access,"worker.offboarding.manage",scope,actor))throw new AccessDeniedError("worker.offboarding.manage");

      if(body.action==="cancel"){
        const [exit]=await tx<Array<{id:string}>>`SELECT id FROM worker_exit_processes WHERE id=${body.exitId}::uuid AND worker_id=${id}::uuid AND status='planned' FOR UPDATE`;
        if(!exit)throw new Error("План завершения работы не найден");
        await tx`UPDATE worker_exit_processes SET status='cancelled',updated_at=now() WHERE id=${exit.id}::uuid`;
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'exit_cancelled','План завершения работы отменён',${tx.json({exitId:exit.id})})`;
        return {status:"cancelled",exitId:exit.id};
      }

      if(body.action==="plan"){
        const [existing]=await tx<Array<{id:string}>>`SELECT id FROM worker_exit_processes WHERE worker_id=${id}::uuid AND status='planned' FOR UPDATE`;
        let exitId:string;
        if(existing){
          exitId=existing.id;
          await tx`UPDATE worker_exit_processes SET effective_date=${body.effectiveDate}::date,reason_code=${body.reasonCode},reason=${body.reason??null},updated_at=now() WHERE id=${exitId}::uuid`;
        }else{
          const [row]=await tx<Array<{id:string}>>`
            INSERT INTO worker_exit_processes(organization_id,worker_id,object_id,effective_date,reason_code,reason,status,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${id}::uuid,${worker.objectId??null}::uuid,${body.effectiveDate}::date,${body.reasonCode},${body.reason??null},'planned',${actor.userId}::uuid)
            RETURNING id
          `;exitId=row.id;
        }
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'exit_planned',${"Запланировано завершение работы: "+body.effectiveDate},${tx.json({exitId,reasonCode:body.reasonCode})})`;
        return {status:"planned",exitId};
      }

      const [dateCheck]=await tx<Array<{future:boolean}>>`SELECT ${body.effectiveDate}::date>current_date future`;
      if(dateCheck?.future)throw new Error("Будущую дату сначала сохраните как план завершения работы");

      const outstanding=await tx<Array<{item:string;variant:string;quantity:number|string;unit:string}>>`
        SELECT i.name item,m.variant,
          sum(CASE WHEN m.movement_type='issue' THEN m.quantity
                   WHEN m.movement_type='return' THEN -m.quantity
                   WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity
                   ELSE 0 END)::numeric quantity,i.unit
        FROM inventory_movements m JOIN inventory_items i ON i.id=m.item_id
        WHERE m.worker_id=${id}::uuid AND i.returnable
        GROUP BY i.id,i.name,i.unit,m.variant
        HAVING sum(CASE WHEN m.movement_type='issue' THEN m.quantity
                        WHEN m.movement_type='return' THEN -m.quantity
                        WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity
                        ELSE 0 END)>0
      `;
      if(outstanding.length)throw new Error("Нельзя завершить работу: не закрыто имущество — "+outstanding.map(row=>row.item+(row.variant?" "+row.variant:"")+" × "+Number(row.quantity)+" "+row.unit).join(", "));

      const [planned]=await tx<Array<{id:string}>>`SELECT id FROM worker_exit_processes WHERE worker_id=${id}::uuid AND status='planned' FOR UPDATE`;
      let exitId:string;
      if(planned){
        exitId=planned.id;
        await tx`UPDATE worker_exit_processes SET effective_date=${body.effectiveDate}::date,reason_code=${body.reasonCode},reason=${body.reason??null},status='completed',completed_by_user_id=${actor.userId}::uuid,completed_at=now(),updated_at=now() WHERE id=${exitId}::uuid`;
      }else{
        const [exit]=await tx<Array<{id:string}>>`
          INSERT INTO worker_exit_processes(organization_id,worker_id,object_id,effective_date,reason_code,reason,status,created_by_user_id,completed_by_user_id,completed_at)
          VALUES(${actor.organizationId}::uuid,${id}::uuid,${worker.objectId??null}::uuid,${body.effectiveDate}::date,${body.reasonCode},${body.reason??null},'completed',${actor.userId}::uuid,${actor.userId}::uuid,now())
          RETURNING id
        `;exitId=exit.id;
      }

      await tx`UPDATE worker_object_assignments SET effective_to=${body.effectiveDate}::date WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from<=${body.effectiveDate}::date`;
      await tx`DELETE FROM worker_object_assignments WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from>${body.effectiveDate}::date`;
      await tx`UPDATE employment_relations SET effective_to=${body.effectiveDate}::date WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from<=${body.effectiveDate}::date`;
      await tx`DELETE FROM employment_relations WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from>${body.effectiveDate}::date`;
      await tx`UPDATE worker_rates SET effective_to=${body.effectiveDate}::date WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from<=${body.effectiveDate}::date`;
      await tx`DELETE FROM worker_rates WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from>${body.effectiveDate}::date`;
      await tx`UPDATE object_crew_members SET effective_to=${body.effectiveDate}::date WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from<=${body.effectiveDate}::date`;
      await tx`DELETE FROM object_crew_members WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from>${body.effectiveDate}::date`;

      await tx`
        UPDATE worker_absence_plans SET
          status=CASE WHEN planned_from>${body.effectiveDate}::date THEN 'cancelled' ELSE 'completed' END,
          actual_to=CASE WHEN planned_from<=${body.effectiveDate}::date THEN ${body.effectiveDate}::date ELSE actual_to END,
          updated_by_user_id=${actor.userId}::uuid,updated_at=now()
        WHERE worker_id=${id}::uuid AND status IN ('tentative','confirmed')
      `;
      await tx`
        UPDATE housing_stays SET
          check_out=CASE WHEN check_in<=${body.effectiveDate}::date THEN ${body.effectiveDate}::date ELSE check_out END,
          status=CASE WHEN check_in>${body.effectiveDate}::date THEN 'cancelled' ELSE 'completed' END,
          updated_at=now()
        WHERE worker_id=${id}::uuid AND status IN ('planned','active')
      `;

      const futureShiftIds=await tx<Array<{id:string}>>`
        SELECT DISTINCT sh.id FROM shifts sh JOIN shift_assignments sa ON sa.shift_id=sh.id
        WHERE sa.worker_id=${id}::uuid AND sh.shift_date>${body.effectiveDate}::date
      `;
      if(futureShiftIds.length){
        const ids=futureShiftIds.map(row=>row.id);
        await tx`UPDATE shift_assignments SET confirmation_status='cancelled' WHERE worker_id=${id}::uuid AND shift_id=ANY(${ids}::uuid[])`;
        await tx`
          UPDATE shifts sh SET
            assigned_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled'),
            reserve_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND sa.is_reserve AND sa.confirmation_status<>'cancelled')
          WHERE sh.id=ANY(${ids}::uuid[])
        `;
      }

      await tx`UPDATE worker_profiles SET status='dismissed',updated_at=now() WHERE id=${id}::uuid`;

      if(worker.objectId&&worker.specialtyId){
        await tx`
          UPDATE needs n SET count_filled=LEAST(n.count_required,(
            SELECT count(DISTINCT a.worker_id)::int FROM worker_object_assignments a JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
            WHERE a.object_id=n.object_id AND a.specialty_id=n.specialty_id
              AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
          )),updated_at=now()
          WHERE n.object_id=${worker.objectId}::uuid AND n.specialty_id=${worker.specialtyId}::uuid AND n.status NOT IN ('cancelled','archived')
        `;
      }

      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'offboarded',${"Работа сотрудника завершена: "+worker.fullName},${tx.json({exitId,effectiveDate:body.effectiveDate,reasonCode:body.reasonCode,objectId:worker.objectId})})`;
      return {status:"completed",exitId};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные завершения работы",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось завершить работу сотрудника"},{status:500});
  }
}
