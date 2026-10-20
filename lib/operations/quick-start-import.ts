import { createHash } from "node:crypto";
import { z } from "zod";
import type { Sql } from "postgres";
import type { Actor } from "@/lib/access/types";
import { requireCapability, AccessDeniedError } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import {resolveObjectConditionInTransaction,conditionScheduleParts} from "@/lib/operations/object-conditions";

const key=z.string().trim().min(1).max(240);
const nullableText=z.string().trim().max(240).nullable().optional();
export const quickStartImportSchema=z.object({
 objects:z.array(z.object({key,name:key,id:z.string().uuid().optional(),address:nullableText,actualStartDate:z.string().date().nullable().optional()})).max(500).default([]),
 workers:z.array(z.object({key,fullName:key,id:z.string().uuid().optional(),phone:nullableText,status:z.enum(["requires_assignment","active"]).optional()})).max(1000).default([]),
 assignments:z.array(z.object({worker:key,object:key,specialtyId:z.string().uuid().optional(),specialtyName:nullableText,startDate:z.string().date().nullable().optional(),endDate:z.string().date().nullable().optional()})).max(1000).default([]),
 hours:z.array(z.object({worker:key,object:key,date:z.string().date(),hours:z.number().min(0).max(24),kind:z.enum(["day","night"])})).max(3000).default([]),
}).superRefine((v,c)=>{if(!v.objects.length&&!v.workers.length&&!v.assignments.length&&!v.hours.length)c.addIssue({code:"custom",message:"Нет строк для импорта"});});
export type QuickStartImportPayload=z.infer<typeof quickStartImportSchema>;
export type ImportIssue={section:string;row:number;message:string;blocking:boolean};
type Context={id:string;organizationId:string;createdByUserId?:string;ownerUserId?:string|null;regionId?:string|null;assigneeUserIds?:string[];objectId?:string|null;status:string;updatedAt:string;name?:string;fullName?:string;phone?:string|null;today?:string};
type Assignment={id:string;workerId:string;objectId:string;specialtyId:string|null;startDate:string|null;endDate:string|null};
export class QuickStartImportError extends Error {}
const hash=(v:unknown)=>createHash("sha256").update(JSON.stringify(v)).digest("hex");
const uuid=(v:unknown)=>{const h=hash(v);return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;};
const normalized=(s:string)=>s.trim().toLocaleLowerCase("ru").replace(/\s+/g," ");
export async function resolveQuickStartImport(sql:Sql,actor:Actor,payload:QuickStartImportPayload){
 const issues:ImportIssue[]=[];
 const note=(section:string,row:number,message:string,blocking=true)=>issues.push({section,row:row+2,message,blocking});
 const org=actor.organizationId;
 const objects=await sql<Context[]>`SELECT o.id,o.organization_id "organizationId",o.created_by_user_id "createdByUserId",o.name,o.status,o.updated_at::text "updatedAt",o.owner_user_id "ownerUserId",o.region_id "regionId",o.id "objectId",ARRAY(SELECT user_id::text FROM object_assignments a WHERE a.organization_id=o.organization_id AND a.object_id=o.id AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)) "assigneeUserIds",(now() AT TIME ZONE COALESCE(s.timezone,'Europe/Moscow'))::date::text today FROM objects o LEFT JOIN object_shift_reporting_settings s ON s.object_id=o.id AND s.organization_id=o.organization_id WHERE o.organization_id=${org}::uuid ORDER BY o.id`;
 const workers=await sql<Context[]>`SELECT w.id,w.organization_id "organizationId",w.created_by_user_id "createdByUserId",w.full_name "fullName",w.phone,w.status,w.updated_at::text "updatedAt",a.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",ARRAY(SELECT user_id::text FROM object_assignments x WHERE x.organization_id=w.organization_id AND x.object_id=o.id AND x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) || ARRAY[a.manager_user_id::text,o.owner_user_id::text] "assigneeUserIds" FROM worker_profiles w LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments a WHERE a.organization_id=w.organization_id AND a.worker_id=w.id ORDER BY a.effective_from DESC,a.id LIMIT 1) a ON true LEFT JOIN objects o ON o.id=a.object_id AND o.organization_id=w.organization_id WHERE w.organization_id=${org}::uuid ORDER BY w.id`;
 const existingAssignments=await sql<Assignment[]>`SELECT id,worker_id "workerId",object_id "objectId",specialty_id "specialtyId",effective_from::text "startDate",effective_to::text "endDate" FROM worker_object_assignments WHERE organization_id=${org}::uuid ORDER BY id`;
 const specialties=await sql<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE organization_id=${org}::uuid AND active`;
 const specialtyIds=new Set(specialties.map(v=>v.id));
 const objectMap=new Map(objects.map(o=>[o.id,o])); const workerMap=new Map(workers.map(w=>[w.id,w]));
 const objectRows:Array<{id:string;reuse:boolean;row:QuickStartImportPayload["objects"][number]}>=[];
 const workerRows:Array<{id:string;reuse:boolean;row:QuickStartImportPayload["workers"][number]}>=[];
 const permit=(context:Context,capability:string)=>{if(!canReadRow(actor.access,capability,context,actor))throw new AccessDeniedError(capability);};
 const seenObjects=new Set<string>(),seenWorkers=new Set<string>();
 payload.objects.forEach((row,index)=>{
  if(seenObjects.has(row.key)){note("Объекты",index,"Повторяется ключ объекта");return;} seenObjects.add(row.key);
  const matches=row.id?objects.filter(o=>o.id===row.id):objects.filter(o=>normalized(o.name!)===normalized(row.name));
  if(matches.length>1){note("Объекты",index,"Несколько объектов с таким названием: укажите ID");return;}
  if(row.id&&!matches.length){note("Объекты",index,"ID объекта недоступен");return;}
  if(objectRows.some(v=>normalized(v.row.name)===normalized(row.name))){note("Объекты",index,"Название повторяется внутри файла; используйте один ключ объекта");return;}
  const match=matches[0];if(match){permit(match,"operations.object.edit");note("Объекты",index,"Объект уже существует: будет использован без изменений",false);}
  else requireCapability(actor,"operations.object.create");
  const id=match?.id??uuid([org,payload,"object",row.key]);
  const context=match??{id,organizationId:org,createdByUserId:actor.userId,status:"active",updatedAt:"",name:row.name,today:new Date().toLocaleDateString("sv-SE",{timeZone:"Europe/Moscow"})};
  if(!match)permit(context,"operations.object.create");
  objectMap.set(row.key,context);objectRows.push({id,reuse:!!match,row});
 });
 payload.workers.forEach((row,index)=>{
  if(seenWorkers.has(row.key)){note("Сотрудники",index,"Повторяется ключ сотрудника");return;}seenWorkers.add(row.key);
  const digits=row.phone?.replace(/\D/g,"");
  const matches=row.id?workers.filter(w=>w.id===row.id):digits?workers.filter(w=>w.phone?.replace(/\D/g,"")===digits):[];
  if(matches.length>1){note("Сотрудники",index,"Телефон неоднозначен: укажите ID сотрудника");return;}
  if(row.id&&!matches.length){note("Сотрудники",index,"ID сотрудника недоступен");return;}
  if(!row.id&&!digits&&workers.some(w=>normalized(w.fullName!)===normalized(row.fullName))){note("Сотрудники",index,"Есть совпадение ФИО: укажите ID или телефон, автоматического объединения нет");return;}
  if(workerRows.some(v=>(digits&&v.row.phone?.replace(/\D/g,"")===digits)||normalized(v.row.fullName)===normalized(row.fullName))){note("Сотрудники",index,"Повтор ФИО или телефона внутри файла: устраните дубль или загрузите отдельно после проверки личности");return;}
  const match=matches[0];if(match){permit(match,"worker.edit");note("Сотрудники",index,"Сотрудник найден: профиль сохранится без изменений",false);if(row.status&&row.status!==match.status)note("Сотрудники",index,"Статус противоречит существующему профилю");}
  const id=match?.id??uuid([org,payload,"worker",row.key]);
  const context=match??{id,organizationId:org,createdByUserId:actor.userId,status:"requires_assignment",updatedAt:"",fullName:row.fullName};
  if(!match)permit(context,"worker.edit");
  workerMap.set(row.key,context);workerRows.push({id,reuse:!!match,row});
 });
 const assignments:Array<Assignment & {reuse:boolean}>=[];
 payload.assignments.forEach((row,index)=>{
  const w=workerMap.get(row.worker),o=objectMap.get(row.object);
  if(!w||!o){note("Назначения",index,"Не найден сотрудник или объект по ключу/ID");return;}
  permit(w,"worker.edit");permit(o,"worker.edit");
  const matchingSpecialties=row.specialtyName?specialties.filter(v=>normalized(v.name)===normalized(row.specialtyName!)):[];
  const specialtyId=row.specialtyId??(matchingSpecialties.length===1?matchingSpecialties[0].id:null);
  if(!specialtyId||!specialtyIds.has(specialtyId)){note("Назначения",index,"Специальность не указана, неоднозначна или недоступна. Выберите существующую специальность");return;}
  if(row.startDate&&row.endDate&&row.endDate<row.startDate){note("Назначения",index,"Окончание раньше начала");return;}
  if(!["active","requires_assignment"].includes(w.status)||o.status!=="active"){note("Назначения",index,"Назначение несовместимо со статусом сотрудника/объекта");return;}
  const item={id:uuid([org,payload,"assignment",index]),workerId:w.id,objectId:o.id,specialtyId,startDate:row.startDate??null,endDate:row.endDate??null,reuse:false};
  const overlaps=[...existingAssignments,...assignments].filter(a=>a.workerId===w.id&&(a.startDate??"0001-01-01")<=(item.endDate??"9999-12-31")&&(a.endDate??"9999-12-31")>=(item.startDate??"0001-01-01"));
  const same=overlaps.find(a=>a.objectId===item.objectId&&a.specialtyId===item.specialtyId&&a.startDate===item.startDate&&a.endDate===item.endDate);
  if(overlaps.length&&(!same||overlaps.length>1)){note("Назначения",index,"Период пересекается с существующим/импортируемым назначением");return;}
  if(same){item.id=same.id;item.reuse=true;note("Назначения",index,"Назначение уже существует: без изменений",false);} assignments.push(item);
 });
 workerRows.forEach((v,index)=>{if(!v.reuse&&v.row.status==="active"&&!assignments.some(a=>a.workerId===v.id))note("Сотрудники",index,"Действующий статус без назначения: укажите назначение или статус требует назначения");});
 const hours:Array<{workerId:string;objectId:string;date:string;hours:number;kind:"day"|"night"}>=[];
 for(const [index,row] of payload.hours.entries()){
  const w=workerMap.get(row.worker),o=objectMap.get(row.object);
  if(!w||!o){note("Часы",index,"Не найден сотрудник/объект");continue;}
  permit(w,"time.time_entry.edit");permit(o,"time.time_entry.edit");
  if(!["active","requires_assignment"].includes(w.status)||o.status!=="active"){note("Часы",index,"Статус сотрудника/объекта не позволяет импортировать часы");continue;}
  if(row.date>o.today!){note("Часы",index,"Будущие часы запрещены");continue;}
  if(![...existingAssignments,...assignments].some(a=>a.workerId===w.id&&a.objectId===o.id&&(!a.startDate||a.startDate<=row.date)&&(!a.endDate||a.endDate>=row.date))){note("Часы",index,"Нет назначения, действующего в эту дату");continue;}
  const [fact]=await sql<Array<{id:string}>>`SELECT id FROM time_entries WHERE organization_id=${org}::uuid AND worker_id=${w.id}::uuid AND object_id=${o.id}::uuid AND work_date=${row.date}::date LIMIT 1`;
  const [fixed]=await sql<Array<{id:string}>>`SELECT id FROM timesheet_snapshots WHERE organization_id=${org}::uuid AND object_id=${o.id}::uuid AND period_start<=${row.date}::date AND period_end>=${row.date}::date AND status IN ('fixed','closed','internal_submitted','internal_checked','client_sent','client_approved') LIMIT 1`;
  if(fact||fixed||hours.some(h=>h.workerId===w.id&&h.objectId===o.id&&h.date===row.date)){note("Часы",index,"Есть факт/фиксированный табель или повтор строки: перезапись запрещена");continue;}
  hours.push({workerId:w.id,objectId:o.id,date:row.date,hours:row.hours,kind:row.kind});
 }
 const plan={objectRows,workerRows,assignments,hours,issues};
 const contexts=[...objectRows.map(r=>objectMap.get(r.row.key)),...workerRows.map(r=>workerMap.get(r.row.key)),...payload.assignments.flatMap(r=>[objectMap.get(r.object),workerMap.get(r.worker)]),...payload.hours.flatMap(r=>[objectMap.get(r.object),workerMap.get(r.worker)])];
 return {...plan,digest:hash([actor.organizationId,actor.userId,payload,plan,contexts,existingAssignments])};
}
export async function quickStartImport(actor:Actor,payload:QuickStartImportPayload,action:"preview"|"commit",digest?:string){
 if(payload.workers.length||payload.assignments.length)requireCapability(actor,"worker.edit");if(payload.assignments.length)requireCapability(actor,"operations.shift.edit");if(payload.hours.length)requireCapability(actor,"time.time_entry.edit");
 if(actor.demo)throw new QuickStartImportError("Демо не сохраняет импорт. Откройте рабочую организацию.");
 return withTenant(actor.organizationId,actor.userId,async sql=>{
  if(action==="commit"){
   for(const phone of [...new Set(payload.workers.map(row=>row.phone?.replace(/\D/g,"")??"").filter(Boolean))].sort())
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId+":worker-phone:"+phone},0))`;
   await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`quick-start:${actor.organizationId}`},0))`;
   await sql`SELECT id FROM worker_profiles WHERE organization_id=${actor.organizationId}::uuid ORDER BY id FOR UPDATE`;
   await sql`SELECT id FROM objects WHERE organization_id=${actor.organizationId}::uuid ORDER BY id FOR UPDATE`;
  }
  const plan=await resolveQuickStartImport(sql,actor,payload);
  if(action==="preview")return {...plan,canCommit:!plan.issues.some(i=>i.blocking)};
  if(!digest||plan.digest!==digest)throw new QuickStartImportError("Данные изменились. Повторите предварительную проверку.");
  if(plan.issues.some(i=>i.blocking))throw new QuickStartImportError("Исправьте блокирующие замечания");
  for(const v of plan.objectRows)if(!v.reuse)await sql`INSERT INTO objects(id,organization_id,name,code,status,client_company_id,region_id,address_text,actual_start_date,created_by_user_id) VALUES(${v.id}::uuid,${actor.organizationId}::uuid,${v.row.name},${`OBJ-${v.id.slice(0,8)}`},'active',NULL,NULL,${v.row.address??null},${v.row.actualStartDate??null}::date,${actor.userId}::uuid)`;
  for(const v of plan.workerRows)if(!v.reuse)await sql`INSERT INTO worker_profiles(id,organization_id,full_name,phone,status,source,created_by_user_id) VALUES(${v.id}::uuid,${actor.organizationId}::uuid,${v.row.fullName},${v.row.phone??null},'requires_assignment','Быстрый старт: импорт',${actor.userId}::uuid)`;
  for(const a of plan.assignments)if(!a.reuse){
   const condition=await resolveObjectConditionInTransaction(sql,actor.organizationId,{objectId:a.objectId,specialtyId:a.specialtyId!,shiftKind:"mixed",date:a.startDate});
   const schedule=conditionScheduleParts(condition);
   await sql`INSERT INTO worker_object_assignments(id,organization_id,worker_id,object_id,specialty_id,effective_from,effective_to,manager_user_id,paid_hours_per_shift,schedule_work_days,schedule_rest_days,schedule_shift_kind,schedule_anchor_date,source_condition_id,created_by_user_id) VALUES(${a.id}::uuid,${actor.organizationId}::uuid,${a.workerId}::uuid,${a.objectId}::uuid,${a.specialtyId}::uuid,${a.startDate}::date,${a.endDate}::date,(SELECT owner_user_id FROM objects WHERE id=${a.objectId}::uuid AND organization_id=${actor.organizationId}::uuid),${condition?.paidHours??null},${schedule.workDays},${schedule.restDays},${condition?.shiftKind??"mixed"},${a.startDate??condition?.effectiveFrom??null}::date,${condition?.id??null}::uuid,${actor.userId}::uuid)`;
   await sql`UPDATE worker_profiles SET status='active',updated_at=now() WHERE id=${a.workerId}::uuid AND organization_id=${actor.organizationId}::uuid AND status='requires_assignment' AND (${a.startDate}::date IS NULL OR ${a.startDate}::date<=current_date) AND (${a.endDate}::date IS NULL OR ${a.endDate}::date>=current_date)`;
  }
  for(const h of plan.hours)await sql`INSERT INTO time_entries(organization_id,worker_id,object_id,work_date,planned,time_code,fact_hours,day_hours,night_hours,planned_shift_kind,source,correction_reason,corrected_by_user_id) VALUES(${actor.organizationId}::uuid,${h.workerId}::uuid,${h.objectId}::uuid,${h.date}::date,false,'WORK',${h.hours},${h.kind==="day"?h.hours:0},${h.kind==="night"?h.hours:0},${h.kind},'import','Импорт исторического факта',${actor.userId}::uuid)`;
  await sql`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'quick_start_import','bulk_import','Импорт действующего контура',${sql.json({objects:plan.objectRows.length,workers:plan.workerRows.length,assignments:plan.assignments.length,hours:plan.hours.length})})`;
  return {ok:true,objects:plan.objectRows.filter(v=>!v.reuse).length,workers:plan.workerRows.filter(v=>!v.reuse).length,assignments:plan.assignments.filter(v=>!v.reuse).length,hours:plan.hours.length};
 });
}
