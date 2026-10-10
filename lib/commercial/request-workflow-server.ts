import {requestAuditChanges} from "@/lib/commercial/edit-history";
import { randomBytes, randomUUID } from "node:crypto";
import { PublicIntakeInputError } from "@/lib/commercial/public-intake-validation";
import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { hasCapability, canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { registerPublicRequestToken, resolvePublicRequestToken } from "@/lib/commercial/public-request-token-directory";
import * as demo from "@/lib/demo/data";
import { normalizeRequestIntake, toJsonValue, type RequestIntake } from "@/lib/commercial/request-intake";
import { defaultRequestStages, type RequestBoardRow, type RequestStageDefinition, type RequestTimelineItem, type RequestWorkflowMeta, type RequestWorkspaceOptions } from "@/lib/commercial/request-workflow";

export type RequestRoleInput = { id?:string; specialtyId?:string|null; specialtyName:string; count:number; schedule:Record<string,unknown>; requirements:Record<string,unknown>; targetClientRate:number|null };
export type RequestV2Payload = { clientId:string|null; title:string; source:string; location:string; regionId:string|null; startDate:string|null; durationText:string|null; schedule:Record<string,unknown>; intake:RequestIntake; lunchPaid:boolean; vatMode:string|null; comments:string|null; ownerUserId:string|null; observerUserIds:string[]; roles:RequestRoleInput[] };
export type BlankRequestContext = { organizationName:string; token:string; specialties:Array<{id:string;name:string}>; regions:Array<{id:string;name:string}>; expiresAt:string|null };

function canAssignRequests(actor:Actor){return actor.roleCode==="director"||hasCapability(actor.access,"organization.manage")||hasCapability(actor.access,"sales.request.archive");}
function canConfigurePipeline(actor:Actor){return actor.roleCode==="director"||hasCapability(actor.access,"organization.manage")||hasCapability(actor.access,"admin.permissions.manage");}
function rule(intake:RequestIntake,key:"housing"|"travel"|"shuttle"|"workwear"|"ppe"|"medical"|"medbook"|"tools"){return intake.provision[key].provider;}

export async function getRequestWorkspaceOptions(actor:Actor):Promise<RequestWorkspaceOptions>{
  if(actor.demo)return {
    clients:demo.clients.map((item)=>({id:item.id,name:item.name})),
    regions:[{id:"30000000-0000-4000-8000-000000000001",name:"Москва"},{id:"30000000-0000-4000-8000-000000000002",name:"Московская область"},{id:"30000000-0000-4000-8000-000000000003",name:"Псковская область"}],
    specialties:[
      {id:"60000000-0000-4000-8000-000000000001",name:"Комплектовщик",stats:{sampleCount:7,clientRateMin:610,clientRateMedian:660,clientRateMax:720,workerPayMin:360,workerPayMax:420}},
      {id:"60000000-0000-4000-8000-000000000002",name:"Грузчик",stats:{sampleCount:5,clientRateMin:580,clientRateMedian:630,clientRateMax:690,workerPayMin:330,workerPayMax:390}},
      {id:"60000000-0000-4000-8000-000000000003",name:"Сборщик мебели",stats:{sampleCount:2,clientRateMin:710,clientRateMedian:740,clientRateMax:770,workerPayMin:430,workerPayMax:470}},
    ],
    members:[{id:actor.userId,name:actor.displayName,role:actor.roleName}],
    currentUserId:actor.userId,
    canAssign:canAssignRequests(actor),
    canConfigurePipeline:canConfigurePipeline(actor),
    sources:["manual","public_form"],
    lossReasons:[
      {code:"price",name:"Цена / экономика"},
      {code:"competitor",name:"Выбран другой подрядчик"},
      {code:"cancelled",name:"Потребность отменена"},
      {code:"timing",name:"Не устроили сроки"},
      {code:"terms",name:"Не устроили условия"},
      {code:"no_response",name:"Нет ответа заказчика"},
      {code:"staffing_failure",name:"Не смогли обеспечить персонал"},
      {code:"other",name:"Другое"},
    ],
  };
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    const [clients,regions,specialties,allMembers,sources,lossReasons]=await Promise.all([
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM client_companies WHERE status<>'archived' ORDER BY name`,
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM regions ORDER BY name`,
      sql<Array<{id:string;name:string;sampleCount:number;clientRateMin:number|null;clientRateMedian:number|null;clientRateMax:number|null;workerPayMin:number|null;workerPayMax:number|null}>>`
        SELECT s.id,s.name,
          count(cs.id) FILTER (WHERE cs.status IN ('accepted','superseded') AND COALESCE(cs.result_snapshot->>'billingUnit','hour')='hour')::int "sampleCount",
          min(COALESCE(NULLIF(cs.result_snapshot->>'clientRateNet','')::numeric,NULLIF(cs.result_snapshot->>'clientRateHourly','')::numeric)) FILTER (WHERE cs.status IN ('accepted','superseded'))::float8 "clientRateMin",
          (percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(NULLIF(cs.result_snapshot->>'clientRateNet','')::numeric,NULLIF(cs.result_snapshot->>'clientRateHourly','')::numeric)) FILTER (WHERE cs.status IN ('accepted','superseded')))::float8 "clientRateMedian",
          max(COALESCE(NULLIF(cs.result_snapshot->>'clientRateNet','')::numeric,NULLIF(cs.result_snapshot->>'clientRateHourly','')::numeric)) FILTER (WHERE cs.status IN ('accepted','superseded'))::float8 "clientRateMax",
          min(COALESCE(NULLIF(cs.inputs_snapshot->>'workerPayAmount','')::numeric,NULLIF(cs.inputs_snapshot->>'workerNetHourly','')::numeric)) FILTER (WHERE cs.status IN ('accepted','superseded'))::float8 "workerPayMin",
          max(COALESCE(NULLIF(cs.inputs_snapshot->>'workerPayAmount','')::numeric,NULLIF(cs.inputs_snapshot->>'workerNetHourly','')::numeric)) FILTER (WHERE cs.status IN ('accepted','superseded'))::float8 "workerPayMax"
        FROM specialties s LEFT JOIN request_roles rr ON rr.specialty_id=s.id LEFT JOIN calculation_scenarios cs ON cs.request_role_id=rr.id
        WHERE s.active GROUP BY s.id,s.name ORDER BY s.name`,
      sql<Array<{id:string;name:string;role:string}>>`SELECT m.user_id id,u.display_name name,r.name role FROM organization_memberships m JOIN app_users u ON u.id=m.user_id JOIN role_templates r ON r.id=m.role_template_id WHERE m.status='active' ORDER BY u.display_name`,
      sql<Array<{source:string}>>`SELECT DISTINCT source FROM requests WHERE source IS NOT NULL AND btrim(source)<>'' ORDER BY source`,
      sql<Array<{code:string;name:string}>>`SELECT code,name FROM request_loss_reasons WHERE active ORDER BY sort_order,name`,
    ]);
    return {clients,regions,specialties:specialties.map((item)=>({id:item.id,name:item.name,stats:{sampleCount:item.sampleCount??0,clientRateMin:item.clientRateMin,clientRateMedian:item.clientRateMedian,clientRateMax:item.clientRateMax,workerPayMin:item.workerPayMin,workerPayMax:item.workerPayMax}})),members:canAssignRequests(actor)?allMembers:allMembers.filter((item)=>item.id===actor.userId),currentUserId:actor.userId,canAssign:canAssignRequests(actor),canConfigurePipeline:canConfigurePipeline(actor),sources:sources.map((item)=>item.source),lossReasons};
  });
}

