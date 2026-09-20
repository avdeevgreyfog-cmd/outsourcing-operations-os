import type { WorkflowDetails } from "./workflow";
import { demoApplicationDetails } from "./demo-timeline";
import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow, hasCapability } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";
import { needSourceLabels, normalizeRecruitingStage, recruitingStageLabels, type RecruitingStage } from "./model";

export type NeedRecruiterAssignment = { userId: string; name: string; targetCount: number };

export type RecruitingPipelineStage = {
  stageCode: string;
  label: string;
  stageKind: "new_contact"|"interview"|"documents"|"approval"|"preparation"|"first_shift"|"retention"|"custom";
  sortOrder: number;
  active: boolean;
  virtual: boolean;
  isSystem: boolean;
};

export type CandidateDocumentChecklistItem = {
  id: string;
  applicationId: string;
  documentName: string;
  status: "missing"|"requested"|"received"|"verified"|"not_required";
  required: boolean;
  note: string | null;
  sortOrder: number;
  updatedAt: string;
};

export type NeedHeadcountChange = {
  id: string;
  previousCount: number;
  newCount: number;
  delta: number;
  responsibleUserId: string | null;
  responsible: string | null;
  reason: string | null;
  createdBy: string;
  createdAt: string;
};

export type RecruitingNeedRow = {
  id: string;
  organizationId: string;
  objectId: string | null;
  object: string | null;
  clientId: string | null;
  client: string | null;
  regionId: string | null;
  region: string | null;
  specialtyId: string;
  specialty: string;
  title: string;
  sourceKind: string;
  sourceLabel: string;
  priority: string;
  required: number;
  filled: number;
  working: number;
  deficit: number;
  toRecruit: number;
  deadline: string | null;
  status: string;
  ownerUserId: string | null;
  owner: string | null;
  managerUserId: string | null;
  manager: string | null;
  assigneeUserIds: string[];
  recruiters: NeedRecruiterAssignment[];
  conditions: Record<string, unknown>;
  candidates: number;
  approved: number;
  ready: number;
  started: number;
  conditionVersion: number;
  stageCounts: Partial<Record<RecruitingStage, number>>;
  funnelReached: Partial<Record<RecruitingStage, number>>;
  lastHeadcountChange?: NeedHeadcountChange | null;
};

export type RecruitingApplicationRow = {
  applicationId: string;
  candidateId: string;
  organizationId: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  preferredChannel: string | null;
  telegram: string | null;
  whatsapp: string | null;
  city: string | null;
  source: string | null;
  sourceChannel: string | null;
  sourceCampaign: string | null;
  sourceReference: string | null;
  stage: RecruitingStage;
  stageLabel: string;
  needId: string;
  need: string;
  objectId: string | null;
  object: string | null;
  regionId: string | null;
  clientId: string | null;
  ownerUserId: string | null;
  owner: string | null;
  managerUserId: string | null;
  manager: string | null;
  responsibleUserId: string | null;
  responsible: string | null;
  assigneeUserIds: string[];
  createdAt?: string;
  updatedAt?: string;
  stageEnteredAt?: string | null;
  nextActionAt?: string | null;
  workflow?: WorkflowDetails;
  stageEvents?: Array<{toStage:string;fromStage?:string|null;createdAt:string;reason?:string|null;reasonCode?:string|null}>;
  nextAction: string | null;
  plannedStartDate: string | null;
  actualStartAt: string | null;
  rejectionReason: string | null;
  rejectionReasonCode: string | null;
  conditions: Record<string, unknown>;
  documentsReceived: number;
  documentsRequired: number;
};

export type CandidateCommunication = {
  id: string;
  applicationId: string | null;
  channel: string;
  direction: string;
  summary: string;
  happenedAt: string;
  author: string;
};

export type CandidateStageEvent = {
  id: string;
  applicationId: string;
  fromStage: string | null;
  toStage: string;
  reason: string | null;
  reasonCode: string | null;
  changedAt: string;
  changedBy: string;
};

