import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type RequestRoleDetail = {
  id: string;
  specialtyId: string;
  specialty: string;
  count: number;
  schedule: Record<string, unknown>;
  requirements: Record<string, unknown>;
  targetClientRate: number | string | null;
};

export type CommercialRequestDetail = {
  id: string;
  organizationId: string;
  clientId: string | null;
  client: string;
  contactId: string | null;
  title: string;
  status: string;
  source: string;
  location: string;
  regionId: string | null;
  region: string | null;
  startDate: string | null;
  durationText: string | null;
  schedule: Record<string, unknown>;
  lunchPaid: boolean | null;
  vatMode: string | null;
  housingRule: string | null;
  travelRule: string | null;
  shuttleRule: string | null;
  ppeRule: string | null;
  medicalRule: string | null;
  citizenshipRule: string | null;
  toolsRule: string | null;
  comments: string | null;
  ownerUserId: string | null;
  createdByUserId: string;
  teamId: string | null;
  archivedAt: string | null;
  roles: RequestRoleDetail[];
};

export type CommercialOptions = {
  clients: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
  specialties: Array<{ id: string; name: string }>;
  models: Array<{ id: string; name: string; code: string }>;
};

export type ApprovalRow = {
  id: string;
  subjectType: "calculation_scenario" | "proposal";
  subjectId: string;
  subject: string;
  processCode: string;
  status: string;
  requestedBy: string;
  approver: string | null;
  approverUserId: string | null;
  requestedAt: string;
  decidedAt: string | null;
  decisionComment: string | null;
  requestId: string | null;
};

export type CommercialProposalRow = {
  id: string;
  organizationId: string;
  requestId: string;
  request: string;
  client: string;
  clientId: string | null;
  regionId: string | null;
  ownerUserId: string | null;
  teamId: string | null;
  version: number;
  status: string;
  scenarioCount: number;
  totalValue: number | string;
  createdAt: string;
  createdBy: string;
  approvedAt: string | null;
  sentAt: string | null;
  acceptedAt: string | null;
  launchedAt: string | null;
};

export type ProposalDetail = CommercialProposalRow & {
  content: {
    roles?: Array<{ role: string; count: number; rate: number; unit: string; scenarioId: string }>;
    vatMode?: string | null;
    location?: string | null;
    expectedStartDate?: string | null;
  };
  clientDecisionNote: string | null;
  sourceObjectId: string | null;
};

function demoRequest(id: string): CommercialRequestDetail | null {
  const request = demo.requests.find((item) => item.id === id);
  if (!request) return null;
  const roleIds = id === "73000000-0000-4000-8000-000000000001"
    ? ["74000000-0000-4000-8000-000000000001", "74000000-0000-4000-8000-000000000002"]
    : request.roles.map((_, index) => `74000000-0000-4000-8000-0000000001${index + 10}`);
  const specialtyIds: Record<string, string> = {
    "Комплектовщик": "60000000-0000-4000-8000-000000000001",
    "Грузчик": "60000000-0000-4000-8000-000000000002",
    "Сборщик мебели": "60000000-0000-4000-8000-000000000003",
  };
  return {
    id: request.id,
    organizationId: request.organizationId,
    clientId: request.clientId ?? null,
    client: request.client ?? "Без клиента",
    contactId: null,
    title: request.title,
    status: request.status,
    source: "manual",
    location: request.location,
    regionId: request.regionId ?? null,
    region: request.regionId === "30000000-0000-4000-8000-000000000002" ? "Калужская область" : "Москва и МО",
    startDate: request.start ?? null,
    durationText: null,
    schedule: typeof request.schedule === "object" && request.schedule ? request.schedule as Record<string, unknown> : { label: request.schedule },
    lunchPaid: false,
    vatMode: request.vat ?? null,
    housingRule: request.housing ?? null,
    travelRule: null,
    shuttleRule: null,
    ppeRule: null,
    medicalRule: null,
    citizenshipRule: null,
    toolsRule: null,
    comments: null,
    ownerUserId: request.ownerUserId ?? null,
    createdByUserId: request.createdByUserId,
    teamId: request.teamId ?? null,
    archivedAt: null,
    roles: request.roles.map((role, index) => ({
      id: roleIds[index],
      specialtyId: specialtyIds[role.name] ?? "60000000-0000-4000-8000-000000000001",
      specialty: role.name,
      count: role.count,
      schedule: {}, requirements: {}, targetClientRate: null,
    })),
  };
}