export async function listRequestStages(actor:Actor):Promise<RequestStageDefinition[]>{if(actor.demo)return defaultRequestStages;return withTenant(actor.organizationId,actor.userId,async(sql)=>{const rows=await sql<Array<{code:string;label:string;sortOrder:number;color:string;active:boolean;terminalKind:"active"|"agreed"|"not_agreed"}>>`SELECT code,label,sort_order "sortOrder",color,active,terminal_kind "terminalKind" FROM request_stage_definitions ORDER BY sort_order,created_at`;return rows.length?rows:defaultRequestStages;});}

export async function listRequestBoard(actor:Actor):Promise<RequestBoardRow[]>{
  requireCapability(actor,"sales.request.read");
  if(actor.demo)return demo.requests.map((item,index)=>{
    const createdAt=index===0?"2026-09-02T09:15:00.000Z":"2026-09-08T10:40:00.000Z";
    const workflowStageCode=["negotiation","proposal_client"][index%2];
    return {id:item.id,organizationId:item.organizationId,title:item.title,client:item.client??"Без клиента",clientId:item.clientId??null,status:item.status,workflowStageCode,location:item.location,regionId:item.regionId??null,region:index===0?"Москва":"Калужская область",ownerUserId:item.ownerUserId??actor.userId,owner:actor.displayName,createdByUserId:item.createdByUserId,start:item.start??null,source:index===0?"manual":"public_form",archivedAt:null,closedAt:null,lossReason:null,lossReasonCode:null,headcount:item.roles.reduce((sum,role)=>sum+role.count,0),roles:item.roles,proposalVersion:index===0?3:1,proposalSentCount:index===0?2:1,lastProposalAt:index===0?"2026-09-12T13:00:00.000Z":"2026-09-15T11:30:00.000Z",createdAt,updatedAt:index===0?"2026-09-18T14:20:00.000Z":"2026-09-17T16:10:00.000Z"} as RequestBoardRow;
  });
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{const rows=await sql<RequestBoardRow[]>`
    SELECT r.id,r.organization_id "organizationId",r.title,COALESCE(c.name,'Без клиента') client,r.client_company_id "clientId",r.status,COALESCE(r.workflow_stage_code,'new') "workflowStageCode",COALESCE(r.location_text,'') location,r.region_id "regionId",rg.name region,r.owner_user_id "ownerUserId",owner.display_name owner,r.created_by_user_id "createdByUserId",r.expected_start_date::text start,r.source,r.archived_at::text "archivedAt",r.closed_at::text "closedAt",r.loss_reason "lossReason",r.loss_reason_code "lossReasonCode",r.created_at::text "createdAt",r.updated_at::text "updatedAt",
    COALESCE((SELECT sum(rr.count_required)::int FROM request_roles rr WHERE rr.request_id=r.id),0) headcount,
    COALESCE((SELECT jsonb_agg(jsonb_build_object('name',s.name,'count',rr.count_required) ORDER BY rr.created_at) FROM request_roles rr JOIN specialties s ON s.id=rr.specialty_id WHERE rr.request_id=r.id),'[]'::jsonb) roles,
    COALESCE((SELECT max(p.version) FROM proposals p WHERE p.request_id=r.id),0)::int "proposalVersion",COALESCE((SELECT count(*) FROM proposals p WHERE p.request_id=r.id AND p.sent_at IS NOT NULL),0)::int "proposalSentCount",(SELECT max(COALESCE(p.sent_at,p.created_at))::text FROM proposals p WHERE p.request_id=r.id) "lastProposalAt"
    FROM requests r LEFT JOIN client_companies c ON c.id=r.client_company_id LEFT JOIN regions rg ON rg.id=r.region_id LEFT JOIN app_users owner ON owner.id=r.owner_user_id ORDER BY r.archived_at NULLS FIRST,r.updated_at DESC`;
    return rows.filter((row)=>canReadRow(actor.access,"sales.request.read",row,actor));});
}