export type CandidateProfile = {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  preferredChannel: string | null;
  telegram: string | null;
  whatsapp: string | null;
  city: string | null;
  birthDate: string | null;
  source: string | null;
  sourceChannel: string | null;
  sourceCampaign: string | null;
  sourceReference: string | null;
  notes: string | null;
  status: string;
  applications: RecruitingApplicationRow[];
  communications: CandidateCommunication[];
  history: CandidateStageEvent[];
  documents: CandidateDocumentChecklistItem[];
};

export type RecruitingOptions = {
  specialties: Array<{id:string;name:string}>;
  regions: Array<{id:string;name:string}>;
  objects: Array<{id:string;name:string;regionId:string;region:string}>;
  recruiters: Array<{id:string;name:string}>;
  responsibles: Array<{id:string;name:string}>;
  sources: string[];
  sourceCatalog: Array<{id:string;name:string;kind:string}>;
  exitReasons: Array<{code:string;name:string;kind:"rejected"|"no_show"|"both"}>;
};


const recruitingStageOrder: RecruitingStage[]=["new","contact","interview","manager_review","approved","preparation","ready","started"];
function buildDemoReached(stages: RecruitingStage[]): Partial<Record<RecruitingStage,number>> {
  return recruitingStageOrder.reduce<Partial<Record<RecruitingStage,number>>>((acc,stage,index)=>{
    acc[stage]=stages.filter(value=>{const normalizedIndex=recruitingStageOrder.indexOf(value);return normalizedIndex>=index}).length;
    return acc;
  },{});
}

function demoNeedRows(actor: Actor): RecruitingNeedRow[] {
  return demo.needs.filter((row) => canReadRow(actor.access, "operations.need.read", row, actor)).map((row) => {
    const related = demo.candidates.filter((candidate) => candidate.objectId === row.objectId && candidate.need === row.specialty);
    const ready = related.filter((candidate) => normalizeRecruitingStage(candidate.stage) === "ready").length;
    const started = related.filter((candidate) => normalizeRecruitingStage(candidate.stage) === "started").length;
    const working = row.filled;
    const recruiterId = row.ownerUserId ?? "10000000-0000-4000-8000-000000000005";
    const recruiterName = "Ольга Новикова";
    return {
      id: row.id, organizationId: row.organizationId, objectId: row.objectId, object: row.object,
      clientId: row.clientId, client: demo.clients.find((client) => client.id === row.clientId)?.name ?? null,
      regionId: row.regionId, region: demo.objects.find((object) => object.id === row.objectId)?.region ?? null,
      specialtyId: row.specialty === "Грузчик" ? "60000000-0000-4000-8000-000000000002" : row.specialty === "Сборщик мебели" ? "60000000-0000-4000-8000-000000000003" : "60000000-0000-4000-8000-000000000001",
      specialty: row.specialty, title: row.specialty, sourceKind: "object", sourceLabel: needSourceLabels.object,
      priority: row.deficit >= 7 ? "high" : "normal", required: row.required, filled: working, working,
      deficit: Math.max(row.required-working,0), toRecruit: Math.max(row.required-working-ready,0),
      deadline: row.deadline ?? null, status: row.status, ownerUserId: recruiterId, owner: recruiterName,
      managerUserId: null, manager: null, assigneeUserIds: row.assigneeUserIds ?? [recruiterId],
      recruiters: [{userId:recruiterId,name:recruiterName,targetCount:Math.max(row.deficit,1)}],
      conditions: row.conditions ?? { schedule: "6/1 · 11 оплачиваемых часов", housing: "Проживание по условиям объекта", location: demo.objects.find((object) => object.id === row.objectId)?.name ?? null },
      candidates: related.length,
      approved: related.filter((candidate) => ["approved","preparation","ready","started"].includes(normalizeRecruitingStage(candidate.stage))).length,
      ready, started, conditionVersion: 1,
      stageCounts: related.reduce<Partial<Record<RecruitingStage,number>>>((acc,candidate)=>{const stage=normalizeRecruitingStage(candidate.stage);acc[stage]=(acc[stage]??0)+1;return acc;},{}),
      funnelReached: buildDemoReached(related.map(candidate=>normalizeRecruitingStage(candidate.stage))),
    };
  });
}

