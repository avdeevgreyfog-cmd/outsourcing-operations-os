import type {Actor} from "@/lib/access/types";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";
import {listObjects,listWorkers} from "@/lib/data/service";
import {resolveToken} from "@/lib/operations/worker-timesheet-portal";
import type {Sql} from "postgres";

export type ScheduleOwner="manager"|"worker";
export type PlannedKind="day"|"night"|"off";
export type PlanningDay={date:string;kind:PlannedKind|null;source:"assigned"|"manual"|"cycle"|"worker"|"none";proposal:PlannedKind|null;proposalStatus:"proposed"|"rejected"|null;startTime:string|null;endTime:string|null;endsNextDay:boolean};
export type EmployeePlanning={owner:ScheduleOwner;horizon:number;workDays:number|null;restDays:number|null;defaultKind:"day"|"night"|null;floatingDaysOff:boolean;patternFrom:string;days:PlanningDay[]};

type TenantScope={org:string;actor:string;worker:string;object:string;link:string;today:string;timezone:string;owner:ScheduleOwner;horizon:number;workDays:number|null;restDays:number|null;anchor:string;defaultKind:"day"|"night"|null};
type Entry={date:string;kind:string|null;code:string;source:string;hours:number};
type Shift={date:string;kind:string;start:string;end:string;endsNextDay:boolean};
type Proposal={date:string;kind:PlannedKind;status:"proposed"|"accepted"|"rejected"};
type TimeChange={date:string;start:string;end:string;next:boolean;appliesTo:string;status:string;kind:"day"|"night"|null};
type Pattern={effectiveFrom:string;workDays:number;restDays:number;shiftKind:"day"|"night";floatingDaysOff:boolean;status:"proposed"|"accepted"|"rejected"};

