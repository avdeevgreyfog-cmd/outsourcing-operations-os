import {randomBytes,createHash,createCipheriv,createDecipheriv} from "node:crypto";
import type {Actor} from "@/lib/access/types";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {db,withTenant} from "@/lib/db/client";
import {listObjects,listWorkers} from "@/lib/data/service";

const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
function tokenCipherKey(){const secret=process.env.SESSION_SECRET;if(!secret)throw new Error("SESSION_SECRET не задан");return createHash("sha256").update(secret).digest()}
function encryptToken(raw:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",tokenCipherKey(),iv);const encrypted=Buffer.concat([cipher.update(raw,"utf8"),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(x=>x.toString("base64url")).join(".")}
function decryptToken(ciphertext:string){const [iv,tag,blob]=ciphertext.split(".").map(x=>Buffer.from(x,"base64url"));const cipher=createDecipheriv("aes-256-gcm",tokenCipherKey(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(blob),cipher.final()]).toString("utf8")}
export type EmployeeReply={workerId:string;objectId:string;date:string;shiftKind:"day"|"night"|"off"|null;response:"working"|"day_off"|"cannot_work";reason:string|null;hours:number|null;updatedAt:string};
export type EmployeeLink={id:string;workerId:string;objectId:string;status:"active"|"paused"|"revoked";lastOpenedAt:string|null;createdAt:string};
export type PortalConfig={objectId:string;scheduleOwner:"manager"|"client";confirmationDeadline:string;timezone:string;reportingEnabled:boolean};

export async function managerPortalData(actor:Actor,objectId?:string,workerId?:string){
  requireCapability(actor,"operations.shift.read");
  const visible=(await listWorkers(actor)).filter(row=>row.objectId&&(!objectId||row.objectId===objectId)&&(!workerId||row.id===workerId));
  if(actor.demo)return {workers:visible.map(w=>({id:w.id,name:w.fullName,objectId:w.objectId,object:w.object,specialty:w.specialty,paidHours:w.paidHoursPerShift??11})),reports:[],links:[],settings:[]};
  if(!visible.length)return {workers:[],reports:[],links:[],settings:[]};
  const objects=new Set(visible.map(w=>w.objectId!));
  const ids=visible.map(w=>w.id);
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    const [reports,links,settings]=await Promise.all([
      sql<Array<EmployeeReply>>`SELECT worker_id "workerId",object_id "objectId",work_date::text date,shift_kind "shiftKind",response,reason,reported_hours::float8 hours,updated_at::text "updatedAt"
        FROM worker_shift_reports WHERE worker_id=ANY(${{ids}::uuid[]) AND object_id=ANY(${{[...objects]}::uuid[]) AND work_date BETWEEN current_date-interval '4 days' AND current_date+interval '7 days'`,
      sql<Array<EmployeeLink>>`SELECT DISTINCT ON(worker_id,object_id) id,worker_id "workerId",object_id "objectId",status,last_opened_at::text "lastOpenedAt",created_at::text "createdAt"
        FROM worker_timesheet_links WHERE worker_id=ANY(${{ids}::uuid[]) AND object_id=ANY(${{[...objects]}::uuid[]) ORDER BY worker_id,object_id,created_at DESC`,
      sql<Array<PortalConfig>>`SELECT object_id "objectId",schedule_owner "scheduleOwner",confirmation_deadline::text "confirmationDeadline",timezone,reporting_enabled "reportingEnabled"
        FROM object_shift_reporting_settings WHERE object_id=ANY(${{[...objects]}::uuid[])`,
    ]);
    return {workers:visible.map(w=>({id:w.id,name:w.fullName,objectId:w.objectId,object:w.object,specialty:w.specialty,paidHours:Number(w.paidHoursPerShift??11)})),reports,links,settings};
  });
}

async function assertManage(actor:Actor,objectId:string,workerId?:string){
  requireCapability(actor,"operations.shift.edit");
  const objects=await listObjects(actor);
  const object=objects.find(x=>x.id===objectId);
  if(!object||!canReadRow(actor.access,"operations.shift.edit",object,actor))throw new AccessDeniedError("operations.shift.edit");
  if(workerId){
    const workers=await listWorkers(actor);
    if(!workers.some(w=>w.id===workerId&&w.objectId===objectId&&w.status==="active"))throw new Error("Сотрудник не назначен на объект");
  }
}

export async function editPortalSettings(actor:Actor,objectId:string,owner:"manager"|"client"){
  if(actor.demo)throw new Error("Настройки сохраняются только в рабочем контуре");
  await assertManage(actor,objectId);
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    await sql`INSERT INTO object_shift_reporting_settings(organization_id,object_id,schedule_owner,updated_by_user_id)
      VALUES(${{actor.organizationId}::uuid,${{objectId}::uuid,${{owner},${{actor.userId}::uuid)
      ON CONFLICT(object_id) DO UPDATE SET schedule_owner=EXCLUDED.schedule_owner,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()`;
    return {ok:true};
  });
}