export async function listRecruitingNeeds(actor: Actor): Promise<RecruitingNeedRow[]> {
  requireCapability(actor, "operations.need.read");
  if (actor.demo) return demoNeedRows(actor);
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<Array<RecruitingNeedRow & Record<string, unknown>>>`
      SELECT n.id,n.organization_id "organizationId",n.object_id "objectId",o.name object,o.client_company_id "clientId",cl.name client,
        COALESCE(n.region_id,o.region_id) "regionId",rg.name region,n.specialty_id "specialtyId",s.name specialty,COALESCE(n.title,s.name) title,
        n.source_kind "sourceKind",n.priority,n.count_required required,
        COALESCE(workforce.working,0)::int filled,COALESCE(workforce.working,0)::int working,
        GREATEST(n.count_required-COALESCE(workforce.working,0),0)::int deficit,
        GREATEST(n.count_required-COALESCE(workforce.working,0)-COALESCE(funnel.ready,0),0)::int "toRecruit",
        to_char(n.deadline,'DD.MM.YYYY') deadline,n.status,n.owner_user_id "ownerUserId",owner.display_name owner,
        n.manager_user_id "managerUserId",manager.display_name manager,n.conditions_snapshot conditions,
        COALESCE(assignments."assigneeUserIds",ARRAY[]::text[]) "assigneeUserIds",
        COALESCE(assignments.recruiters,'[]'::jsonb) recruiters,
        COALESCE(funnel.candidates,0)::int candidates,COALESCE(funnel.approved,0)::int approved,
        COALESCE(funnel.ready,0)::int ready,COALESCE(funnel.started,0)::int started,
        COALESCE(funnel."stageCounts",'{}'::jsonb) "stageCounts",
        COALESCE(funnel."reachedCounts",'{}'::jsonb) "funnelReached",
        COALESCE(versions.version,1)::int "conditionVersion",
        headcount."lastHeadcountChange"
      FROM needs n
      JOIN specialties s ON s.id=n.specialty_id
      LEFT JOIN objects o ON o.id=n.object_id
      LEFT JOIN client_companies cl ON cl.id=o.client_company_id
      LEFT JOIN regions rg ON rg.id=COALESCE(n.region_id,o.region_id)
      LEFT JOIN app_users owner ON owner.id=n.owner_user_id
      LEFT JOIN app_users manager ON manager.id=n.manager_user_id
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT woa.worker_id)::int working
        FROM worker_object_assignments woa
        JOIN worker_profiles wp ON wp.id=woa.worker_id AND wp.status='active'
        WHERE woa.object_id=n.object_id AND woa.specialty_id=n.specialty_id
          AND woa.effective_from<=current_date AND (woa.effective_to IS NULL OR woa.effective_to>=current_date)
      ) workforce ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int candidates,
          count(*) FILTER (WHERE f.stage IN ('approved','preparation','ready','started','documents','first_shift'))::int approved,
          count(*) FILTER (WHERE f.stage IN ('ready','documents'))::int ready,
          count(*) FILTER (WHERE f.stage IN ('started','first_shift'))::int started,
          jsonb_build_object(
            'new',count(*) FILTER (WHERE f.stage='new'),
            'contact',count(*) FILTER (WHERE f.stage IN ('contact','call')),
            'interview',count(*) FILTER (WHERE f.stage='interview'),
            'manager_review',count(*) FILTER (WHERE f.stage='manager_review'),
            'approved',count(*) FILTER (WHERE f.stage='approved'),
            'preparation',count(*) FILTER (WHERE f.stage IN ('preparation','documents')),
            'ready',count(*) FILTER (WHERE f.stage='ready'),
            'started',count(*) FILTER (WHERE f.stage IN ('started','first_shift')),
            'rejected',count(*) FILTER (WHERE f.stage='rejected'),
            'no_show',count(*) FILTER (WHERE f.stage='no_show')
          ) "stageCounts",
          jsonb_build_object(
            'new',count(*),
            'contact',count(*) FILTER (WHERE f.max_rank>=2),
            'interview',count(*) FILTER (WHERE f.max_rank>=3),
            'manager_review',count(*) FILTER (WHERE f.max_rank>=4),
            'approved',count(*) FILTER (WHERE f.max_rank>=5),
            'preparation',count(*) FILTER (WHERE f.max_rank>=6),
            'ready',count(*) FILTER (WHERE f.max_rank>=7),
            'started',count(*) FILTER (WHERE f.max_rank>=8)
          ) "reachedCounts"
        FROM (
          SELECT ca.stage,
            GREATEST(
              CASE ca.stage
                WHEN 'new' THEN 1 WHEN 'contact' THEN 2 WHEN 'call' THEN 2 WHEN 'interview' THEN 3
                WHEN 'manager_review' THEN 4 WHEN 'approved' THEN 5 WHEN 'preparation' THEN 6 WHEN 'documents' THEN 6
                WHEN 'ready' THEN 7 WHEN 'started' THEN 8 WHEN 'first_shift' THEN 8 ELSE 1 END,
              COALESCE((
                SELECT max(CASE h.to_stage
                  WHEN 'new' THEN 1 WHEN 'contact' THEN 2 WHEN 'call' THEN 2 WHEN 'interview' THEN 3
                  WHEN 'manager_review' THEN 4 WHEN 'approved' THEN 5 WHEN 'preparation' THEN 6 WHEN 'documents' THEN 6
                  WHEN 'ready' THEN 7 WHEN 'started' THEN 8 WHEN 'first_shift' THEN 8 ELSE 1 END)
                FROM candidate_stage_history h WHERE h.application_id=ca.id
              ),1)
            ) max_rank
          FROM candidate_applications ca WHERE ca.need_id=n.id
        ) f
      ) funnel ON true
      LEFT JOIN LATERAL (
        SELECT ARRAY_REMOVE(ARRAY_AGG(na.recruiter_user_id::text),NULL) "assigneeUserIds",
          jsonb_agg(jsonb_build_object('userId',na.recruiter_user_id,'name',u.display_name,'targetCount',na.target_count) ORDER BY na.assigned_at)
            FILTER (WHERE na.recruiter_user_id IS NOT NULL) recruiters
        FROM need_assignments na
        LEFT JOIN app_users u ON u.id=na.recruiter_user_id
        WHERE na.need_id=n.id AND na.unassigned_at IS NULL
      ) assignments ON true
      LEFT JOIN LATERAL (
        SELECT max(nv.version)::int version FROM need_versions nv WHERE nv.need_id=n.id
      ) versions ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_build_object(
          'id',hc.id,
          'previousCount',hc.previous_count,
          'newCount',hc.new_count,
          'delta',hc.delta,
          'responsibleUserId',hc.responsible_user_id,
          'responsible',ru.display_name,
          'reason',hc.reason,
          'createdBy',cu.display_name,
          'createdAt',to_char(hc.created_at,'DD.MM.YYYY HH24:MI')
        ) "lastHeadcountChange"
        FROM need_headcount_changes hc
        LEFT JOIN app_users ru ON ru.id=hc.responsible_user_id
        JOIN app_users cu ON cu.id=hc.created_by_user_id
        WHERE hc.need_id=n.id
        ORDER BY hc.created_at DESC
        LIMIT 1
      ) headcount ON true
      ORDER BY n.status IN ('open','in_progress','paused') DESC,n.deadline NULLS LAST,n.created_at DESC
    `;
    return rows.filter((row) => canReadRow(actor.access, "operations.need.read", row, actor))
      .map((row) => ({...row, sourceLabel: needSourceLabels[row.sourceKind] ?? "Другое"}));
  });
}