function addDays(date:string,days:number){const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
export function cycleKind(date:string,anchor:string,workDays:number|null,restDays:number|null,kind:"day"|"night"|null):PlannedKind|null{
 if(!workDays||restDays===null||workDays<1||restDays<0||!kind||date<anchor)return null;
 if((workDays===5&&restDays===2)||(workDays===6&&restDays===1)){
  const dow=new Date(date+"T00:00:00Z").getUTCDay();
  return dow===0||(workDays===5&&dow===6)?"off":kind;
 }
 const cycle=workDays+restDays;
 const n=Math.round((Date.parse(date+"T00:00:00Z")-Date.parse(anchor+"T00:00:00Z"))/86400000);
 return n%cycle<workDays?kind:"off";
}
async function scopeForToken(token:string):Promise<TenantScope>{
 const ref=await resolveToken(token);if(!ref)throw new Error("Недействительная ссылка");
 return withTenant(ref.tenantId,ref.actorUserId,async sql=>{
  const [row]=await sql<Array<Omit<TenantScope,"org"|"actor"|"link">>>`SELECT
   l.worker_id worker,l.object_id object,
   (now() AT TIME ZONE COALESCE(s.timezone,'Europe/Moscow'))::date::text today,
   COALESCE(s.timezone,'Europe/Moscow') timezone,
   COALESCE(wa.schedule_owner,s.schedule_authority,CASE WHEN s.schedule_owner='client' THEN 'worker' ELSE s.schedule_owner END,'manager') owner,
   COALESCE(s.planning_horizon_days,7)::int horizon,
   a.schedule_work_days::int "workDays",a.schedule_rest_days::int "restDays",
   COALESCE(a.schedule_anchor_date,a.effective_from)::text anchor,
   CASE WHEN a.schedule_shift_kind='night' THEN 'night' WHEN a.schedule_shift_kind='day' THEN 'day' ELSE NULL END "defaultKind"
   FROM worker_timesheet_links l JOIN worker_profiles w ON w.id=l.worker_id
   JOIN worker_object_assignments a ON a.worker_id=l.worker_id AND a.object_id=l.object_id
     AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
   LEFT JOIN object_shift_reporting_settings s ON s.object_id=l.object_id
   LEFT JOIN worker_schedule_authorities wa ON wa.worker_id=l.worker_id AND wa.object_id=l.object_id
   WHERE l.id=${ref.linkId}::uuid AND l.status='active' AND w.status='active'
     AND COALESCE(s.reporting_enabled,true)
   ORDER BY a.effective_from DESC LIMIT 1`;
  if(!row)throw new Error("Персональный доступ закрыт");
  return {...row,org:ref.tenantId,actor:ref.actorUserId,link:ref.linkId};
 });
}
async function planningRows(sql:Sql,s:TenantScope,from:string,to:string){
 const [entries,shifts,proposals,changes,patterns]=await Promise.all([
  sql<Array<Entry>>`SELECT DISTINCT ON(work_date) work_date::text date,planned_shift_kind kind,time_code code,source,fact_hours::float8 hours
   FROM time_entries WHERE worker_id=${s.worker}::uuid AND object_id=${s.object}::uuid
     AND work_date BETWEEN ${from}::date AND ${to}::date ORDER BY work_date,(shift_id IS NULL) DESC,updated_at DESC`,
  sql<Array<Shift>>`SELECT DISTINCT ON(sh.shift_date) sh.shift_date::text date,sh.shift_kind kind,
    to_char(sh.starts_at AT TIME ZONE ${s.timezone},'HH24:MI') start,
    to_char(sh.ends_at AT TIME ZONE ${s.timezone},'HH24:MI') "end",
    ((sh.ends_at AT TIME ZONE ${s.timezone})::date>sh.shift_date) "endsNextDay"
   FROM shift_assignments sa JOIN shifts sh ON sh.id=sa.shift_id
   WHERE sa.worker_id=${s.worker}::uuid AND sh.object_id=${s.object}::uuid AND sh.shift_date BETWEEN ${from}::date AND ${to}::date
     AND sa.confirmation_status<>'cancelled' AND NOT sa.is_reserve
   ORDER BY sh.shift_date,sh.starts_at`,
  sql<Array<Proposal>>`SELECT work_date::text date,requested_kind kind,status FROM worker_shift_plan_changes
   WHERE worker_id=${s.worker}::uuid AND object_id=${s.object}::uuid AND work_date BETWEEN ${from}::date AND ${to}::date`,
  sql<Array<TimeChange>>`SELECT work_date::text date,to_char(start_time,'HH24:MI') start,to_char(end_time,'HH24:MI') "end",
    ends_next_day "next",applies_to "appliesTo",status,shift_kind kind FROM worker_shift_time_changes
   WHERE worker_id=${s.worker}::uuid AND object_id=${s.object}::uuid AND
     (work_date BETWEEN ${from}::date AND ${to}::date OR (applies_to='regular' AND status='accepted' AND work_date<=${to}::date))`,
  sql<Array<Pattern>>`SELECT effective_from::text "effectiveFrom",work_days "workDays",rest_days "restDays",shift_kind "shiftKind",floating_days_off "floatingDaysOff",status
    FROM worker_schedule_pattern_changes WHERE worker_id=${s.worker}::uuid AND object_id=${s.object}::uuid
    AND effective_from<=${to}::date ORDER BY effective_from DESC`,
 ]);
 return {entries,shifts,proposals,changes,patterns};
}
export async function employeePlanning(token:string):Promise<EmployeePlanning>{
 const s=await scopeForToken(token);
 return withTenant(s.org,s.actor,async sql=>{
  const from=addDays(s.today,-3),to=addDays(s.today,s.horizon);
  const records=await planningRows(sql,s,from,to);
  const entries=new Map(records.entries.map(e=>[e.date,e]));
  const shifts=new Map(records.shifts.map(e=>[e.date,e]));
  const requests=new Map(records.proposals.map(e=>[e.date,e]));
  const specific=new Map(records.changes.filter(e=>e.appliesTo==="single"&&e.status==="accepted").map(e=>[e.date,e]));
  const recurring=records.changes.filter(e=>e.appliesTo==="regular"&&e.status==="accepted").sort((a,b)=>b.date.localeCompare(a.date));
  const accepted=records.patterns.filter(p=>p.status==="accepted");
 const current=accepted.find(p=>p.effectiveFrom<=s.today);
 const days:PlanningDay[]=[];
  for(let d=from;d<=to;d=addDays(d,1)){
   const en=entries.get(d),sh=shifts.get(d),pr=requests.get(d);
   const regular=recurring.find(x=>x.date<=d),custom=specific.get(d)??regular;
   let kind:PlannedKind|null=null,source:PlanningDay["source"]="none";
   if(sh){kind=sh.kind==="night"?"night":"day";source="assigned";}
   else if(en?.code==="DAY_OFF"&&en.source==="schedule"){kind="off";source=pr?.status==="accepted"?"worker":"manual";}
   else if(en?.kind==="night"||en?.kind==="day"){kind=en.kind;source=pr?.status==="accepted"?"worker":"manual";}
   else if(en?.code==="WORK"&&en.hours>0){kind=(en.kind==="night"?"night":"day");source="manual";}
   else {
    const pattern=accepted.find(p=>p.effectiveFrom<=d);
    kind=cycleKind(d,pattern?.effectiveFrom??s.anchor,pattern?.workDays??s.workDays,pattern?.restDays??s.restDays,pattern?.shiftKind??s.defaultKind);
    if(kind)source="cycle";
   }
   if(!sh&&custom?.kind&&kind!=="off"&&source==="cycle"){kind=custom.kind;source="manual";}
   days.push({date:d,kind,source,proposal:pr?.status==="proposed"?pr.kind:null,
    proposalStatus:pr?.status==="proposed"||pr?.status==="rejected"?pr.status:null,
    startTime:custom?.start??sh?.start??null,endTime:custom?.end??sh?.end??null,endsNextDay:custom?.next??sh?.endsNextDay??kind==="night"});
  }
  return {owner:s.owner,horizon:s.horizon,workDays:current?.workDays??s.workDays,restDays:current?.restDays??s.restDays,
    defaultKind:current?.shiftKind??s.defaultKind,floatingDaysOff:current?.floatingDaysOff??false,patternFrom:current?.effectiveFrom??s.anchor,days};
 });
}
async function ensureNotLocked(sql:Sql,s:TenantScope,date:string){
 const [lock]=await sql<Array<{id:string}>>`SELECT id FROM timesheet_snapshots WHERE object_id=${s.object}::uuid
  AND period_start<=${date}::date AND period_end>=${date}::date
  AND status IN ('fixed','closed','internal_submitted','internal_checked','client_sent','client_approved') LIMIT 1`;
 if(lock)throw new Error("Период табеля уже закрыт или направлен на согласование");
}
async function writePlan(sql:Sql,s:Pick<TenantScope,"org"|"actor"|"worker"|"object">,date:string,kind:PlannedKind){
 const [conflict]=await sql<Array<{id:string}>>`SELECT sa.id FROM shift_assignments sa JOIN shifts sh ON sh.id=sa.shift_id
   WHERE sa.worker_id=${s.worker}::uuid AND sh.object_id=${s.object}::uuid AND sh.shift_date=${date}::date
     AND sa.confirmation_status<>'cancelled' LIMIT 1`;
 if(conflict)throw new Error("На дату уже назначена смена менеджером. Скорректируйте её через планирование объекта.");
 const [entry]=await sql<Array<{id:string;source:string;code:string;hours:number}>>`SELECT id,source,time_code code,fact_hours::float8 hours FROM time_entries
   WHERE worker_id=${s.worker}::uuid AND object_id=${s.object}::uuid AND work_date=${date}::date
   ORDER BY (shift_id IS NULL) DESC,updated_at DESC LIMIT 1 FOR UPDATE`;
 if(entry&&(entry.source!=="schedule"||entry.hours>0||!["PLANNED","DAY_OFF"].includes(entry.code)))throw new Error("За эту дату уже существует факт. План менять нельзя");
 if(entry){
  await sql`UPDATE time_entries SET planned=${kind!=="off"},time_code=${kind==="off"?"DAY_OFF":"PLANNED"},
    planned_shift_kind=${kind==="off"?null:kind},source='schedule',correction_reason='График по отметке сотрудника',
    updated_at=now() WHERE id=${entry.id}::uuid`;
 }else{
  await sql`INSERT INTO time_entries(organization_id,worker_id,object_id,work_date,planned,time_code,planned_shift_kind,source,correction_reason)
   VALUES(${s.org}::uuid,${s.worker}::uuid,${s.object}::uuid,${date}::date,${kind!=="off"},
    ${kind==="off"?"DAY_OFF":"PLANNED"},${kind==="off"?null:kind},'schedule','График по отметке сотрудника')`;
 }
}
export async function submitEmployeePlan(token:string,day:string,kind:PlannedKind){
 const s=await scopeForToken(token);
 const distance=Math.round((Date.parse(day+"T00:00:00Z")-Date.parse(s.today+"T00:00:00Z"))/86400000);
 if(!Number.isFinite(distance)||distance<0||distance>s.horizon)throw new Error("Дата вне доступного периода планирования");
 return withTenant(s.org,s.actor,async sql=>{
  await ensureNotLocked(sql,s,day);
  const [pattern]=await sql<Array<{workDays:number;restDays:number;floating:boolean}>>`SELECT work_days "workDays",rest_days "restDays",floating_days_off floating FROM worker_schedule_pattern_changes
    WHERE worker_id=${s.worker}::uuid AND object_id=${s.object}::uuid AND effective_from<=${day}::date AND status='accepted'
    ORDER BY effective_from DESC LIMIT 1`;
  const fixed=Boolean((pattern?.workDays??s.workDays)&&(pattern?.restDays??s.restDays)!==null);
  const status=s.owner==="worker"&&!fixed?"accepted":"proposed";
  if(status==="accepted")await writePlan(sql,s,day,kind);
  await sql`INSERT INTO worker_shift_plan_changes(organization_id,object_id,worker_id,work_date,requested_kind,status,requested_by_link_id)
   VALUES(${s.org}::uuid,${s.object}::uuid,${s.worker}::uuid,${day}::date,${kind},${status},${s.link}::uuid)
   ON CONFLICT(worker_id,object_id,work_date) DO UPDATE SET requested_kind=EXCLUDED.requested_kind,status=EXCLUDED.status,
     requested_by_link_id=EXCLUDED.requested_by_link_id,reviewed_at=NULL,reviewed_by_user_id=NULL,updated_at=now()`;
  return {ok:true,status};
 });
}
async function assertManager(actor:Actor,objectId:string,workerId?:string){
 requireCapability(actor,"operations.shift.edit");
 const objects=await listObjects(actor);
 const o=objects.find(x=>x.id===objectId);
 if(!o||!canReadRow(actor.access,"operations.shift.edit",o,actor))throw new AccessDeniedError("operations.shift.edit");
 if(workerId){
  const workers=await listWorkers(actor);
  if(!workers.some(x=>x.id===workerId&&x.objectId===objectId))throw new Error("Сотрудник не относится к объекту");
 }
}
export async function managerSetScheduleOwner(actor:Actor,objectId:string,owner:ScheduleOwner|null,workerId?:string,horizon?:number){
 if(actor.demo)throw new Error("Недоступно в демонстрации");
 await assertManager(actor,objectId,workerId);
 if(horizon!==undefined&&(!Number.isInteger(horizon)||horizon<2||horizon>31))throw new Error("Укажите горизонт от 2 до 31 дня");
 return withTenant(actor.organizationId,actor.userId,async sql=>{
  if(workerId&&owner===null){
   await sql`DELETE FROM worker_schedule_authorities WHERE object_id=${objectId}::uuid AND worker_id=${workerId}::uuid`;
  }else if(workerId){
   await sql`INSERT INTO worker_schedule_authorities(organization_id,object_id,worker_id,schedule_owner,updated_by_user_id)
    VALUES(${actor.organizationId}::uuid,${objectId}::uuid,${workerId}::uuid,${owner},${actor.userId}::uuid)
    ON CONFLICT(object_id,worker_id) DO UPDATE SET schedule_owner=EXCLUDED.schedule_owner,
      updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()`;
  }else{
   if(!owner)throw new Error("Режим графика объекта должен быть указан");
   await sql`INSERT INTO object_shift_reporting_settings(organization_id,object_id,schedule_authority,planning_horizon_days,updated_by_user_id)
    VALUES(${actor.organizationId}::uuid,${objectId}::uuid,${owner},${horizon??7},${actor.userId}::uuid)
    ON CONFLICT(object_id) DO UPDATE SET schedule_authority=EXCLUDED.schedule_authority,planning_horizon_days=COALESCE(${horizon??null},object_shift_reporting_settings.planning_horizon_days),
      updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()`;
  }
  return {ok:true};
 });
}
export async function managerReviewEmployeePlan(actor:Actor,objectId:string,workerId:string,date:string,approve:boolean){
 if(actor.demo)throw new Error("Недоступно в демонстрации");
 await assertManager(actor,objectId,workerId);
 return withTenant(actor.organizationId,actor.userId,async sql=>{
  const [request]=await sql<Array<{kind:PlannedKind}>>`SELECT requested_kind kind FROM worker_shift_plan_changes
    WHERE object_id=${objectId}::uuid AND worker_id=${workerId}::uuid AND work_date=${date}::date AND status='proposed' FOR UPDATE`;
  if(!request)throw new Error("Предложение не найдено или уже рассмотрено");
  const s={org:actor.organizationId,actor:actor.userId,worker:workerId,object:objectId};
  if(approve){
   await ensureNotLocked(sql,{...s,link:"",today:date,timezone:"Europe/Moscow",owner:"manager",horizon:7,workDays:null,restDays:null,anchor:date,defaultKind:null},date);
   await writePlan(sql,s,date,request.kind);
  }
  await sql`UPDATE worker_shift_plan_changes SET status=${approve?"accepted":"rejected"},reviewed_by_user_id=${actor.userId}::uuid,
   reviewed_at=now(),updated_at=now() WHERE object_id=${objectId}::uuid AND worker_id=${workerId}::uuid AND work_date=${date}::date`;
  return {ok:true};
 });
}
export async function managerEmployeePlanningChanges(actor:Actor,objectId?:string){
 requireCapability(actor,"operations.shift.read");
 if(actor.demo)return {planningChanges:[],workerAuthorities:[],patternChanges:[]};
 const people=(await listWorkers(actor)).filter(x=>x.objectId&&(!objectId||x.objectId===objectId));
 if(!people.length)return {planningChanges:[],workerAuthorities:[],patternChanges:[]};
 const ids=people.map(x=>x.id);
 return withTenant(actor.organizationId,actor.userId,async sql=>{
  const [planningChanges,workerAuthorities,patternChanges]=await Promise.all([
   sql<Array<{workerId:string;objectId:string;date:string;kind:PlannedKind;status:string}>>`SELECT worker_id "workerId",object_id "objectId",work_date::text date,requested_kind kind,status
    FROM worker_shift_plan_changes WHERE worker_id=ANY(${ids}::uuid[]) AND work_date BETWEEN current_date-1 AND current_date+31`,
   sql<Array<{workerId:string;objectId:string;scheduleOwner:ScheduleOwner}>>`SELECT worker_id "workerId",object_id "objectId",schedule_owner "scheduleOwner"
    FROM worker_schedule_authorities WHERE worker_id=ANY(${ids}::uuid[])`,
   sql<Array<{workerId:string;objectId:string;date:string;workDays:number;restDays:number;shiftKind:"day"|"night";floatingDaysOff:boolean;status:string}>>`SELECT worker_id "workerId",object_id "objectId",effective_from::text date,work_days "workDays",rest_days "restDays",shift_kind "shiftKind",floating_days_off "floatingDaysOff",status
    FROM worker_schedule_pattern_changes WHERE worker_id=ANY(${ids}::uuid[]) AND effective_from BETWEEN current_date-90 AND current_date+60 ORDER BY effective_from DESC`
  ]);
  return {planningChanges,workerAuthorities,patternChanges};
 });
}

export type PatternInput={effectiveFrom:string;workDays:number;restDays:number;shiftKind:"day"|"night";floatingDaysOff:boolean};
function validatePattern(pattern:PatternInput,from:string){
 if(!Number.isInteger(pattern.workDays)||!Number.isInteger(pattern.restDays)||pattern.workDays<1||pattern.workDays>30||pattern.restDays<0||pattern.restDays>30)throw new Error("Проверьте рабочие и выходные дни");
 if(pattern.floatingDaysOff&&!(pattern.workDays===5&&pattern.restDays===2||pattern.workDays===6&&pattern.restDays===1))throw new Error("Плавающие выходные доступны для графика 5/2 и 6/1");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(pattern.effectiveFrom)||pattern.effectiveFrom<from)throw new Error("Изменение графика должно действовать с сегодняшней или будущей даты");
}
export async function submitEmployeePattern(token:string,pattern:PatternInput){
 const s=await scopeForToken(token);
 validatePattern(pattern,addDays(s.today,1));
 if(pattern.effectiveFrom>addDays(s.today,s.horizon))throw new Error("Дата изменения за горизонтом планирования объекта");
 return withTenant(s.org,s.actor,async sql=>{
  await ensureNotLocked(sql,s,pattern.effectiveFrom);
  await sql`INSERT INTO worker_schedule_pattern_changes(organization_id,object_id,worker_id,effective_from,work_days,rest_days,shift_kind,floating_days_off,status,source_link_id)
   VALUES(${s.org}::uuid,${s.object}::uuid,${s.worker}::uuid,${pattern.effectiveFrom}::date,${pattern.workDays},${pattern.restDays},${pattern.shiftKind},${pattern.floatingDaysOff},'proposed',${s.link}::uuid)
   ON CONFLICT(worker_id,object_id,effective_from) DO UPDATE SET work_days=EXCLUDED.work_days,rest_days=EXCLUDED.rest_days,shift_kind=EXCLUDED.shift_kind,floating_days_off=EXCLUDED.floating_days_off,
      status='proposed',source_link_id=EXCLUDED.source_link_id,reviewed_at=NULL,reviewed_by_user_id=NULL,updated_at=now()`;
  return {ok:true,status:"proposed"};
 });
}
export async function submitEmployeeWeek(token:string,weekStart:string,offDates:string[]){
 const s=await scopeForToken(token);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)||new Date(weekStart+"T00:00:00Z").getUTCDay()!==1)throw new Error("Выберите неделю, начиная с понедельника");
 const dates=Array.from({length:7},(_,i)=>addDays(weekStart,i));
 if(weekStart<s.today||dates[6]>addDays(s.today,s.horizon))throw new Error("Выберите полную будущую неделю в пределах горизонта планирования");
 if(new Set(offDates).size!==offDates.length||offDates.some(d=>!dates.includes(d)))throw new Error("Проверьте выбранные выходные");
 return withTenant(s.org,s.actor,async sql=>{
  const [p]=await sql<Array<{workDays:number;restDays:number;kind:"day"|"night";floating:boolean}>>`SELECT work_days "workDays",rest_days "restDays",shift_kind kind,floating_days_off floating
    FROM worker_schedule_pattern_changes WHERE worker_id=${s.worker}::uuid AND object_id=${s.object}::uuid AND effective_from<=${weekStart}::date AND status='accepted' ORDER BY effective_from DESC LIMIT 1`;
  const workDays=p?.workDays??s.workDays,restDays=p?.restDays??s.restDays;
  if(!p?.floating||!(workDays===5&&restDays===2||workDays===6&&restDays===1))throw new Error("Плавающие выходные не разрешены в текущем графике");
  if(offDates.length!==restDays)throw new Error(restDays===1?"На неделе должен быть один выходной":"На неделе должно быть два выходных");
  const status=s.owner==="worker"?"accepted":"proposed";
  for(const date of dates){
   await ensureNotLocked(sql,s,date);
   const kind:PlannedKind=offDates.includes(date)?"off":p?.kind??s.defaultKind??"day";
   if(status==="accepted")await writePlan(sql,s,date,kind);
   await sql`INSERT INTO worker_shift_plan_changes(organization_id,object_id,worker_id,work_date,requested_kind,status,requested_by_link_id)
    VALUES(${s.org}::uuid,${s.object}::uuid,${s.worker}::uuid,${date}::date,${kind},${status},${s.link}::uuid)
    ON CONFLICT(worker_id,object_id,work_date) DO UPDATE SET requested_kind=EXCLUDED.requested_kind,status=EXCLUDED.status,
      requested_by_link_id=EXCLUDED.requested_by_link_id,reviewed_at=NULL,reviewed_by_user_id=NULL,updated_at=now()`;
  }
  return {ok:true,status,updated:dates.length};
 });
}
export async function managerSetWorkerPattern(actor:Actor,objectId:string,workerId:string,pattern:PatternInput){
 if(actor.demo)throw new Error("Недоступно в демонстрации");
 await assertManager(actor,objectId,workerId);
 validatePattern(pattern,new Date().toISOString().slice(0,10));
 return withTenant(actor.organizationId,actor.userId,async sql=>{
  const [fact]=await sql<Array<{id:string}>>`SELECT id FROM timesheet_snapshots WHERE object_id=${objectId}::uuid
    AND period_start<=${pattern.effectiveFrom}::date AND period_end>=${pattern.effectiveFrom}::date
    AND status IN ('fixed','closed','internal_submitted','internal_checked','client_sent','client_approved') LIMIT 1`;
  if(fact)throw new Error("Дата попадает в закрытый период");
  await sql`INSERT INTO worker_schedule_pattern_changes(organization_id,object_id,worker_id,effective_from,work_days,rest_days,shift_kind,floating_days_off,status,reviewed_by_user_id,reviewed_at)
   VALUES(${actor.organizationId}::uuid,${objectId}::uuid,${workerId}::uuid,${pattern.effectiveFrom}::date,${pattern.workDays},${pattern.restDays},${pattern.shiftKind},${pattern.floatingDaysOff},'accepted',${actor.userId}::uuid,now())
   ON CONFLICT(worker_id,object_id,effective_from) DO UPDATE SET work_days=EXCLUDED.work_days,rest_days=EXCLUDED.rest_days,shift_kind=EXCLUDED.shift_kind,
     floating_days_off=EXCLUDED.floating_days_off,status='accepted',reviewed_by_user_id=EXCLUDED.reviewed_by_user_id,reviewed_at=now(),updated_at=now()`;
  return {ok:true};
 });
}
export async function managerReviewPattern(actor:Actor,objectId:string,workerId:string,date:string,approve:boolean){
 if(actor.demo)throw new Error("Недоступно в демонстрации");
 await assertManager(actor,objectId,workerId);
 return withTenant(actor.organizationId,actor.userId,async sql=>{
  const [request]=await sql<Array<{effectiveFrom:string}>>`SELECT effective_from::text "effectiveFrom" FROM worker_schedule_pattern_changes
    WHERE worker_id=${workerId}::uuid AND object_id=${objectId}::uuid AND effective_from=${date}::date AND status='proposed' FOR UPDATE`;
  if(!request)throw new Error("Запрос уже обработан или отсутствует");
  if(approve&&date<new Date().toISOString().slice(0,10))throw new Error("График нельзя вводить задним числом");
  await sql`UPDATE worker_schedule_pattern_changes SET status=${approve?"accepted":"rejected"},
   reviewed_by_user_id=${actor.userId}::uuid,reviewed_at=now(),updated_at=now()
   WHERE worker_id=${workerId}::uuid AND object_id=${objectId}::uuid AND effective_from=${date}::date`;
  return {ok:true};
 });
}