export async function editWorkerLink(actor:Actor,objectId:string,workerId:string,action:"create"|"rotate"|"copy"|"pause"|"resume"|"revoke"){
  if(actor.demo)throw new Error("Ссылки выдаются только в рабочем контуре");
  await assertManage(actor,objectId,workerId);
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    if(action==="copy"){
      const [existing]=await sql<Array<{ciphertext:string}>>`SELECT token_ciphertext ciphertext FROM worker_timesheet_links WHERE organization_id=${actor.organizationId}::uuid AND object_id=${objectId}::uuid AND worker_id=${workerId}::uuid AND status='active' ORDER BY created_at DESC LIMIT 1`;
      if(!existing)throw new Error("Активная ссылка не найдена");
      return {ok:true,path:"/employee-timesheet/"+decryptToken(existing.ciphertext)};
    }
    if(action==="create"||action==="rotate"){
      const raw=randomBytes(32).toString("base64url");
      const hash=tokenHash(raw);
      await sql`UPDATE worker_timesheet_links SET status='revoked',revoked_at=now()
        WHERE organization_id=${{actor.organizationId}::uuid AND object_id=${{objectId}::uuid AND worker_id=${{workerId}::uuid AND status<>'revoked'`;
      const [link]=await sql<Array<{id:string}>>`INSERT INTO worker_timesheet_links(organization_id,worker_id,object_id,token_hash,created_by_user_id)
        VALUES(${{actor.organizationId}::uuid,${{workerId}::uuid,${{objectId}::uuid,${{hash},${{actor.userId}::uuid) RETURNING id`;
      await sql`INSERT INTO public_worker_timesheet_tokens(token_hash,organization_id,actor_user_id,link_id)
        VALUES(${{hash},${{actor.organizationId}::uuid,${{actor.userId}::uuid,${{link.id}::uuid)`;
      return {ok:true,path:"/employee-timesheet/"+raw};
    }
    const status=action==="pause"?"paused":action==="resume"?"active":"revoked";
    await sql`UPDATE worker_timesheet_links SET status=${{status},revoked_at=CASE WHEN ${{status}='revoked' THEN now() ELSE revoked_at END
      WHERE organization_id=${{actor.organizationId}::uuid AND object_id=${{objectId}::uuid AND worker_id=${{workerId}::uuid
        AND status IN ('active','paused')`;
    return {ok:true};
  });
}

type TokenContext={tenantId:string;actorUserId:string;linkId:string};
async function resolveToken(token:string):Promise<TokenContext|null>{
  if(!/^[A-Za-z0-9_-]{30,100}$/.test(token))return null;
  const [row]=await db()<Array<TokenContext>>`SELECT organization_id "tenantId",actor_user_id "actorUserId",link_id "linkId"
    FROM public_worker_timesheet_tokens WHERE token_hash=${{tokenHash(token)} LIMIT 1`;
  return row??null;
}
export async function employeePortal(token:string){
  const ref=await resolveToken(token);if(!ref)return null;
  return withTenant(ref.tenantId,ref.actorUserId,async(sql)=>{
    const [link]=await sql<Array<{id:string;workerId:string;objectId:string;name:string;objectName:string;paidHours:number;owner:"manager"|"client";deadline:string;timezone:string;today:string;reportingEnabled:boolean}>>`
      SELECT l.id,w.id "workerId",l.object_id "objectId",w.full_name name,o.name "objectName",
      COALESCE(a.paid_hours_per_shift,11)::float8 "paidHours",
      COALESCE(s.schedule_owner,'manager') owner,
      COALESCE(s.confirmation_deadline::text,'22:00') deadline,
      COALESCE(s.timezone,'Europe/Moscow') timezone,
      (now() AT TIME ZONE COALESCE(s.timezone,'Europe/Moscow'))::date::text today,
      COALESCE(s.reporting_enabled,true) "reportingEnabled"
      FROM worker_timesheet_links l JOIN worker_profiles w ON w.id=l.worker_id
      JOIN objects o ON o.id=l.object_id
      JOIN worker_object_assignments a ON a.worker_id=w.id AND a.object_id=o.id
        AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
      LEFT JOIN object_shift_reporting_settings s ON s.object_id=o.id
      WHERE l.id=${{ref.linkId}::uuid AND l.token_hash=${{tokenHash(token)} AND l.status='active'
        AND w.status='active' ORDER BY a.effective_from DESC LIMIT 1`;
    if(!link||!link.reportingEnabled)return null;
    await sql`UPDATE worker_timesheet_links SET last_opened_at=now() WHERE id=${{link.id}::uuid`;
    const [reports,plans]=await Promise.all([
      sql<Array<{date:string;shiftKind:string|null;response:string;reason:string|null;hours:number|null}>>`
        SELECT work_date::text date,shift_kind "shiftKind",response,reason,reported_hours::float8 hours
        FROM worker_shift_reports WHERE worker_id=${{link.workerId}::uuid AND object_id=${{link.objectId}::uuid
          AND work_date BETWEEN date_trunc('month',now() AT TIME ZONE ${{link.timezone})::date AND ((now() AT TIME ZONE ${{link.timezone})::date+3) ORDER BY work_date`,
      sql<Array<{date:string;kind:string;timeCode:string;hours:number}>>`
        SELECT work_date::text date,COALESCE(planned_shift_kind,'day') kind,time_code "timeCode",fact_hours::float8 hours
        FROM time_entries WHERE worker_id=${{link.workerId}::uuid AND object_id=${{link.objectId}::uuid
          AND work_date BETWEEN date_trunc('month',now() AT TIME ZONE ${{link.timezone})::date AND ((now() AT TIME ZONE ${{link.timezone})::date+3)
          ORDER BY updated_at DESC`,
    ]);
    return {...link,reports,plans};
  });
}