function demoApplications(actor: Actor): RecruitingApplicationRow[] {
  return demo.candidates.filter((row) => canReadRow(actor.access, "recruiting.candidate.read", row, actor)).map((row) => {
    const stage = normalizeRecruitingStage(row.stage);
    const need = demo.needs.find((item) => item.objectId === row.objectId && item.specialty === row.need);
    return {
      applicationId: `demo-application-${row.id}`, candidateId: row.id, organizationId: row.organizationId,
      fullName: row.fullName, phone: row.phone ?? null, email: null, preferredChannel: "phone", telegram: null, whatsapp: null, city: null,
      source: row.source ?? null, sourceChannel: row.source ?? null, sourceCampaign: null, sourceReference: null,
      stage, stageLabel: recruitingStageLabels[stage], needId: need?.id ?? "", need: row.need ?? "—", objectId: row.objectId ?? null,
      object: row.object ?? null, regionId: row.regionId ?? null, clientId: row.clientId ?? null, ownerUserId: row.ownerUserId ?? null,
      owner: "Ольга Новикова", managerUserId: null, manager: null, responsibleUserId: row.ownerUserId ?? null, responsible: "Ольга Новикова", assigneeUserIds: row.assigneeUserIds ?? [],
      nextAction: row.nextAction ?? null, plannedStartDate: null, actualStartAt: stage === "started" ? "2026-09-12" : null,
      rejectionReason: (row as {rejectionReason?:string}).rejectionReason??null, rejectionReasonCode:(row as {rejectionReasonCode?:string}).rejectionReasonCode??null, conditions: need?.conditions ?? {},
      documentsReceived: stage==="preparation"?2:0, documentsRequired: stage==="preparation"?4:0,
      ...demoApplicationDetails(row,demo.candidates.findIndex(x=>x.id===row.id)),
    };
  });
}

