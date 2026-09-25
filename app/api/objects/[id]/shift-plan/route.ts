import { NextResponse } from "next/server";
import { z } from "zod";
import type { Sql } from "postgres";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError,requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const cellKind=z.enum(["day","night","off","clear","reserve_day","reserve_night"]);
const cellSchema=z.object({workerId:z.string().uuid(),date:z.string().date(),kind:cellKind});
const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("generate"),startDate:z.string().date(),endDate:z.string().date(),workerIds:z.array(z.string().uuid()).max(200).optional()}),
  z.object({action:z.literal("set_cell"),workerId:z.string().uuid(),date:z.string().date(),kind:cellKind}),
  z.object({action:z.literal("set_cells"),cells:z.array(cellSchema).min(1).max(300)}),
]);

type CellKind=z.infer<typeof cellKind>;
type Scope={organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]};
type Assignment={workerId:string;specialtyId:string;workDays:number|null;restDays:number|null;shiftKind:"day"|"night"|"mixed";anchorDate:string;effectiveFrom:string;effectiveTo:string|null};
type EntryState={id:string;factHours:number|string;timeCode:string;source:string;plannedShiftKind:"day"|"night"|"mixed"|null};

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
function isFactEntry(entry:EntryState|undefined){
  if(!entry)return false;
  return entry.source!=="schedule"||Number(entry.factHours)>0||["WORK_PENDING","NO_SHOW","SICK","ABSENCE"].includes(entry.timeCode);
}
async function getScope(tx:Sql,id:string){
  const [scope]=await tx<Array<Scope>>`
    SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
      ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
    FROM objects o WHERE o.id=${id}::uuid`;
  return scope;
}
async function dateLocked(tx:Sql,objectId:string,date:string){
  const [locked]=await tx<Array<{id:string}>>`
    SELECT id FROM timesheet_snapshots
    WHERE object_id=${objectId}::uuid AND period_start<=${date}::date AND period_end>=${date}::date
      AND status IN ('internal_submitted','internal_checked','client_sent','client_approved','closed')
    ORDER BY created_at DESC LIMIT 1`;
  return Boolean(locked);
}
async function confirmedAbsence(tx:Sql,workerId:string,date:string){
  const [absence]=await tx<Array<{id:string;type:string}>>`
    SELECT id,absence_type type FROM worker_absence_plans
    WHERE worker_id=${workerId}::uuid AND status='confirmed'
      AND planned_from<=${date}::date AND (planned_to IS NULL OR planned_to>=${date}::date)
    ORDER BY planned_from DESC LIMIT 1`;
  return absence??null;
}
async function existingEntry(tx:Sql,objectId:string,workerId:string,date:string){
  const [entry]=await tx<EntryState[]>`
    SELECT id,fact_hours "factHours",time_code "timeCode",source,planned_shift_kind "plannedShiftKind"
    FROM time_entries
    WHERE worker_id=${workerId}::uuid AND object_id=${objectId}::uuid AND work_date=${date}::date
    ORDER BY (shift_id IS NULL) DESC,updated_at DESC LIMIT 1 FOR UPDATE`;
  return entry;
}
async function syncCounts(tx:Sql,shiftIds:string[]){
  const ids=[...new Set(shiftIds)];
  if(!ids.length)return;
  await tx`UPDATE shifts sh SET
    assigned_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled'),
    reserve_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND sa.is_reserve AND sa.confirmation_status<>'cancelled')
    WHERE sh.id=ANY(${ids}::uuid[])`;
}
async function upsertPlanEntry(tx:Sql,actor:{organizationId:string;userId:string},objectId:string,workerId:string,date:string,kind:"day"|"night"|"off"){
  const entry=await existingEntry(tx,objectId,workerId,date);
  if(isFactEntry(entry))return false;
  const timeCode=kind==="off"?"DAY_OFF":"PLANNED",planned=kind!=="off",plannedKind=kind==="off"?null:kind;
  if(entry){
    await tx`UPDATE time_entries SET planned=${planned},time_code=${timeCode},fact_hours=0,day_hours=0,night_hours=0,
      overtime_hours=0,planned_shift_kind=${plannedKind},source='schedule',corrected_by_user_id=${actor.userId}::uuid,updated_at=now()
      WHERE id=${entry.id}::uuid`;
    return true;
  }
  await tx`INSERT INTO time_entries(
    organization_id,worker_id,object_id,work_date,planned,time_code,fact_hours,day_hours,night_hours,overtime_hours,planned_shift_kind,source,corrected_by_user_id
  ) VALUES(
    ${actor.organizationId}::uuid,${workerId}::uuid,${objectId}::uuid,${date}::date,${planned},${timeCode},0,0,0,0,${plannedKind},'schedule',${actor.userId}::uuid
  )`;
  return true;
}
async function clearPlanEntry(tx:Sql,objectId:string,workerId:string,date:string){
  await tx`DELETE FROM time_entries
    WHERE worker_id=${workerId}::uuid AND object_id=${objectId}::uuid AND work_date=${date}::date
      AND shift_id IS NULL AND COALESCE(fact_hours,0)=0 AND source='schedule'`;
}
async function assignCell(tx:Sql,actor:{organizationId:string;userId:string},objectId:string,row:Assignment,date:string,kind:CellKind,{skipProtected=false}:{skipProtected?:boolean}={}){
  if(await dateLocked(tx,objectId,date))return skipProtected?"locked":Promise.reject(new Error("Табель за эту дату уже зафиксирован. План прошлого периода менять нельзя."));
  const entry=await existingEntry(tx,objectId,row.workerId,date);
  if(isFactEntry(entry))return skipProtected?"fact":Promise.reject(new Error("В табеле уже зафиксирован факт. Изменение плана не должно переписывать фактические данные."));
  const absence=await confirmedAbsence(tx,row.workerId,date);
  if(absence&&["day","night","reserve_day","reserve_night"].includes(kind))return skipProtected?"absence":Promise.reject(new Error("На выбранную дату у сотрудника подтверждено плановое отсутствие."));

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
    return "updated";
  }
  if(kind==="off"){
    await upsertPlanEntry(tx,actor,objectId,row.workerId,date,"off");
    await syncCounts(tx,affected.map(item=>item.id));
    return "updated";
  }

  const reserve=kind==="reserve_day"||kind==="reserve_night";
  const shiftKind=kind==="night"||kind==="reserve_night"?"night":"day";
  const start=shiftKind==="night"?"20:00":"08:00",end=shiftKind==="night"?"08:00":"20:00";
  let [shift]=await tx<Array<{id:string}>>`
    SELECT id FROM shifts
    WHERE object_id=${objectId}::uuid AND specialty_id=${row.specialtyId}::uuid AND shift_date=${date}::date
      AND shift_kind=${shiftKind} AND status<>'cancelled'
    ORDER BY created_at LIMIT 1`;
  if(!shift){
    [shift]=await tx<Array<{id:string}>>`
      INSERT INTO shifts(
        organization_id,object_id,specialty_id,shift_date,starts_at,ends_at,shift_kind,demand_count,assigned_count,reserve_count,planned_cost,status,created_by_user_id
      ) VALUES(
        ${actor.organizationId}::uuid,${objectId}::uuid,${row.specialtyId}::uuid,${date}::date,
        (${date}::date+${start}::time)::timestamptz,
        (${date}::date+${end}::time+CASE WHEN ${end}::time<=${start}::time THEN interval '1 day' ELSE interval '0 day' END)::timestamptz,
        ${shiftKind},1,0,0,0,'open',${actor.userId}::uuid
      ) RETURNING id`;
  }
  await tx`INSERT INTO shift_assignments(organization_id,shift_id,worker_id,confirmation_status,is_reserve,assigned_by_user_id)
    VALUES(${actor.organizationId}::uuid,${shift.id}::uuid,${row.workerId}::uuid,'pending',${reserve},${actor.userId}::uuid)
    ON CONFLICT(shift_id,worker_id) DO UPDATE SET confirmation_status='pending',is_reserve=EXCLUDED.is_reserve,assigned_by_user_id=EXCLUDED.assigned_by_user_id`;
  if(reserve)await clearPlanEntry(tx,objectId,row.workerId,date);
  else await upsertPlanEntry(tx,actor,objectId,row.workerId,date,shiftKind);
  await syncCounts(tx,[...affected.map(item=>item.id),shift.id]);
  return "updated";
}

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.shift.read");
    const {id}=await params;const url=new URL(request.url);
    const start=url.searchParams.get("start")??new Date().toISOString().slice(0,10);
    const end=url.searchParams.get("end")??start;
    if(!z.string().date().safeParse(start).success||!z.string().date().safeParse(end).success||end<start)return NextResponse.json({error:"Проверьте период"},{status:400});
    const span=(Date.parse(end+"T00:00:00Z")-Date.parse(start+"T00:00:00Z"))/86400000;
    if(span>31)return NextResponse.json({error:"Период не больше 32 дней"},{status:400});
    if(actor.demo)return NextResponse.json({assignments:[],entries:[],absences:[],demand:[],lockedRanges:[],demo:true});
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>{
      const scope=await getScope(sql,id);
      if(!scope||!canReadRow(actor.access,"operations.shift.read",scope,actor))throw new AccessDeniedError("operations.shift.read");
      const assignments=await sql<Array<{workerId:string;date:string;kind:"day"|"night"|"mixed";reserve:boolean;status:string}>>`
        SELECT sa.worker_id "workerId",sh.shift_date::text date,sh.shift_kind kind,sa.is_reserve reserve,sa.confirmation_status status
        FROM shift_assignments sa JOIN shifts sh ON sh.id=sa.shift_id
        WHERE sh.object_id=${id}::uuid AND sh.shift_date BETWEEN ${start}::date AND ${end}::date
          AND sh.status<>'cancelled' AND sa.confirmation_status<>'cancelled'
        ORDER BY sh.shift_date,sa.is_reserve,sa.created_at`;
      const entries=await sql<Array<{workerId:string;date:string;timeCode:string;factHours:number|string;dayHours:number|string;nightHours:number|string;source:string;plannedShiftKind:"day"|"night"|"mixed"|null}>>`
        SELECT DISTINCT ON(te.worker_id,te.work_date) te.worker_id "workerId",te.work_date::text date,te.time_code "timeCode",
          te.fact_hours "factHours",te.day_hours "dayHours",te.night_hours "nightHours",te.source,te.planned_shift_kind "plannedShiftKind"
        FROM time_entries te
        WHERE te.object_id=${id}::uuid AND te.work_date BETWEEN ${start}::date AND ${end}::date
        ORDER BY te.worker_id,te.work_date,(te.shift_id IS NULL) DESC,te.updated_at DESC`;
      const absences=await sql<Array<{workerId:string;type:string;from:string;to:string|null;status:string}>>`
        SELECT worker_id "workerId",absence_type type,planned_from::text "from",planned_to::text "to",status
        FROM worker_absence_plans
        WHERE (object_id IS NULL OR object_id=${id}::uuid) AND status='confirmed'
          AND planned_from<=${end}::date AND (planned_to IS NULL OR planned_to>=${start}::date)
        ORDER BY planned_from`;
      const demand=await sql<Array<{date:string;specialtyId:string;specialty:string;required:number}>>`
        SELECT d.day::date::text date,latest.specialty_id "specialtyId",s.name specialty,sum(latest.count_required)::int required
        FROM generate_series(${start}::date,${end}::date,interval '1 day') d(day)
        JOIN needs n ON n.object_id=${id}::uuid AND (n.source_kind IS NULL OR n.source_kind<>'replacement')
        JOIN LATERAL (
          SELECT v.specialty_id,v.count_required,v.status
          FROM need_versions v
          WHERE v.need_id=n.id AND v.effective_from<(d.day+interval '1 day')
          ORDER BY v.effective_from DESC,v.version DESC LIMIT 1
        ) latest ON latest.status NOT IN ('cancelled','archived')
        JOIN specialties s ON s.id=latest.specialty_id
        GROUP BY d.day,latest.specialty_id,s.name ORDER BY d.day,s.name`;
      const lockedRanges=await sql<Array<{from:string;to:string;status:string}>>`
        SELECT period_start::text "from",period_end::text "to",status
        FROM timesheet_snapshots
        WHERE object_id=${id}::uuid AND period_end>=${start}::date AND period_start<=${end}::date
          AND status IN ('internal_submitted','internal_checked','client_sent','client_approved','closed')
        ORDER BY period_start`;
      return {assignments,entries,absences,demand,lockedRanges};
    });
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось загрузить план смен"},{status:500});
  }
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.shift.edit");
    const {id}=await params;
    const body=schema.parse(await request.json());
    if(actor.demo)return NextResponse.json({ok:true,demo:true});
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const scope=await getScope(tx,id);
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
      const selected=body.workerIds?.length?new Set(body.workerIds):null;
      let updated=0,skipped=0,skippedFact=0,skippedLocked=0,skippedAbsence=0,skippedExisting=0;
      for(const date of dates(body.startDate,body.endDate))for(const row of assignments){
        if(selected&&!selected.has(row.workerId))continue;
        if(date<row.effectiveFrom||(row.effectiveTo&&date>row.effectiveTo))continue;
        if(await dateLocked(tx,id,date)){skippedLocked++;continue}
        if(await confirmedAbsence(tx,row.workerId,date)){skippedAbsence++;continue}
        const entry=await existingEntry(tx,id,row.workerId,date);
        if(isFactEntry(entry)){skippedFact++;continue}
        const [existingShift]=await tx<Array<{id:string}>>`
          SELECT sh.id FROM shifts sh JOIN shift_assignments sa ON sa.shift_id=sh.id
          WHERE sh.object_id=${id}::uuid AND sh.shift_date=${date}::date AND sa.worker_id=${row.workerId}::uuid
            AND sh.status<>'cancelled' AND sa.confirmation_status<>'cancelled' LIMIT 1`;
        if(existingShift||entry?.source==="schedule"){skippedExisting++;continue}
        const work=cycleWork(date,row);
        if(work==null){skipped++;continue}
        const kind=work?(row.shiftKind==="night"?"night":"day"):"off";
        const result=await assignCell(tx,actor,id,row,date,kind,{skipProtected:true});
        if(result==="updated")updated++;else if(result==="fact")skippedFact++;else if(result==="locked")skippedLocked++;else if(result==="absence")skippedAbsence++;else skipped++;
      }
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,'shift_plan_generated',
          'Сформирован план смен из графиков сотрудников',${tx.json({startDate:body.startDate,endDate:body.endDate,workerIds:body.workerIds??null,updated,skipped,skippedFact,skippedLocked,skippedAbsence,skippedExisting})})`;
      return {ok:true,updated,skipped,skippedFact,skippedLocked,skippedAbsence,skippedExisting};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры плана",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось изменить план смен"},{status:500});
  }
}
