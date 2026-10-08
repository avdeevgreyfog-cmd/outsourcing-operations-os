import type {Actor} from "@/lib/access/types";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {hasCapability,canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";
import {listObjects,listWorkers,listShifts,listTasks} from "@/lib/data/service";
import {listLaunchPlans,listLaunchSiteVisits,type LaunchSiteVisitRow} from "@/lib/operations/launch-management";

export type MobileWorker={id:string;name:string;phone:string|null;objectId:string;objectName:string;specialty:string|null;startDate:string|null;documents:string|null;ppeMissing:string[];assignmentId:string|null;kind:"day"|"night";time:string|null;firstDay:boolean;attendance:"pending"|"present"|"absent";reason:string|null};
export type MobileCheck={workerId:string;date:string;checkpoint:string;state:"done"|"issue";note:string|null};
export type MobileVisit={id:string;launchId:string;objectId:string;objectName:string;scheduledDate:string|null;status:string;checklist:LaunchSiteVisitRow["checklist"];notes:string|null};
export type MobileDesk={date:string;objects:{id:string;name:string;address:string|null}[];workers:MobileWorker[];checks:MobileCheck[];visits:MobileVisit[];tasks:{id:string;title:string;due:string|null}[];canEdit:boolean;canVisitEdit:boolean;demo:boolean};
export const firstDaySteps=["met","pass_checked","documents_checked","briefing_checked","ppe_checked","started"] as const;
export type FirstDayStep=(typeof firstDaySteps)[number];
export function moscowToday(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function plus(date:string,n:number){const t=new Date(date+"T00:00:00Z");t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)}
function safeDate(date:string){return /^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date+"T00:00:00Z"))&&date>=plus(moscowToday(),-7)&&date<=plus(moscowToday(),14)}
function managerCanEdit(actor:Actor,object:Parameters<typeof canReadRow>[2]){return hasCapability(actor.access,"operations.shift.edit")&&canReadRow(actor.access,"operations.shift.edit",object,actor)}
type Assignment={id:string;workerId:string;objectId:string;kind:string;time:string};
type Event={assignmentId:string;eventType:string;reason:string|null};
export async function mobileManagerDesk(actor:Actor,date=moscowToday()):Promise<MobileDesk>{
 requireCapability(actor,"operations.shift.read");requireCapability(actor,"worker.read");requireCapability(actor,"operations.object.read");
 if(!safeDate(date))throw new Error("Дата вне доступного периода");
 const [objects,workers,shifts]=await Promise.all([listObjects(actor),listWorkers(actor),listShifts(actor)]);
 const visible=objects.filter(o=>!["archived","completed"].includes(o.status));
 const objectIds=visible.map(o=>o.id),names=new Map(visible.map(o=>[o.id,o.name]));
 const people=workers.filter(w=>w.objectId&&names.has(w.objectId)&&w.status==="active");
 const ids=people.map(w=>w.id),byId=new Map(people.map(w=>[w.id,w]));
 let assignments:Assignment[]=[],events:Event[]=[],checks:MobileCheck[]=[];
 if(actor.demo)assignments=shifts.filter(s=>s.dateIso===date).flatMap(s=>s.workerIds.map(workerId=>({id:s.id+"-"+workerId,workerId,objectId:s.objectId,kind:s.kind,time:s.time})));
 else if(ids.length&&objectIds.length){
  [assignments,events,checks]=await withTenant(actor.organizationId,actor.userId,sql=>Promise.all([
   sql<Assignment[]>`SELECT sa.id,sa.worker_id "workerId",sh.object_id "objectId",sh.shift_kind kind,
     to_char(sh.starts_at AT TIME ZONE 'Europe/Moscow','HH24:MI')||'–'||to_char(sh.ends_at AT TIME ZONE 'Europe/Moscow','HH24:MI') time
     FROM shift_assignments sa JOIN shifts sh ON sh.id=sa.shift_id
     WHERE sh.object_id=ANY(${objectIds}::uuid[]) AND sa.worker_id=ANY(${ids}::uuid[]) AND sh.shift_date=${date}::date
      AND sa.confirmation_status<>'cancelled' AND NOT sa.is_reserve ORDER BY sh.starts_at`,
   sql<Event[]>`SELECT DISTINCT ON(ae.shift_assignment_id) ae.shift_assignment_id "assignmentId",ae.event_type "eventType",ae.reason
    FROM attendance_events ae JOIN shift_assignments sa ON sa.id=ae.shift_assignment_id JOIN shifts sh ON sh.id=sa.shift_id
    WHERE sh.object_id=ANY(${objectIds}::uuid[]) AND sa.worker_id=ANY(${ids}::uuid[]) AND sh.shift_date=${date}::date
    ORDER BY ae.shift_assignment_id,ae.event_at DESC,ae.created_at DESC`,
   sql<MobileCheck[]>`SELECT worker_id "workerId",first_shift_date::text date,checkpoint,state,note
    FROM worker_first_day_checkpoints WHERE object_id=ANY(${objectIds}::uuid[]) AND worker_id=ANY(${ids}::uuid[]) AND first_shift_date=${date}::date`
  ]));
 }
 const byAssignment=new Map(events.map(x=>[x.assignmentId,x]));
 const roster:MobileWorker[]=assignments.filter(x=>byId.has(x.workerId)).map(a=>{
  const w=byId.get(a.workerId)!,ev=byAssignment.get(a.id);
  return {id:w.id,name:w.fullName,phone:w.phone??null,objectId:a.objectId,objectName:names.get(a.objectId)??"",
   specialty:w.specialty??null,startDate:w.startDate??null,documents:w.employmentDocumentsStatus??null,
   ppeMissing:w.ppeMissingNames??[],assignmentId:a.id,kind:a.kind==="night"?"night":"day",time:a.time,
   firstDay:w.startDate===date,attendance:ev?.eventType==="arrival"?"present":ev?.eventType==="no_show"?"absent":"pending",reason:ev?.reason??null};
 });
 for(const w of people){
  if(w.startDate!==date||roster.some(x=>x.id===w.id))continue;
  roster.push({id:w.id,name:w.fullName,phone:w.phone??null,objectId:w.objectId!,objectName:w.object??"",
   specialty:w.specialty??null,startDate:w.startDate??null,documents:w.employmentDocumentsStatus??null,
   ppeMissing:w.ppeMissingNames??[],assignmentId:null,kind:w.scheduleShiftKind==="night"?"night":"day",
   time:w.todayShiftTime??null,firstDay:true,attendance:"pending",reason:null});
 }
 const [launches,visits,tasks]=await Promise.all([listLaunchPlans(actor),listLaunchSiteVisits(actor),hasCapability(actor.access,"task.read")?listTasks(actor):Promise.resolve([])]);
 const allowedLaunches=new Set(launches.filter(l=>names.has(l.objectId)&&!["completed","cancelled"].includes(l.phase)).map(l=>l.id));
 return {date,objects:visible.map(o=>({id:o.id,name:o.name,address:o.address??null})),workers:roster.sort((a,b)=>Number(b.firstDay)-Number(a.firstDay)||a.objectName.localeCompare(b.objectName,"ru")||a.name.localeCompare(b.name,"ru")),
   checks,visits:visits.filter(v=>allowedLaunches.has(v.launchId)&&v.status!=="cancelled").map(v=>({id:v.id,launchId:v.launchId,objectId:v.objectId,objectName:names.get(v.objectId)??"",scheduledDate:v.scheduledDate,status:v.status,checklist:v.checklist,notes:v.notes})),
   tasks:tasks.filter(t=>!["done","cancelled"].includes(t.status)).slice(0,12).map(t=>({id:t.id,title:t.title,due:t.due??null})),
   canEdit:hasCapability(actor.access,"operations.shift.edit"),canVisitEdit:hasCapability(actor.access,"operations.object.edit"),demo:actor.demo};
}
async function verifyEmployee(actor:Actor,objectId:string,workerId:string){
 requireCapability(actor,"operations.shift.edit");requireCapability(actor,"worker.read");
 const [objects,workers]=await Promise.all([listObjects(actor),listWorkers(actor)]);
 const obj=objects.find(o=>o.id===objectId),worker=workers.find(w=>w.id===workerId&&w.objectId===objectId&&w.status==="active");
 if(!obj||!worker||!managerCanEdit(actor,obj))throw new AccessDeniedError("operations.shift.edit");
 return worker;
}
export async function markMobileAttendance(actor:Actor,objectId:string,date:string,kind:"day"|"night",workerIds:string[],state:"present"|"absent"|"pending",reason:string|null){
 if(actor.demo)throw new Error("В демонстрации сохранение недоступно");
 if(!safeDate(date)||date>moscowToday())throw new Error("Отметки будущей явки недоступны");
 if(workerIds.length<1||workerIds.length>50||new Set(workerIds).size!==workerIds.length)throw new Error("Выберите не более 50 сотрудников");
 if((reason?.length??0)>500)throw new Error("Слишком длинный комментарий");
 for(const id of workerIds)await verifyEmployee(actor,objectId,id);
 return withTenant(actor.organizationId,actor.userId,sql=>sql.begin(async tx=>{
  const rows=await tx<Array<{id:string;workerId:string}>>`SELECT sa.id,sa.worker_id "workerId" FROM shift_assignments sa JOIN shifts sh ON sh.id=sa.shift_id
   WHERE sh.object_id=${objectId}::uuid AND sh.shift_date=${date}::date AND sh.shift_kind=${kind} AND sa.worker_id=ANY(${workerIds}::uuid[])
    AND sa.confirmation_status<>'cancelled' AND NOT sa.is_reserve FOR UPDATE OF sa`;
  if(new Set(rows.map(x=>x.workerId)).size!==workerIds.length)throw new Error("Не у всех сотрудников есть назначенная смена");
  const assignedIds=rows.map(x=>x.id);
  const events=await tx<Array<{assignmentId:string;type:string}>>`SELECT DISTINCT ON(shift_assignment_id) shift_assignment_id "assignmentId",event_type type
   FROM attendance_events WHERE shift_assignment_id=ANY(${assignedIds}::uuid[]) ORDER BY shift_assignment_id,event_at DESC,created_at DESC`;
  const latest=new Map(events.map(x=>[x.assignmentId,x.type]));
  const event=state==="present"?"arrival":state==="absent"?"no_show":"manual_correction";
  let changed=0;
  for(const row of rows){if(latest.get(row.id)===event)continue;
   await tx`INSERT INTO attendance_events(organization_id,shift_assignment_id,event_type,event_at,source,reason,created_by_user_id)
     VALUES(${actor.organizationId}::uuid,${row.id}::uuid,${event},now(),'manager_mobile',${reason??null},${actor.userId}::uuid)`;changed++;
  }
  return {ok:true,changed};
 }));
}
export async function markFirstDayStep(actor:Actor,objectId:string,workerId:string,date:string,checkpoint:FirstDayStep,state:"done"|"issue"|null,note:string|null){
 if(actor.demo)throw new Error("Демонстрация не сохраняет данные");
 if(!safeDate(date)||date>moscowToday())throw new Error("Контроль будущих выходов недоступен");
 if(!firstDaySteps.includes(checkpoint)||(note?.length??0)>500)throw new Error("Неверная контрольная отметка");
 const worker=await verifyEmployee(actor,objectId,workerId);
 if(worker.startDate!==date)throw new Error("Не совпадает дата первого выхода");
 return withTenant(actor.organizationId,actor.userId,async sql=>{
  if(checkpoint==="started"&&state==="done"){
   const [arrived]=await sql<Array<{id:string}>>`SELECT ae.id FROM attendance_events ae JOIN shift_assignments sa ON sa.id=ae.shift_assignment_id
    JOIN shifts sh ON sh.id=sa.shift_id WHERE sh.object_id=${objectId}::uuid AND sh.shift_date=${date}::date
    AND sa.worker_id=${workerId}::uuid AND ae.event_type='arrival' ORDER BY ae.event_at DESC LIMIT 1`;
   if(!arrived)throw new Error("Сначала отметьте прибытие через контроль явки");
  }
  if(state===null)await sql`DELETE FROM worker_first_day_checkpoints WHERE object_id=${objectId}::uuid AND worker_id=${workerId}::uuid
     AND first_shift_date=${date}::date AND checkpoint=${checkpoint}`;
  else await sql`INSERT INTO worker_first_day_checkpoints(organization_id,object_id,worker_id,first_shift_date,checkpoint,state,note,checked_by_user_id,checked_at)
   VALUES(${actor.organizationId}::uuid,${objectId}::uuid,${workerId}::uuid,${date}::date,${checkpoint},${state},${note??null},${actor.userId}::uuid,now())
   ON CONFLICT(object_id,worker_id,first_shift_date,checkpoint) DO UPDATE SET state=EXCLUDED.state,note=EXCLUDED.note,
     checked_by_user_id=EXCLUDED.checked_by_user_id,checked_at=now()`;
  return {ok:true};
 });
}