export async function getRequestWorkflowMeta(actor:Actor,requestId:string):Promise<RequestWorkflowMeta>{
  if(actor.demo)return {owner:actor.displayName,observers:[],timeline:[{id:"demo-created",at:new Date().toISOString(),actor:actor.displayName,title:"Заявка создана",detail:"Создан черновик заявки",kind:"request"}]};
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    const [request]=await sql<Array<{owner:string|null}>>`SELECT u.display_name owner FROM requests r LEFT JOIN app_users u ON u.id=r.owner_user_id WHERE r.id=${requestId}::uuid`;
    const observers=await sql<Array<{id:string;name:string;role:string}>>`SELECT ro.user_id id,u.display_name name,rt.name role FROM request_observers ro JOIN organization_memberships m ON m.organization_id=ro.organization_id AND m.user_id=ro.user_id AND m.status='active' JOIN app_users u ON u.id=ro.user_id JOIN role_templates rt ON rt.id=m.role_template_id WHERE ro.request_id=${requestId}::uuid ORDER BY u.display_name`;
    const audit=await sql<Array<{id:string;at:string;actor:string;resourceType:string;action:string;beforeJson:Record<string,unknown>|null;afterJson:Record<string,unknown>|null}>>`SELECT ae.id,ae.created_at::text at,COALESCE(u.display_name,'Система') actor,ae.resource_type "resourceType",ae.action,ae.before_json "beforeJson",ae.after_json "afterJson" FROM audit_events ae LEFT JOIN app_users u ON u.id=ae.actor_user_id WHERE (ae.resource_type='requests' AND ae.resource_id=${requestId}::uuid) OR (ae.resource_type='request_roles' AND COALESCE(ae.after_json->>'request_id',ae.before_json->>'request_id')=${requestId}) OR (ae.resource_type='request_observers' AND COALESCE(ae.after_json->>'request_id',ae.before_json->>'request_id')=${requestId}) ORDER BY ae.created_at`;
    const calculations=await sql<Array<{id:string;at:string;actor:string}>>`SELECT c.id,c.created_at::text at,COALESCE(u.display_name,'Система') actor FROM calculations c LEFT JOIN app_users u ON u.id=c.created_by_user_id WHERE c.request_id=${requestId}::uuid ORDER BY c.created_at`;
    const proposals=await sql<Array<{id:string;version:number;status:string;createdAt:string;sentAt:string|null;acceptedAt:string|null;rejectedAt:string|null;actor:string}>>`SELECT p.id,p.version,p.status,p.created_at::text "createdAt",p.sent_at::text "sentAt",p.accepted_at::text "acceptedAt",p.rejected_at::text "rejectedAt",COALESCE(u.display_name,'Система') actor FROM proposals p LEFT JOIN app_users u ON u.id=p.created_by_user_id WHERE p.request_id=${requestId}::uuid ORDER BY p.version`;
    const external=await sql<Array<{id:string;submittedAt:string;status:string}>>`SELECT id,submitted_at::text "submittedAt",status FROM request_public_submissions WHERE request_id=${requestId}::uuid ORDER BY submitted_at`;
    const timeline:RequestTimelineItem[]=[];
    for(const item of audit){const before=item.beforeJson??{};const after=item.afterJson??{};let title=item.resourceType==="request_roles"?"Изменены позиции":item.resourceType==="request_observers"?"Изменены наблюдатели":item.action==="insert"?"Заявка создана":"Заявка обновлена";let detail=item.resourceType==="request_roles"?"Состав, численность или требования позиции были изменены":"Изменены данные заявки";if(before.workflow_stage_code!==after.workflow_stage_code&&after.workflow_stage_code){title="Изменён этап";detail=`${String(before.workflow_stage_code??"new")} → ${String(after.workflow_stage_code)}`;}else if(before.owner_user_id!==after.owner_user_id&&after.owner_user_id){title="Изменён ответственный";detail="Заявка передана другому ответственному";}timeline.push({id:item.id,at:item.at,actor:item.actor,title,detail,changes:requestAuditChanges(before,after),kind:item.resourceType==="request_roles"?"position":"request"});}
    for(const item of calculations)timeline.push({id:`calc-${item.id}`,at:item.at,actor:item.actor,title:"Создан расчёт",detail:"Начат новый коммерческий расчёт",kind:"calculation"});
    for(const item of proposals){timeline.push({id:`proposal-${item.id}`,at:item.createdAt,actor:item.actor,title:`Создано КП v${item.version}`,detail:`Статус: ${item.status}`,kind:"proposal"});if(item.sentAt)timeline.push({id:`proposal-sent-${item.id}`,at:item.sentAt,actor:item.actor,title:`КП v${item.version} отправлено`,detail:"Коммерческое предложение отправлено заказчику",kind:"proposal"});if(item.acceptedAt)timeline.push({id:`proposal-accepted-${item.id}`,at:item.acceptedAt,actor:item.actor,title:`КП v${item.version} согласовано`,detail:"Заказчик принял коммерческое предложение",kind:"proposal"});if(item.rejectedAt)timeline.push({id:`proposal-rejected-${item.id}`,at:item.rejectedAt,actor:item.actor,title:`КП v${item.version} не принято`,detail:"Заказчик отклонил версию коммерческого предложения",kind:"proposal"});}
    for(const item of external)timeline.push({id:`external-${item.id}`,at:item.submittedAt,actor:"Получатель внешней формы",title:"Получено уточнение заявки",detail:`Версия: ${item.status}`,kind:"external"});timeline.sort((a,b)=>new Date(a.at).getTime()-new Date(b.at).getTime());return {owner:request?.owner??null,observers,timeline};
  });
}

