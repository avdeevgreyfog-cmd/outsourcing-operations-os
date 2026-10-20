import {randomBytes,createHash,createCipheriv,createDecipheriv} from "node:crypto";
import type {Sql} from "postgres";
import type {Actor} from "@/lib/access/types";
import {requireCapability,AccessDeniedError} from "@/lib/access/server";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {db,withTenant} from "@/lib/db/client";
import {listObjects,listWorkers} from "@/lib/data/service";
import {defaultPortalConfiguration,applyPortalPatch,effectivePortalConfiguration,effectiveActiveLinkConfiguration,diffPortalConfiguration,normalizePortalPatch,type PortalConfigurationPatch,type PortalConfiguration} from "@/lib/operations/employee-portal-config";

export class EmployeePortalError extends Error {}
export class EmployeePortalAccessError extends EmployeePortalError {}
const tokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
function tokenCipherKey(){const secret=process.env.SESSION_SECRET;if(!secret)throw new EmployeePortalError("Не настроен ключ персональных ссылок в серверном окружении (SESSION_SECRET). Обратитесь к администратору.");return createHash("sha256").update(secret).digest()}
function encryptToken(raw:string){const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",tokenCipherKey(),iv);const encrypted=Buffer.concat([cipher.update(raw,"utf8"),cipher.final()]);return [iv,cipher.getAuthTag(),encrypted].map(x=>x.toString("base64url")).join(".")}
function decryptToken(ciphertext:string){const [iv,tag,blob]=ciphertext.split(".").map(x=>Buffer.from(x,"base64url"));const cipher=createDecipheriv("aes-256-gcm",tokenCipherKey(),iv);cipher.setAuthTag(tag);return Buffer.concat([cipher.update(blob),cipher.final()]).toString("utf8")}
export type EmployeeReply={workerId:string;objectId:string;date:string;shiftKind:"day"|"night"|"off"|null;shiftId?:string|null;response:"working"|"day_off"|"cannot_work";reason:string|null;hours:number|null;updatedAt:string;employeeRespondedAt:string|null;reconciledAt?:string|null;needsReconfirmation?:boolean;reviewStatus?:"pending"|"approved"|"rejected";approvedHours?:number|null;reviewComment?:string|null;reviewedAt?:string|null};
export type EmployeeLink={id:string;workerId:string;objectId:string;status:"active"|"paused"|"revoked"|"expired"|"rotated";lastOpenedAt:string|null;createdAt:string;expiresAt?:string|null;autoRevokeAt?:string|null;createdBy?:string|null;changedBy?:string|null;lastManagerPreviewAt?:string|null;blockReason?:string|null};
export type EmployeePlan={workerId:string;objectId:string;date:string;timeCode:string;kind:string|null};
export type PortalConfig={objectId:string;scheduleOwner:"manager"|"worker";confirmationDeadline:string;timezone:string;reportingEnabled:boolean;managerPhone:string|null;planningHorizonDays:number;showEmployeeDocuments:boolean;showEmployeeWorkwear:boolean};

export async function managerPortalData(actor:Actor,objectId?:string,workerId?:string){
  requireCapability(actor,"operations.shift.read");
  const visible=(await listWorkers(actor)).filter(row=>row.objectId&&canReadRow(actor.access,"operations.shift.read",row,actor)&&(!objectId||row.objectId===objectId)&&(!workerId||row.id===workerId));
  const availableObjects=(await listObjects(actor)).filter(row=>canReadRow(actor.access,"operations.shift.read",row,actor)&&(!objectId||row.id===objectId));
  const objectOptions=availableObjects.map(o=>({id:o.id,name:o.name??"Объект"}));
  if(actor.demo)return {workers:visible.map(w=>({id:w.id,name:w.fullName,objectId:w.objectId,object:w.object,specialty:w.specialty,paidHours:w.paidHoursPerShift??11,workDays:w.scheduleWorkDays??null,restDays:w.scheduleRestDays??null,shiftKind:w.scheduleShiftKind??null})),reports:[],links:[],settings:[],plans:[],portalOverrides:[],sizeRequests:[],onboarding:[],hourDisputes:[],adjustments:[],canManageAdjustments:false,defaultPortalConfiguration,organizationId:actor.organizationId,objectOptions};
  if(!visible.length&&!availableObjects.length)return {workers:[],reports:[],links:[],settings:[],plans:[],portalOverrides:[],defaultPortalConfiguration,organizationId:actor.organizationId,objectOptions};
  const objects=new Set([...availableObjects.map(o=>o.id),...visible.map(w=>w.objectId!)]);
  const ids=visible.map(w=>w.id);
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    const [reports,links,settings,plans,portalOverrides]=await Promise.all([
      sql<Array<EmployeeReply>>`SELECT worker_id "workerId",object_id "objectId",work_date::text date,shift_kind "shiftKind",shift_id "shiftId",response,reason,reported_hours::float8 hours,updated_at::text "updatedAt",GREATEST(confirmed_at,hours_submitted_at)::text "employeeRespondedAt",hours_reconciled_at::text "reconciledAt",(confirmed_at IS NULL AND reported_hours IS NULL AND hours_reconciled_at IS NULL) "needsReconfirmation",review_status "reviewStatus",approved_hours::float8 "approvedHours",review_comment "reviewComment",reviewed_at::text "reviewedAt"
        FROM worker_shift_reports WHERE worker_id=ANY(${ids}::uuid[]) AND object_id=ANY(${[...objects]}::uuid[]) AND work_date BETWEEN current_date-interval '4 days' AND current_date+interval '7 days'`,
      sql<Array<EmployeeLink>>`SELECT DISTINCT ON(l.worker_id,l.object_id) l.id,l.worker_id "workerId",l.object_id "objectId",CASE WHEN l.status='revoked' AND l.replaced_by_link_id IS NOT NULL THEN 'rotated' WHEN l.status IN ('active','paused') AND (l.expires_at<=now() OR l.auto_revoke_at<=now()) THEN 'expired' ELSE l.status END status,l.last_opened_at::text "lastOpenedAt",l.last_manager_preview_at::text "lastManagerPreviewAt",l.block_reason "blockReason",l.created_at::text "createdAt",l.expires_at::text "expiresAt",l.auto_revoke_at::text "autoRevokeAt",creator.display_name "createdBy",changer.display_name "changedBy"
        FROM worker_timesheet_links l LEFT JOIN app_users creator ON creator.id=l.created_by_user_id LEFT JOIN app_users changer ON changer.id=l.changed_by_user_id WHERE l.worker_id=ANY(${ids}::uuid[]) AND l.object_id=ANY(${[...objects]}::uuid[]) ORDER BY l.worker_id,l.object_id,l.created_at DESC`,
      sql<Array<PortalConfig>>`SELECT object_id "objectId",COALESCE(schedule_authority,CASE WHEN schedule_owner='client' THEN 'worker' ELSE schedule_owner END) "scheduleOwner",confirmation_deadline::text "confirmationDeadline",timezone,reporting_enabled "reportingEnabled",manager_phone "managerPhone",COALESCE(planning_horizon_days,14)::int "planningHorizonDays",show_employee_documents "showEmployeeDocuments",show_employee_workwear "showEmployeeWorkwear"
        FROM object_shift_reporting_settings WHERE object_id=ANY(${[...objects]}::uuid[])`,
      sql<Array<EmployeePlan>>`SELECT DISTINCT ON(worker_id,object_id,work_date) worker_id "workerId",object_id "objectId",work_date::text date,time_code "timeCode",planned_shift_kind kind
        FROM time_entries WHERE worker_id=ANY(${ids}::uuid[]) AND object_id=ANY(${[...objects]}::uuid[])
          AND work_date BETWEEN current_date-interval '2 days' AND current_date+interval '7 days'
        ORDER BY worker_id,object_id,work_date,(shift_id IS NULL) DESC,updated_at DESC`,
       sql<Array<{scope:"organization"|"object"|"worker";scopeId:string;config:PortalConfigurationPatch}>>`SELECT scope,scope_id "scopeId",config FROM employee_portal_config_overrides WHERE organization_id=${actor.organizationId}::uuid AND (scope='organization' OR (scope='object' AND scope_id=ANY(${[...objects]}::uuid[])) OR (scope='worker' AND scope_id=ANY(${ids}::uuid[])))`,
    ]);
    const [sizeRequests,onboarding,hourDisputes,adjustments]=await Promise.all([
      sql<Array<{id:string;workerId:string;objectId:string;clothingSize:string|null;shoeSize:string|null;gloveSize:string|null;comment:string|null;status:string;createdAt:string}>>`
       SELECT id,worker_id "workerId",object_id "objectId",clothing_size "clothingSize",shoe_size "shoeSize",glove_size "gloveSize",comment,status,created_at::text "createdAt" FROM worker_ppe_size_requests
       WHERE worker_id=ANY(${ids}::uuid[]) AND object_id=ANY(${[...objects]}::uuid[]) AND status='pending' ORDER BY created_at DESC`,
      sql<Array<{workerId:string;objectId:string;stage:string;comment:string|null;showAfterCompleted:boolean}>>`
       SELECT worker_id "workerId",object_id "objectId",stage,employee_comment comment,show_after_completed "showAfterCompleted"
       FROM worker_onboarding_status WHERE worker_id=ANY(${ids}::uuid[]) AND object_id=ANY(${[...objects]}::uuid[])`,
      sql<Array<{id:string;workerId:string;objectId:string;date:string;reason:string;comment:string;status:string}>>`
       SELECT id,worker_id "workerId",object_id "objectId",work_date::text date,reason,comment,status FROM worker_hours_disputes
       WHERE worker_id=ANY(${ids}::uuid[]) AND object_id=ANY(${[...objects]}::uuid[]) AND status IN ('open','in_review') ORDER BY created_at DESC`,
      (hasCapability(actor.access,"finance.worker_accrual.read")?sql<Array<{id:string;workerId:string;objectId:string;amount:number;periodStart:string;periodEnd:string;status:string;reason:string;description:string}>>`
       SELECT id,worker_id "workerId",object_id "objectId",amount::float8 amount,period_start::text "periodStart",period_end::text "periodEnd",status,reason,employee_description description
       FROM worker_pay_adjustments WHERE worker_id=ANY(${ids}::uuid[]) AND object_id=ANY(${[...objects]}::uuid[]) ORDER BY created_at DESC LIMIT 100`:Promise.resolve([] as Array<{id:string;workerId:string;objectId:string;amount:number;periodStart:string;periodEnd:string;status:string;reason:string;description:string}>))
    ]);
    return {workers:visible.map(w=>({id:w.id,name:w.fullName,objectId:w.objectId,object:w.object,specialty:w.specialty,paidHours:w.paidHoursPerShift??null,workDays:w.scheduleWorkDays??null,restDays:w.scheduleRestDays??null,shiftKind:w.scheduleShiftKind??null})),reports,links,settings,plans,portalOverrides,sizeRequests,onboarding,hourDisputes,adjustments,canManageAdjustments:hasCapability(actor.access,"finance.worker_accrual.edit"),defaultPortalConfiguration,organizationId:actor.organizationId,objectOptions};
  });
}