export async function listRecruitingApplications(actor: Actor): Promise<RecruitingApplicationRow[]> {
  requireCapability(actor, "recruiting.candidate.read");
  if (actor.demo) return demoApplications(actor);
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<Array<Omit<RecruitingApplicationRow,"stage"|"stageLabel"> & {rawStage:string} & Record<string, unknown>>>`
      SELECT ca.id "applicationId",c.id "candidateId",c.organization_id "organizationId",c.full_name "fullName",c.phone,c.email,
        c.preferred_channel "preferredChannel",c.telegram,c.whatsapp,c.city,CASE WHEN ca.source_snapshot IS NULL THEN c.source ELSE ca.source_snapshot->>'source' END source,ca.source_snapshot->>'channel' "sourceChannel",
        ca.source_snapshot->>'campaign' "sourceCampaign",ca.source_snapshot->>'reference' "sourceReference",ca.stage "rawStage",ca.need_id "needId",
        COALESCE(n.title,s.name) need,ca.object_id "objectId",o.name object,COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
        ca.owner_user_id "ownerUserId",owner.display_name owner,ca.manager_user_id "managerUserId",manager.display_name manager,
        ca.responsible_user_id "responsibleUserId",responsible.display_name responsible,
        ARRAY[ca.owner_user_id::text,ca.manager_user_id::text,ca.responsible_user_id::text]
          || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
          || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds",
        ca.created_at::text "createdAt",ca.updated_at::text "updatedAt",ca.next_action_at::text "nextActionAt",ca.workflow_details workflow,
        (SELECT max(h.created_at)::text FROM candidate_stage_history h WHERE h.application_id=ca.id) "stageEnteredAt",
        to_char(ca.next_action_at,'DD.MM.YYYY HH24:MI') "nextAction",ca.planned_start_date::text "plannedStartDate",
        ca.actual_start_at::text "actualStartAt",ca.rejection_reason "rejectionReason",ca.rejection_reason_code "rejectionReasonCode",ca.conditions_snapshot conditions,
        (SELECT count(*)::int FROM candidate_application_documents d WHERE d.application_id=ca.id AND d.required AND d.status IN ('received','verified')) "documentsReceived",
        (SELECT count(*)::int FROM candidate_application_documents d WHERE d.application_id=ca.id AND d.required AND d.status<>'not_required') "documentsRequired"
      FROM candidate_applications ca
      JOIN candidates c ON c.id=ca.candidate_id
      JOIN needs n ON n.id=ca.need_id
      JOIN specialties s ON s.id=n.specialty_id
      LEFT JOIN objects o ON o.id=ca.object_id
      LEFT JOIN app_users owner ON owner.id=ca.owner_user_id
      LEFT JOIN app_users manager ON manager.id=ca.manager_user_id
      LEFT JOIN app_users responsible ON responsible.id=ca.responsible_user_id
      ORDER BY ca.updated_at DESC
    `;
    return rows.filter((row) => canReadRow(actor.access, "recruiting.candidate.read", row, actor)).map((row) => {
      const stage = normalizeRecruitingStage(row.rawStage);
      const {rawStage, ...rest} = row;
      return {...rest, stage, stageLabel: recruitingStageLabels[stage]} as RecruitingApplicationRow;
    });
  });
}