type IntakeLinkRecord = { token: string; expiresAt: string | null; submissionCount: number; ownerUserId: string; ownerName: string };
function intakeLinkResult(actor: Actor, row: IntakeLinkRecord) {
  return { path: `/request-intake/${row.token}`, expiresAt: row.expiresAt, submissionCount: row.submissionCount, ownerName: row.ownerName, canManage: row.ownerUserId === actor.userId || canConfigurePipeline(actor) };
}
export async function getActiveBlankIntakeLink(actor: Actor) {
  requireCapability(actor, "sales.request.create");
  if (actor.demo) return null;
  return withTenant(actor.organizationId, actor.userId, async sql => {
    const [row] = await sql<IntakeLinkRecord[]>`SELECT l.token,l.expires_at::text "expiresAt",l.submission_count "submissionCount",l.created_by_user_id "ownerUserId",u.display_name "ownerName" FROM request_intake_links l JOIN app_users u ON u.id=l.created_by_user_id WHERE l.active AND (l.expires_at IS NULL OR l.expires_at>now()) AND EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id=l.organization_id AND m.user_id=l.created_by_user_id AND m.status='active') ORDER BY l.created_at DESC LIMIT 1`;
    return row ? intakeLinkResult(actor, row) : null;
  });
}
export async function createBlankIntakeLink(actor: Actor, expiresInDays: number | null) {
  requireCapability(actor, "sales.request.create");
  if (actor.demo) throw new Error("В демо внешние ссылки не создаются. Создайте тестовую заявку через форму менеджера.");
  return withTenant(actor.organizationId, actor.userId, async sql => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`intake-link:${actor.organizationId}`},0))`;
    await sql`UPDATE request_intake_links l SET active=false WHERE active AND ((expires_at IS NOT NULL AND expires_at<=now()) OR NOT EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id=l.organization_id AND m.user_id=l.created_by_user_id AND m.status='active'))`;
    const [current] = await sql<IntakeLinkRecord[]>`SELECT l.token,l.expires_at::text "expiresAt",l.submission_count "submissionCount",l.created_by_user_id "ownerUserId",u.display_name "ownerName" FROM request_intake_links l JOIN app_users u ON u.id=l.created_by_user_id WHERE l.active LIMIT 1`;
    if (current) return intakeLinkResult(actor, current);
    const token = randomBytes(24).toString("base64url");
    const [row] = await sql<Array<{id:string;token:string;expiresAt:string|null;submissionCount:number}>>`INSERT INTO request_intake_links(organization_id,token,created_by_user_id,expires_at) VALUES(${actor.organizationId}::uuid,${token},${actor.userId}::uuid,CASE WHEN ${expiresInDays}::int IS NULL THEN NULL ELSE now()+(${expiresInDays}::int*interval '1 day') END) RETURNING id,token,expires_at::text "expiresAt",submission_count "submissionCount"`;
    await registerPublicRequestToken(sql, token, actor.organizationId, actor.userId, "request_intake_link", row.id);
    return intakeLinkResult(actor, { ...row, ownerUserId: actor.userId, ownerName: actor.displayName });
  });
}
export async function revokeBlankIntakeLink(actor: Actor) {
  requireCapability(actor, "sales.request.create");
  if (actor.demo) throw new Error("В демо внешние ссылки не изменяются");
  return withTenant(actor.organizationId, actor.userId, async sql => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`intake-link:${actor.organizationId}`},0))`;
    const [link] = await sql<Array<{id:string;ownerUserId:string}>>`SELECT id,created_by_user_id "ownerUserId" FROM request_intake_links WHERE active FOR UPDATE`;
    if (!link) return;
    if (link.ownerUserId !== actor.userId && !canConfigurePipeline(actor)) throw new PublicIntakeInputError("Отключить ссылку может её создатель или администратор воронки", 403);
    await sql`UPDATE request_intake_links SET active=false WHERE id=${link.id}::uuid`;
  });
}