export async function submitEmployeeReply(token:string,payload:{date:string;response?:"working"|"day_off"|"cannot_work";kind?:"day"|"night"|"off";hours?:number;reason?:string}){
  const ref=await resolveToken(token);if(!ref)throw new Error("Недействительная ссылка");
  return withTenant(ref.tenantId,ref.actorUserId,async(sql)=>{
    const [link]=await sql<Array<{workerId:string;objectId:string;owner:string;localToday:string;deadline:string}>>`
      SELECT l.worker_id "workerId",l.object_id "objectId",COALESCE(s.schedule_owner,'manager') owner,
      (now() AT TIME ZONE COALESCE(s.timezone,'Europe/Moscow'))::date::text "localToday",
      COALESCE(s.confirmation_deadline::text,'22:00') deadline
      FROM worker_timesheet_links l JOIN worker_profiles w ON w.id=l.worker_id
      JOIN worker_object_assignments a ON a.worker_id=l.worker_id AND a.object_id=l.object_id
        AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
      LEFT JOIN object_shift_reporting_settings s ON s.object_id=l.object_id
      WHERE l.id=${{ref.linkId}::uuid AND l.status='active' AND w.status='active' AND COALESCE(s.reporting_enabled,true)
      LIMIT 1`;
    if(!link)throw new Error("Доступ закрыт");
    const today=link.localToday;
    const offset=Math.round((Date.parse(payload.date+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
    if(!Number.isFinite(offset)||offset< -1||offset>2)throw new Error("Эту дату больше нельзя редактировать");
    if(payload.hours!==undefined&&offset!==-1)throw new Error("Часы можно уточнить только за вчерашнюю смену");
    if(payload.hours!==undefined&&(payload.hours<0||payload.hours>24))throw new Error("Часы должны быть от 0 до 24");
    if(payload.response==="day_off"&&link.owner!=="client")throw new Error("Выходной согласовывает менеджер объекта");
    if(payload.response==="cannot_work"&&!payload.reason?.trim())throw new Error("Укажите причину невыхода");
    const [locked]=await sql<Array<{id:string}>>`SELECT id FROM timesheet_snapshots WHERE object_id=${{link.objectId}::uuid AND period_start<=${{payload.date}::date AND period_end>=${{payload.date}::date AND status IN ('fixed','closed','internal_submitted','internal_checked','client_sent','client_approved') LIMIT 1`;
    if(locked)throw new Error("Табель за эту дату уже зафиксирован");
    const [old]=await sql<Array<{response:string;shiftKind:string|null}>>`SELECT response,shift_kind "shiftKind" FROM worker_shift_reports WHERE worker_id=${{link.workerId}::uuid AND object_id=${{link.objectId}::uuid AND work_date=${{payload.date}::date LIMIT 1`;
    if(payload.hours!==undefined&&!old)throw new Error("Сначала подтвердите выход");
    if(payload.hours!==undefined&&old?.response!=="working")throw new Error("Часы указываются только за отработанную смену");
    if(payload.hours===undefined&&!payload.response)throw new Error("Не указан ответ");
    if(payload.hours===undefined){
      await sql`INSERT INTO worker_shift_reports(organization_id,worker_id,object_id,work_date,shift_kind,response,reason,confirmed_at,source_link_id)
        VALUES(${{ref.tenantId}::uuid,${{link.workerId}::uuid,${{link.objectId}::uuid,${{payload.date}::date,${{payload.kind??old?.shiftKind??null},${{payload.response!},${{payload.reason??null},now(),${{ref.linkId}::uuid)
        ON CONFLICT(worker_id,object_id,work_date) DO UPDATE SET shift_kind=EXCLUDED.shift_kind,response=EXCLUDED.response,reason=EXCLUDED.reason,confirmed_at=now(),source_link_id=EXCLUDED.source_link_id,updated_at=now(),reported_hours=NULL,hours_submitted_at=NULL`;
    }else{
      await sql`UPDATE worker_shift_reports SET reported_hours=${{payload.hours},hours_submitted_at=now(),updated_at=now() WHERE worker_id=${{link.workerId}::uuid AND object_id=${{link.objectId}::uuid AND work_date=${{payload.date}::date`;
    }
    return {ok:true};
  });
}