async function assertManage(actor:Actor,objectId:string,workerId?:string){
  requireCapability(actor,"operations.shift.edit");
  const objects=await listObjects(actor);
  const object=objects.find(x=>x.id===objectId);
  if(!object||!canReadRow(actor.access,"operations.shift.edit",object,actor))throw new AccessDeniedError("operations.shift.edit");
  if(workerId){
    const workers=await listWorkers(actor);
    if(!workers.some(w=>w.id===workerId&&w.objectId===objectId&&w.status==="active"))throw new EmployeePortalError("Сотрудник не назначен на объект");
  }
  return object;
}

export async function savePortalConfiguration(actor:Actor,scope:"organization"|"object"|"worker",scopeId:string,config:PortalConfigurationPatch,objectId?:string){
  if(actor.demo)throw new EmployeePortalError("Изменение настроек недоступно в демонстрации");
  const patch=normalizePortalPatch(config);
  if(scope==="organization"){
    requireCapability(actor,"organization.manage");
    if(scopeId!==actor.organizationId)throw new AccessDeniedError("organization.manage");
  }else{
    if(!objectId)throw new EmployeePortalError("Не указан объект");
    await assertManage(actor,objectId,scope==="worker"?scopeId:undefined);
    if(scope==="object"&&scopeId!==objectId)throw new EmployeePortalError("Некорректный объект");
  }
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    await sql`INSERT INTO employee_portal_config_overrides(organization_id,scope,scope_id,config,updated_by_user_id)
      VALUES(${actor.organizationId}::uuid,${scope},${scopeId}::uuid,${sql.json(patch)},${actor.userId}::uuid)
      ON CONFLICT(organization_id,scope,scope_id) DO UPDATE SET config=EXCLUDED.config,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()`;
    return {ok:true};
  });
}

export async function editPortalSettings(actor:Actor,objectId:string,owner:"manager"|"worker"){
  if(actor.demo)throw new EmployeePortalError("Настройки сохраняются только в рабочем контуре");
  await assertManage(actor,objectId);
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    await sql`INSERT INTO object_shift_reporting_settings(organization_id,object_id,schedule_owner,updated_by_user_id)
      VALUES(${actor.organizationId}::uuid,${objectId}::uuid,${owner},${actor.userId}::uuid)
      ON CONFLICT(object_id) DO UPDATE SET schedule_owner=EXCLUDED.schedule_owner,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()`;
    return {ok:true};
  });
}