export async function getCandidateProfile(actor: Actor, id: string): Promise<CandidateProfile | null> {
  const applications = (await listRecruitingApplications(actor)).filter((row) => row.candidateId === id);
  if (!applications.length) return null;
  const first = applications[0];
  if (actor.demo) return {
    id, fullName:first.fullName, phone:first.phone, email:first.email, preferredChannel:first.preferredChannel, telegram:first.telegram,
    whatsapp:first.whatsapp, city:first.city, birthDate:null, source:first.source, sourceChannel:first.sourceChannel,
    sourceCampaign:first.sourceCampaign, sourceReference:first.sourceReference, notes:null, status:"active", applications,
    communications: [], history: applications.map((application, index) => ({id:`demo-history-${index}`,applicationId:application.applicationId,fromStage:null,toStage:application.stage,reason:null,reasonCode:null,changedAt:"Демо",changedBy:"Ольга Новикова"})),
    documents: [],
  };
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [candidate] = await sql<Array<Omit<CandidateProfile,"applications"|"communications"|"history"|"documents">>>`
      SELECT id,full_name "fullName",phone,email,preferred_channel "preferredChannel",telegram,whatsapp,city,birth_date::text "birthDate",
        source,source_channel "sourceChannel",source_campaign "sourceCampaign",source_reference "sourceReference",notes,status
      FROM candidates WHERE id=${id}::uuid
    `;
    if (!candidate) return null;
    const applicationIds = applications.map((application) => application.applicationId);
    const [communications, history, documents] = await Promise.all([
      sql<CandidateCommunication[]>`
        SELECT cc.id,cc.application_id "applicationId",cc.channel,cc.direction,cc.summary,
          to_char(cc.happened_at,'DD.MM.YYYY HH24:MI') "happenedAt",u.display_name author
        FROM candidate_communications cc JOIN app_users u ON u.id=cc.created_by_user_id
        WHERE cc.candidate_id=${id}::uuid ORDER BY cc.happened_at DESC LIMIT 100
      `,
      sql<CandidateStageEvent[]>`
        SELECT h.id,h.application_id "applicationId",h.from_stage "fromStage",h.to_stage "toStage",h.reason,h.reason_code "reasonCode",
          to_char(h.created_at,'DD.MM.YYYY HH24:MI') "changedAt",u.display_name "changedBy"
        FROM candidate_stage_history h JOIN app_users u ON u.id=h.changed_by_user_id
        WHERE h.application_id=ANY(${applicationIds}::uuid[]) ORDER BY h.created_at DESC LIMIT 100
      `,
      sql<CandidateDocumentChecklistItem[]>`
        SELECT d.id,d.application_id "applicationId",d.document_name "documentName",d.status,d.required,d.note,d.sort_order "sortOrder",
          to_char(d.updated_at,'DD.MM.YYYY HH24:MI') "updatedAt"
        FROM candidate_application_documents d
        WHERE d.application_id=ANY(${applicationIds}::uuid[])
        ORDER BY d.application_id,d.sort_order,d.document_name
      `,
    ]);
    return {...candidate, applications, communications, history, documents};
  });
}


