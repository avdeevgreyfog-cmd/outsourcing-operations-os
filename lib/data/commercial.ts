import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { listCalculations, listProposals, listRequests } from "@/lib/data/service";

export type CommercialRole = {
  id?: string;
  name: string;
  count: number;
  qualification?: string | null;
  experience?: string | null;
  salaryTarget?: number | string | null;
  salaryUnit?: string | null;
  scheduleType?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  presenceHours?: number | string | null;
  paidHours?: number | string | null;
  lunchMinutes?: number | null;
  lunchPaid?: boolean | null;
  nightHours?: number | string | null;
  overtimeRule?: string | null;
  requirements?: Record<string, unknown>;
};

export type CommercialRequestRow = {
  id: string;
  requestNumber: string;
  title: string;
  clientId?: string | null;
  client: string;
  contactName?: string | null;
  contactPosition?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  customerInn?: string | null;
  stage: string;
  outcome: string;
  archivedAt?: string | null;
  location: string;
  siteName?: string | null;
  city?: string | null;
  region?: string | null;
  transportAccess?: string | null;
  nearestTransport?: string | null;
  logisticsComment?: string | null;
  start?: string | null;
  duration?: string | null;
  projectIndefinite?: boolean;
  schedule?: Record<string, unknown>;
  provision?: Record<string, unknown>;
  commercialLimits?: Record<string, unknown>;
  staffingRequirements?: Record<string, unknown>;
  owner?: string | null;
  ownerUserId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  nextAction?: string | null;
  nextActionAt?: string | null;
  closeReason?: string | null;
  closeComment?: string | null;
  roles: CommercialRole[];
};

export type ApprovalRow = { id:string; scenarioId:string; scenario:string; status:string; requestedAt:string; requestedBy:string; assignedTo?:string|null; decidedBy?:string|null; decidedAt?:string|null; comment?:string|null };
export type CommentRow = { id:string; entityType:string; entityId:string; type:string; body:string; author:string; createdAt:string; visibility:string };
export type HistoryRow = { id:string; action:string; actor:string; createdAt:string; resourceType:string; before?:Record<string,unknown>|null; after?:Record<string,unknown>|null };

