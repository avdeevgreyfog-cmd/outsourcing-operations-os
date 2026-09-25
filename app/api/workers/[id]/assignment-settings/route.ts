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
}).superRefine((value,ctx)=>{
  if((value.scheduleWorkDays==null)!==(value.scheduleRestDays==null))ctx.addIssue({code:"custom",path:["scheduleWorkDays"],message:"Рабочие и выходные дни задаются вместе"});
});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.edit");const {id}=await params;const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({ok:true,demo:true});
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{assignmentId:string;organizationId:string;objectId:string;specialtyId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT a.id "assignmentId",w.organization_id "organizationId",a.object_id "objectId",a.specialty_id "specialtyId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM worker_profiles w JOIN worker_object_assignments a ON a.worker_id=w.id
        JOIN objects o ON o.id=a.object_id
        WHERE w.id=${id}::uuid AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
        ORDER BY a.effective_from DESC LIMIT 1 FOR UPDATE OF a
      `;
      if(!scope||!canReadRow(actor.access,"worker.edit",scope,actor))throw new AccessDeniedError("worker.edit");
      await tx`
        UPDATE worker_object_assignments SET
          schedule_work_days=CASE WHEN ${body.scheduleWorkDays===undefined} THEN schedule_work_days ELSE ${body.scheduleWorkDays??null}::int END,
          schedule_rest_days=CASE WHEN ${body.scheduleRestDays===undefined} THEN schedule_rest_days ELSE ${body.scheduleRestDays??null}::int END,
          schedule_shift_kind=COALESCE(${body.scheduleShiftKind??null},schedule_shift_kind),
          schedule_anchor_date=CASE WHEN ${body.scheduleAnchorDate===undefined} THEN schedule_anchor_date ELSE ${body.scheduleAnchorDate??null}::date END,
          transition_days=COALESCE(${body.transitionDays??null}::int,transition_days),
          daily_payment_shifts=COALESCE(${body.dailyPaymentShifts??null}::int,daily_payment_shifts)
        WHERE id=${scope.assignmentId}::uuid
      `;
      if(body.employmentDocumentsStatus!==undefined)await tx`UPDATE worker_profiles SET employment_documents_status=${body.employmentDocumentsStatus},updated_at=now() WHERE id=${id}::uuid`;
      if(body.dayRate!==undefined||body.nightRate!==undefined){
        const today=new Date().toISOString().slice(0,10);
        await tx`UPDATE worker_rates SET effective_to=(${today}::date-interval '1 day')::date WHERE worker_id=${id}::uuid AND object_id=${scope.objectId}::uuid AND effective_to IS NULL AND day_night=ANY(ARRAY['any','day','night']::text[]) AND effective_from<${today}::date`;
        await tx`DELETE FROM worker_rates WHERE worker_id=${id}::uuid AND object_id=${scope.objectId}::uuid AND effective_from=${today}::date AND day_night=ANY(ARRAY['any','day','night']::text[])`;
        const [fallback]=await tx<Array<{amount:number|string;unit:string}>>`SELECT amount,unit FROM worker_rates WHERE worker_id=${id}::uuid AND (object_id=${scope.objectId}::uuid OR object_id IS NULL) AND effective_to=(${today}::date-interval '1 day')::date ORDER BY (object_id=${scope.objectId}::uuid) DESC,effective_from DESC LIMIT 1`;
        const day=body.dayRate===undefined?Number(fallback?.amount??0):body.dayRate;const night=body.nightRate===undefined?Number(fallback?.amount??0):body.nightRate;
        if(day&&scope.specialtyId)await tx`INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id) VALUES(${actor.organizationId}::uuid,${id}::uuid,${scope.specialtyId}::uuid,${scope.objectId}::uuid,${day},'hour','day',${today}::date,${actor.userId}::uuid)`;
        if(night&&scope.specialtyId)await tx`INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id) VALUES(${actor.organizationId}::uuid,${id}::uuid,${scope.specialtyId}::uuid,${scope.objectId}::uuid,${night},'hour','night',${today}::date,${actor.userId}::uuid)`;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'assignment_settings_updated','Обновлены операционные настройки сотрудника',${tx.json(body)})
      `;
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте настройки сотрудника",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить настройки"},{status:500});
  }
}