export async function editWorkerLink(actor:Actor,objectId:string,workerId:string,action:"create"|"rotate"|"copy"|"pause"|"resume"|"revoke",issuedConfig?:PortalConfigurationPatch,requestedExpiry?:string,requestedAutoRevoke?:string){
 if(actor.demo)throw new EmployeePortalError("Ссылки выдаются только в рабочем контуре");
 await assertManage(actor,objectId,workerId);
 return withTenant(actor.organizationId,actor.userId,async(sql)=>{
   const [worker]=await sql<Array<{id:string}>>`SELECT w.id FROM worker_profiles w
     WHERE w.organization_id=${actor.organizationId}::uuid AND w.id=${workerId}::uuid AND w.status='active'
     AND EXISTS(SELECT 1 FROM worker_object_assignments a WHERE a.organization_id=w.organization_id AND a.worker_id=w.id AND a.object_id=${objectId}::uuid
       AND (a.effective_from IS NULL OR a.effective_from<=current_date) AND (a.effective_to IS NULL OR a.effective_to>=current_date))
     FOR UPDATE OF w`;
   if(!worker)throw new EmployeePortalError("Сотрудник больше не работает на объекте");
   const [current]=await sql<Array<{id:string;status:string;ciphertext:string;valid:boolean}>>`
     SELECT id,status,token_ciphertext ciphertext,
     ((expires_at IS NULL OR expires_at>now()) AND (auto_revoke_at IS NULL OR auto_revoke_at>now())) valid
     FROM worker_timesheet_links WHERE organization_id=${actor.organizationId}::uuid
     AND object_id=${objectId}::uuid AND worker_id=${workerId}::uuid
     AND status IN ('active','paused') ORDER BY created_at DESC LIMIT 1 FOR UPDATE`;
   if(action==="copy"){
     if(!current||current.status!=="active"||!current.valid)throw new EmployeePortalError("Активная ссылка не найдена");
     await sql`INSERT INTO worker_portal_events(organization_id,worker_id,object_id,link_id,actor_user_id,event_type)
      VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${objectId}::uuid,${current.id}::uuid,${actor.userId}::uuid,'copied')`;
    return {ok:true,path:"/employee-timesheet/"+decryptToken(current.ciphertext)};
   }
   if(action==="create"&&current?.valid)throw new EmployeePortalError(current.status==="paused"?"Ссылка приостановлена. Возобновите её или перевыпустите.":"У сотрудника уже есть активная ссылка. Скопируйте или перевыпустите её.");
   if(action==="rotate"&&!current?.valid)throw new EmployeePortalError("Ссылка истекла. Выпустите новую ссылку.");
   if(action==="create"||action==="rotate"){
     const patch=issuedConfig?normalizePortalPatch(issuedConfig):{};
     const inherited=await effectivePortalConfiguration(sql,actor.organizationId,objectId,workerId);
     const config=applyPortalPatch(inherited,patch);
     const linkOverride=diffPortalConfiguration(inherited,patch);
     const expiresAt=requestedExpiry??null;
     if(expiresAt&&(!Number.isFinite(Date.parse(expiresAt))||Date.parse(expiresAt)<=Date.now()||Date.parse(expiresAt)>Date.now()+366*86400000))throw new EmployeePortalError("Некорректный срок действия ссылки");
     if(requestedAutoRevoke&&(!Number.isFinite(Date.parse(requestedAutoRevoke))||Date.parse(requestedAutoRevoke)<=Date.now()))throw new EmployeePortalError("Некорректная дата автоматического отзыва");
     const raw=randomBytes(32).toString("base64url"),hash=tokenHash(raw);
     if(current)await sql`UPDATE worker_timesheet_links SET status='revoked',revoked_at=now(),block_reason='rotated',changed_by_user_id=${actor.userId}::uuid,changed_at=now()
       WHERE id=${current.id}::uuid AND status IN ('active','paused')`;
     const [link]=await sql<Array<{id:string}>>`INSERT INTO worker_timesheet_links(
       organization_id,worker_id,object_id,token_hash,token_ciphertext,created_by_user_id,
       portal_config_snapshot,link_config_override,expires_at,auto_revoke_at)
       VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${objectId}::uuid,${hash},${encryptToken(raw)},${actor.userId}::uuid,
       ${sql.json(config)},${sql.json(linkOverride)},${expiresAt}::timestamptz,${requestedAutoRevoke??null}::timestamptz) RETURNING id`;
     if(current)await sql`UPDATE worker_timesheet_links SET replaced_by_link_id=${link.id}::uuid WHERE id=${current.id}::uuid`;
     await sql`INSERT INTO public_worker_timesheet_tokens(token_hash,tenant_id,actor_user_id,link_id)
       VALUES(${hash},${actor.organizationId}::uuid,${actor.userId}::uuid,${link.id}::uuid)`;
     await sql`INSERT INTO worker_portal_events(organization_id,worker_id,object_id,link_id,actor_user_id,event_type)
       VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${objectId}::uuid,${link.id}::uuid,${actor.userId}::uuid,${action==="rotate"?"rotated":"issued"})`;
     return {ok:true,path:"/employee-timesheet/"+raw,expiresAt,config};
   }
   if(!current)throw new EmployeePortalError("Действующая ссылка не найдена");
   if(action==="resume"&&(current.status!=="paused"||!current.valid))throw new EmployeePortalError("Истёкшую или отозванную ссылку нельзя возобновить");
   if(action==="pause"&&current.status!=="active")throw new EmployeePortalError("Ссылка уже приостановлена");
   const status=action==="pause"?"paused":action==="resume"?"active":"revoked";
   await sql`UPDATE worker_timesheet_links SET status=${status},revoked_at=CASE WHEN ${status}='revoked' THEN now() ELSE revoked_at END,
     block_reason=CASE WHEN ${status}='revoked' THEN 'manual' ELSE NULL END,changed_by_user_id=${actor.userId}::uuid,changed_at=now()
     WHERE id=${current.id}::uuid AND status IN ('active','paused')`;
   await sql`INSERT INTO worker_portal_events(organization_id,worker_id,object_id,link_id,actor_user_id,event_type)
     VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${objectId}::uuid,${current.id}::uuid,${actor.userId}::uuid,${action==="pause"?"paused":action==="resume"?"resumed":"revoked"})`;
   return {ok:true};
 });
}

type TokenContext={tenantId:string;actorUserId:string;linkId:string};
export async function resolveToken(token:string):Promise<TokenContext|null>{
  if(!/^[A-Za-z0-9_-]{30,100}$/.test(token))return null;
  const hashed=tokenHash(token);
  return db().begin(async tx=>{
    await tx`SELECT set_config('app.worker_token_hash',${hashed},true)`;
    const [row]=await tx<Array<TokenContext>>`SELECT tenant_id "tenantId",actor_user_id "actorUserId",link_id "linkId"
      FROM public_worker_timesheet_tokens WHERE token_hash=${hashed} LIMIT 1`;
    return row??null;
  });
}
export async function assertEmployeeLinkActive(sql:Sql,ref:{tenantId:string;linkId:string},token:string){
  const [worker]=await sql<Array<{id:string}>>`SELECT w.id FROM worker_profiles w JOIN worker_timesheet_links l ON l.worker_id=w.id AND l.organization_id=w.organization_id
    WHERE l.id=${ref.linkId}::uuid AND l.organization_id=${ref.tenantId}::uuid AND l.token_hash=${tokenHash(token)} AND w.status='active' FOR UPDATE OF w`;
  if(!worker)throw new EmployeePortalAccessError("Ссылка недействительна или заблокирована");
  const [row]=await sql<Array<{id:string}>>`
    SELECT l.id FROM worker_timesheet_links l JOIN worker_profiles w ON w.id=l.worker_id AND w.organization_id=l.organization_id
    WHERE l.id=${ref.linkId}::uuid AND l.organization_id=${ref.tenantId}::uuid AND l.token_hash=${tokenHash(token)}
      AND l.status='active' AND (l.expires_at IS NULL OR l.expires_at>now()) AND (l.auto_revoke_at IS NULL OR l.auto_revoke_at>now()) AND w.status='active'
      AND EXISTS(SELECT 1 FROM worker_object_assignments a WHERE a.organization_id=l.organization_id AND a.worker_id=l.worker_id AND a.object_id=l.object_id
        AND (a.effective_from IS NULL OR a.effective_from<=current_date) AND (a.effective_to IS NULL OR a.effective_to>=current_date))
      AND NOT EXISTS(SELECT 1 FROM object_shift_reporting_settings s WHERE s.organization_id=l.organization_id AND s.object_id=l.object_id AND NOT s.reporting_enabled)
    FOR UPDATE OF l
  `;
  if(!row)throw new EmployeePortalAccessError("Ссылка недействительна или заблокирована");
}

