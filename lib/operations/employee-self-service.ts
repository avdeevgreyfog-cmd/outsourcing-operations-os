import {createHash} from "node:crypto";
import type {Actor} from "@/lib/access/types";
import {withTenant} from "@/lib/db/client";
import {listObjects,listWorkers} from "@/lib/data/service";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {resolveToken} from "@/lib/operations/worker-timesheet-portal";

export const docLabels:Record<string,string>={
 passport:"Паспорт",snils:"СНИЛС",inn:"ИНН",bank_details:"Реквизиты для выплат",
 military:"Военный билет / приписное",medical_book:"Медицинская книжка",photo:"Фотография",
 application:"Заявление",contract:"Договор / экземпляр"
};
export type DocumentCode=keyof typeof docLabels;
export type RelationType="employment"|"gph"|"npd"|"custom";
const defaultRequired:Record<RelationType,string[]>={
 employment:["passport","snils","inn","bank_details","application"],
 gph:["passport","snils","inn","bank_details"],
 npd:["passport","inn","bank_details"],
 custom:["passport","inn","bank_details"]
};
export type PortalDetails={
 clothingSize:string|null;shoeSize:string|null;employment:RelationType;managerName:string|null;managerPhone:string|null;
 documents:Array<{code:string;label:string;employeeReported:boolean;managerVerified:boolean}>;
 workwear:Array<{name:string;state:"issued"|"needed";variant:string|null}>;
 shiftWindows:Array<{date:string;startTime:string;endTime:string;endsNextDay:boolean}>;
 timeChanges:Array<{date:string;startTime:string;endTime:string;endsNextDay:boolean;appliesTo:"single"|"regular";status:"proposed"|"accepted"|"rejected"}>;
};
export function checklistCodes(relation:RelationType,overrides:Array<{code:string;required:boolean}>){
 const map=new Map<string,boolean>(defaultRequired[relation].map(code=>[code,true]));
 for(const item of overrides)if(docLabels[item.code])map.set(item.code,item.required);
 return [...map].filter(([,required])=>required).map(([code])=>code);
}
async function authorizedEmployee(token:string){
 const ref=await resolveToken(token);if(!ref)return null;
 return withTenant(ref.tenantId,ref.actorUserId,async(sql)=>{
  const [link]=await sql<Array<{workerId:string;objectId:string;owner:"manager"|"worker";timezone:string;employment:RelationType}>>`
   SELECT l.worker_id "workerId",l.object_id "objectId",COALESCE(wa.schedule_owner,st.schedule_authority,CASE WHEN st.schedule_owner='client' THEN 'worker' ELSE st.schedule_owner END,'manager') owner,
   COALESCE(st.timezone,'Europe/Moscow') timezone,
   COALESCE((SELECT er.relation_type FROM employment_relations er WHERE er.worker_id=l.worker_id
      AND er.effective_from<=current_date AND (er.effective_to IS NULL OR er.effective_to>=current_date)
      ORDER BY er.effective_from DESC LIMIT 1),'custom') employment
   FROM worker_timesheet_links l JOIN worker_profiles w ON w.id=l.worker_id
   JOIN worker_object_assignments a ON a.worker_id=w.id AND a.object_id=l.object_id
      AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
   LEFT JOIN object_shift_reporting_settings st ON st.object_id=l.object_id
   LEFT JOIN worker_schedule_authorities wa ON wa.worker_id=l.worker_id AND wa.object_id=l.object_id
   WHERE l.id=${ref.linkId}::uuid AND l.token_hash=${createHashToken(token)}
      AND l.status='active' AND w.status='active' AND COALESCE(st.reporting_enabled,true) LIMIT 1`;
  if(!link)return null;
  return {ref,link};
 });
}
function createHashToken(raw:string){return createHash("sha256").update(raw).digest("hex")}
export async function employeePortalDetails(token:string):Promise<PortalDetails|null>{
 const scope=await authorizedEmployee(token);if(!scope)return null;
 const {ref,link}=scope;
 return withTenant(ref.tenantId,ref.actorUserId,async(sql)=>{
  const [profile,overrides,checkItems,issueRows,normRows,shiftWindows,timeChanges]=await Promise.all([
   sql<Array<{clothingSize:string|null;shoeSize:string|null;managerName:string|null;managerPhone:string|null}>>`
    SELECT w.clothing_size "clothingSize",w.shoe_size "shoeSize",u.display_name "managerName",s.manager_phone "managerPhone"
    FROM worker_profiles w JOIN objects o ON o.id=${link.objectId}::uuid
    LEFT JOIN worker_object_assignments a ON a.worker_id=w.id AND a.object_id=o.id
      AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
    LEFT JOIN app_users u ON u.id=COALESCE(a.manager_user_id,o.owner_user_id)
    LEFT JOIN object_shift_reporting_settings s ON s.object_id=o.id
    WHERE w.id=${link.workerId}::uuid ORDER BY a.effective_from DESC LIMIT 1`,
   sql<Array<{code:string;required:boolean}>>`SELECT document_code code,required FROM object_worker_document_requirements WHERE object_id=${link.objectId}::uuid AND relation_type=${link.employment}`,
   sql<Array<{code:string;employeeReported:boolean;managerVerified:boolean}>>`SELECT document_code code,(employee_reported_at IS NOT NULL) "employeeReported",(manager_verified_at IS NOT NULL) "managerVerified" FROM worker_document_checklist WHERE worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid`,
   sql<Array<{name:string;variant:string|null}>>`
     SELECT i.name, NULLIF(m.variant,'') variant FROM inventory_movements m JOIN inventory_items i ON i.id=m.item_id
     WHERE m.worker_id=${link.workerId}::uuid AND i.returnable
     GROUP BY i.id,i.name,m.variant
     HAVING sum(CASE WHEN m.movement_type='issue' THEN m.quantity WHEN m.movement_type='return' THEN -m.quantity
       WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity ELSE 0 END)>0
     ORDER BY i.name`,
   sql<Array<{name:string}>>`
     SELECT i.name FROM worker_object_assignments a JOIN LATERAL (
       SELECT t.id FROM object_ppe_templates t WHERE t.specialty_id=a.specialty_id AND t.active
        AND (t.object_id=a.object_id OR t.object_id IS NULL)
       ORDER BY (t.object_id=a.object_id) DESC NULLS LAST,t.updated_at DESC,t.created_at DESC LIMIT 1
     ) tmpl ON true JOIN object_ppe_template_items ti ON ti.template_id=tmpl.id
     JOIN inventory_items i ON i.id=ti.item_id
     WHERE a.worker_id=${link.workerId}::uuid AND a.object_id=${link.objectId}::uuid
       AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
     ORDER BY i.name`,
   sql<Array<{date:string;startTime:string;endTime:string;endsNextDay:boolean}>>`
     SELECT DISTINCT ON(sh.shift_date) sh.shift_date::text date,
       to_char(sh.starts_at AT TIME ZONE ${link.timezone},'HH24:MI') "startTime",
       to_char(sh.ends_at AT TIME ZONE ${link.timezone},'HH24:MI') "endTime",
       ((sh.ends_at AT TIME ZONE ${link.timezone})::date>sh.shift_date) "endsNextDay"
     FROM shift_assignments sa JOIN shifts sh ON sh.id=sa.shift_id
     WHERE sa.worker_id=${link.workerId}::uuid AND sh.object_id=${link.objectId}::uuid
       AND sa.confirmation_status<>'cancelled' AND sh.shift_date BETWEEN current_date-33 AND current_date+31
     ORDER BY sh.shift_date,sa.is_reserve,sh.starts_at`,
   sql<Array<{date:string;startTime:string;endTime:string;endsNextDay:boolean;appliesTo:"single"|"regular";status:"proposed"|"accepted"|"rejected"}>>`
     SELECT work_date::text date,to_char(start_time,'HH24:MI') "startTime",to_char(end_time,'HH24:MI') "endTime",
       ends_next_day "endsNextDay",applies_to "appliesTo",status FROM worker_shift_time_changes
     WHERE worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid
      AND (work_date BETWEEN current_date-33 AND current_date+31 OR (applies_to='regular' AND status='accepted' AND work_date<=current_date+31))`
  ]);
  const codes=checklistCodes(link.employment,overrides);
  const verified=new Map(checkItems.map(item=>[item.code,item]));
  const names=new Set(issueRows.map(x=>x.name));
  const workwear=[...issueRows.map(x=>({...x,state:"issued" as const})),...normRows.filter(x=>!names.has(x.name)).map(x=>({name:x.name,variant:null,state:"needed" as const}))];
  return {clothingSize:profile[0]?.clothingSize??null,shoeSize:profile[0]?.shoeSize??null,
    employment:link.employment,managerName:profile[0]?.managerName??null,managerPhone:profile[0]?.managerPhone??null,
    documents:codes.map(code=>({code,label:docLabels[code],employeeReported:verified.get(code)?.employeeReported??false,managerVerified:verified.get(code)?.managerVerified??false})),
    workwear,shiftWindows,timeChanges};
 });
}