export async function listCommercialRequests(actor: Actor): Promise<CommercialRequestRow[]> {
  if (actor.demo) {
    const rows = await listRequests(actor);
    return rows.map((row, index) => ({
      id: row.id,
      requestNumber: `З-ДЕМО-${String(index + 1).padStart(3, "0")}`,
      title: row.title,
      clientId: row.clientId,
      client: row.client || "Не указана",
      stage: normalizeLegacyStage(row.status),
      outcome: "open",
      archivedAt: null,
      location: row.location,
      start: row.start,
      schedule: typeof row.schedule === "object" && row.schedule ? row.schedule as Record<string,unknown> : {},
      provision: { housing: row.housing ? { provider: row.housing } : undefined },
      commercialLimits: { vatMode: row.vat },
      ownerUserId: row.ownerUserId,
      roles: row.roles.map((role) => ({ name: role.name, count: role.count })),
      nextAction: "Уточнить условия и следующий коммерческий шаг",
    }));
  }
  requireCapability(actor, "sales.request.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<CommercialRequestRow[]>`
    SELECT r.id, r.request_number "requestNumber", r.title, r.client_company_id "clientId", COALESCE(c.name,'Не указана') client,
      r.contact_name "contactName", r.contact_position "contactPosition", r.contact_phone "contactPhone", r.contact_email "contactEmail", r.customer_inn "customerInn",
      r.stage, r.outcome, r.archived_at "archivedAt", COALESCE(r.location_text,'') location, r.site_name "siteName", r.city,
      rg.name region, r.transport_access "transportAccess", r.nearest_transport "nearestTransport", r.logistics_comment "logisticsComment",
      to_char(r.expected_start_date,'DD.MM.YYYY') start, r.duration_text duration, r.project_indefinite "projectIndefinite",
      r.schedule_json schedule, r.provision_json provision, r.commercial_limits_json "commercialLimits", r.staffing_requirements_json "staffingRequirements",
      u.display_name owner, r.owner_user_id "ownerUserId", to_char(r.created_at,'DD.MM.YYYY HH24:MI') "createdAt", to_char(r.updated_at,'DD.MM.YYYY HH24:MI') "updatedAt",
      r.next_action_text "nextAction", to_char(r.next_action_at,'DD.MM.YYYY HH24:MI') "nextActionAt", r.close_reason "closeReason", r.close_comment "closeComment",
      COALESCE(jsonb_agg(jsonb_build_object(
        'id',rr.id,'name',s.name,'count',rr.count_required,'qualification',rr.qualification,'experience',rr.experience_text,
        'salaryTarget',rr.salary_target,'salaryUnit',rr.salary_unit,'scheduleType',rr.schedule_type,'startsAt',rr.starts_at,'endsAt',rr.ends_at,
        'presenceHours',rr.presence_hours,'paidHours',rr.paid_hours,'lunchMinutes',rr.lunch_minutes,'lunchPaid',rr.lunch_paid,
        'nightHours',rr.night_hours,'overtimeRule',rr.overtime_rule,'requirements',rr.requirements_json
      ) ORDER BY rr.created_at) FILTER (WHERE rr.id IS NOT NULL),'[]'::jsonb) roles
    FROM requests r
    LEFT JOIN client_companies c ON c.id=r.client_company_id
    LEFT JOIN regions rg ON rg.id=r.region_id
    LEFT JOIN app_users u ON u.id=r.owner_user_id
    LEFT JOIN request_roles rr ON rr.request_id=r.id
    LEFT JOIN specialties s ON s.id=rr.specialty_id
    GROUP BY r.id,c.name,rg.name,u.display_name
    ORDER BY r.updated_at DESC
  `);
}

export async function getCommercialRequest(actor: Actor, id: string) {
  const request = (await listCommercialRequests(actor)).find((row) => row.id === id);
  if (!request) return null;
  const calculations = actor.access.capabilities.includes("calculation.scenario.read") ? (await listCalculations(actor)).filter((row) => row.requestId === id) : [];
  const proposals = actor.demo
    ? actor.access.capabilities.includes("sales.proposal.read") ? (await listProposals(actor)).filter((row) => row.requestId === id) : []
    : await listRequestProposals(actor, id);
  const approvals = actor.demo ? [] : await listRequestApprovals(actor, id);
  const comments = actor.demo ? [] : await listRequestComments(actor, id);
  const history = actor.demo ? [] : await listRequestHistory(actor, id);
  return { request, calculations, proposals, approvals, comments, history };
}

export async function listRequestApprovals(actor: Actor, requestId: string): Promise<ApprovalRow[]> {
  requireCapability(actor, "calculation.approval.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<ApprovalRow[]>`
    SELECT a.id,a.scenario_id "scenarioId",cs.name scenario,a.status,to_char(a.requested_at,'DD.MM.YYYY HH24:MI') "requestedAt",
      req.display_name "requestedBy", ass.display_name "assignedTo", dec.display_name "decidedBy",to_char(a.decided_at,'DD.MM.YYYY HH24:MI') "decidedAt",a.comment
    FROM calculation_approvals a JOIN calculation_scenarios cs ON cs.id=a.scenario_id
    JOIN app_users req ON req.id=a.requested_by_user_id LEFT JOIN app_users ass ON ass.id=a.assigned_to_user_id LEFT JOIN app_users dec ON dec.id=a.decided_by_user_id
    WHERE a.request_id=${requestId}::uuid ORDER BY a.created_at DESC
  `);
}

export async function listRequestProposals(actor: Actor, requestId: string) {
  requireCapability(actor, "sales.proposal.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<Array<{id:string;requestId:string;request:string;client:string;version:number;status:string;scenarioCount:number;totalValue:number|string;createdAt:string;createdBy:string;proposalNumber:string;validUntil?:string|null;sentAt?:string|null}>>`
    SELECT p.id,p.request_id "requestId",r.title request,COALESCE(c.name,'Не указана') client,p.version,p.status,cardinality(p.scenario_ids)::int "scenarioCount",
      COALESCE(p.total_value,0) "totalValue",to_char(p.created_at,'DD.MM.YYYY') "createdAt",u.display_name "createdBy",p.proposal_number "proposalNumber",
      to_char(p.valid_until,'DD.MM.YYYY') "validUntil",to_char(p.sent_at,'DD.MM.YYYY HH24:MI') "sentAt"
    FROM proposals p JOIN requests r ON r.id=p.request_id LEFT JOIN client_companies c ON c.id=r.client_company_id JOIN app_users u ON u.id=p.created_by_user_id
    WHERE p.request_id=${requestId}::uuid ORDER BY p.version DESC
  `);
}

export async function listRequestComments(actor: Actor, requestId: string): Promise<CommentRow[]> {
  requireCapability(actor, "sales.request.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<CommentRow[]>`
    SELECT c.id,c.entity_type "entityType",c.entity_id "entityId",c.comment_type type,c.body,u.display_name author,
      to_char(c.created_at,'DD.MM.YYYY HH24:MI') "createdAt",c.visibility
    FROM comments c JOIN app_users u ON u.id=c.created_by_user_id
    WHERE (c.entity_type='request' AND c.entity_id=${requestId}::uuid)
       OR (c.entity_type='calculation_scenario' AND c.entity_id IN (
          SELECT cs.id FROM calculation_scenarios cs JOIN calculations calc ON calc.id=cs.calculation_id WHERE calc.request_id=${requestId}::uuid))
       OR (c.entity_type='calculation_approval' AND c.entity_id IN (SELECT id FROM calculation_approvals WHERE request_id=${requestId}::uuid))
       OR (c.entity_type='proposal' AND c.entity_id IN (SELECT id FROM proposals WHERE request_id=${requestId}::uuid))
    ORDER BY c.created_at DESC
  `);
}

export async function listRequestHistory(actor: Actor, requestId: string): Promise<HistoryRow[]> {
  requireCapability(actor, "sales.request.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<HistoryRow[]>`
    SELECT a.id,a.action,COALESCE(u.display_name,'Система') actor,to_char(a.created_at,'DD.MM.YYYY HH24:MI') "createdAt",
      a.resource_type "resourceType",a.before_json before,a.after_json after
    FROM audit_events a LEFT JOIN app_users u ON u.id=a.actor_user_id
    WHERE (a.resource_type='requests' AND a.resource_id=${requestId}::uuid)
       OR (a.resource_type='proposals' AND a.resource_id IN (SELECT id FROM proposals WHERE request_id=${requestId}::uuid))
       OR (a.resource_type='calculation_approvals' AND a.resource_id IN (SELECT id FROM calculation_approvals WHERE request_id=${requestId}::uuid))
       OR (a.resource_type='calculation_scenarios' AND a.resource_id IN (
          SELECT cs.id FROM calculation_scenarios cs JOIN calculations calc ON calc.id=cs.calculation_id WHERE calc.request_id=${requestId}::uuid))
    ORDER BY a.created_at DESC LIMIT 100
  `);
}

function normalizeLegacyStage(status: string) {
  if (status === "calculated") return "calculation";
  if (status === "approved") return "proposal_ready";
  if (status === "accepted") return "accepted";
  return status === "draft" ? "new" : status;
}