export async function getRecruitingPipeline(actor: Actor): Promise<RecruitingPipelineStage[]> {
  requireCapability(actor,"recruiting.candidate.read");
  if(actor.demo) return [
    {stageCode:"new",label:"Новый контакт",stageKind:"new_contact",sortOrder:10,active:true,virtual:false,isSystem:true},
    {stageCode:"contact",label:"Интервью",stageKind:"interview",sortOrder:20,active:true,virtual:false,isSystem:true},
    {stageCode:"interview",label:"Документы",stageKind:"documents",sortOrder:30,active:true,virtual:false,isSystem:true},
    {stageCode:"manager_review",label:"Согласование",stageKind:"approval",sortOrder:35,active:false,virtual:false,isSystem:true},
    {stageCode:"approved",label:"Согласован",stageKind:"approval",sortOrder:36,active:false,virtual:false,isSystem:true},
    {stageCode:"preparation",label:"Подготовка к выходу",stageKind:"preparation",sortOrder:40,active:true,virtual:false,isSystem:true},
    {stageCode:"ready",label:"Готов к выходу",stageKind:"preparation",sortOrder:45,active:false,virtual:false,isSystem:true},
    {stageCode:"started",label:"Первый выход",stageKind:"first_shift",sortOrder:50,active:true,virtual:false,isSystem:true},
    {stageCode:"retention_7",label:"7 дней",stageKind:"retention",sortOrder:60,active:true,virtual:true,isSystem:true},
    {stageCode:"retention_30",label:"30 дней",stageKind:"retention",sortOrder:70,active:true,virtual:true,isSystem:true},
  ];
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<RecruitingPipelineStage[]>`
    SELECT stage_code "stageCode",label,stage_kind "stageKind",sort_order "sortOrder",active,virtual,is_system "isSystem"
    FROM recruiting_pipeline_stage_settings
    ORDER BY sort_order,created_at
  `);
}

