import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  objectId:z.string().uuid(),
  specialtyId:z.string().uuid(),
  name:z.string().trim().min(2).max(240).optional(),
  startDate:z.string().date(),
  endDate:z.string().date(),
  startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  shiftKind:z.enum(["day","night","mixed"]).default("day"),
  demandCount:z.number().int().min(1).max(500),
  workDays:z.number().int().min(1).max(31).default(6),
  restDays:z.number().int().min(0).max(31).default(1),
  workerIds:z.array(z.string().uuid()).max(200).default([]),
  reserveWorkerIds:z.array(z.string().uuid()).max(200).default([]),
}).superRefine((value,ctx)=>{
  if(value.endDate<value.startDate)ctx.addIssue({code:"custom",path:["endDate"],message:"Дата окончания не может быть раньше начала"});
  const days=Math.floor((Date.parse(value.endDate+"T00:00:00Z")-Date.parse(value.startDate+"T00:00:00Z"))/86400000)+1;
  if(days>93)ctx.addIssue({code:"custom",path:["endDate"],message:"За один раз можно построить график максимум на 93 дня"});
  const all=[...value.workerIds,...value.reserveWorkerIds];
  if(new Set(all).size!==all.length)ctx.addIssue({code:"custom",path:["workerIds"],message:"Один сотрудник не может одновременно быть основным и резервным"});
});

