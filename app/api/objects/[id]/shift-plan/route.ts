import { NextResponse } from "next/server";
import { z } from "zod";
import type { Sql } from "postgres";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError,requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const cellSchema=z.object({workerId:z.string().uuid(),date:z.string().date(),kind:z.enum(["day","night","off","clear"])});
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("generate"),startDate:z.string().date(),endDate:z.string().date()}),
  z.object({action:z.literal("set_cell"),workerId:z.string().uuid(),date:z.string().date(),kind:z.enum(["day","night","off","clear"])}),
  z.object({action:z.literal("set_cells"),cells:z.array(cellSchema).min(1).max(200)}),
]);

type Scope={organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]};
type Assignment={workerId:string;specialtyId:string;workDays:number|null;restDays:number|null;shiftKind:"day"|"night"|"mixed";anchorDate:string;effectiveFrom:string;effectiveTo:string|null};

function cycleWork(date:string,row:Assignment){
  if(row.workDays==null||row.restDays==null||row.workDays<1)return null;
  const cycle=row.workDays+row.restDays;
  const diff=Math.floor((Date.parse(date+"T00:00:00Z")-Date.parse(row.anchorDate+"T00:00:00Z"))/86400000);
  const offset=((diff%cycle)+cycle)%cycle;
  return offset<row.workDays;
}
function dates(start:string,end:string){
  const out:string[]=[];let d=new Date(start+"T00:00:00Z");const finish=new Date(end+"T00:00:00Z");
  while(d<=finish){out.push(d.toISOString().slice(0,10));d=new Date(d.getTime()+86400000)}
  return out;
}
async function syncCounts(tx:Sql,shiftIds:string[]){
  if(!shiftIds.length)return;
  await tx`UPDATE shifts sh SET
    assigned_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled'),
    reserve_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND sa.is_reserve AND sa.confirmation_status<>'cancelled')
    WHERE sh.id=ANY(${shiftIds}::uuid[])`;
}
async function upsertPlanEntry(tx:Sql,actor:{organizationId:string;userId:string},objectId:string,workerId:string,date:string,kind:"day"|"night"|"off"){
  const [existing]=await tx<Array<{id:string;factHours:number|string}>>`
    SELECT id,fact_hours "factHours" FROM time_entries
    WHERE worker_id=${workerId}::uuid AND object_id=${objectId}::uuid AND work_date=${date}::date AND shift_id IS NULL
    ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`;
  const timeCode=kind==="off"?"DAY_OFF":"PLANNED",planned=kind!=="off",plannedKind=kind==="off"?null:kind;
  if(existing){
    if(Number(existing.factHours)>0)return;
    await tx`UPDATE time_entries SET planned=${planned},time_code=${timeCode},fact_hours=0,day_hours=0,night_hours=0,
      planned_shift_kind=${plannedKind},source='schedule',corrected_by_user_id=${actor.userId}::uuid,updated_at=now()
      WHERE id=${existing.id}::uuid`;
    return;
  }
  await tx`INSERT INTO time_entries(
    organization_id,worker_id,object_id,work_date,planned,time_code,fact_hours,day_hours,night_hours,overtime_hours,planned_shift_kind,source,corrected_by_user_id
  ) VALUES(
    ${actor.organizationId}::uuid,${workerId}::uuid,${objectId}::uuid,${date}::date,${planned},${timeCode},0,0,0,0,${plannedKind},'schedule',${actor.userId}::uuid
  )`;
}
async function clearPlanEntry(tx:Sql,objectId:string,workerId:string,date:string){
  await tx`DELETE FROM time_entries
    WHERE worker_id=${workerId}::uuid AND object_id=${objectId}::uuid AND work_date=${date}::date
      AND shift_id IS NULL AND COALESCE(fact_hours,0)=0 AND source='schedule'`;
}
async function assignCell(tx:Sql,actor:{organizationId:string;userId:string},objectId:string,row:Assignment,date:string,kind:"day"|"night"|"off"|"clear"){
  const affected=await tx<Array<{id:string}>>`
    SELECT DISTINCT sh.id FROM shifts sh JOIN shift_assignments sa ON sa.shift_id=sh.id
    WHERE sh.object_id=${objectId}::uuid AND sh.shift_date=${date}::date
      AND sa.worker_id=${row.workerId}::uuid AND sa.confirmation_status<>'cancelled'`;
  if(affected.length)await tx`UPDATE shift_assignments sa SET confirmation_status='cancelled'
    FROM shifts sh WHERE sh.id=sa.shift_id AND sh.object_id=${objectId}::uuid AND sh.shift_date=${date}::date
      AND sa.worker_id=${row.workerId}::uuid AND sa.confirmation_status<>'cancelled'`;

  if(kind==="clear"){
    await clearPlanEntry(tx,objectId,row.workerId,date);
    await syncCounts(tx,affected.map(item=>item.id));
    return;
  }
  if(kind==="off"){
    await upsertPlanEntry(tx,actor,objectId,row.workerId,date,"off");
    await syncCounts(tx,affected.map(item=>item.id));
    return;
  }

  const start=kind==="night"?"20:00":"08:00",end=kind==="night"?"08:00":"20:00";
  let [shift]=await tx<Array<{id:string}>>`
    SELECT id FROM shifts
    WHERE object_id=${objectId}::uuid AND specialty_id=${row.specialtyId}::uuid AND shift_date=${date}::date
      AND shift_kind=${kind} AND status<>'cancelled'
    ORDER BY created_at LIMIT 1`;
  if(!shift){
    [shift]=await tx<Array<{id:string}>>`
      INSERT INTO shifts(
        organization_id,object_id,specialty_id,shift_date,starts_at,ends_at,shift_kind,demand_count,assigned_count,reserve_count,planned_cost,status,created_by_user_id
      ) VALUES(
        ${actor.organizationId}::uuid,${objectId}::uuid,${row.specialtyId}::uuid,${date}::date,
        (${date}::date+${start}::time)::timestamptz,
        (${date}::date+${end}::time+CASE WHEN ${end}::time<=${start}::time THEN interval '1 day' ELSE interval '0 day' END)::timestamptz,
        ${kind},1,0,0,0,'open',${actor.userId}::uuid
      ) RETURNING id`;
  }
  await tx`INSERT INTO shift_assignments(organization_id,shift_id,worker_id,confirmation_status,is_reserve,assigned_by_user_id)
    VALUES(${actor.organizationId}::uuid,${shift.id}::uuid,${row.workerId}::uuid,'pending',false,${actor.userId}::uuid)
    ON CONFLICT(shift_id,worker_id) DO UPDATE SET confirmation_status='pending',is_reserve=false,assigned_by_user_id=EXCLUDED.assigned_by_user_id`;
  await upsertPlanEntry(tx,actor,objectId,row.workerId,date,kind);
  await syncCounts(tx,[...affected.map(item=>item.id),shift.id]);
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.shift.edit");
    const {id}=await params;
    const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({ok:true,demo:true});
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<Scope>>`
        SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${id}::uuid`;
      if(!scope||!canReadRow(actor.access,"operations.shift.edit",scope,actor))throw new AccessDeniedError("operations.shift.edit");

      const assignments=await tx<Assignment[]>`
        SELECT a.worker_id "workerId",a.specialty_id "specialtyId",a.schedule_work_days "workDays",a.schedule_rest_days "restDays",
          a.schedule_shift_kind "shiftKind",COALESCE(a.schedule_anchor_date,a.effective_from)::text "anchorDate",
          a.effective_from::text "effectiveFrom",a.effective_to::text "effectiveTo"
        FROM worker_object_assignments a
        JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
        WHERE a.object_id=${id}::uuid AND a.specialty_id IS NOT NULL`;

      if(body.action==="set_cell"||body.action==="set_cells"){
        const cells=body.action==="set_cell"?[{workerId:body.workerId,date:body.date,kind:body.kind}]:body.cells;
        let updated=0;
        for(const cell of cells){
          const row=assignments.find(item=>item.workerId===cell.workerId&&item.effectiveFrom<=cell.date&&(!item.effectiveTo||item.effectiveTo>=cell.date));
          if(!row)throw new Error("На выбранную дату у одного из сотрудников нет действующего назначения на объект");
          await assignCell(tx,actor,id,row,cell.date,cell.kind);
          updated++;
        }
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,'shift_plan_cells_updated',
            ${cells.length>1?"Массово изменён план выходов":"Изменён план выхода сотрудника"},
            ${tx.json({cells})})`;
        return {ok:true,updated};
      }

      if(body.endDate<body.startDate)throw new Error("Дата окончания раньше даты начала");
      const span=(Date.parse(body.endDate+"T00:00:00Z")-Date.parse(body.startDate+"T00:00:00Z"))/86400000;
      if(span>31)throw new Error("За один раз можно сформировать не больше 32 дней");
      let updated=0,skipped=0;
      for(const date of dates(body.startDate,body.endDate))for(const row of assignments){
        if(date<row.effectiveFrom||(row.effectiveTo&&date>row.effectiveTo))continue;
        const [absence]=await tx<Array<{id:string}>>`
          SELECT id FROM worker_absence_plans
          WHERE worker_id=${row.workerId}::uuid AND status='confirmed'
            AND planned_from<=${date}::date AND (planned_to IS NULL OR planned_to>=${date}::date)
          LIMIT 1`;
        if(absence){skipped++;continue}
        const work=cycleWork(date,row);
        if(work==null){skipped++;continue}
        const kind=work?(row.shiftKind==="night"?"night":"day"):"off";
        await assignCell(tx,actor,id,row,date,kind);
        updated++;
      }
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,'shift_plan_generated',
          'Сформирован план смен из графиков сотрудников',${tx.json({startDate:body.startDate,endDate:body.endDate,updated,skipped})})`;
      return {ok:true,updated,skipped};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры плана",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось изменить план смен"},{status:500});
  }
}