export async function getCommercialRequest(actor: Actor, id: string): Promise<CommercialRequestDetail | null> {
  requireCapability(actor, "sales.request.read");
  if (actor.demo) {
    const row = demoRequest(id);
    if (!row || !canReadRow(actor.access, "sales.request.read", row, actor)) return null;
    return row;
  }
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [row] = await sql<Array<CommercialRequestDetail & Record<string, unknown>>>`
      SELECT r.id,r.organization_id "organizationId",r.client_company_id "clientId",COALESCE(c.name,'Без клиента') client,
        r.contact_id "contactId",r.title,r.status,r.source,r.location_text location,r.region_id "regionId",rg.name region,
        r.expected_start_date::text "startDate",r.duration_text "durationText",r.schedule_json schedule,r.lunch_paid "lunchPaid",
        r.vat_mode "vatMode",r.housing_rule "housingRule",r.travel_rule "travelRule",r.shuttle_rule "shuttleRule",
        r.ppe_rule "ppeRule",r.medical_rule "medicalRule",r.citizenship_rule "citizenshipRule",r.tools_rule "toolsRule",
        r.comments,r.owner_user_id "ownerUserId",r.created_by_user_id "createdByUserId",r.assigned_team_id "teamId",
        r.archived_at::text "archivedAt",
        COALESCE(jsonb_agg(jsonb_build_object(
          'id',rr.id,'specialtyId',rr.specialty_id,'specialty',s.name,'count',rr.count_required,'schedule',rr.schedule_json,
          'requirements',rr.requirements_json,'targetClientRate',rr.target_client_rate
        ) ORDER BY rr.created_at) FILTER (WHERE rr.id IS NOT NULL),'[]'::jsonb) roles
      FROM requests r
      LEFT JOIN client_companies c ON c.id=r.client_company_id
      LEFT JOIN regions rg ON rg.id=r.region_id
      LEFT JOIN request_roles rr ON rr.request_id=r.id
      LEFT JOIN specialties s ON s.id=rr.specialty_id
      WHERE r.id=${id}::uuid
      GROUP BY r.id,c.name,rg.name
    `;
    if (!row || !canReadRow(actor.access, "sales.request.read", row, actor)) return null;
    return row;
  });
}

