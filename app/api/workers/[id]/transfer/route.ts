import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({objectId:z.string().uuid(),specialtyId:z.string().uuid(),effectiveFrom:z.string().date(),workMode:z.enum(["local","rotation"]).default("local"),paidHoursPerShift:z.number().positive().max(24).nullable().optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.edit");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [worker]=await tx<Array<{id:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT w.id,a.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM worker_profiles w
        LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id AND x.effective_to IS NULL ORDER BY x.effective_from DESC LIMIT 1) a ON true
        LEFT JOIN objects o ON o.id=a.object_id WHERE w.id=${id}::uuid FOR UPDATE OF w
      `;
      if(!worker)throw new Error("Сотрудник не найден");
      if(worker.objectId&&!canReadRow(actor.access,"worker.edit",{organizationId:actor.organizationId,objectId:worker.objectId,ownerUserId:worker.ownerUserId,regionId:worker.regionId,assigneeUserIds:worker.assigneeUserIds},actor))throw new AccessDeniedError("worker.edit");
      const [target]=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];defaultTransitionDays:number;defaultDailyPaymentShifts:number;defaultScheduleWorkDays:number|null;defaultScheduleRestDays:number|null;defaultShiftKind:"day"|"night"|"mixed"}>>`
        SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",o.default_transition_days "defaultTransitionDays",o.default_daily_payment_shifts "defaultDailyPaymentShifts",o.default_schedule_work_days "defaultScheduleWorkDays",o.default_schedule_rest_days "defaultScheduleRestDays",o.default_shift_kind "defaultShiftKind",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid
      `;
      if(!target||!canReadRow(actor.access,"worker.edit",{organizationId:actor.organizationId,objectId:target.id,ownerUserId:target.ownerUserId,regionId:target.regionId,assigneeUserIds:target.assigneeUserIds},actor))throw new AccessDeniedError("worker.edit");
      if(!target.ownerUserId)throw new Error("У целевого объекта не назначен менеджер. Сначала назначьте менеджера объекта.");
      await tx`
        UPDATE worker_object_assignments SET effective_to=(${body.effectiveFrom}::date-1)
        WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from<${body.effectiveFrom}::date
      `;
      await tx`
        DELETE FROM worker_object_assignments
        WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from>=${body.effectiveFrom}::date
      `;
      await tx`
        INSERT INTO worker_object_assignments(organization_id,worker_id,object_id,specialty_id,effective_from,manager_user_id,work_mode,paid_hours_per_shift,transition_days,daily_payment_shifts,schedule_work_days,schedule_rest_days,schedule_shift_kind,schedule_anchor_date,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.objectId}::uuid,${body.specialtyId}::uuid,${body.effectiveFrom}::date,${target.ownerUserId}::uuid,${body.workMode},${body.paidHoursPerShift??null},${target.defaultTransitionDays},${target.defaultDailyPaymentShifts},${target.defaultScheduleWorkDays},${target.defaultScheduleRestDays},${target.defaultShiftKind},${body.effectiveFrom}::date,${actor.userId}::uuid)
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'transferred','Изменено назначение сотрудника',${tx.json({fromObjectId:worker.objectId,toObjectId:body.objectId,effectiveFrom:body.effectiveFrom,specialtyId:body.specialtyId,workMode:body.workMode,paidHoursPerShift:body.paidHoursPerShift??null})})
      `;
    }));
    return NextResponse.json({ok:true},{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте перевод",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось перевести сотрудника"},{status:500});
  }
}
