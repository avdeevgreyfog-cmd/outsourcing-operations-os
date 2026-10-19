import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import {resolveObjectConditionInTransaction,conditionScheduleParts} from "@/lib/operations/object-conditions";

const schema=z.object({
  objectId:z.string().uuid(),
  specialtyId:z.string().uuid(),
  effectiveFrom:z.string().date().nullable(),
  dateUnknown:z.boolean().optional(),
  shiftKind:z.enum(["day","night","mixed"]).default("mixed"),
  workMode:z.enum(["local","rotation"]).nullable().optional(),
  paidHoursPerShift:z.number().positive().max(24).nullable().optional(),
  dayRate:z.number().positive().max(100000).nullable().optional(),
  nightRate:z.number().positive().max(100000).nullable().optional(),
  reason:z.string().trim().max(500).nullable().optional(),
});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.edit");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [worker]=await tx<Array<{id:string;objectId:string|null;specialtyId:string|null;effectiveFrom:string|null;workMode:string|null;scheduleShiftKind:string;createdByUserId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];paidHoursPerShift:number|string|null}>>`
        SELECT w.id,w.created_by_user_id "createdByUserId",a.object_id "objectId",a.specialty_id "specialtyId",a.effective_from::text "effectiveFrom",a.work_mode "workMode",a.schedule_shift_kind "scheduleShiftKind",a.paid_hours_per_shift "paidHoursPerShift",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM worker_profiles w
        LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id AND x.effective_to IS NULL ORDER BY x.effective_from DESC LIMIT 1) a ON true
        LEFT JOIN objects o ON o.id=a.object_id WHERE w.id=${id}::uuid AND w.organization_id=${actor.organizationId}::uuid FOR UPDATE OF w
      `;
      if(!worker)throw new Error("Сотрудник не найден");
      if(!canReadRow(actor.access,"worker.edit",{organizationId:actor.organizationId,objectId:worker.objectId,createdByUserId:worker.createdByUserId,ownerUserId:worker.objectId?worker.ownerUserId:worker.createdByUserId,regionId:worker.regionId,assigneeUserIds:worker.assigneeUserIds},actor))throw new AccessDeniedError("worker.edit");
      if(!body.effectiveFrom&&!body.dateUnknown)throw new Error("Укажите дату или явно отметьте: дата начала неизвестна");
      if(worker.objectId&&!body.effectiveFrom&&!(worker.objectId===body.objectId&&worker.specialtyId===body.specialtyId&&worker.effectiveFrom===null))throw new Error("Для перевода уже назначенного сотрудника укажите дату изменения; историческое начало может остаться неизвестным");
      const [specialty]=await tx`SELECT id FROM specialties WHERE id=${body.specialtyId}::uuid AND organization_id=${actor.organizationId}::uuid AND active`;
      if(!specialty)throw new AccessDeniedError("worker.edit");
      const [exitPlan]=await tx<Array<{effectiveDate:string}>>`
        SELECT effective_date::text "effectiveDate" FROM worker_exit_processes
        WHERE worker_id=${id}::uuid AND status='planned'
        ORDER BY effective_date LIMIT 1
      `;
      if(exitPlan)throw new Error(`У сотрудника уже запланировано завершение работы на ${exitPlan.effectiveDate}. Сначала отмените или измените этот план.`);
      const currentRates=worker.objectId?await tx<Array<{kind:"any"|"day"|"night";amount:number|string;unit:"hour"|"shift"|"month"}>>`
        SELECT day_night kind,amount,unit FROM worker_rates
        WHERE worker_id=${id}::uuid AND object_id=${worker.objectId}::uuid
          AND effective_from<${body.effectiveFrom}::date
          AND (effective_to IS NULL OR effective_to>=${body.effectiveFrom}::date-1)
          AND day_night=ANY(ARRAY['any','day','night']::text[])
        ORDER BY effective_from DESC
      `:[];
      const [target]=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];defaultTransitionDays:number;defaultDailyPaymentShifts:number;defaultScheduleWorkDays:number|null;defaultScheduleRestDays:number|null;defaultShiftKind:"day"|"night"|"mixed"}>>`
        SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",o.default_transition_days "defaultTransitionDays",o.default_daily_payment_shifts "defaultDailyPaymentShifts",o.default_schedule_work_days "defaultScheduleWorkDays",o.default_schedule_rest_days "defaultScheduleRestDays",o.default_shift_kind "defaultShiftKind",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid AND o.organization_id=${actor.organizationId}::uuid
      `;
      if(!target||!canReadRow(actor.access,"worker.edit",{organizationId:actor.organizationId,objectId:target.id,ownerUserId:target.ownerUserId,regionId:target.regionId,assigneeUserIds:target.assigneeUserIds},actor))throw new AccessDeniedError("worker.edit");
      const condition=await resolveObjectConditionInTransaction(tx,actor.organizationId,{objectId:body.objectId,specialtyId:body.specialtyId,shiftKind:body.shiftKind,date:body.effectiveFrom});
      const schedule=conditionScheduleParts(condition);
      if(!body.effectiveFrom&&(body.dayRate||body.nightRate))throw new Error("Для индивидуальной ставки укажите дату начала действия");
      // A missing object manager is an incomplete profile, not a fabricated owner.
      // Repeating the same first assignment must not delete/recreate its history.
      if(worker.objectId===body.objectId&&worker.specialtyId===body.specialtyId&&worker.effectiveFrom===body.effectiveFrom&&worker.scheduleShiftKind===body.shiftKind&&!body.dayRate&&!body.nightRate&&(body.workMode===undefined||body.workMode===worker.workMode)&&(body.paidHoursPerShift==null||body.paidHoursPerShift===Number(worker.paidHoursPerShift)))return;
      if(worker.objectId&&!body.effectiveFrom)throw new Error("Для изменения действующего назначения укажите дату изменения; первоначальная историческая дата остаётся неизвестной");
      await tx`
        UPDATE worker_object_assignments SET effective_to=(${body.effectiveFrom}::date-1)
        WHERE worker_id=${id}::uuid AND organization_id=${actor.organizationId}::uuid AND effective_to IS NULL AND (effective_from IS NULL OR effective_from<${body.effectiveFrom}::date)
      `;
      const [future]=await tx`SELECT id FROM worker_object_assignments WHERE worker_id=${id}::uuid AND organization_id=${actor.organizationId}::uuid AND effective_to IS NULL AND effective_from>=${body.effectiveFrom}::date`;
      if(future)throw new Error("На эту дату уже есть назначение. Уточните дату перевода, история не перезаписывается.");
      await tx`
        INSERT INTO worker_object_assignments(organization_id,worker_id,object_id,specialty_id,effective_from,manager_user_id,work_mode,paid_hours_per_shift,transition_days,daily_payment_shifts,schedule_work_days,schedule_rest_days,schedule_shift_kind,schedule_anchor_date,source_condition_id,paid_hours_override,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.objectId}::uuid,${body.specialtyId}::uuid,${body.effectiveFrom}::date,${target.ownerUserId}::uuid,${body.workMode??null},${body.paidHoursPerShift??condition?.paidHours??null},${target.defaultTransitionDays},${target.defaultDailyPaymentShifts},${schedule.workDays??target.defaultScheduleWorkDays},${schedule.restDays??target.defaultScheduleRestDays},${body.shiftKind},${body.effectiveFrom??condition?.effectiveFrom??null}::date,${condition?.id??null}::uuid,${body.paidHoursPerShift!=null},${actor.userId}::uuid)
      `;

      await tx`UPDATE worker_profiles SET status='active' WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid AND status='requires_assignment'`;

      if(worker.objectId){
        const futureShiftIds=await tx<Array<{id:string}>>`
          SELECT DISTINCT sh.id FROM shifts sh
          JOIN shift_assignments sa ON sa.shift_id=sh.id
          WHERE sa.worker_id=${id}::uuid AND sh.object_id=${worker.objectId}::uuid AND sh.shift_date>=${body.effectiveFrom}::date
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
        await tx`
          UPDATE worker_rates SET effective_to=(${body.effectiveFrom}::date-1)
          WHERE worker_id=${id}::uuid AND object_id=${worker.objectId}::uuid
            AND effective_from<${body.effectiveFrom}::date AND (effective_to IS NULL OR effective_to>=${body.effectiveFrom}::date)
        `;
        await tx`DELETE FROM worker_rates WHERE worker_id=${id}::uuid AND object_id=${worker.objectId}::uuid AND effective_from>=${body.effectiveFrom}::date`;
      }

      const toHourly=(row:{amount:number|string;unit:"hour"|"shift"|"month"}|undefined)=>{
        if(!row||row.unit==="month")return null;
        const amount=Number(row.amount),hours=Number(worker.paidHoursPerShift??0);
        return row.unit==="shift"&&hours>0?amount/hours:amount;
      };
      const any=currentRates.find(row=>row.kind==="any");
      const resolvedDay=body.dayRate??(!condition?toHourly(currentRates.find(row=>row.kind==="day")??any):null);
      const resolvedNight=body.nightRate??(!condition?toHourly(currentRates.find(row=>row.kind==="night")??any):null);
      if(body.effectiveFrom&&resolvedDay&&resolvedDay>0)await tx`
        INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.specialtyId}::uuid,${body.objectId}::uuid,${resolvedDay},'hour','day',${body.effectiveFrom}::date,${actor.userId}::uuid)
      `;
      if(body.effectiveFrom&&resolvedNight&&resolvedNight>0)await tx`
        INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.specialtyId}::uuid,${body.objectId}::uuid,${resolvedNight},'hour','night',${body.effectiveFrom}::date,${actor.userId}::uuid)
      `;

      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'transferred','Изменено назначение сотрудника',${tx.json({
          fromObjectId:worker.objectId,toObjectId:body.objectId,effectiveFrom:body.effectiveFrom,specialtyId:body.specialtyId,
          workMode:body.workMode,paidHoursPerShift:body.paidHoursPerShift??null,dayRate:resolvedDay,nightRate:resolvedNight,conditionId:condition?.id??null,dateUnknown:!body.effectiveFrom,reason:body.reason??null
        })})
      `;
    }));
    return NextResponse.json({ok:true},{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте перевод",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось перевести сотрудника"},{status:500});
  }
}