export async function getRecruitingOptions(actor: Actor): Promise<RecruitingOptions> {
  requireCapability(actor, "operations.need.read");
  if (actor.demo) return {
    specialties: [
      {id:"60000000-0000-4000-8000-000000000001",name:"Комплектовщик"},
      {id:"60000000-0000-4000-8000-000000000002",name:"Грузчик"},
      {id:"60000000-0000-4000-8000-000000000003",name:"Сборщик мебели"},
    ],
    regions: [
      {id:"30000000-0000-4000-8000-000000000001",name:"Москва и МО"},
      {id:"30000000-0000-4000-8000-000000000002",name:"Калужская область"},
    ],
    objects: demo.objects.filter((row) => actor.access.allOrg || actor.regionIds.includes(row.regionId)).map((row) => ({id:row.id,name:row.name,regionId:row.regionId,region:row.region})),
    recruiters: [{id:"10000000-0000-4000-8000-000000000005",name:"Ольга Новикова"}],
    responsibles: [
      {id:"10000000-0000-4000-8000-000000000005",name:"Ольга Новикова"},
      {id:"10000000-0000-4000-8000-000000000004",name:"Дмитрий Волков"},
    ],
    sources: [...new Set(demo.candidates.map((row)=>row.source).filter((value): value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b,"ru")),
    sourceCatalog: [
      {id:"demo-source-avito",name:"Авито",kind:"job_board"},
      {id:"demo-source-hh",name:"hh.ru",kind:"job_board"},
      {id:"demo-source-telegram",name:"Telegram",kind:"messenger"},
      {id:"demo-source-referral",name:"Рекомендация",kind:"referral"},
      {id:"demo-source-partner",name:"Партнёр / агентство",kind:"partner"},
    ],
    exitReasons: [
      {code:"pay",name:"Не устроила зарплата",kind:"rejected"},
      {code:"schedule",name:"Не устроил график",kind:"rejected"},
      {code:"housing",name:"Не устроило проживание",kind:"rejected"},
      {code:"location",name:"Не устроила локация",kind:"rejected"},
      {code:"other_offer",name:"Нашёл другую работу",kind:"rejected"},
      {code:"security",name:"Не прошёл проверку / СБ",kind:"rejected"},
      {code:"documents",name:"Проблемы с документами",kind:"rejected"},
      {code:"no_contact",name:"Не выходит на связь",kind:"both"},
      {code:"changed_mind",name:"Передумал",kind:"both"},
      {code:"client_rejected",name:"Отказ клиента / объекта",kind:"rejected"},
      {code:"transport",name:"Проблема с проездом / логистикой",kind:"no_show"},
      {code:"shift_confirm",name:"Не подтвердил выход / смену",kind:"no_show"},
      {code:"no_show",name:"Не вышел без предупреждения",kind:"no_show"},
      {code:"other",name:"Другое",kind:"both"},
    ],
  };
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [specialties,regions,objects,recruiters,responsibles,sourceCatalog,exitReasons] = await Promise.all([
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE active ORDER BY name`,
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM regions ORDER BY name`,
      sql<Array<{id:string;name:string;regionId:string;region:string}>>`
        SELECT DISTINCT o.id,o.name,o.region_id "regionId",r.name region
        FROM objects o JOIN regions r ON r.id=o.region_id
        LEFT JOIN object_assignments oa ON oa.object_id=o.id AND oa.effective_to IS NULL
        LEFT JOIN needs n ON n.object_id=o.id
        LEFT JOIN need_assignments na ON na.need_id=n.id AND na.unassigned_at IS NULL
        WHERE ${actor.access.allOrg} OR o.region_id=ANY(${actor.regionIds}::uuid[]) OR oa.user_id=${actor.userId}::uuid OR na.recruiter_user_id=${actor.userId}::uuid
        ORDER BY o.name
      `,
      sql<Array<{id:string;name:string}>>`
        SELECT DISTINCT m.user_id id,u.display_name name
        FROM organization_memberships m
        JOIN app_users u ON u.id=m.user_id
        JOIN role_templates rt ON rt.id=m.role_template_id
        LEFT JOIN membership_regions mr ON mr.membership_id=m.id
        WHERE m.organization_id=${actor.organizationId}::uuid AND m.status='active'
          AND (
            rt.code IN ('recruiter','recruiting_manager')
            OR EXISTS (
              SELECT 1 FROM permission_grants pg
              WHERE pg.role_template_id=rt.id
                AND pg.capability IN ('recruiting.candidate.edit','recruiting.candidate.create')
                AND pg.effect='allow'
            )
            OR (m.user_id=${actor.userId}::uuid AND ${hasCapability(actor.access,"recruiting.candidate.edit")})
          )
          AND (${actor.access.allOrg} OR mr.region_id=ANY(${actor.regionIds}::uuid[]) OR m.user_id=${actor.userId}::uuid)
        ORDER BY u.display_name
      `,
      sql<Array<{id:string;name:string}>>`
        SELECT DISTINCT m.user_id id,u.display_name name
        FROM organization_memberships m
        JOIN app_users u ON u.id=m.user_id
        WHERE m.organization_id=${actor.organizationId}::uuid AND m.status='active'
        ORDER BY u.display_name
      `,
      sql<Array<{id:string;name:string;kind:string}>>`
        SELECT id,name,kind
        FROM candidate_source_catalog
        WHERE active
        ORDER BY sort_order,name
      `,
      sql<Array<{code:string;name:string;kind:"rejected"|"no_show"|"both"}>>`
        SELECT code,name,kind FROM candidate_exit_reasons
        WHERE active ORDER BY sort_order,name
      `,
    ]);
    return {specialties,regions,objects,recruiters,responsibles,sources:sourceCatalog.map((row)=>row.name),sourceCatalog,exitReasons};

  });
}