export async function getBlankRequestContext(token: string): Promise<BlankRequestContext | null> {
  const resolved = await resolvePublicRequestToken(token, "request_intake_link");
  if (!resolved) return null;
  return withTenant(resolved.tenantId, resolved.actorUserId, async sql => {
    const [link] = await sql<Array<{id:string;expiresAt:string|null}>>`SELECT id,expires_at::text "expiresAt" FROM request_intake_links WHERE id=${resolved.linkId}::uuid AND token=${token} AND active AND (expires_at IS NULL OR expires_at>now()) LIMIT 1`;
    if (!link) return null;
    const [owner] = await sql<Array<{id:string}>>`SELECT id FROM organization_memberships WHERE organization_id=${resolved.tenantId}::uuid AND user_id=${resolved.actorUserId}::uuid AND status='active' LIMIT 1`;
    if (!owner) return null;
    await sql`UPDATE request_intake_links SET last_opened_at=now() WHERE id=${link.id}::uuid`;
    const [organization, specialties, regions] = await Promise.all([
      sql<Array<{name:string}>>`SELECT name FROM organizations WHERE id=${resolved.tenantId}::uuid`,
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE active ORDER BY name`,
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM regions ORDER BY name`,
    ]);
    return { organizationName: organization[0]?.name ?? "Компания", token, specialties, regions, expiresAt: link.expiresAt };
  });
}

