import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError,requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  scheduleWorkDays:z.number().int().min(1).max(31).nullable().optional(),
  scheduleRestDays:z.number().int().min(0).max(31).nullable().optional(),
  scheduleShiftKind:z.enum(["day","night","mixed"]).optional(),
  scheduleAnchorDate:z.string().date().nullable().optional(),
  transitionDays:z.number().int().min(0).max(90).optional(),
  dailyPaymentShifts:z.number().int().min(0).max(31).optional(),
  employmentDocumentsStatus:z.enum(["not_received","collecting","received","submitted","processing","completed","problem"]).optional(),
  dayRate:z.number().positive().max(100000).nullable().optional(),
  nightRate:z.number().positive().max(100000).nullable().optional(),
  specialtyId:z.string().uuid().optional(),
  specialtyEffectiveFrom:z.string().date().optional(),
  transferReason:z.string().trim().max(500).nullable().optional(),
}).superRefine((value,ctx)=>{
  if((value.scheduleWorkDays==null)!==(value.scheduleRestDays==null))ctx.addIssue({code:"custom",path:["scheduleWorkDays"],message:"Рабочие и выходные дни задаются вместе"});
  if(value.specialtyId&&!value.specialtyEffectiveFrom)ctx.addIssue({code:"custom",path:["specialtyEffectiveFrom"],message:"Укажите дату перевода"});
});