type EmployeeDetailChange=
 |{action:"sizes";clothingSize:string|null;shoeSize:string|null}
 |{action:"document";code:string;reported:boolean}
 |{action:"shift_time";date:string;kind?:"day"|"night";startTime:string;endTime:string;endsNextDay:boolean;appliesTo:"single"|"regular"};
const hhmm=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
export async function updateEmployeePortalDetails(token:string,change:EmployeeDetailChange){
 const scope=await authorizedEmployee(token);if(!scope)throw new Error("Доступ недействителен");
 const {ref,link}=scope;
 return withTenant(ref.tenantId,ref.actorUserId,async(sql)=>{
  if(change.action==="sizes"){
   if((change.clothingSize?.length??0)>40||(change.shoeSize?.length??0)>40)throw new Error("Укажите корректные размеры");
   await sql`UPDATE worker_profiles SET clothing_size=${change.clothingSize?.trim()||null},shoe_size=${change.shoeSize?.trim()||null},updated_at=now() WHERE id=${link.workerId}::uuid`;
   return {ok:true};
  }
  if(change.action==="document"){
   const overrides=await sql<Array<{code:string;required:boolean}>>`SELECT document_code code,required FROM object_worker_document_requirements WHERE object_id=${link.objectId}::uuid AND relation_type=${link.employment}`;
   if(!checklistCodes(link.employment,overrides).includes(change.code))throw new Error("Документ не входит в список объекта");
   await sql`INSERT INTO worker_document_checklist(organization_id,worker_id,object_id,document_code,employee_reported_at)
     VALUES(${ref.tenantId}::uuid,${link.workerId}::uuid,${link.objectId}::uuid,${change.code},CASE WHEN ${change.reported} THEN now() ELSE NULL END)
     ON CONFLICT(worker_id,object_id,document_code) DO UPDATE SET employee_reported_at=EXCLUDED.employee_reported_at,updated_at=now()`;
   return {ok:true};
  }
  if(!hhmm.test(change.startTime)||!hhmm.test(change.endTime))throw new Error("Укажите время в формате ЧЧ:ММ");
  const minutes=(x:string)=>Number(x.slice(0,2))*60+Number(x.slice(3,5));
  const duration=minutes(change.endTime)-minutes(change.startTime)+(change.endsNextDay?1440:0);
  if(duration<60||duration>24*60)throw new Error("Продолжительность смены должна быть от 1 до 24 часов");
  const parts=new Intl.DateTimeFormat("ru-RU",{timeZone:link.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
  const local=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  const today=`${local.year}-${local.month}-${local.day}`;
  const offset=Math.round((Date.parse(change.date+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
  if(!Number.isFinite(offset)||offset<0||offset>31)throw new Error("Изменение времени доступно на ближайший месяц");
  const [locked]=await sql<Array<{id:string}>>`SELECT id FROM timesheet_snapshots WHERE object_id=${link.objectId}::uuid AND period_start<=${change.date}::date AND period_end>=${change.date}::date AND status IN ('fixed','closed','internal_submitted','internal_checked','client_sent','client_approved') LIMIT 1`;
  if(locked)throw new Error("Период табеля уже зафиксирован");
  const status=link.owner==="worker"&&change.appliesTo==="single"?"accepted":"proposed";
  await sql`INSERT INTO worker_shift_time_changes(organization_id,worker_id,object_id,work_date,start_time,end_time,ends_next_day,applies_to,status,source_link_id,shift_kind)
    VALUES(${ref.tenantId}::uuid,${link.workerId}::uuid,${link.objectId}::uuid,${change.date}::date,${change.startTime}::time,${change.endTime}::time,${change.endsNextDay},${change.appliesTo},${status},${ref.linkId}::uuid,${change.kind??null})
    ON CONFLICT(worker_id,object_id,work_date) DO UPDATE SET start_time=EXCLUDED.start_time,end_time=EXCLUDED.end_time,ends_next_day=EXCLUDED.ends_next_day,applies_to=EXCLUDED.applies_to,status=EXCLUDED.status,source_link_id=EXCLUDED.source_link_id,shift_kind=EXCLUDED.shift_kind,reviewed_at=NULL,reviewed_by_user_id=NULL,updated_at=now()`;
  return {ok:true,status};
 });
}

export async function employeeDetailManagerList(actor:Actor,objectId?:string){
 requireCapability(actor,"operations.shift.read");
 if(actor.demo)return {timeChanges:[],documents:[]};
 const workers=(await listWorkers(actor)).filter(w=>w.objectId&&(!objectId||w.objectId===objectId));
 if(!workers.length)return {timeChanges:[],documents:[]};
 const ids=workers.map(w=>w.id);
 return withTenant(actor.organizationId,actor.userId,async(sql)=>{
  const [timeChanges,documents]=await Promise.all([
   sql<Array<{workerId:string;objectId:string;date:string;startTime:string;endTime:string;status:string;appliesTo:string}>>`
    SELECT worker_id "workerId",object_id "objectId",work_date::text date,to_char(start_time,'HH24:MI') "startTime",
      to_char(end_time,'HH24:MI') "endTime",status,applies_to "appliesTo"
    FROM worker_shift_time_changes WHERE worker_id=ANY(${ids}::uuid[]) AND work_date>=current_date-2 AND work_date<=current_date+31`,
   sql<Array<{workerId:string;objectId:string;code:string;employeeReported:boolean;managerVerified:boolean}>>`
    SELECT worker_id "workerId",object_id "objectId",document_code code,(employee_reported_at IS NOT NULL) "employeeReported",
      (manager_verified_at IS NOT NULL) "managerVerified" FROM worker_document_checklist
    WHERE worker_id=ANY(${ids}::uuid[])`
  ]);return {timeChanges,documents};
 });
}
export async function managerEmployeeDetailAction(actor:Actor,change:
 |{action:"verify_document";objectId:string;workerId:string;code:string;verified:boolean}
 |{action:"review_shift_time";objectId:string;workerId:string;date:string;approve:boolean}
 |{action:"manager_phone";objectId:string;phone:string|null}
 |{action:"document_requirement";objectId:string;relationType:RelationType;code:string;required:boolean}){
 requireCapability(actor,"operations.shift.edit");
 if(actor.demo)throw new Error("Действие недоступно в демонстрации");
 const objects=await listObjects(actor);
 const obj=objects.find(x=>x.id===change.objectId);
 if(!obj||!canReadRow(actor.access,"operations.shift.edit",obj,actor))throw new AccessDeniedError("operations.shift.edit");
 if("workerId" in change){
  if(!(await listWorkers(actor)).some(w=>w.id===change.workerId&&w.objectId===change.objectId))throw new Error("Нет доступа к сотруднику");
 }
 return withTenant(actor.organizationId,actor.userId,async(sql)=>{
  if(change.action==="manager_phone"){
   if((change.phone?.length??0)>50)throw new Error("Номер слишком длинный");
   await sql`INSERT INTO object_shift_reporting_settings(organization_id,object_id,manager_phone,updated_by_user_id)
     VALUES(${actor.organizationId}::uuid,${change.objectId}::uuid,${change.phone},${actor.userId}::uuid)
     ON CONFLICT(object_id) DO UPDATE SET manager_phone=EXCLUDED.manager_phone,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()`;
  }else if(change.action==="document_requirement"){
   if(!docLabels[change.code])throw new Error("Неизвестный тип документа");
   await sql`INSERT INTO object_worker_document_requirements(organization_id,object_id,relation_type,document_code,required,updated_by_user_id)
     VALUES(${actor.organizationId}::uuid,${change.objectId}::uuid,${change.relationType},${change.code},${change.required},${actor.userId}::uuid)
     ON CONFLICT(object_id,relation_type,document_code) DO UPDATE SET required=EXCLUDED.required,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()`;
  }else if(change.action==="verify_document"){
   if(!docLabels[change.code])throw new Error("Неизвестный документ");
   await sql`INSERT INTO worker_document_checklist(organization_id,worker_id,object_id,document_code,manager_verified_at,manager_verified_by_user_id)
     VALUES(${actor.organizationId}::uuid,${change.workerId}::uuid,${change.objectId}::uuid,${change.code},
       CASE WHEN ${change.verified} THEN now() ELSE NULL END,CASE WHEN ${change.verified} THEN ${actor.userId}::uuid ELSE NULL END)
     ON CONFLICT(worker_id,object_id,document_code) DO UPDATE SET manager_verified_at=EXCLUDED.manager_verified_at,manager_verified_by_user_id=EXCLUDED.manager_verified_by_user_id,updated_at=now()`;
  }else{
   await sql`UPDATE worker_shift_time_changes SET status=${change.approve?"accepted":"rejected"},reviewed_by_user_id=${actor.userId}::uuid,reviewed_at=now(),updated_at=now()
     WHERE worker_id=${change.workerId}::uuid AND object_id=${change.objectId}::uuid AND work_date=${change.date}::date`;
  }
  return {ok:true};
 });
}