export async function submitBlankRequest(token:string,payload:Omit<RequestV2Payload,"clientId"|"ownerUserId"|"observerUserIds">&{companyName:string}){const resolved=await resolvePublicRequestToken(token,"request_intake_link");if(!resolved)throw new PublicIntakeInputError("Ссылка недействительна или срок её действия истёк");return withTenant(resolved.tenantId,resolved.actorUserId,async(tx)=>{
    const [validLink] = await tx<Array<{id:string}>>`SELECT id FROM request_intake_links l WHERE l.id=${resolved.linkId}::uuid AND l.token=${token} AND l.active AND (l.expires_at IS NULL OR l.expires_at>now()) AND EXISTS (SELECT 1 FROM organization_memberships m WHERE m.organization_id=l.organization_id AND m.user_id=l.created_by_user_id AND m.status='active') FOR UPDATE`;
    if (!validLink) throw new PublicIntakeInputError("Ссылка недействительна или срок её действия истёк");
    if (payload.regionId) {
      const [region] = await tx<Array<{id:string}>>`SELECT id FROM regions WHERE id=${payload.regionId}::uuid`;
      if (!region) throw new PublicIntakeInputError("Выберите регион из списка формы");
    }
    for (const role of payload.roles) if (role.specialtyId) {
      const [specialty] = await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE id=${role.specialtyId}::uuid AND active`;
      if (!specialty) throw new PublicIntakeInputError("Выберите действующую специальность из списка формы");
    }
    let clientId:string|null=null;if(payload.companyName.trim()){const [existing]=await tx<Array<{id:string}>>`SELECT id FROM client_companies WHERE lower(name)=lower(${payload.companyName.trim()}) LIMIT 1`;if(existing)clientId=existing.id;}const [request]=await tx<Array<{id:string}>>`INSERT INTO requests(organization_id,client_company_id,title,status,workflow_stage_code,source,location_text,region_id,expected_start_date,duration_text,schedule_json,intake_json,lunch_paid,vat_mode,housing_rule,travel_rule,shuttle_rule,ppe_rule,medical_rule,citizenship_rule,tools_rule,comments,owner_user_id,created_by_user_id) VALUES(${resolved.tenantId}::uuid,${clientId}::uuid,${payload.title},'draft','new','public_form',${payload.location},${payload.regionId}::uuid,${payload.startDate}::date,${payload.durationText},${tx.json(toJsonValue(payload.schedule))},${tx.json(toJsonValue(payload.intake))},${payload.lunchPaid},${payload.vatMode},${rule(payload.intake,"housing")},${rule(payload.intake,"travel")},${rule(payload.intake,"shuttle")},${`${rule(payload.intake,"workwear")} / ${rule(payload.intake,"ppe")}`},${`${rule(payload.intake,"medical")} / ${rule(payload.intake,"medbook")}`},${payload.intake.compliance.workerCategories.join(", ")},${rule(payload.intake,"tools")},${payload.comments},${resolved.actorUserId}::uuid,${resolved.actorUserId}::uuid) RETURNING id`;
    for(const role of payload.roles){let specialtyId=role.specialtyId??null;if(!specialtyId){const name=role.specialtyName.trim();const [existing]=await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE active AND lower(name)=lower(${name}) LIMIT 1`;if(existing)specialtyId=existing.id;else{const [created]=await tx<Array<{id:string}>>`INSERT INTO specialties(organization_id,code,name) VALUES(${resolved.tenantId}::uuid,${`custom-${randomUUID().slice(0,8)}`},${name}) RETURNING id`;specialtyId=created.id;}}await tx`INSERT INTO request_roles(organization_id,request_id,specialty_id,count_required,schedule_json,requirements_json,target_client_rate) VALUES(${resolved.tenantId}::uuid,${request.id}::uuid,${specialtyId}::uuid,${role.count},${tx.json(toJsonValue(role.schedule))},${tx.json(toJsonValue(role.requirements))},${role.targetClientRate})`;}
    await tx`UPDATE request_intake_links SET submission_count=submission_count+1 WHERE id=${resolved.linkId}::uuid`;return {id:request.id,reference:request.id};});}

// Capture one server timestamp per snapshot, shared by SSR and client hydration.
export function getRequestSnapshotTime() { return Date.now(); }
