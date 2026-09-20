import type { WorkflowDetails } from "./workflow";
import { demoApplicationDetails } from "./demo-timeline";
import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow, hasCapability } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";
import { needSourceLabels, normalizeRecruitingStage, recruitingStageLabels, type RecruitingStage } from "./model";

export type NeedRecruiterAssignment = { userId: string; name: string; targetCount: number };
export type RecruitingFunnelStageSetting = { code: RecruitingStage; label: string; sortOrder: number; active: boolean; systemType: string };
export type RecruitingSourceOption = { id:string; code:string; name:string; kind:string; active:boolean };
export type NeedQuantityChange = { id:string; oldCount:number|null; newCount:number; delta:number; reason:string|null; changedAt:string; changedBy:string };

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
  quantityHistory: NeedQuantityChange[];
  requiredDocumentTypeIds: string[];
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
  recentCommunications?: Array<{id:string;channel:string;summary:string;happenedAt:string;author:string}>;
  documentSummary?: {required:number;received:number;missing:string[]};
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
};

export type RecruitingOptions = {
  specialties: Array<{id:string;name:string}>;
  regions: Array<{id:string;name:string}>;
  objects: Array<{id:string;name:string;regionId:string;region:string}>;
  recruiters: Array<{id:string;name:string}>;
  sources: string[];
  sourceCatalog: RecruitingSourceOption[];
  funnelStages: RecruitingFunnelStageSetting[];
  documentTypes: Array<{id:string;code:string;name:string}>;
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
      ready, started, conditionVersion: 1, quantityHistory:[], requiredDocumentTypeIds:[],
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
        COALESCE(versions.version,1)::int "conditionVersion",COALESCE(quantity.history,'[]'::jsonb) "quantityHistory",ARRAY(SELECT ndr.document_type_id::text FROM need_document_requirements ndr WHERE ndr.need_id=n.id AND ndr.required) "requiredDocumentTypeIds"
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
          count(*) FILTER (WHERE f.stage IN ('documents','preparation','first_shift','retention_7','retention_30','manager_review','approved','ready','started'))::int approved,
          count(*) FILTER (WHERE f.stage IN ('preparation','ready'))::int ready,
          count(*) FILTER (WHERE f.stage IN ('first_shift','retention_7','retention_30','started'))::int started,
          jsonb_build_object(
            'new',count(*) FILTER (WHERE f.normalized_stage='new'),
            'interview',count(*) FILTER (WHERE f.normalized_stage='interview'),
            'documents',count(*) FILTER (WHERE f.normalized_stage='documents'),
            'preparation',count(*) FILTER (WHERE f.normalized_stage='preparation'),
            'first_shift',count(*) FILTER (WHERE f.normalized_stage='first_shift'),
            'retention_7',count(*) FILTER (WHERE f.normalized_stage='retention_7'),
            'retention_30',count(*) FILTER (WHERE f.normalized_stage='retention_30'),
            'rejected',count(*) FILTER (WHERE f.stage='rejected'),
            'no_show',count(*) FILTER (WHERE f.stage='no_show')
          ) "stageCounts",
          jsonb_build_object(
            'new',count(*),
            'interview',count(*) FILTER (WHERE f.max_rank>=2),
            'documents',count(*) FILTER (WHERE f.max_rank>=3),
            'preparation',count(*) FILTER (WHERE f.max_rank>=4),
            'first_shift',count(*) FILTER (WHERE f.max_rank>=5),
            'retention_7',count(*) FILTER (WHERE f.max_rank>=6),
            'retention_30',count(*) FILTER (WHERE f.max_rank>=7)
          ) "reachedCounts"
        FROM (
          SELECT ca.stage,
            CASE ca.stage
              WHEN 'new' THEN 'new'
              WHEN 'contact' THEN 'interview' WHEN 'call' THEN 'interview' WHEN 'interview' THEN 'interview'
              WHEN 'manager_review' THEN 'documents' WHEN 'approved' THEN 'documents' WHEN 'documents' THEN 'documents'
              WHEN 'ready' THEN 'preparation' WHEN 'preparation' THEN 'preparation'
              WHEN 'started' THEN 'first_shift' WHEN 'first_shift' THEN 'first_shift'
              WHEN 'retention_7' THEN 'retention_7' WHEN 'retention_30' THEN 'retention_30'
              ELSE ca.stage END normalized_stage,
            GREATEST(
              CASE ca.stage
                WHEN 'new' THEN 1
                WHEN 'contact' THEN 2 WHEN 'call' THEN 2 WHEN 'interview' THEN 2
                WHEN 'manager_review' THEN 3 WHEN 'approved' THEN 3 WHEN 'documents' THEN 3
                WHEN 'ready' THEN 4 WHEN 'preparation' THEN 4
                WHEN 'started' THEN 5 WHEN 'first_shift' THEN 5
                WHEN 'retention_7' THEN 6 WHEN 'retention_30' THEN 7 ELSE 1 END,
              COALESCE((
                SELECT max(CASE h.to_stage
                  WHEN 'new' THEN 1
                  WHEN 'contact' THEN 2 WHEN 'call' THEN 2 WHEN 'interview' THEN 2
                  WHEN 'manager_review' THEN 3 WHEN 'approved' THEN 3 WHEN 'documents' THEN 3
                  WHEN 'ready' THEN 4 WHEN 'preparation' THEN 4
                  WHEN 'started' THEN 5 WHEN 'first_shift' THEN 5
                  WHEN 'retention_7' THEN 6 WHEN 'retention_30' THEN 7 ELSE 1 END)
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
        SELECT jsonb_agg(jsonb_build_object(
          'id',q.id,'oldCount',q.old_count,'newCount',q.new_count,'delta',q.delta,'reason',q.reason,
          'changedAt',to_char(q.created_at,'DD.MM.YYYY HH24:MI'),'changedBy',u.display_name
        ) ORDER BY q.created_at DESC) history
        FROM need_quantity_changes q
        JOIN app_users u ON u.id=q.changed_by_user_id
        WHERE q.need_id=n.id
      ) quantity ON true
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
      owner: "Ольга Новикова", managerUserId: null, manager: null, assigneeUserIds: row.assigneeUserIds ?? [],
      nextAction: row.nextAction ?? null, plannedStartDate: null, actualStartAt: ["first_shift","retention_7","retention_30"].includes(stage) ? "2026-09-12" : null,
      rejectionReason: (row as {rejectionReason?:string}).rejectionReason??null, rejectionReasonCode:(row as {rejectionReasonCode?:string}).rejectionReasonCode??null, conditions: need?.conditions ?? {},
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
        ARRAY[ca.owner_user_id::text,ca.manager_user_id::text]
          || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
          || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds",
        ca.created_at::text "createdAt",ca.updated_at::text "updatedAt",ca.next_action_at::text "nextActionAt",ca.workflow_details workflow,
        (SELECT max(h.created_at)::text FROM candidate_stage_history h WHERE h.application_id=ca.id) "stageEnteredAt",
        to_char(ca.next_action_at,'DD.MM.YYYY HH24:MI') "nextAction",ca.planned_start_date::text "plannedStartDate",
        ca.actual_start_at::text "actualStartAt",ca.rejection_reason "rejectionReason",ca.rejection_reason_code "rejectionReasonCode",ca.conditions_snapshot conditions,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object('id',x.id,'channel',x.channel,'summary',x.summary,'happenedAt',x.happened_at,'author',x.author) ORDER BY x.sort_at DESC)
          FROM (
            SELECT cc.id,cc.channel,cc.summary,to_char(cc.happened_at,'DD.MM.YYYY HH24:MI') happened_at,u.display_name author,cc.happened_at sort_at
            FROM candidate_communications cc JOIN app_users u ON u.id=cc.created_by_user_id
            WHERE cc.candidate_id=c.id AND (cc.application_id=ca.id OR cc.application_id IS NULL)
            ORDER BY cc.happened_at DESC LIMIT 5
          ) x
        ),'[]'::jsonb) "recentCommunications",
        jsonb_build_object(
          'required',(SELECT count(*)::int FROM need_document_requirements ndr WHERE ndr.need_id=n.id AND ndr.required),
          'received',(SELECT count(*)::int FROM candidate_application_documents cad WHERE cad.application_id=ca.id AND cad.status IN ('received','verified')),
          'missing',COALESCE((SELECT jsonb_agg(dt.name ORDER BY dt.sort_order) FROM need_document_requirements ndr JOIN recruiting_document_types dt ON dt.id=ndr.document_type_id LEFT JOIN candidate_application_documents cad ON cad.application_id=ca.id AND cad.document_type_id=dt.id WHERE ndr.need_id=n.id AND ndr.required AND COALESCE(cad.status,'missing') NOT IN ('received','verified','not_required')),'[]'::jsonb)
        ) "documentSummary"
      FROM candidate_applications ca
      JOIN candidates c ON c.id=ca.candidate_id
      JOIN needs n ON n.id=ca.need_id
      JOIN specialties s ON s.id=n.specialty_id
      LEFT JOIN objects o ON o.id=ca.object_id
      LEFT JOIN app_users owner ON owner.id=ca.owner_user_id
      LEFT JOIN app_users manager ON manager.id=ca.manager_user_id
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
  };
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [candidate] = await sql<Array<Omit<CandidateProfile,"applications"|"communications"|"history">>>`
      SELECT id,full_name "fullName",phone,email,preferred_channel "preferredChannel",telegram,whatsapp,city,birth_date::text "birthDate",
        source,source_channel "sourceChannel",source_campaign "sourceCampaign",source_reference "sourceReference",notes,status
      FROM candidates WHERE id=${id}::uuid
    `;
    if (!candidate) return null;
    const applicationIds = applications.map((application) => application.applicationId);
    const [communications, history] = await Promise.all([
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
    ]);
    return {...candidate, applications, communications, history};
  });
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
    sources: [...new Set(demo.candidates.map((row)=>row.source).filter((value): value is string=>Boolean(value)))].sort((a,b)=>a.localeCompare(b,"ru")),
    sourceCatalog: [
      {id:"demo-source-avito",code:"avito",name:"Авито",kind:"job_site",active:true},
      {id:"demo-source-hh",code:"hh",name:"hh.ru",kind:"job_site",active:true},
      {id:"demo-source-telegram",code:"telegram",name:"Telegram",kind:"social",active:true},
      {id:"demo-source-referral",code:"referral",name:"Рекомендация",kind:"referral",active:true},
      {id:"demo-source-partner",code:"partner",name:"Партнёр / подрядчик",kind:"partner",active:true},
    ],
    funnelStages: [
      {code:"new",label:"Новый контакт",sortOrder:10,active:true,systemType:"intake"},
      {code:"interview",label:"Интервью",sortOrder:20,active:true,systemType:"qualification"},
      {code:"documents",label:"Документы",sortOrder:30,active:true,systemType:"documents"},
      {code:"preparation",label:"Подготовка к выходу",sortOrder:40,active:true,systemType:"preparation"},
      {code:"first_shift",label:"Первый выход",sortOrder:50,active:true,systemType:"start"},
      {code:"retention_7",label:"7 дней",sortOrder:60,active:true,systemType:"retention"},
      {code:"retention_30",label:"30 дней",sortOrder:70,active:true,systemType:"retention_final"},
    ],
    documentTypes: [
      {id:"demo-doc-passport",code:"passport",name:"Паспорт"},
      {id:"demo-doc-snils",code:"snils",name:"СНИЛС"},
      {id:"demo-doc-inn",code:"inn",name:"ИНН"},
      {id:"demo-doc-bank",code:"bank_details",name:"Банковские реквизиты"},
      {id:"demo-doc-medical",code:"medical",name:"Медицинские документы"},
      {id:"demo-doc-qualification",code:"qualification",name:"Удостоверение / допуск"},
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
    const [specialties,regions,objects,recruiters,sources,sourceCatalog,funnelStages,documentTypes,exitReasons] = await Promise.all([
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
      sql<Array<{source:string}>>`
        SELECT DISTINCT c.source
        FROM candidates c
        WHERE c.source IS NOT NULL AND btrim(c.source)<>''
        ORDER BY c.source
      `,
      sql<RecruitingSourceOption[]>`
        SELECT id,code,name,kind,active
        FROM recruiting_candidate_sources
        WHERE active ORDER BY sort_order,name
      `,
      sql<RecruitingFunnelStageSetting[]>`
        SELECT code,label,sort_order "sortOrder",active,system_type "systemType"
        FROM recruiting_funnel_stages
        WHERE active ORDER BY sort_order,created_at
      `,
      sql<Array<{id:string;code:string;name:string}>>`
        SELECT id,code,name FROM recruiting_document_types WHERE active ORDER BY sort_order,name
      `,
      sql<Array<{code:string;name:string;kind:"rejected"|"no_show"|"both"}>>`
        SELECT code,name,kind FROM candidate_exit_reasons
        WHERE active ORDER BY sort_order,name
      `,
    ]);
    return {specialties,regions,objects,recruiters,sources:sources.map((row)=>row.source),sourceCatalog,funnelStages,documentTypes,exitReasons};

  });
}