type AssignmentScope={
  assignmentId:string;organizationId:string;objectId:string;specialtyId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];
  effectiveFrom:string;effectiveTo:string|null;managerUserId:string|null;workMode:"local"|"rotation";paidHoursPerShift:number|string|null;
  transitionDays:number;scheduleWorkDays:number|null;scheduleRestDays:number|null;scheduleShiftKind:"day"|"night"|"mixed";scheduleAnchorDate:string|null;dailyPaymentShifts:number;
};

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.edit");
    const {id}=await params;
    const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({ok:true,demo:true});
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const today=new Date().toISOString().slice(0,10);
      const assignmentDate=body.specialtyEffectiveFrom??today;
      if(body.specialtyId||body.dayRate!==undefined||body.nightRate!==undefined){
        const changeDate=body.specialtyEffectiveFrom??today;
        const [locked]=await tx<Array<{id:string;status:string}>>`
          SELECT id,status FROM timesheet_snapshots
          WHERE object_id IN (
            SELECT object_id FROM worker_object_assignments
            WHERE worker_id=${id}::uuid AND effective_from<=${changeDate}::date AND (effective_to IS NULL OR effective_to>=${changeDate}::date)
          )
            AND period_start<=${changeDate}::date AND period_end>=${changeDate}::date
            AND status IN ('internal_submitted','internal_checked','client_sent','client_approved','closed')
          ORDER BY created_at DESC LIMIT 1
        `;
        if(locked)throw new Error("За выбранную дату табель уже зафиксирован. Сначала верните период на корректировку.");
      }

      const [scope]=await tx<AssignmentScope[]>`
        SELECT a.id "assignmentId",w.organization_id "organizationId",a.object_id "objectId",a.specialty_id "specialtyId",
          o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds",
          a.effective_from::text "effectiveFrom",a.effective_to::text "effectiveTo",a.manager_user_id "managerUserId",
          a.work_mode "workMode",a.paid_hours_per_shift "paidHoursPerShift",a.transition_days "transitionDays",
          a.schedule_work_days "scheduleWorkDays",a.schedule_rest_days "scheduleRestDays",a.schedule_shift_kind "scheduleShiftKind",
          a.schedule_anchor_date::text "scheduleAnchorDate",a.daily_payment_shifts "dailyPaymentShifts"
        FROM worker_profiles w
        JOIN worker_object_assignments a ON a.worker_id=w.id
        JOIN objects o ON o.id=a.object_id
        WHERE w.id=${id}::uuid
          AND a.effective_from<=${assignmentDate}::date
          AND (a.effective_to IS NULL OR a.effective_to>=${assignmentDate}::date)
        ORDER BY a.effective_from DESC LIMIT 1 FOR UPDATE OF a
      `;
      if(!scope||!canReadRow(actor.access,"worker.edit",scope,actor))throw new AccessDeniedError("worker.edit");

      if(body.specialtyId||body.dayRate!==undefined||body.nightRate!==undefined){
        const [exitPlan]=await tx<Array<{effectiveDate:string}>>`
          SELECT effective_date::text "effectiveDate" FROM worker_exit_processes
          WHERE worker_id=${id}::uuid AND status='planned'
          ORDER BY effective_date LIMIT 1
        `;
        if(exitPlan)throw new Error(`У сотрудника уже запланировано завершение работы на ${exitPlan.effectiveDate}. Сначала отмените или измените этот план.`);
      }

      let assignmentId=scope.assignmentId;
      let specialtyId=scope.specialtyId;
      let transferred=false;
      if(body.specialtyId){
        const [target]=await tx<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE id=${body.specialtyId}::uuid AND active`;
        if(!target)throw new Error("Специальность не найдена или отключена");
        if(body.specialtyId===scope.specialtyId)throw new Error("Сотрудник уже назначен на эту специальность");
        if(assignmentDate<scope.effectiveFrom)throw new Error("Дата перевода раньше начала текущего назначения");
        if(assignmentDate===scope.effectiveFrom){
          await tx`UPDATE worker_object_assignments SET specialty_id=${body.specialtyId}::uuid WHERE id=${scope.assignmentId}::uuid`;
        }else{
          await tx`UPDATE worker_object_assignments SET effective_to=(${assignmentDate}::date-interval '1 day')::date WHERE id=${scope.assignmentId}::uuid`;
          const [next]=await tx<Array<{id:string}>>`
            INSERT INTO worker_object_assignments(
              organization_id,worker_id,object_id,specialty_id,effective_from,effective_to,manager_user_id,created_by_user_id,
              work_mode,paid_hours_per_shift,transition_days,daily_payment_shifts,schedule_work_days,schedule_rest_days,schedule_shift_kind,schedule_anchor_date
            )
            VALUES(
              ${actor.organizationId}::uuid,${id}::uuid,${scope.objectId}::uuid,${body.specialtyId}::uuid,${assignmentDate}::date,${scope.effectiveTo}::date,
              ${scope.managerUserId}::uuid,${actor.userId}::uuid,${scope.workMode},${scope.paidHoursPerShift},
              ${scope.transitionDays},${scope.dailyPaymentShifts},${scope.scheduleWorkDays},${scope.scheduleRestDays},${scope.scheduleShiftKind},${scope.scheduleAnchorDate}::date
            ) RETURNING id
          `;
          assignmentId=next.id;
        }
        specialtyId=body.specialtyId;
        transferred=true;
        const mismatchedShiftIds=await tx<Array<{id:string}>>`
          SELECT DISTINCT sh.id FROM shifts sh
          JOIN shift_assignments sa ON sa.shift_id=sh.id
          WHERE sa.worker_id=${id}::uuid AND sh.object_id=${scope.objectId}::uuid
            AND sh.shift_date>=${assignmentDate}::date AND sh.specialty_id<>${body.specialtyId}::uuid
        `;
        if(mismatchedShiftIds.length){
          const ids=mismatchedShiftIds.map(row=>row.id);
          await tx`UPDATE shift_assignments SET confirmation_status='cancelled' WHERE worker_id=${id}::uuid AND shift_id=ANY(${ids}::uuid[])`;
          await tx`
            UPDATE shifts sh SET
              assigned_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled'),
              reserve_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND sa.is_reserve AND sa.confirmation_status<>'cancelled')
            WHERE sh.id=ANY(${ids}::uuid[])
          `;
        }
      }

      await tx`
        UPDATE worker_object_assignments SET
          schedule_work_days=CASE WHEN ${body.scheduleWorkDays===undefined} THEN schedule_work_days ELSE ${body.scheduleWorkDays??null}::int END,
          schedule_rest_days=CASE WHEN ${body.scheduleRestDays===undefined} THEN schedule_rest_days ELSE ${body.scheduleRestDays??null}::int END,
          schedule_shift_kind=COALESCE(${body.scheduleShiftKind??null},schedule_shift_kind),
          schedule_anchor_date=CASE WHEN ${body.scheduleAnchorDate===undefined} THEN schedule_anchor_date ELSE ${body.scheduleAnchorDate??null}::date END,
          transition_days=COALESCE(${body.transitionDays??null}::int,transition_days),
          daily_payment_shifts=COALESCE(${body.dailyPaymentShifts??null}::int,daily_payment_shifts)
        WHERE id=${assignmentId}::uuid
      `;
      if(body.employmentDocumentsStatus!==undefined)await tx`UPDATE worker_profiles SET employment_documents_status=${body.employmentDocumentsStatus},updated_at=now() WHERE id=${id}::uuid`;

      if(transferred&&body.dayRate===undefined&&body.nightRate===undefined){
        const activeRates=await tx<Array<{id:string;amount:number|string;unit:"hour"|"shift"|"month";dayNight:"any"|"day"|"night";effectiveFrom:string;effectiveTo:string|null}>>`
          SELECT id,amount,unit,day_night "dayNight",effective_from::text "effectiveFrom",effective_to::text "effectiveTo"
          FROM worker_rates
          WHERE worker_id=${id}::uuid AND object_id=${scope.objectId}::uuid
            AND day_night=ANY(ARRAY['any','day','night']::text[])
            AND effective_from<=${assignmentDate}::date AND (effective_to IS NULL OR effective_to>=${assignmentDate}::date)
          ORDER BY effective_from,day_night
        `;
        for(const rate of activeRates){
          if(rate.effectiveFrom===assignmentDate){
            await tx`UPDATE worker_rates SET specialty_id=${specialtyId}::uuid WHERE id=${rate.id}::uuid`;
          }else{
            await tx`UPDATE worker_rates SET effective_to=(${assignmentDate}::date-interval '1 day')::date WHERE id=${rate.id}::uuid`;
            if(specialtyId)await tx`
              INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,effective_to,created_by_user_id)
              VALUES(${actor.organizationId}::uuid,${id}::uuid,${specialtyId}::uuid,${scope.objectId}::uuid,${rate.amount},${rate.unit},${rate.dayNight},${assignmentDate}::date,${rate.effectiveTo}::date,${actor.userId}::uuid)
            `;
          }
        }
      }

      if(body.dayRate!==undefined||body.nightRate!==undefined){
        const rateDate=body.specialtyEffectiveFrom??today;
        const existing=await tx<Array<{dayNight:"any"|"day"|"night";amount:number|string;unit:"hour"|"shift"|"month"}>>`
          SELECT day_night "dayNight",amount,unit
          FROM worker_rates
          WHERE worker_id=${id}::uuid AND object_id=${scope.objectId}::uuid
            AND effective_from<=${rateDate}::date AND (effective_to IS NULL OR effective_to>=${rateDate}::date)
            AND day_night=ANY(ARRAY['any','day','night']::text[])
          ORDER BY effective_from DESC
        `;
        const hours=Number(scope.paidHoursPerShift??0);
        const hourly=(row:{amount:number|string;unit:"hour"|"shift"|"month"}|undefined)=>{
          if(!row)return 0;
          const amount=Number(row.amount);
          return row.unit==="shift"&&hours>0?amount/hours:amount;
        };
        const any=existing.find(row=>row.dayNight==="any");
        const dayExisting=existing.find(row=>row.dayNight==="day")??any;
        const nightExisting=existing.find(row=>row.dayNight==="night")??any;
        const day=body.dayRate===undefined?hourly(dayExisting):Number(body.dayRate??0);
        const night=body.nightRate===undefined?hourly(nightExisting):Number(body.nightRate??0);
        await tx`
          UPDATE worker_rates SET effective_to=(${rateDate}::date-interval '1 day')::date
          WHERE worker_id=${id}::uuid AND object_id=${scope.objectId}::uuid
            AND day_night=ANY(ARRAY['any','day','night']::text[])
            AND effective_from<${rateDate}::date AND (effective_to IS NULL OR effective_to>=${rateDate}::date)
        `;
        await tx`DELETE FROM worker_rates WHERE worker_id=${id}::uuid AND object_id=${scope.objectId}::uuid AND effective_from=${rateDate}::date AND day_night=ANY(ARRAY['any','day','night']::text[])`;
        if(day&&specialtyId)await tx`INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id) VALUES(${actor.organizationId}::uuid,${id}::uuid,${specialtyId}::uuid,${scope.objectId}::uuid,${day},'hour','day',${rateDate}::date,${actor.userId}::uuid)`;
        if(night&&specialtyId)await tx`INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id) VALUES(${actor.organizationId}::uuid,${id}::uuid,${specialtyId}::uuid,${scope.objectId}::uuid,${night},'hour','night',${rateDate}::date,${actor.userId}::uuid)`;
      }

      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(
          ${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,
          ${transferred?"worker_specialty_transferred":"assignment_settings_updated"},
          ${transferred?"Сотрудник переведён на другую специальность внутри объекта":"Обновлены операционные настройки сотрудника"},
          ${tx.json({...body,objectId:scope.objectId,fromSpecialtyId:scope.specialtyId,toSpecialtyId:specialtyId,effectiveFrom:assignmentDate})}
        )
      `;
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте настройки сотрудника",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить настройки"},{status:500});
  }
}