export async function getCommercialOptions(actor: Actor): Promise<CommercialOptions> {
  if (actor.demo) return {
    clients: demo.clients.map((item) => ({ id: item.id, name: item.name })),
    regions: [
      { id: "30000000-0000-4000-8000-000000000001", name: "Москва и МО" },
      { id: "30000000-0000-4000-8000-000000000002", name: "Калужская область" },
    ],
    specialties: [
      { id: "60000000-0000-4000-8000-000000000001", name: "Комплектовщик" },
      { id: "60000000-0000-4000-8000-000000000002", name: "Грузчик" },
      { id: "60000000-0000-4000-8000-000000000003", name: "Сборщик мебели" },
    ],
    models: [
      { id: "76000000-0000-4000-8000-000000000001", name: "Трудовой договор", code: "employment" },
      { id: "76000000-0000-4000-8000-000000000002", name: "ГПХ", code: "gph" },
      { id: "76000000-0000-4000-8000-000000000003", name: "НПД", code: "npd" },
    ],
  };
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [clients, regions, specialties, models] = await Promise.all([
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM client_companies WHERE status<>'archived' ORDER BY name`,
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM regions ORDER BY name`,
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE active ORDER BY name`,
      sql<Array<{id:string;name:string;code:string}>>`SELECT id,name,code FROM calculation_models WHERE active ORDER BY name`,
    ]);
    return { clients, regions, specialties, models };
  });
}

export async function listApprovals(actor: Actor): Promise<ApprovalRow[]> {
  requireCapability(actor, "approval.read");
  if (actor.demo) {
    return demo.calculations.filter((item) => item.status === "review").map((item) => ({
      id: `approval-${item.id}`,
      subjectType: "calculation_scenario" as const,
      subjectId: item.id,
      subject: `Расчёт · ${item.request} · ${item.role}`,
      processCode: "commercial_calculation",
      status: "pending",
      requestedBy: "Елена Котова",
      approver: actor.roleCode === "director" ? actor.displayName : "Анна Лебедева",
      approverUserId: actor.roleCode === "director" ? actor.userId : "10000000-0000-4000-8000-000000000001",
      requestedAt: "30.08.2026 15:10",
      decidedAt: null,
      decisionComment: null,
      requestId: item.requestId,
    }));
  }
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const allOrg = actor.access.allOrg || actor.access.scopes["approval.read"]?.some((scope) => scope.type === "all_org");
    return sql<ApprovalRow[]>`
      SELECT ai.id,ai.subject_type "subjectType",ai.subject_id "subjectId",
        CASE ai.subject_type
          WHEN 'calculation_scenario' THEN 'Расчёт · '||COALESCE(r1.title,'—')||' · '||COALESCE(s.name,'—')
          WHEN 'proposal' THEN 'КП · '||COALESCE(r2.title,'—')||' · v'||COALESCE(p.version::text,'—')
        END subject,
        ai.process_code "processCode",ai.status,requester.display_name "requestedBy",approver.display_name approver,
        aps.approver_user_id "approverUserId",to_char(ai.submitted_at,'DD.MM.YYYY HH24:MI') "requestedAt",
        to_char(aps.decided_at,'DD.MM.YYYY HH24:MI') "decidedAt",aps.decision_comment "decisionComment",
        COALESCE(c.request_id,p.request_id) "requestId"
      FROM approval_instances ai
      JOIN approval_steps aps ON aps.approval_id=ai.id AND aps.step_order=1
      JOIN app_users requester ON requester.id=ai.requested_by_user_id
      LEFT JOIN app_users approver ON approver.id=aps.approver_user_id
      LEFT JOIN calculation_scenarios cs ON ai.subject_type='calculation_scenario' AND cs.id=ai.subject_id
      LEFT JOIN calculations c ON c.id=cs.calculation_id
      LEFT JOIN requests r1 ON r1.id=c.request_id
      LEFT JOIN request_roles rr ON rr.id=cs.request_role_id
      LEFT JOIN specialties s ON s.id=rr.specialty_id
      LEFT JOIN proposals p ON ai.subject_type='proposal' AND p.id=ai.subject_id
      LEFT JOIN requests r2 ON r2.id=p.request_id
      WHERE ${allOrg} OR ai.requested_by_user_id=${actor.userId}::uuid OR aps.approver_user_id=${actor.userId}::uuid
      ORDER BY ai.status='pending' DESC,ai.submitted_at DESC
    `;
  });
}

export async function listCommercialProposals(actor: Actor): Promise<CommercialProposalRow[]> {
  requireCapability(actor, actor.access.capabilities.includes("sales.proposal.read") ? "sales.proposal.read" : "sales.request.read");
  if (actor.demo) return demo.proposals.map((item) => ({
    ...item,
    approvedAt: null,
    sentAt: null,
    acceptedAt: item.status === "accepted" ? item.createdAt : null,
    launchedAt: null,
  })) as CommercialProposalRow[];
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<CommercialProposalRow[]>`
      SELECT p.id,p.organization_id "organizationId",p.request_id "requestId",r.title request,COALESCE(c.name,'Без клиента') client,
        r.client_company_id "clientId",r.region_id "regionId",r.owner_user_id "ownerUserId",r.assigned_team_id "teamId",
        p.version,p.status,cardinality(p.scenario_ids)::int "scenarioCount",COALESCE(p.total_value,0) "totalValue",
        to_char(p.created_at,'DD.MM.YYYY') "createdAt",u.display_name "createdBy",
        p.approved_at::text "approvedAt",p.sent_at::text "sentAt",p.accepted_at::text "acceptedAt",p.launched_at::text "launchedAt"
      FROM proposals p JOIN requests r ON r.id=p.request_id LEFT JOIN client_companies c ON c.id=r.client_company_id
      JOIN app_users u ON u.id=p.created_by_user_id ORDER BY p.created_at DESC
    `;
    return rows.filter((row) => canReadRow(actor.access, actor.access.capabilities.includes("sales.proposal.read") ? "sales.proposal.read" : "sales.request.read", row, actor));
  });
}

export async function getProposalDetail(actor: Actor, id: string): Promise<ProposalDetail | null> {
  const rows = await listCommercialProposals(actor);
  const summary = rows.find((row) => row.id === id);
  if (!summary) return null;
  if (actor.demo) {
    const request = demo.requests.find((item) => item.id === summary.requestId);
    const scenarios = demo.calculations.filter((item) => item.requestId === summary.requestId && item.status === "accepted");
    return {
      ...summary,
      content: {
        roles: scenarios.map((item) => ({ role: item.role, count: request?.roles.find((r) => r.name === item.role)?.count ?? 0, rate: Number(item.clientRate), unit: "час", scenarioId: item.id })),
        vatMode: request?.vat ?? null,
        location: request?.location ?? null,
        expectedStartDate: request?.start ?? null,
      },
      clientDecisionNote: null,
      sourceObjectId: demo.objects.find((item) => item.id && summary.status === "accepted" && item.clientId === summary.clientId)?.id ?? null,
    };
  }
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [extra] = await sql<Array<{content: ProposalDetail["content"];clientDecisionNote:string|null;sourceObjectId:string|null}>>`
      SELECT p.content_snapshot content,p.client_decision_note "clientDecisionNote",o.id "sourceObjectId"
      FROM proposals p LEFT JOIN objects o ON o.source_proposal_id=p.id WHERE p.id=${id}::uuid
    `;
    return extra ? { ...summary, ...extra } : null;
  });
}

export async function listRequestProposals(actor: Actor, requestId: string) {
  return (await listCommercialProposals(actor)).filter((item) => item.requestId === requestId);
}
