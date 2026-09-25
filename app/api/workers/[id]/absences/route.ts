import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({absenceType:z.enum(["intershift","vacation","sick","personal","other"]),status:z.enum(["tentative","confirmed"]).default("tentative"),plannedFrom:z.string().date(),plannedTo:z.string().date().nullable().optional(),flexibleReturn:z.boolean().default(false),note:z.string().trim().max(1000).nullable().optional()}).superRefine((value,ctx)=>{if(value.plannedTo&&value.plannedTo<value.plannedFrom)ctx.addIssue({code:"custom",path:["plannedTo"],message:"Дата окончания раньше даты начала"})});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.edit");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [worker]=await tx<Array<{id:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT w.id,a.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM worker_profiles w
        LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id AND x.effective_to IS NULL ORDER BY x.effective_from DESC LIMIT 1) a ON true
        LEFT JOIN objects o ON o.id=a.object_id WHERE w.id=${id}::uuid
      `;
      if(!worker||!canReadRow(actor.access,"worker.edit",{organizationId:actor.organizationId,objectId:worker.objectId??undefined,ownerUserId:worker.ownerUserId??undefined,regionId:worker.regionId??undefined,assigneeUserIds:worker.assigneeUserIds},actor))throw new AccessDeniedError("worker.edit");
      const [locked]=worker.objectId?await tx<Array<{id:string}>>`
        SELECT id FROM timesheet_snapshots
        WHERE object_id=${worker.objectId}::uuid
          AND status IN ('internal_submitted','internal_checked','client_sent','client_approved','closed')
          AND period_end>=${body.plannedFrom}::date
          AND period_start<=COALESCE(${body.plannedTo??null}::date,${body.plannedFrom}::date)
        ORDER BY created_at DESC LIMIT 1
      `:[];
      if(locked)throw new Error("В выбранном периоде табель уже зафиксирован. Сначала верните его на корректировку.");
      const [overlap]=await tx<Array<{id:string}>>`
        SELECT id FROM worker_absence_plans
        WHERE worker_id=${id}::uuid AND status IN ('tentative','confirmed')
          AND daterange(planned_from,COALESCE(planned_to,'infinity'::date),'[]')
              && daterange(${body.plannedFrom}::date,COALESCE(${body.plannedTo??null}::date,'infinity'::date),'[]')
        LIMIT 1
      `;
      if(overlap)throw new Error("На выбранные даты у сотрудника уже есть плановое отсутствие");
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO worker_absence_plans(organization_id,worker_id,object_id,absence_type,status,planned_from,planned_to,flexible_return,note,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${worker.objectId??null}::uuid,${body.absenceType},${body.status},${body.plannedFrom}::date,${body.plannedTo??null}::date,${body.flexibleReturn},${body.note??null},${actor.userId}::uuid)
        RETURNING id
      `;
      if(body.status==="confirmed"&&worker.objectId){
        const timeCode=body.absenceType==="intershift"?"INTERSHIFT":body.absenceType==="vacation"?"VACATION":body.absenceType==="sick"?"SICK":"DAY_OFF";
        await tx`
          UPDATE shift_assignments sa SET confirmation_status='cancelled'
          FROM shifts sh WHERE sh.id=sa.shift_id AND sa.worker_id=${id}::uuid AND sh.object_id=${worker.objectId}::uuid
            AND sh.shift_date>=${body.plannedFrom}::date AND (${body.plannedTo??null}::date IS NULL OR sh.shift_date<=${body.plannedTo??null}::date)
            AND sa.confirmation_status<>'cancelled'
        `;
        await tx`
          UPDATE shifts sh SET
            assigned_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled'),
            reserve_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND sa.is_reserve AND sa.confirmation_status<>'cancelled')
          WHERE sh.object_id=${worker.objectId}::uuid AND sh.shift_date>=${body.plannedFrom}::date
            AND (${body.plannedTo??null}::date IS NULL OR sh.shift_date<=${body.plannedTo??null}::date)
        `;
        await tx`
          UPDATE time_entries SET planned=false,time_code=${timeCode},fact_hours=0,day_hours=0,night_hours=0,overtime_hours=0,
            planned_shift_kind=NULL,source='schedule',correction_reason='Плановое отсутствие',corrected_by_user_id=${actor.userId}::uuid,updated_at=now()
          WHERE worker_id=${id}::uuid AND object_id=${worker.objectId}::uuid AND work_date>=${body.plannedFrom}::date
            AND (${body.plannedTo??null}::date IS NULL OR work_date<=${body.plannedTo??null}::date) AND COALESCE(fact_hours,0)=0
        `;
      }
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'worker_absence_planned',
          ${body.status==="confirmed"?"Зафиксировано плановое отсутствие":"Добавлено предварительное отсутствие"},
          ${tx.json({absenceId:row.id,objectId:worker.objectId,absenceType:body.absenceType,plannedFrom:body.plannedFrom,plannedTo:body.plannedTo??null,status:body.status})})`;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте отсутствие",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить отсутствие"},{status:500});
  }
}