export async function assertPortalSectionAllowed(token:string,section:keyof PortalConfiguration["sections"]){
 const ref=await resolveToken(token);
 if(!ref)throw new EmployeePortalAccessError("Ссылка недействительна");
 return withTenant(ref.tenantId,ref.actorUserId,async(sql)=>{
  await assertEmployeeLinkActive(sql,ref,token);
  const [row]=await sql<Array<{workerId:string;objectId:string;linkOverride:PortalConfigurationPatch}>>`SELECT worker_id "workerId",object_id "objectId",link_config_override "linkOverride" FROM worker_timesheet_links WHERE id=${ref.linkId}::uuid`;
  if(!row)throw new EmployeePortalAccessError("Раздел недоступен по этой ссылке");
  const config=await effectiveActiveLinkConfiguration(sql,ref.tenantId,row.objectId,row.workerId,row.linkOverride);
  if(!config.sections[section])throw new EmployeePortalAccessError("Раздел недоступен по этой ссылке");
 });
}

export async function employeePortal(token:string,selectedMonth?:string){
  const ref=await resolveToken(token);if(!ref)return null;
  return withTenant(ref.tenantId,ref.actorUserId,async(sql)=>{
    const [link]=await sql<Array<{id:string;workerId:string;objectId:string;name:string;objectName:string;paidHours:number;owner:"manager"|"worker";deadline:string;timezone:string;today:string;reportingEnabled:boolean;configuration:PortalConfigurationPatch;linkOverride:PortalConfigurationPatch}>>`
      SELECT l.id,w.id "workerId",l.object_id "objectId",w.full_name name,o.name "objectName",
      a.paid_hours_per_shift::float8 "paidHours",
      COALESCE(wa.schedule_owner,s.schedule_authority,CASE WHEN s.schedule_owner='client' THEN 'worker' ELSE s.schedule_owner END,'manager') owner,
      COALESCE(s.confirmation_deadline::text,'22:00') deadline,
      COALESCE(NULLIF(l.portal_config_snapshot->>'timezone',''),s.timezone,'Europe/Moscow') timezone,
      (now() AT TIME ZONE COALESCE(NULLIF(l.portal_config_snapshot->>'timezone',''),s.timezone,'Europe/Moscow'))::date::text today,
      l.portal_config_snapshot configuration,l.link_config_override "linkOverride",
      COALESCE(s.reporting_enabled,true) "reportingEnabled"
      FROM worker_timesheet_links l JOIN worker_profiles w ON w.id=l.worker_id
      JOIN objects o ON o.id=l.object_id
      JOIN worker_object_assignments a ON a.worker_id=w.id AND a.object_id=o.id
        AND (a.effective_from IS NULL OR a.effective_from<=current_date) AND (a.effective_to IS NULL OR a.effective_to>=current_date)
      LEFT JOIN object_shift_reporting_settings s ON s.object_id=o.id
      LEFT JOIN worker_schedule_authorities wa ON wa.worker_id=w.id AND wa.object_id=o.id
      WHERE l.id=${ref.linkId}::uuid AND l.token_hash=${tokenHash(token)} AND l.status='active'
        AND (l.expires_at IS NULL OR l.expires_at>now()) AND (l.auto_revoke_at IS NULL OR l.auto_revoke_at>now())
        AND w.status='active' ORDER BY a.effective_from DESC LIMIT 1`;
    if(!link||!link.reportingEnabled)return null;
    const activeConfig=await effectiveActiveLinkConfiguration(sql,ref.tenantId,link.objectId,link.workerId,link.linkOverride);
    const local=new Intl.DateTimeFormat("en-GB",{timeZone:activeConfig.timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const dateParts=Object.fromEntries(local.map(part=>[part.type,part.value]));
    link.today=`${dateParts.year}-${dateParts.month}-${dateParts.day}`;
    link.timezone=activeConfig.timezone;
    const touched=await sql`UPDATE worker_timesheet_links SET last_opened_at=now()
      WHERE id=${link.id}::uuid AND (last_opened_at IS NULL OR last_opened_at<now()-interval '15 minutes') RETURNING id`;
    if(touched.length)await sql`INSERT INTO worker_portal_events(organization_id,worker_id,object_id,link_id,event_type)
      VALUES(${ref.tenantId}::uuid,${link.workerId}::uuid,${link.objectId}::uuid,${link.id}::uuid,'opened_by_employee')`;
    const todayMonth=link.today.slice(0,7);
     const month=selectedMonth&&/^\d{4}-(0[1-9]|1[0-2])$/.test(selectedMonth)&&selectedMonth>="2020-01"&&selectedMonth<=todayMonth?selectedMonth:todayMonth;
     const monthFrom=month+"-01";const monthTo=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
     const rangeFrom=monthFrom;
     const rangeTo=monthTo;
     const [reports,plans,disputes,period]=await Promise.all([
      sql<Array<{date:string;shiftKind:string|null;response:string;reason:string|null;hours:number|null;reconciledAt:string|null;needsReconfirmation:boolean;reviewStatus:string;approvedHours:number|null;reviewedAt:string|null;updatedAt:string;employeeRespondedAt:string|null;reviewedBy:string|null}>>`
        SELECT r.work_date::text date,r.shift_kind "shiftKind",r.response,r.reason,r.reported_hours::float8 hours,r.hours_reconciled_at::text "reconciledAt",
         (r.confirmed_at IS NULL AND r.reported_hours IS NULL AND r.hours_reconciled_at IS NULL) "needsReconfirmation",
         r.review_status "reviewStatus",r.approved_hours::float8 "approvedHours",r.reviewed_at::text "reviewedAt",r.updated_at::text "updatedAt",
         GREATEST(r.confirmed_at,r.hours_submitted_at)::text "employeeRespondedAt",reviewer.display_name "reviewedBy"
        FROM worker_shift_reports r LEFT JOIN app_users reviewer ON reviewer.id=r.reviewed_by_user_id
        WHERE r.worker_id=${link.workerId}::uuid AND r.object_id=${link.objectId}::uuid
          AND ((r.work_date BETWEEN ${rangeFrom}::date AND ${rangeTo}::date) OR (r.work_date BETWEEN (${link.today}::date-3) AND (${link.today}::date+31))) ORDER BY r.work_date`,
      sql<Array<{date:string;kind:string;timeCode:string;hours:number;source:string}>>`
        SELECT DISTINCT ON(work_date) work_date::text date,COALESCE(planned_shift_kind,'day') kind,time_code "timeCode",fact_hours::float8 hours,source
        FROM time_entries WHERE worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid
          AND ((work_date BETWEEN ${rangeFrom}::date AND ${rangeTo}::date) OR (work_date BETWEEN (${link.today}::date-3) AND (${link.today}::date+31)))
          ORDER BY work_date,updated_at DESC`,
      sql<Array<{date:string;status:string;reason:string;comment:string;createdAt:string}>>`
       SELECT work_date::text date,status,reason,comment,created_at::text "createdAt" FROM worker_hours_disputes
       WHERE worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid
       AND work_date BETWEEN ${rangeFrom}::date AND ${rangeTo}::date ORDER BY created_at DESC`,
      sql<Array<{status:string;closedAt:string|null}>>`
       SELECT status,closed_at::text "closedAt" FROM timesheet_snapshots
       WHERE object_id=${link.objectId}::uuid AND view_type='internal'
         AND period_start<=${monthFrom}::date AND period_end>=${monthTo}::date
       ORDER BY version DESC LIMIT 1`,
    ]);
    return {...link,config:activeConfig,reports,plans,disputes,periodStatus:period[0]?.status??null,periodClosedAt:period[0]?.closedAt??null,selectedMonth:month};
  });
}

function dateAddOne(date:string){const day=new Date(date+"T00:00:00Z");day.setUTCDate(day.getUTCDate()+1);return day.toISOString().slice(0,10)}
export async function submitEmployeeReply(token:string,payload:{date:string;response?:"working"|"day_off"|"cannot_work";kind?:"day"|"night"|"off";hours?:number;reason?:string}){
  const ref=await resolveToken(token);if(!ref)throw new EmployeePortalAccessError("Недействительная ссылка");
  return withTenant(ref.tenantId,ref.actorUserId,async(sql)=>{
    await assertEmployeeLinkActive(sql,ref,token);
    const [link]=await sql<Array<{workerId:string;objectId:string;owner:string;localToday:string;deadline:string;timezone:string;paidHours:number;configuration:PortalConfigurationPatch}>>`
      SELECT l.worker_id "workerId",l.object_id "objectId",COALESCE(wa.schedule_owner,s.schedule_authority,CASE WHEN s.schedule_owner='client' THEN 'worker' ELSE s.schedule_owner END,'manager') owner,
      (now() AT TIME ZONE COALESCE(NULLIF(l.portal_config_snapshot->>'timezone',''),s.timezone,'Europe/Moscow'))::date::text "localToday",
      COALESCE(s.confirmation_deadline::text,'22:00') deadline,
      COALESCE(NULLIF(l.portal_config_snapshot->>'timezone',''),s.timezone,'Europe/Moscow') timezone,
      COALESCE(a.paid_hours_per_shift,11)::float8 "paidHours",l.portal_config_snapshot configuration
      FROM worker_timesheet_links l JOIN worker_profiles w ON w.id=l.worker_id
      JOIN worker_object_assignments a ON a.worker_id=l.worker_id AND a.object_id=l.object_id
        AND (a.effective_from IS NULL OR a.effective_from<=current_date) AND (a.effective_to IS NULL OR a.effective_to>=current_date)
      LEFT JOIN object_shift_reporting_settings s ON s.object_id=l.object_id
      LEFT JOIN worker_schedule_authorities wa ON wa.worker_id=l.worker_id AND wa.object_id=l.object_id
      WHERE l.id=${ref.linkId}::uuid AND l.status='active' AND (l.expires_at IS NULL OR l.expires_at>now()) AND (l.auto_revoke_at IS NULL OR l.auto_revoke_at>now()) AND w.status='active' AND COALESCE(s.reporting_enabled,true)
      LIMIT 1`;
    if(!link)throw new EmployeePortalAccessError("Доступ закрыт");
    const sections=applyPortalPatch(defaultPortalConfiguration,link.configuration??{}).sections;
    if(payload.hours!==undefined&&!sections.hours)throw new EmployeePortalError("Ввод часов отключён для этой ссылки");
    if(payload.response==="working"&&!sections.confirm)throw new EmployeePortalError("Подтверждение выхода недоступно");
    if(payload.response==="cannot_work"&&!sections.decline)throw new EmployeePortalError("Сообщение о невыходе недоступно");
    if(payload.response==="day_off"&&!sections.scheduleChanges)throw new EmployeePortalError("Изменение графика недоступно");
    if(payload.hours!==undefined&&Math.abs(payload.hours-link.paidHours)>0.001&&!payload.reason?.trim())throw new EmployeePortalError("При отличии часов от нормы укажите причину");
    const activeShifts=await sql<Array<{id:string}>>`
      SELECT sh.id FROM shifts sh JOIN shift_assignments sa ON sa.shift_id=sh.id
      WHERE sh.object_id=${link.objectId}::uuid AND sa.worker_id=${link.workerId}::uuid
        AND sh.shift_date=${payload.date}::date AND sh.status<>'cancelled' AND sa.confirmation_status<>'cancelled'
      ORDER BY sh.starts_at LIMIT 2`;
    if(activeShifts.length>1)throw new EmployeePortalError("На эту дату назначено несколько смен: данные необходимо сверить с менеджером.");
    const assignedShiftId=activeShifts[0]?.id??null;
    if(link.owner==='manager'&&payload.response==='working'){
      const [planned]=await sql<Array<{kind:string;reserve:boolean}>>`SELECT sh.shift_kind kind,sa.is_reserve reserve
        FROM shifts sh JOIN shift_assignments sa ON sa.shift_id=sh.id
        WHERE sh.object_id=${link.objectId}::uuid AND sa.worker_id=${link.workerId}::uuid AND sh.shift_date=${payload.date}::date
          AND sh.status<>'cancelled' AND sa.confirmation_status<>'cancelled'
        ORDER BY sa.is_reserve,sh.starts_at LIMIT 1`;
      if(planned?.reserve)throw new EmployeePortalError("Вы в резерве. Для выхода требуется назначение менеджера");
      if(planned&&payload.kind&&planned.kind!==payload.kind)throw new EmployeePortalError("Смена отличается от плана менеджера. Обратитесь к менеджеру для изменения графика");
    }

    const today=link.localToday;
    const offset=Math.round((Date.parse(payload.date+"T00:00:00Z")-Date.parse(today+"T00:00:00Z"))/86400000);
    if(!Number.isFinite(offset)||offset< -3||offset>31)throw new EmployeePortalError("Эту дату больше нельзя редактировать");
    if(payload.hours!==undefined&&(offset>0||offset< -3))throw new EmployeePortalError("Часы можно уточнить только после завершения смены");
    if(payload.hours!==undefined&&(payload.hours<0||payload.hours>24))throw new EmployeePortalError("Часы должны быть от 0 до 24");
    if(payload.response==="day_off")throw new EmployeePortalError("Выходные дни отмечаются в разделе планирования графика");
    if(payload.response==="cannot_work"&&!payload.reason?.trim())throw new EmployeePortalError("Укажите причину невыхода");
    if(payload.hours!==undefined){
      const [assignmentShift]=await sql<Array<{endClock:string;endDate:string}>>`
        SELECT to_char(sh.ends_at AT TIME ZONE ${link.timezone},'HH24:MI') "endClock",
          (sh.ends_at AT TIME ZONE ${link.timezone})::date::text "endDate"
        FROM shifts sh JOIN shift_assignments sa ON sa.shift_id=sh.id
        WHERE sh.object_id=${link.objectId}::uuid AND sa.worker_id=${link.workerId}::uuid
          AND sh.shift_date=${payload.date}::date AND sh.status<>'cancelled' AND sa.confirmation_status<>'cancelled' AND NOT sa.is_reserve
        ORDER BY sh.starts_at LIMIT 1`;
      const [customTime]=await sql<Array<{endClock:string;nextDay:boolean}>>`
        SELECT to_char(end_time,'HH24:MI') "endClock",ends_next_day "nextDay"
        FROM worker_shift_time_changes WHERE worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid
          AND status='accepted' AND work_date<=${payload.date}::date
          AND (work_date=${payload.date}::date OR applies_to='regular')
        ORDER BY (work_date=${payload.date}::date) DESC,work_date DESC LIMIT 1`;
      const [savedResponse]=await sql<Array<{kind:string|null}>>`SELECT shift_kind kind FROM worker_shift_reports
        WHERE worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid AND work_date=${payload.date}::date LIMIT 1`;
      const night=(savedResponse?.kind??payload.kind)==="night";
      const finishDate=customTime?(customTime.nextDay?dateAddOne(payload.date):payload.date)
        :assignmentShift?.endDate??(night?dateAddOne(payload.date):payload.date);
      const finishTime=customTime?.endClock??assignmentShift?.endClock??(night?"08:00":"20:00");
      const parts=new Intl.DateTimeFormat("en-GB",{timeZone:link.timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
      const stamp=Object.fromEntries(parts.map(p=>[p.type,p.value]));
      const nowLocal=`${stamp.year}-${stamp.month}-${stamp.day}T${stamp.hour}:${stamp.minute}`;
      if(nowLocal<`${finishDate}T${finishTime}`)throw new EmployeePortalError("Смена ещё не завершилась. Укажите часы после её окончания.");
    }
    const [locked]=await sql<Array<{id:string}>>`SELECT id FROM timesheet_snapshots WHERE object_id=${link.objectId}::uuid AND period_start<=${payload.date}::date AND period_end>=${payload.date}::date AND status IN ('fixed','closed','internal_submitted','internal_checked','client_sent','client_approved') LIMIT 1`;
    if(locked)throw new EmployeePortalError("Табель за эту дату уже зафиксирован");
    const [old]=await sql<Array<{response:string;shiftKind:string|null;shiftId:string|null;needsReconfirmation:boolean}>>`SELECT response,shift_kind "shiftKind",shift_id "shiftId",(confirmed_at IS NULL) "needsReconfirmation" FROM worker_shift_reports WHERE worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid AND work_date=${payload.date}::date LIMIT 1`;
    if(payload.hours!==undefined||(payload.response!==undefined&&payload.date<=link.localToday)){const [verified]=await sql<Array<{id:string}>>`SELECT worker_id id FROM worker_shift_reports WHERE worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid AND work_date=${payload.date}::date AND hours_reconciled_at IS NOT NULL LIMIT 1`;if(verified)throw new EmployeePortalError("Смена уже согласована. Для исправления обратитесь к менеджеру.")}
    if(payload.hours!==undefined&&old?.shiftId&&old.shiftId!==assignedShiftId)throw new EmployeePortalError("Назначенная смена изменилась. Сначала подтвердите актуальный план.");
    if(payload.hours!==undefined&&old?.needsReconfirmation)throw new EmployeePortalError("План смены изменён. Сначала подтвердите актуальную смену менеджера");
    if(link.owner==='manager'&&payload.hours!==undefined&&old?.response==='working'){
      const [planned]=await sql<Array<{kind:string;reserve:boolean}>>`SELECT sh.shift_kind kind,sa.is_reserve reserve
        FROM shifts sh JOIN shift_assignments sa ON sa.shift_id=sh.id
        WHERE sh.object_id=${link.objectId}::uuid AND sa.worker_id=${link.workerId}::uuid AND sh.shift_date=${payload.date}::date
          AND sh.status<>'cancelled' AND sa.confirmation_status<>'cancelled'
        ORDER BY sa.is_reserve,sh.starts_at LIMIT 1`;
      if(planned?.reserve)throw new EmployeePortalError("Вы в резерве. Для выхода требуется назначение менеджера");
      if(planned&&old.shiftKind!==planned.kind)throw new EmployeePortalError("План смены изменён. Сначала подтвердите актуальную смену менеджера");
    }
     if(payload.hours!==undefined&&!old)throw new EmployeePortalError("Сначала подтвердите выход");
    if(payload.hours!==undefined&&old?.response!=="working")throw new EmployeePortalError("Часы указываются только за отработанную смену");
    if(payload.hours===undefined&&!payload.response)throw new EmployeePortalError("Не указан ответ");
    if(payload.hours===undefined){
      await sql`INSERT INTO worker_shift_reports(organization_id,worker_id,object_id,work_date,shift_kind,response,reason,confirmed_at,source_link_id,shift_id)
        VALUES(${ref.tenantId}::uuid,${link.workerId}::uuid,${link.objectId}::uuid,${payload.date}::date,${payload.kind??old?.shiftKind??null},${payload.response!},${payload.reason??null},now(),${ref.linkId}::uuid,${assignedShiftId}::uuid)
        ON CONFLICT(worker_id,object_id,work_date) DO UPDATE SET shift_kind=EXCLUDED.shift_kind,response=EXCLUDED.response,reason=EXCLUDED.reason,confirmed_at=now(),source_link_id=EXCLUDED.source_link_id,shift_id=EXCLUDED.shift_id,updated_at=now(),review_status='pending',reviewed_at=NULL,reviewed_by_user_id=NULL,approved_hours=NULL,review_comment=NULL,reported_hours=CASE WHEN worker_shift_reports.response=EXCLUDED.response AND worker_shift_reports.shift_kind IS NOT DISTINCT FROM EXCLUDED.shift_kind THEN worker_shift_reports.reported_hours ELSE NULL END,
          hours_submitted_at=CASE WHEN worker_shift_reports.response=EXCLUDED.response AND worker_shift_reports.shift_kind IS NOT DISTINCT FROM EXCLUDED.shift_kind THEN worker_shift_reports.hours_submitted_at ELSE NULL END`;
    }else{
      await sql`UPDATE worker_shift_reports SET reported_hours=${payload.hours},reason=COALESCE(${payload.reason??null},reason),source_link_id=${ref.linkId}::uuid,shift_id=COALESCE(${assignedShiftId}::uuid,shift_id),hours_submitted_at=now(),review_status='pending',reviewed_at=NULL,reviewed_by_user_id=NULL,approved_hours=NULL,review_comment=NULL,updated_at=now() WHERE worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid AND work_date=${payload.date}::date`;
    }
    if(payload.response)await sql`UPDATE shift_assignments sa SET confirmation_status=${payload.response==='working'?'confirmed':'declined'}
      FROM shifts sh WHERE sh.id=sa.shift_id AND sh.object_id=${link.objectId}::uuid AND sh.shift_date=${payload.date}::date
        AND sa.worker_id=${link.workerId}::uuid AND sa.confirmation_status<>'cancelled' AND sh.status<>'cancelled' AND NOT sa.is_reserve`;
    // Employee-submitted hours stay in worker_shift_reports until manager review.
    // No time_entries or accruals are modified by a public employee response.
    return {ok:true};
  });
}

export async function reviewEmployeeHours(actor:Actor,objectId:string,workerId:string,date:string,approved:boolean,approvedHours?:number,comment?:string){
 requireCapability(actor,"time.time_entry.edit");
 const object=await assertManage(actor,objectId,workerId);
 if(!canReadRow(actor.access,"time.time_entry.edit",object,actor))throw new AccessDeniedError("time.time_entry.edit");
 if(actor.demo)throw new EmployeePortalError("Сверка недоступна в демонстрации");
 if(approvedHours!==undefined&&(!Number.isFinite(approvedHours)||approvedHours<=0||approvedHours>24))throw new EmployeePortalError("Укажите часы от 0,01 до 24");
 if((comment?.length??0)>500)throw new EmployeePortalError("Комментарий слишком длинный");
 return withTenant(actor.organizationId,actor.userId,async(sql)=>{
   const [locked]=await sql<Array<{id:string}>>`SELECT id FROM timesheet_snapshots
     WHERE organization_id=${actor.organizationId}::uuid AND object_id=${objectId}::uuid
       AND period_start<=${date}::date AND period_end>=${date}::date
       AND status IN ('fixed','closed','internal_submitted','internal_checked','client_sent','client_approved') LIMIT 1`;
   if(locked)throw new EmployeePortalError("Табель за эту дату уже зафиксирован");
   const [report]=await sql<Array<{id:string;hours:number|null;response:string;kind:string|null;status:string;reason:string|null;linkId:string;shiftId:string|null;confirmedAt:string|null}>>`
     SELECT id,reported_hours::float8 hours,response,shift_kind kind,review_status status,reason,source_link_id "linkId",shift_id "shiftId",confirmed_at::text "confirmedAt"
     FROM worker_shift_reports WHERE organization_id=${actor.organizationId}::uuid
       AND object_id=${objectId}::uuid AND worker_id=${workerId}::uuid AND work_date=${date}::date FOR UPDATE`;
   if(!report||report.hours===null||report.response!=="working")throw new EmployeePortalError("Нет переданных сотрудником часов для проверки");
   if(!report.confirmedAt)throw new EmployeePortalError("План смены изменился. Сотрудник должен повторно подтвердить выход.");
   if(report.status==="approved")throw new EmployeePortalError("Часы уже подтверждены. Корректировку проводите через табель с записью в историю.");
   if(!approved&&!comment?.trim())throw new EmployeePortalError("Для отклонения укажите причину");
   const finalHours=approvedHours??report.hours;
   if(approved&&(finalHours<=0||finalHours>24))throw new EmployeePortalError("Некорректные итоговые часы");
   if(approved){
     // An old response must never approve hours for a cancelled/replaced shift.
     const assignments=await sql<Array<{id:string;kind:string;isReserve:boolean}>>`
       SELECT sh.id,sh.shift_kind kind,sa.is_reserve "isReserve"
       FROM shifts sh JOIN shift_assignments sa ON sa.shift_id=sh.id
       WHERE sh.organization_id=${actor.organizationId}::uuid AND sh.object_id=${objectId}::uuid
         AND sh.shift_date=${date}::date AND sh.status<>'cancelled'
         AND sa.worker_id=${workerId}::uuid AND sa.confirmation_status<>'cancelled'
       ORDER BY sh.starts_at LIMIT 2`;
     if(assignments.length>1)throw new EmployeePortalError("Несколько смен на одну дату: нужна ручная сверка табеля.");
     const assigned=assignments[0];
     if(assigned&&(assigned.isReserve||!report.shiftId||assigned.id!==report.shiftId||assigned.kind!==report.kind))
       throw new EmployeePortalError("Назначение смены изменилось. Запросите новое подтверждение сотрудника.");
     if(!assigned&&report.shiftId)
       throw new EmployeePortalError("Смена отменена или назначение закрыто. Подтверждение часов недоступно.");
     const entries=await sql<Array<{id:string;source:string;shiftId:string|null;factHours:number}>>`
       SELECT id,source,shift_id "shiftId",fact_hours::float8 "factHours" FROM time_entries
       WHERE organization_id=${actor.organizationId}::uuid AND object_id=${objectId}::uuid
         AND worker_id=${workerId}::uuid AND work_date=${date}::date
       ORDER BY (shift_id IS NULL) DESC,updated_at DESC FOR UPDATE`;
     if(entries.length>1)throw new EmployeePortalError("Несколько записей табеля за дату: требуется ручная сверка.");
     const recorded=entries[0];
     if(recorded?.shiftId&&report.shiftId&&recorded.shiftId!==report.shiftId)throw new EmployeePortalError("Табель относится к другой смене. Проверьте назначение перед подтверждением.");
     if(recorded&&recorded.source!=="schedule"&&recorded.source!=="worker_report"&&Math.abs(recorded.factHours-finalHours)>0.001)
       throw new EmployeePortalError("Часы уже внесены менеджером: исправьте расхождение через табель с историей корректировок.");
     const kind=report.kind==="night"?"night":"day";
     if(recorded&&recorded.source!=="schedule"&&recorded.source!=="worker_report"){
       // A matching manager fact is authoritative; only complete the missing shift reference.
       if(!recorded.shiftId&&report.shiftId)await sql`UPDATE time_entries SET shift_id=${report.shiftId}::uuid,
         corrected_by_user_id=${actor.userId}::uuid,updated_at=now()
         WHERE id=${recorded.id}::uuid AND shift_id IS NULL`;
     }else if(entries.length){
       const entry=entries[0];
       await sql`UPDATE time_entries SET planned=true,time_code='WORK',fact_hours=${finalHours},shift_id=COALESCE(shift_id,${report.shiftId}::uuid),
          day_hours=${kind==="day"?finalHours:0},night_hours=${kind==="night"?finalHours:0},
          planned_shift_kind=${kind},source='manual',corrected_by_user_id=${actor.userId}::uuid,
          correction_reason=${comment?.trim()||"Часы подтверждены менеджером по ответу сотрудника"},updated_at=now()
          WHERE id=${entry.id}::uuid`;
     }else{
       await sql`INSERT INTO time_entries(organization_id,worker_id,object_id,work_date,shift_id,planned,time_code,fact_hours,
         day_hours,night_hours,planned_shift_kind,source,corrected_by_user_id,correction_reason)
         VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${objectId}::uuid,${date}::date,${report.shiftId}::uuid,true,'WORK',${finalHours},
         ${kind==="day"?finalHours:0},${kind==="night"?finalHours:0},${kind},'manual',${actor.userId}::uuid,
         ${comment?.trim()||"Часы подтверждены менеджером по ответу сотрудника"})`;
     }
   }
   await sql`UPDATE worker_shift_reports SET review_status=${approved?"approved":"rejected"},
      approved_hours=${approved?finalHours:null},review_comment=${comment?.trim()||null},
      reviewed_at=now(),reviewed_by_user_id=${actor.userId}::uuid,
      hours_reconciled_at=CASE WHEN ${approved} THEN now() ELSE NULL END,
      hours_reconciled_by_user_id=CASE WHEN ${approved} THEN ${actor.userId}::uuid ELSE NULL END,updated_at=now()
      WHERE id=${report.id}::uuid`;
   await sql`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
      VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${workerId}::uuid,
      ${approved?"employee_hours_approved":"employee_hours_rejected"},
      ${approved?"Менеджер подтвердил часы сотрудника":"Менеджер отклонил часы сотрудника"},
      ${sql.json({objectId,date,employeeHours:report.hours,approvedHours:approved?finalHours:null,comment:comment??null,sourceLinkId:report.linkId})})`;
   return {ok:true,approvedHours:approved?finalHours:null};
 });
}

export async function reconcileEmployeeHours(actor:Actor,objectId:string,fromDate:string,toDate:string){
  requireCapability(actor,"time.time_entry.edit");
  const object=await assertManage(actor,objectId);
  if(!canReadRow(actor.access,"time.time_entry.edit",object,actor))throw new AccessDeniedError("time.time_entry.edit");
  if(actor.demo)throw new EmployeePortalError("Сверка недоступна в демонстрационном режиме");
  if(toDate<fromDate||Date.parse(toDate)-Date.parse(fromDate)>31*86400000)throw new EmployeePortalError("Выберите период не длиннее 31 дня");
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    const [locked]=await sql<Array<{id:string}>>`SELECT id FROM timesheet_snapshots
      WHERE object_id=${objectId}::uuid AND period_start<=${toDate}::date AND period_end>=${fromDate}::date
      AND status IN ('fixed','closed','internal_submitted','internal_checked','client_sent','client_approved') LIMIT 1`;
    if(locked)throw new EmployeePortalError("В выбранном периоде есть зафиксированный табель");
    const reviewed=await sql<Array<{workerId:string;date:string}>>`UPDATE worker_shift_reports r
      SET hours_reconciled_at=now(),hours_reconciled_by_user_id=${actor.userId}::uuid,review_status='approved',approved_hours=r.reported_hours,reviewed_at=now(),reviewed_by_user_id=${actor.userId}::uuid,updated_at=now()
      FROM time_entries t WHERE t.worker_id=r.worker_id AND t.object_id=r.object_id AND t.work_date=r.work_date
        AND r.object_id=${objectId}::uuid AND r.work_date BETWEEN ${fromDate}::date AND ${toDate}::date
        AND r.reported_hours IS NOT NULL AND r.hours_reconciled_at IS NULL AND r.review_status='pending' AND t.source='worker_report' AND t.time_code='WORK' AND t.fact_hours>0 AND abs(t.fact_hours-r.reported_hours)<0.001
      RETURNING r.worker_id "workerId",r.work_date::text date`;
    await sql`UPDATE time_entries SET source='manual',corrected_by_user_id=${actor.userId}::uuid,
      correction_reason='Промежуточная сверка с заказчиком',updated_at=now()
      WHERE object_id=${objectId}::uuid AND work_date BETWEEN ${fromDate}::date AND ${toDate}::date AND source='worker_report'
      AND EXISTS(SELECT 1 FROM worker_shift_reports r WHERE r.worker_id=time_entries.worker_id AND r.object_id=time_entries.object_id AND r.work_date=time_entries.work_date AND r.review_status='approved' AND r.hours_reconciled_by_user_id=${actor.userId}::uuid)
      RETURNING id`;
    await sql`INSERT INTO object_timesheet_reconciliations(organization_id,object_id,period_start,period_end,reconciled_by_user_id,checked_worker_reports)
      VALUES(${actor.organizationId}::uuid,${objectId}::uuid,${fromDate}::date,${toDate}::date,${actor.userId}::uuid,${reviewed.length})`;
    await sql`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
      VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${objectId}::uuid,'timesheet_interim_reconciled',
      'Промежуточная сверка табеля с заказчиком',${sql.json({fromDate,toDate,workerReportsAccepted:reviewed.length})})`;
    return {ok:true,accepted:reviewed.length};
  });
}


export async function submitEmployeeHoursDispute(token:string,input:{date:string;reason:"hours"|"missing_shift"|"wrong_shift"|"other";comment:string}){
 const ref=await resolveToken(token);
 if(!ref)throw new EmployeePortalAccessError("Ссылка недействительна");
 const comment=input.comment.trim();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.date)||!comment||comment.length>500)throw new EmployeePortalError("Укажите дату и причину обращения");
 return withTenant(ref.tenantId,ref.actorUserId,async sql=>{
  await assertEmployeeLinkActive(sql,ref,token);
  const [link]=await sql<Array<{workerId:string;objectId:string;linkOverride:PortalConfigurationPatch}>>`
    SELECT worker_id "workerId",object_id "objectId",link_config_override "linkOverride" FROM worker_timesheet_links WHERE id=${ref.linkId}::uuid`;
  if(!link)throw new EmployeePortalAccessError("Ссылка недействительна");
  const config=await effectiveActiveLinkConfiguration(sql,ref.tenantId,link.objectId,link.workerId,link.linkOverride);
  if(!config.sections.timesheet)throw new EmployeePortalAccessError("Табель недоступен");
  const [duplicate]=await sql`SELECT id FROM worker_hours_disputes WHERE worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid
    AND work_date=${input.date}::date AND status IN ('open','in_review') LIMIT 1`;
  if(duplicate)throw new EmployeePortalError("По этому дню уже есть открытое обращение");
  await sql`INSERT INTO worker_hours_disputes(organization_id,worker_id,object_id,work_date,source_link_id,reason,comment)
    VALUES(${ref.tenantId}::uuid,${link.workerId}::uuid,${link.objectId}::uuid,${input.date}::date,${ref.linkId}::uuid,${input.reason},${comment})`;
  return {ok:true};
 });
}

