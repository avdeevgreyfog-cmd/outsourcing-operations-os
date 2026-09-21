import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  workerIds:z.array(z.string().uuid()).max(200).default([]),
  reserveWorkerIds:z.array(z.string().uuid()).max(200).default([]),
}).superRefine((value,ctx)=>{
  const all=[...value.workerIds,...value.reserveWorkerIds];
  if(new Set(all).size!==all.length)ctx.addIssue({code:"custom",path:["workerIds"],message:"Сотрудник не может быть одновременно основным и резервным"});
});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.shift.edit");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме состав смены не сохраняется"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [shift]=await tx<Array<{
        id:string;organizationId:string;objectId:string;specialtyId:string;shiftDate:string;startsAt:string;endsAt:string;
        object:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[];demandCount:number;
      }>>`
        SELECT sh.id,sh.organization_id "organizationId",sh.object_id "objectId",sh.specialty_id "specialtyId",
          sh.shift_date::text "shiftDate",sh.starts_at::text "startsAt",sh.ends_at::text "endsAt",o.name object,
          o.owner_user_id "ownerUserId",o.region_id "regionId",sh.demand_count "demandCount",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa
            WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM shifts sh JOIN objects o ON o.id=sh.object_id WHERE sh.id=${id}::uuid FOR UPDATE OF sh
      `;
      if(!shift||!canReadRow(actor.access,"operations.shift.edit",shift,actor))throw new AccessDeniedError("operations.shift.edit");
      const primary=[...new Set(body.workerIds)],reserve=[...new Set(body.reserveWorkerIds)],requested=[...primary,...reserve];
      const warnings:string[]=[];
      if(requested.length){
        const rows=await tx<Array<{id:string;name:string;eligible:boolean;absence:boolean;conflict:boolean}>>`
          SELECT w.id,w.full_name name,
            EXISTS(
              SELECT 1 FROM worker_object_assignments a
              WHERE a.worker_id=w.id AND a.object_id=${shift.objectId}::uuid AND a.specialty_id=${shift.specialtyId}::uuid
                AND a.effective_from<=${shift.shiftDate}::date AND (a.effective_to IS NULL OR a.effective_to>=${shift.shiftDate}::date)
            ) eligible,
            EXISTS(
              SELECT 1 FROM worker_absence_plans ap WHERE ap.worker_id=w.id AND ap.status='confirmed'
                AND ap.planned_from<=${shift.shiftDate}::date AND (ap.planned_to IS NULL OR ap.planned_to>=${shift.shiftDate}::date)
            ) absence,
            EXISTS(
              SELECT 1 FROM shift_assignments sa JOIN shifts other ON other.id=sa.shift_id
              WHERE sa.worker_id=w.id AND sa.confirmation_status<>'cancelled' AND other.id<>${shift.id}::uuid
                AND tstzrange(other.starts_at,other.ends_at,'[)') && tstzrange(${shift.startsAt}::timestamptz,${shift.endsAt}::timestamptz,'[)')
            ) conflict
          FROM worker_profiles w WHERE w.id=ANY(${requested}::uuid[]) AND w.status='active'
        `;
        const byId=new Map(rows.map(row=>[row.id,row]));
        for(const workerId of requested){
          const row=byId.get(workerId);
          if(!row)warnings.push("Сотрудник "+workerId+" не найден или неактивен");
          else if(!row.eligible)warnings.push(row.name+": нет назначения на объект по этой специальности");
          else if(row.absence)warnings.push(row.name+": подтверждённое отсутствие");
          else if(row.conflict)warnings.push(row.name+": пересечение с другой сменой");
        }
      }
      if(warnings.length)return {conflict:true,warnings};

      await tx`UPDATE shift_assignments SET confirmation_status='cancelled'
        WHERE shift_id=${shift.id}::uuid AND confirmation_status<>'cancelled' AND NOT(worker_id=ANY(${requested.length?requested:["00000000-0000-0000-0000-000000000000"]}::uuid[]))`;
      for(const workerId of requested){
        const isReserve=reserve.includes(workerId);
        await tx`
          INSERT INTO shift_assignments(organization_id,shift_id,worker_id,confirmation_status,is_reserve,assigned_by_user_id)
          VALUES(${actor.organizationId}::uuid,${shift.id}::uuid,${workerId}::uuid,'pending',${isReserve},${actor.userId}::uuid)
          ON CONFLICT(shift_id,worker_id) DO UPDATE SET is_reserve=EXCLUDED.is_reserve,
            confirmation_status=CASE WHEN shift_assignments.confirmation_status='cancelled' THEN 'pending' ELSE shift_assignments.confirmation_status END,
            assigned_by_user_id=EXCLUDED.assigned_by_user_id
        `;
      }
      const [counts]=await tx<Array<{assigned:number;reserve:number;cost:number|string}>>`
        WITH active AS (
          SELECT sa.worker_id,sa.is_reserve FROM shift_assignments sa WHERE sa.shift_id=${shift.id}::uuid AND sa.confirmation_status<>'cancelled'
        )
        SELECT count(*) FILTER(WHERE NOT a.is_reserve)::int assigned,
               count(*) FILTER(WHERE a.is_reserve)::int reserve,
               COALESCE(sum(CASE WHEN NOT a.is_reserve THEN COALESCE((
                 SELECT CASE r.unit
                   WHEN 'hour' THEN r.amount*(EXTRACT(epoch FROM (${shift.endsAt}::timestamptz-${shift.startsAt}::timestamptz))/3600)
                   WHEN 'shift' THEN r.amount
                   WHEN 'month' THEN r.amount/22
                   ELSE r.amount END
                 FROM worker_rates r WHERE r.worker_id=a.worker_id AND r.object_id=${shift.objectId}::uuid AND r.specialty_id=${shift.specialtyId}::uuid
                   AND r.effective_from<=${shift.shiftDate}::date AND (r.effective_to IS NULL OR r.effective_to>=${shift.shiftDate}::date)
                 ORDER BY r.effective_from DESC LIMIT 1
               ),0) ELSE 0 END),0)::numeric cost
        FROM active a
      `;
      await tx`UPDATE shifts SET assigned_count=${counts?.assigned??0},reserve_count=${counts?.reserve??0},planned_cost=${Number(counts?.cost??0)} WHERE id=${shift.id}::uuid`;
      const deficit=Math.max(shift.demandCount-(counts?.assigned??0),0);
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'shift',${shift.id}::uuid,'assignments_updated',
          ${"Обновлён состав смены: "+shift.object},${tx.json({assigned:counts?.assigned??0,reserve:counts?.reserve??0,deficit})})
      `;
      return {id:shift.id,assigned:counts?.assigned??0,reserve:counts?.reserve??0,deficit};
    }));
    if("conflict" in result)return NextResponse.json({error:"Есть конфликты назначений",warnings:result.warnings},{status:422});
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте состав смены",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось изменить состав смены"},{status:500});
  }
}
