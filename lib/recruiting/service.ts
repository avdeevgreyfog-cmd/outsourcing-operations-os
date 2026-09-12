import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";
import { needSourceLabels, normalizeRecruitingStage, recruitingStageLabels, type RecruitingStage } from "./model";

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
  deficit: number;
  deadline: string | null;
  status: string;
  ownerUserId: string | null;
  owner: string | null;
  managerUserId: string | null;
  manager: string | null;
  assigneeUserIds: string[];
  conditions: Record<string, unknown>;
  candidates: number;
  approved: number;
  ready: number;
  started: number;
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
  nextAction: string | null;
  plannedStartDate: string | null;
  actualStartAt: string | null;
  rejectionReason: string | null;
  conditions: Record<string, unknown>;
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
};

function demoNeedRows(actor: Actor): RecruitingNeedRow[] {
  return demo.needs.filter((row) => canReadRow(actor.access, "operations.need.read", row, actor)).map((row) => {
    const related = demo.candidates.filter((candidate) => candidate.objectId === row.objectId && candidate.need === row.specialty);
    return {
      id: row.id, organizationId: row.organizationId, objectId: row.objectId, object: row.object,
      clientId: row.clientId, client: demo.clients.find((client) => client.id === row.clientId)?.name ?? null,
      regionId: row.regionId, region: demo.objects.find((object) => object.id === row.objectId)?.region ?? null,
      specialtyId: row.specialty === "Грузчик" ? "60000000-0000-4000-8000-000000000002" : row.specialty === "Сборщик мебели" ? "60000000-0000-4000-8000-000000000003" : "60000000-0000-4000-8000-000000000001",
      specialty: row.specialty, title: row.specialty, sourceKind: "object", sourceLabel: needSourceLabels.object,
      priority: row.deficit >= 7 ? "high" : "normal", required: row.required, filled: row.filled, deficit: row.deficit,
      deadline: row.deadline ?? null, status: row.status, ownerUserId: row.ownerUserId, owner: "Ольга Новикова",
      managerUserId: null, manager: null, assigneeUserIds: row.assigneeUserIds ?? [],
      conditions: { schedule: "6/1 · 11 оплачиваемых часов", housing: "Проживание по условиям объекта", location: demo.objects.find((object) => object.id === row.objectId)?.name ?? null },
      candidates: related.length,
      approved: related.filter((candidate) => ["approved","documents","first_shift"].includes(candidate.stage)).length,
      ready: related.filter((candidate) => ["documents","first_shift"].includes(candidate.stage)).length,
      started: related.filter((candidate) => candidate.stage === "first_shift").length,
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
        n.source_kind "sourceKind",n.priority,n.count_required required,n.count_filled filled,GREATEST(n.count_required-n.count_filled,0)::int deficit,
        to_char(n.deadline,'DD.MM.YYYY') deadline,n.status,n.owner_user_id "ownerUserId",owner.display_name owner,
        n.manager_user_id "managerUserId",manager.display_name manager,n.conditions_snapshot conditions,
        ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=n.id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
          || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=n.object_id AND oa.effective_to IS NULL) "assigneeUserIds",
        count(ca.id)::int candidates,
        count(ca.id) FILTER (WHERE ca.stage IN ('approved','preparation','ready','started','documents','first_shift'))::int approved,
        count(ca.id) FILTER (WHERE ca.stage IN ('ready','started','first_shift'))::int ready,
        count(ca.id) FILTER (WHERE ca.stage IN ('started','first_shift'))::int started
      FROM needs n
      JOIN specialties s ON s.id=n.specialty_id
      LEFT JOIN objects o ON o.id=n.object_id
      LEFT JOIN client_companies cl ON cl.id=o.client_company_id
      LEFT JOIN regions rg ON rg.id=COALESCE(n.region_id,o.region_id)
      LEFT JOIN app_users owner ON owner.id=n.owner_user_id
      LEFT JOIN app_users manager ON manager.id=n.manager_user_id
      LEFT JOIN candidate_applications ca ON ca.need_id=n.id
      GROUP BY n.id,o.name,o.client_company_id,cl.name,rg.name,s.name,owner.display_name,manager.display_name
      ORDER BY n.status='open' DESC,n.deadline NULLS LAST,n.created_at DESC
    `;
    return rows.filter((row) => canReadRow(actor.access, "operations.need.read", row, actor)).map((row) => ({...row, sourceLabel: needSourceLabels[row.sourceKind] ?? "Другое"}));
  });
}

function demoApplications(actor: Actor): RecruitingApplicationRow[] {
  return demo.candidates.filter((row) => canReadRow(actor.access, "recruiting.candidate.read", row, actor)).map((row, index) => {
    const stage = normalizeRecruitingStage(row.stage);
    const need = demo.needs.find((item) => item.objectId === row.objectId && item.specialty === row.need);
    return {
      applicationId: `demo-application-${index + 1}`, candidateId: row.id, organizationId: row.organizationId,
      fullName: row.fullName, phone: row.phone ?? null, email: null, preferredChannel: "phone", telegram: null, whatsapp: null, city: null,
      source: row.source ?? null, sourceChannel: row.source ?? null, sourceCampaign: null, sourceReference: null,
      stage, stageLabel: recruitingStageLabels[stage], needId: need?.id ?? "", need: row.need ?? "—", objectId: row.objectId ?? null,
      object: row.object ?? null, regionId: row.regionId ?? null, clientId: row.clientId ?? null, ownerUserId: row.ownerUserId ?? null,
      owner: "Ольга Новикова", managerUserId: null, manager: null, assigneeUserIds: row.assigneeUserIds ?? [],
      nextAction: row.nextAction ?? null, plannedStartDate: null, actualStartAt: stage === "started" ? "2026-09-12" : null,
      rejectionReason: null, conditions: {},
    };
  });
}

export async function listRecruitingApplications(actor: Actor): Promise<RecruitingApplicationRow[]> {
  requireCapability(actor, "recruiting.candidate.read");
  if (actor.demo) return demoApplications(actor);
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<Array<Omit<RecruitingApplicationRow,"stage"|"stageLabel"> & {rawStage:string} & Record<string, unknown>>>`
      SELECT ca.id "applicationId",c.id "candidateId",c.organization_id "organizationId",c.full_name "fullName",c.phone,c.email,
        c.preferred_channel "preferredChannel",c.telegram,c.whatsapp,c.city,c.source,c.source_channel "sourceChannel",
        c.source_campaign "sourceCampaign",c.source_reference "sourceReference",ca.stage "rawStage",ca.need_id "needId",
        COALESCE(n.title,s.name) need,ca.object_id "objectId",o.name object,COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
        ca.owner_user_id "ownerUserId",owner.display_name owner,ca.manager_user_id "managerUserId",manager.display_name manager,
        ARRAY[ca.owner_user_id::text,ca.manager_user_id::text]
          || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
          || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds",
        to_char(ca.next_action_at,'DD.MM.YYYY HH24:MI') "nextAction",ca.planned_start_date::text "plannedStartDate",
        ca.actual_start_at::text "actualStartAt",ca.rejection_reason "rejectionReason",ca.conditions_snapshot conditions
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
    communications: [], history: applications.map((application, index) => ({id:`demo-history-${index}`,applicationId:application.applicationId,fromStage:null,toStage:application.stage,reason:null,changedAt:"Демо",changedBy:"Ольга Новикова"})),
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
        SELECT h.id,h.application_id "applicationId",h.from_stage "fromStage",h.to_stage "toStage",h.reason,
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
  };
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const specialties = await sql<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE active ORDER BY name`;
    const regions = await sql<Array<{id:string;name:string}>>`SELECT id,name FROM regions ORDER BY name`;
    const objects = await sql<Array<{id:string;name:string;regionId:string;region:string}>>`
      SELECT DISTINCT o.id,o.name,o.region_id "regionId",r.name region
      FROM objects o JOIN regions r ON r.id=o.region_id
      LEFT JOIN object_assignments oa ON oa.object_id=o.id AND oa.effective_to IS NULL
      LEFT JOIN needs n ON n.object_id=o.id
      LEFT JOIN need_assignments na ON na.need_id=n.id AND na.unassigned_at IS NULL
      WHERE ${actor.access.allOrg} OR o.region_id=ANY(${actor.regionIds}::uuid[]) OR oa.user_id=${actor.userId}::uuid OR na.recruiter_user_id=${actor.userId}::uuid
      ORDER BY o.name
    `;
    return {specialties,regions,objects};
  });
}