export async function submitEmployeeAdjustmentQuestion(token:string,input:{adjustmentId:string;question:string}){
 const ref=await resolveToken(token);
 if(!ref)throw new EmployeePortalAccessError("Ссылка недействительна");
 const question=input.question.trim();
 if(!/^[a-f0-9-]{36}$/i.test(input.adjustmentId)||!question||question.length>500)throw new EmployeePortalError("Некорректный вопрос");
 return withTenant(ref.tenantId,ref.actorUserId,async sql=>{
  await assertEmployeeLinkActive(sql,ref,token);
  const [link]=await sql<Array<{workerId:string;objectId:string;linkOverride:PortalConfigurationPatch}>>`
    SELECT worker_id "workerId",object_id "objectId",link_config_override "linkOverride" FROM worker_timesheet_links WHERE id=${ref.linkId}::uuid`;
  if(!link)throw new EmployeePortalAccessError("Ссылка недействительна");
  const cfg=await effectiveActiveLinkConfiguration(sql,ref.tenantId,link.objectId,link.workerId,link.linkOverride);
  if(!cfg.sections.payAdjustments)throw new EmployeePortalAccessError("Раздел недоступен");
  const [adjustment]=await sql`SELECT id FROM worker_pay_adjustments
    WHERE id=${input.adjustmentId}::uuid AND worker_id=${link.workerId}::uuid AND object_id=${link.objectId}::uuid
    AND status IN ('review','confirmed','accounted')`;
  if(!adjustment)throw new EmployeePortalError("Корректировка недоступна");
  await sql`INSERT INTO worker_pay_adjustment_questions(organization_id,adjustment_id,worker_id,source_link_id,question)
    VALUES(${ref.tenantId}::uuid,${input.adjustmentId}::uuid,${link.workerId}::uuid,${ref.linkId}::uuid,${question})`;
  return {ok:true};
 });
}