function dates(start:string,end:string,workDays:number,restDays:number){
  const result:string[]=[];let cursor=new Date(start+"T00:00:00Z");const finish=new Date(end+"T00:00:00Z");let cycleIndex=0;
  const cycle=workDays+restDays;
  while(cursor<=finish){
    if(cycleIndex%cycle<workDays)result.push(cursor.toISOString().slice(0,10));
    cursor=new Date(cursor.getTime()+86400000);cycleIndex++;
  }
  return result;
}

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.shift.edit");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме график не сохраняется"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [object]=await tx<Array<{organizationId:string;objectId:string;name:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.organization_id "organizationId",o.id "objectId",o.name,o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa
            WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid
      `;
      if(!object||!canReadRow(actor.access,"operations.shift.edit",object,actor))throw new AccessDeniedError("operations.shift.edit");
      const [specialty]=await tx<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE id=${body.specialtyId}::uuid AND active`;
      if(!specialty)throw new Error("Специальность не найдена");
      const [need]=await tx<Array<{id:string}>>`
        SELECT id FROM needs
        WHERE object_id=${body.objectId}::uuid AND specialty_id=${body.specialtyId}::uuid AND status NOT IN ('cancelled','archived')
        ORDER BY status='in_progress' DESC,deadline NULLS LAST,created_at DESC LIMIT 1
      `;
      const patternCode=body.restDays===0?body.workDays+"/0":body.workDays+"/"+body.restDays;
      const seriesName=body.name??(object.name+" · "+specialty.name+" · "+patternCode);
      const [series]=await tx<Array<{id:string}>>`
        INSERT INTO shift_series(organization_id,object_id,need_id,specialty_id,name,pattern_code,work_days,rest_days,start_date,end_date,starts_at,ends_at,shift_kind,demand_count,status,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.objectId}::uuid,${need?.id??null}::uuid,${body.specialtyId}::uuid,
          ${seriesName},${patternCode},${body.workDays},${body.restDays},
          ${body.startDate}::date,${body.endDate}::date,${body.startTime}::time,${body.endTime}::time,${body.shiftKind},${body.demandCount},'active',${actor.userId}::uuid)
        RETURNING id
      `;
      const primary=[...new Set(body.workerIds)];
      const reserve=[...new Set(body.reserveWorkerIds)];
      const requested=[...primary,...reserve];
      let created=0,assigned=0,reserved=0,totalDeficit=0;
      const warnings:Array<{date:string;worker:string;reason:string}>=[];
      for(const shiftDate of dates(body.startDate,body.endDate,body.workDays,body.restDays)){
        const [existing]=await tx<Array<{id:string}>>`
          SELECT id FROM shifts
          WHERE object_id=${body.objectId}::uuid AND specialty_id=${body.specialtyId}::uuid AND shift_date=${shiftDate}::date
            AND starts_at::time=${body.startTime}::time AND status<>'cancelled'
          LIMIT 1
        `;
        let shiftId=existing?.id;
        if(!shiftId){
          const [shift]=await tx<Array<{id:string}>>`
            INSERT INTO shifts(organization_id,object_id,need_id,specialty_id,series_id,shift_date,starts_at,ends_at,shift_kind,demand_count,assigned_count,reserve_count,planned_cost,status,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${body.objectId}::uuid,${need?.id??null}::uuid,${body.specialtyId}::uuid,${series.id}::uuid,${shiftDate}::date,
              (${shiftDate}::date+${body.startTime}::time)::timestamptz,
              (${shiftDate}::date+${body.endTime}::time+CASE WHEN ${body.endTime}::time<=${body.startTime}::time THEN interval '1 day' ELSE interval '0 day' END)::timestamptz,
              ${body.shiftKind},${body.demandCount},0,0,0,'open',${actor.userId}::uuid)
            RETURNING id
          `;shiftId=shift.id;created++;
        }
        if(requested.length){
          const availability=await tx<Array<{workerId:string;name:string;eligible:boolean;absence:boolean;conflict:boolean}>>`
            SELECT w.id "workerId",w.full_name name,
              EXISTS(
                SELECT 1 FROM worker_object_assignments a
                WHERE a.worker_id=w.id AND a.object_id=${body.objectId}::uuid AND a.specialty_id=${body.specialtyId}::uuid
                  AND a.effective_from<=${shiftDate}::date AND (a.effective_to IS NULL OR a.effective_to>=${shiftDate}::date)
              ) eligible,
              EXISTS(
                SELECT 1 FROM worker_absence_plans ap
                WHERE ap.worker_id=w.id AND ap.status='confirmed' AND ap.planned_from<=${shiftDate}::date
                  AND (ap.planned_to IS NULL OR ap.planned_to>=${shiftDate}::date)
              ) absence,
              EXISTS(
                SELECT 1 FROM shift_assignments sa JOIN shifts other ON other.id=sa.shift_id
                WHERE sa.worker_id=w.id AND sa.confirmation_status<>'cancelled' AND other.id<>${shiftId}::uuid
                  AND other.shift_date=${shiftDate}::date
                  AND tstzrange(other.starts_at,other.ends_at,'[)') && tstzrange(
                    (${shiftDate}::date+${body.startTime}::time)::timestamptz,
                    (${shiftDate}::date+${body.endTime}::time+CASE WHEN ${body.endTime}::time<=${body.startTime}::time THEN interval '1 day' ELSE interval '0 day' END)::timestamptz,'[)')
              ) conflict
            FROM worker_profiles w WHERE w.id=ANY(${requested}::uuid[]) AND w.status='active'
          `;
          const byId=new Map(availability.map(row=>[row.workerId,row]));
          for(const workerId of requested){
            const info=byId.get(workerId);
            if(!info){warnings.push({date:shiftDate,worker:workerId,reason:"Сотрудник не найден или неактивен"});continue;}
            if(!info.eligible){warnings.push({date:shiftDate,worker:info.name,reason:"Нет действующего назначения на объект по этой специальности"});continue;}
            if(info.absence){warnings.push({date:shiftDate,worker:info.name,reason:"Подтверждённое отсутствие"});continue;}
            if(info.conflict){warnings.push({date:shiftDate,worker:info.name,reason:"Пересечение с другой сменой"});continue;}
            const isReserve=reserve.includes(workerId);
            await tx`
              INSERT INTO shift_assignments(organization_id,shift_id,worker_id,confirmation_status,is_reserve,assigned_by_user_id)
              VALUES(${actor.organizationId}::uuid,${shiftId}::uuid,${workerId}::uuid,'pending',${isReserve},${actor.userId}::uuid)
              ON CONFLICT(shift_id,worker_id) DO UPDATE SET is_reserve=EXCLUDED.is_reserve,
                confirmation_status=CASE WHEN shift_assignments.confirmation_status='cancelled' THEN 'pending' ELSE shift_assignments.confirmation_status END,
                assigned_by_user_id=EXCLUDED.assigned_by_user_id
            `;
          }
        }
        const [counts]=await tx<Array<{assigned:number;reserve:number;cost:number|string}>>`
          WITH active AS (
            SELECT sa.worker_id,sa.is_reserve FROM shift_assignments sa
            WHERE sa.shift_id=${shiftId}::uuid AND sa.confirmation_status<>'cancelled'
          ), rated AS (
            SELECT a.worker_id,a.is_reserve,
              COALESCE((
                SELECT CASE r.unit
                  WHEN 'hour' THEN r.amount * (EXTRACT(epoch FROM (
                    (${shiftDate}::date+${body.endTime}::time+CASE WHEN ${body.endTime}::time<=${body.startTime}::time THEN interval '1 day' ELSE interval '0 day' END)::timestamptz
                    - (${shiftDate}::date+${body.startTime}::time)::timestamptz
                  ))/3600)
                  WHEN 'shift' THEN r.amount
                  WHEN 'month' THEN r.amount/22
                  ELSE r.amount
                END
                FROM worker_rates r
                WHERE r.worker_id=a.worker_id AND r.object_id=${body.objectId}::uuid AND r.specialty_id=${body.specialtyId}::uuid
                  AND r.effective_from<=${shiftDate}::date AND (r.effective_to IS NULL OR r.effective_to>=${shiftDate}::date)
                ORDER BY r.effective_from DESC LIMIT 1
              ),0) cost
            FROM active a
          )
          SELECT count(*) FILTER(WHERE NOT is_reserve)::int assigned,
                 count(*) FILTER(WHERE is_reserve)::int reserve,
                 COALESCE(sum(cost) FILTER(WHERE NOT is_reserve),0)::numeric cost
          FROM rated
        `;
        await tx`UPDATE shifts SET assigned_count=${counts?.assigned??0},reserve_count=${counts?.reserve??0},planned_cost=${Number(counts?.cost??0)} WHERE id=${shiftId}::uuid`;
        assigned+=counts?.assigned??0;reserved+=counts?.reserve??0;totalDeficit+=Math.max(body.demandCount-(counts?.assigned??0),0);
      }
      const taskKey="shift_deficit:"+body.objectId+":"+body.specialtyId+":"+body.startDate+":"+body.endDate;
      if(totalDeficit>0){
        const due=new Date(body.startDate+"T00:00:00Z");due.setUTCDate(due.getUTCDate()-1);
        await tx`
          INSERT INTO tasks(organization_id,title,status,priority,assignee_user_id,due_at,entity_type,entity_id,checklist_json,created_by_user_id,automation_key,process_code)
          VALUES(${actor.organizationId}::uuid,${"Закрыть дефицит графика: "+object.name+" · "+specialty.name},'open',${totalDeficit>=5?"high":"normal"},${object.ownerUserId??actor.userId}::uuid,
            ${due.toISOString()}::timestamptz,'object',${body.objectId}::uuid,${tx.json({kind:"shift_deficit",seriesId:series.id,specialtyId:body.specialtyId,startDate:body.startDate,endDate:body.endDate,deficit:totalDeficit})},
            ${actor.userId}::uuid,${taskKey},'operations.shift.staffing')
          ON CONFLICT(organization_id,automation_key) WHERE automation_key IS NOT NULL AND status NOT IN ('done','cancelled')
          DO UPDATE SET title=EXCLUDED.title,priority=EXCLUDED.priority,assignee_user_id=EXCLUDED.assignee_user_id,due_at=EXCLUDED.due_at,checklist_json=EXCLUDED.checklist_json,updated_at=now()
        `;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'shift_series',${series.id}::uuid,'created',
          ${"Создан график: "+object.name+" · "+specialty.name+" · "+patternCode},
          ${tx.json({objectId:body.objectId,specialtyId:body.specialtyId,startDate:body.startDate,endDate:body.endDate,created,assigned,reserved,totalDeficit,warnings:warnings.length})})
      `;
      return {id:series.id,created,assigned,reserved,totalDeficit,warnings};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры графика",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать график"},{status:500});
  }
}
