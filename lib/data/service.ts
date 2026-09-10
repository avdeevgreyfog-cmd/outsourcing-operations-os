import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { canReadRow } from "@/lib/core/access.mjs";
import * as demo from "@/lib/demo/data";
import * as demoOrg from "@/lib/demo/organization";

type ScopedRow = {
  id?: string; organizationId: string; createdByUserId?: string; ownerUserId?: string; assigneeUserIds?: string[];
  teamId?: string; regionId?: string; objectId?: string; clientId?: string;
};
export type ClientRow = ScopedRow & { id:string; name:string; legalName?:string|null; status:string; contacts:number; requests:number; objects:number };
export type RequestRoleRow = { name:string; count:number };
export type RequestRow = ScopedRow & { id:string; title:string; client:string; status:string; location:string; start?:string|null; roles:RequestRoleRow[]; schedule?:unknown; housing?:string|null; vat?:string|null };
export type CalculationRow = ScopedRow & { id:string; requestId:string; request:string; role:string; name:string; model:string; status:string; workerNet:number|string; totalCost:number|string; clientRate:number|string; marginPct:number|string; monthlyContribution:number|string };
export type ObjectRow = ScopedRow & { id:string; ownerName?:string|null; sourceRequestId?:string|null; name:string; code:string; client:string; status:string; region:string; targetStart?:string|null; coverage:number; required:number; filled:number; deficit:number; risk?:string|null; revenueForecast?:number|string|null; marginForecast?:number|string|null };
export type NeedRow = ScopedRow & { id:string; objectId:string; object:string; specialty:string; required:number; filled:number; deficit:number; deadline?:string|null; status:string };
export type CandidateRow = ScopedRow & { id:string; fullName:string; phone?:string|null; source?:string|null; stage:string; stageLabel?:string|null; need?:string|null; object?:string|null; objectId:string; nextAction?:string|null };
export type WorkerRow = ScopedRow & { id:string; fullName:string; status:string; source?:string|null; origin?:string|null; originalRecruiter?:string|null; object?:string|null; objectId?:string|null; employment?:string|null; rate:number|string|null; accrued:number|string|null; paid?:number|string|null; payable?:number|string|null };
export type ShiftRow = ScopedRow & { id:string; objectId:string; object:string; date:string; kind:string; time:string; specialty:string; demand:number; assigned:number; reserve:number; confirmed?:number|null; deficit:number; cost:number|string; status:string };
export type TimesheetWorkerRow = { workerId:string; name:string; days?:Record<string,number|null>; total:number|string; client?:number|string|null; night?:number|string|null; overtime?:number|string|null; rate?:number|string|null; accrual?:number|string|null };
export type ReconciliationIssue = { id?:string; difference:number|string; worker:string; date:string; reason:string; owner:string; status?:string };
export type TimesheetData = ScopedRow & { objectId:string; object:string; period:string; clientHours:number; internalHours:number; discrepancy:number; status:string; rows:TimesheetWorkerRow[]; issue:ReconciliationIssue|null };
export type FinanceRow = ScopedRow & { id:string; objectId:string; object:string; revenue:number|string; workerCost:number|string; expenses:number|string; contribution:number|string; marginPct:number|string; planMarginPct?:number|string|null; periodStart?:string|null; periodEnd?:string|null };
export type TaskRow = ScopedRow & { id:string; title:string; status:string; priority:string; due?:string|null; entity?:string|null };
export type AccessUserRow = { id:string; membershipId:string; name:string; email:string|null; role:string; roleCode:string; processRoles:string[]; teams:number; regions:number; scopes:string[]; capabilities:number };
export type AuditRow = { id:string; createdAt:string; actor:string; action:string; record:string; summary?:string|null };
export type ProposalRow = ScopedRow & { id:string; requestId:string; request:string; client:string; version:number; status:string; scenarioCount:number; totalValue:number|string; createdAt:string; createdBy:string };
export type RateReferenceRow = ScopedRow & { id:string; specialty:string; region:string; employmentModel:string; amountMin:number|string; amountMax:number|string; unit:string; grossNet:string; source:string; sourceDate:string; confidence:string; comment?:string|null };
export type LaunchTaskRow = ScopedRow & { id:string; objectId:string; object:string; title:string; level:number; owner:string; start:string; end:string; baselineStart?:string|null; baselineEnd?:string|null; progress:number; status:string; risk:string; milestone:boolean; critical:boolean; dependencyIds:string[] };
export type AccrualRow = ScopedRow & { id:string; workerId:string; worker:string; objectId:string; object:string; period:string; base:number|string; premium:number|string; adjustment:number|string; total:number|string; status:string };
export type PaymentRow = ScopedRow & { id:string; workerId:string; worker:string; objectId?:string|null; object?:string|null; kind:"advance"|"payment"; date?:string|null; amount:number|string; status:string; reference?:string|null };
export type IncidentRow = ScopedRow & { id:string; objectId:string; object:string; title:string; type:string; occurredAt:string; severity:string; status:string; responsible?:string|null; worker?:string|null; description:string };
type TimesheetMeta = ScopedRow & { objectId:string; object:string };
type ClientSnapshot = { hours:number|string|null; status:string };

function allowed<T extends Record<string, unknown>>(actor: Actor, capability: string, rows: T[]): T[] {
  requireCapability(actor, capability);
  return rows.filter((row) => canReadRow(actor.access, capability, row, actor));
}

export async function listClients(actor: Actor): Promise<ClientRow[]> {
  if (actor.demo) return allowed(actor, "sales.client.read", demo.clients);
  requireCapability(actor, "sales.client.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<ClientRow[]>`
      SELECT c.id, c.organization_id "organizationId", c.name, c.legal_name "legalName", c.status,
             c.owner_user_id "ownerUserId", c.created_by_user_id "createdByUserId", c.assigned_team_id "teamId", c.region_id "regionId",
             count(DISTINCT ct.id)::int contacts, count(DISTINCT r.id)::int requests, count(DISTINCT o.id)::int objects
      FROM client_companies c
      LEFT JOIN contacts ct ON ct.client_company_id=c.id
      LEFT JOIN requests r ON r.client_company_id=c.id
      LEFT JOIN objects o ON o.client_company_id=c.id
      GROUP BY c.id
      ORDER BY c.name
    `;
    return rows.filter((row) => canReadRow(actor.access, "sales.client.read", row, actor));
  });
}

export async function listRequests(actor: Actor): Promise<RequestRow[]> {
  if (actor.demo) return allowed(actor, "sales.request.read", demo.requests);
  requireCapability(actor, "sales.request.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<RequestRow[]>`
      SELECT r.id, r.organization_id "organizationId", r.title, r.status, r.location_text location,
             r.region_id "regionId", r.owner_user_id "ownerUserId", r.created_by_user_id "createdByUserId", r.assigned_team_id "teamId",
             r.client_company_id "clientId", c.name client, to_char(r.expected_start_date,'DD.MM.YYYY') start,
             r.schedule_json schedule, r.housing_rule housing, r.vat_mode vat,
             COALESCE(jsonb_agg(jsonb_build_object('name',s.name,'count',rr.count_required)) FILTER (WHERE rr.id IS NOT NULL),'[]'::jsonb) roles
      FROM requests r JOIN client_companies c ON c.id=r.client_company_id
      LEFT JOIN request_roles rr ON rr.request_id=r.id LEFT JOIN specialties s ON s.id=rr.specialty_id
      GROUP BY r.id,c.name ORDER BY r.created_at DESC
    `;
    return rows.filter((row) => canReadRow(actor.access, "sales.request.read", row, actor));
  });
}

export async function listCalculations(actor: Actor): Promise<CalculationRow[]> {
  if (actor.demo) return allowed(actor, "calculation.scenario.read", demo.calculations);
  requireCapability(actor, "calculation.scenario.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<CalculationRow[]>`
      SELECT cs.id, cs.organization_id "organizationId", cs.name, cs.status,
             c.owner_user_id "ownerUserId", cs.created_by_user_id "createdByUserId", r.region_id "regionId", r.assigned_team_id "teamId",
             r.id "requestId", r.title request, s.name role, cm.name model,
             (cs.inputs_snapshot->>'workerNetHourly')::numeric "workerNet",
             (cs.result_snapshot->>'totalCostHourly')::numeric "totalCost",
             (cs.result_snapshot->>'clientRateHourly')::numeric "clientRate",
             (cs.result_snapshot->>'marginPct')::numeric "marginPct",
             (cs.result_snapshot->>'monthlyContribution')::numeric "monthlyContribution"
      FROM calculation_scenarios cs
      JOIN calculations c ON c.id=cs.calculation_id
      JOIN requests r ON r.id=c.request_id
      JOIN request_roles rr ON rr.id=cs.request_role_id
      JOIN specialties s ON s.id=rr.specialty_id
      JOIN calculation_models cm ON cm.id=cs.model_id
      ORDER BY cs.created_at DESC
    `;
    return rows.filter((row) => canReadRow(actor.access, "calculation.scenario.read", row, actor));
  });
}

export async function listObjects(actor: Actor): Promise<ObjectRow[]> {
  if (actor.demo) return allowed(actor, "operations.object.read", demo.objects);
  requireCapability(actor, "operations.object.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<ObjectRow[]>`
      SELECT o.id, o.organization_id "organizationId", o.name, o.code, o.status, o.source_request_id "sourceRequestId", (SELECT u.display_name FROM app_users u WHERE u.id=o.owner_user_id) "ownerName", o.region_id "regionId", rg.name region,
             o.owner_user_id "ownerUserId", o.created_by_user_id "createdByUserId", o.client_company_id "clientId", c.name client,
             to_char(o.target_start_date,'DD.MM') "targetStart",
             COALESCE(sum(n.count_required),0)::int required, COALESCE(sum(n.count_filled),0)::int filled,
             GREATEST(COALESCE(sum(n.count_required-n.count_filled),0),0)::int deficit,
             CASE WHEN COALESCE(sum(n.count_required),0)=0 THEN 100 ELSE round(100.0*sum(n.count_filled)/sum(n.count_required)) END::int coverage,
             ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds"
      FROM objects o JOIN client_companies c ON c.id=o.client_company_id JOIN regions rg ON rg.id=o.region_id
      LEFT JOIN needs n ON n.object_id=o.id
      GROUP BY o.id,c.name,rg.name ORDER BY o.name
    `;
    return rows.filter((row) => canReadRow(actor.access, "operations.object.read", row, actor));
  });
}

export async function listNeeds(actor: Actor): Promise<NeedRow[]> {
  if (actor.demo) return allowed(actor, "operations.need.read", demo.needs);
  requireCapability(actor, "operations.need.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<NeedRow[]>`
      SELECT n.id,n.organization_id "organizationId",n.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",
             s.name specialty,n.count_required required,n.count_filled filled,(n.count_required-n.count_filled) deficit,
             to_char(n.deadline,'DD.MM') deadline,n.status,n.owner_user_id "ownerUserId",n.created_by_user_id "createdByUserId",
             ARRAY(SELECT COALESCE(na.recruiter_user_id::text,'') FROM need_assignments na WHERE na.need_id=n.id AND na.unassigned_at IS NULL)
               || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds"
      FROM needs n JOIN objects o ON o.id=n.object_id JOIN specialties s ON s.id=n.specialty_id ORDER BY n.deadline NULLS LAST
    `;
    return rows.filter((row) => canReadRow(actor.access, "operations.need.read", row, actor));
  });
}

export async function listCandidates(actor: Actor): Promise<CandidateRow[]> {
  if (actor.demo) return allowed(actor, "recruiting.candidate.read", demo.candidates);
  requireCapability(actor, "recruiting.candidate.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<CandidateRow[]>`
      SELECT c.id,c.organization_id "organizationId",c.full_name "fullName",c.phone,c.source,
             ca.stage,ca.next_action_at "nextAction",ca.owner_user_id "ownerUserId",c.created_by_user_id "createdByUserId",
             ca.object_id "objectId",o.client_company_id "clientId",o.region_id "regionId",o.name object,s.name need,
             ARRAY[ca.owner_user_id::text] || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds"
      FROM candidates c JOIN candidate_applications ca ON ca.candidate_id=c.id JOIN needs n ON n.id=ca.need_id
      JOIN specialties s ON s.id=n.specialty_id JOIN objects o ON o.id=ca.object_id ORDER BY ca.updated_at DESC
    `;
    return rows.filter((row) => canReadRow(actor.access, "recruiting.candidate.read", row, actor));
  });
}

export async function listWorkers(actor: Actor): Promise<WorkerRow[]> {
  if (actor.demo) {
    const rows = allowed(actor, "worker.read", demo.workers);
    const maySeeComp = !actor.access.denies.includes("worker.compensation.read") && actor.access.capabilities.includes("worker.compensation.read");
    return rows.map((row) => maySeeComp ? row : { ...row, rate: null, accrued: null, paid: null, payable: null });
  }
  requireCapability(actor, "worker.read");
  const maySeeComp = !actor.access.denies.includes("worker.compensation.read") && actor.access.capabilities.includes("worker.compensation.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<WorkerRow[]>`
      SELECT w.id,w.organization_id "organizationId",w.full_name "fullName",w.status,w.source,w.created_by_user_id "createdByUserId",
             woa.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",woa.manager_user_id "ownerUserId",
             ARRAY[woa.manager_user_id::text] "assigneeUserIds",
             ${maySeeComp ? sql`wr.amount` : sql`NULL::numeric`} rate,
             ${maySeeComp ? sql`COALESCE(wa.total_amount,0)` : sql`NULL::numeric`} accrued
      FROM worker_profiles w
      LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id AND x.effective_to IS NULL ORDER BY x.effective_from DESC LIMIT 1) woa ON true
      LEFT JOIN objects o ON o.id=woa.object_id
      LEFT JOIN LATERAL (SELECT amount FROM worker_rates x WHERE x.worker_id=w.id AND x.effective_to IS NULL ORDER BY x.effective_from DESC LIMIT 1) wr ON true
      LEFT JOIN LATERAL (SELECT total_amount FROM worker_accruals x WHERE x.worker_id=w.id ORDER BY x.period_end DESC LIMIT 1) wa ON true
      ORDER BY w.full_name
    `;
    return rows.filter((row) => canReadRow(actor.access, "worker.read", row, actor));
  });
}

export async function listShifts(actor: Actor): Promise<ShiftRow[]> {
  if (actor.demo) return allowed(actor, "operations.shift.read", demo.shifts);
  requireCapability(actor, "operations.shift.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<ShiftRow[]>`
      SELECT sh.id,sh.organization_id "organizationId",sh.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",
             to_char(sh.shift_date,'DD.MM') date, sh.shift_kind kind, to_char(sh.starts_at,'HH24:MI')||'–'||to_char(sh.ends_at,'HH24:MI') time,
             s.name specialty,sh.demand_count demand,sh.assigned_count assigned,sh.reserve_count reserve,
             (sh.demand_count-sh.assigned_count) deficit,sh.planned_cost cost,sh.status,o.owner_user_id "ownerUserId",sh.created_by_user_id "createdByUserId",
             ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds"
      FROM shifts sh JOIN objects o ON o.id=sh.object_id JOIN specialties s ON s.id=sh.specialty_id ORDER BY sh.shift_date,sh.starts_at
    `;
    return rows.filter((row) => canReadRow(actor.access, "operations.shift.read", row, actor));
  });
}

export async function getTimesheet(actor: Actor): Promise<TimesheetData | null> {
  requireCapability(actor, "time.timesheet.read");
  if (actor.demo) {
    if (!canReadRow(actor.access,"time.timesheet.read",{...demo.timesheet,ownerUserId:"10000000-0000-4000-8000-000000000004",assigneeUserIds:["10000000-0000-4000-8000-000000000004","10000000-0000-4000-8000-000000000003"]},actor)) return null;
    return demo.timesheet;
  }
  // Detailed pivot generation is intentionally server-derived from canonical time_entries.
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [meta] = await sql<TimesheetMeta[]>`SELECT id "objectId",name object,organization_id "organizationId",client_company_id "clientId",region_id "regionId",owner_user_id "ownerUserId" FROM objects ORDER BY created_at DESC LIMIT 1`;
    if (!meta || !canReadRow(actor.access,"time.timesheet.read",meta,actor)) return null;
    const rows = await sql<TimesheetWorkerRow[]>`
      SELECT te.worker_id "workerId",w.full_name name,sum(te.fact_hours)::numeric total,sum(te.night_hours)::numeric night,sum(te.overtime_hours)::numeric overtime
      FROM time_entries te JOIN worker_profiles w ON w.id=te.worker_id WHERE te.object_id=${meta.objectId}::uuid GROUP BY te.worker_id,w.full_name ORDER BY w.full_name
    `;
    const [clientSnap] = await sql<ClientSnapshot[]>`SELECT (snapshot_json->>'hours')::numeric hours,status FROM timesheet_snapshots WHERE object_id=${meta.objectId}::uuid AND view_type='client' ORDER BY period_end DESC LIMIT 1`;
    const internalHours = rows.reduce((sum,row)=>sum+Number(row.total),0);
    const clientHours = Number(clientSnap?.hours ?? internalHours);
    return {...meta,period:"Последний период",clientHours,internalHours,discrepancy:internalHours-clientHours,status:clientSnap?.status ?? "draft",rows,issue:null};
  });
}

export async function listFinance(actor: Actor): Promise<FinanceRow[]> {
  if (actor.demo) return allowed(actor, "finance.pnl.read", demo.financeRows);
  requireCapability(actor, "finance.pnl.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<FinanceRow[]>`
      SELECT p.id,p.organization_id "organizationId",p.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",o.owner_user_id "ownerUserId",
             p.period_start::text "periodStart",p.period_end::text "periodEnd",p.revenue,p.worker_cost "workerCost",p.object_expenses expenses,p.contribution,p.margin_pct "marginPct",
             ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds"
      FROM pnl_snapshots p JOIN objects o ON o.id=p.object_id WHERE p.scenario='fact' ORDER BY p.period_end DESC,p.created_at DESC
    `;
    return rows.filter((row)=>canReadRow(actor.access,"finance.pnl.read",row,actor));
  });
}

export async function listTasks(actor: Actor): Promise<TaskRow[]> {
  if (actor.demo) return allowed(actor, "task.read", demo.tasks);
  requireCapability(actor,"task.read");
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    const rows=await sql<TaskRow[]>`SELECT id,organization_id "organizationId",title,status,priority,assignee_user_id "ownerUserId",ARRAY[assignee_user_id::text] "assigneeUserIds",to_char(due_at,'DD.MM HH24:MI') due,entity_type entity,created_by_user_id "createdByUserId" FROM tasks ORDER BY due_at NULLS LAST`;
    return rows.filter((row)=>canReadRow(actor.access,"task.read",row,actor));
  });
}

export async function getCommandCenter(actor: Actor) {
  const [objectRows, taskRows] = await Promise.all([
    actor.access.capabilities.includes("operations.object.read") ? listObjects(actor) : Promise.resolve([]),
    actor.access.capabilities.includes("task.read") ? listTasks(actor) : Promise.resolve([]),
  ]);
  const needRows = actor.access.capabilities.includes("operations.need.read") ? await listNeeds(actor) : [];
  const candidateRows = actor.access.capabilities.includes("recruiting.candidate.read") ? await listCandidates(actor) : [];
  const requestRows = actor.access.capabilities.includes("sales.request.read") ? await listRequests(actor) : [];
  const financeRows = actor.access.capabilities.includes("finance.pnl.read") ? await listFinance(actor) : [];
  return {
    objects: objectRows,
    tasks: taskRows.filter((x)=>x.status!=="done"),
    needs: needRows,
    candidates: candidateRows,
    requests: requestRows,
    finance: financeRows,
    activity: demo.activity,
  };
}

export async function listAccessUsers(actor: Actor): Promise<AccessUserRow[]> {
  requireCapability(actor, "admin.permissions.manage");
  if (actor.demo) {
    const { demoActors, getDemoActor } = await import("@/lib/demo/access");
    return demoActors().map((u) => {
      const a = getDemoActor(u.code);
      const scopeSet = [...new Set(Object.values(a.access.scopes).flat().map((s) => s.type))];
      const employee=demoOrg.companyEmployees.find(item=>item.userId===a.userId);
      return { id:a.userId, membershipId:`demo-${a.userId}`, name:a.displayName, email:a.email, role:a.positionName??a.roleName, roleCode:a.roleCode, processRoles:employee?.roles.map(item=>item.name)??[], teams:a.teamIds.length, regions:a.regionIds.length, scopes:scopeSet, capabilities:a.access.capabilities.length };
    });
  }
  return withTenant(actor.organizationId,actor.userId,async(sql)=>sql<AccessUserRow[]>`
    SELECT u.id,m.id "membershipId",u.display_name name,u.email,COALESCE(p.name,r.name) role,r.code "roleCode",
      ARRAY(SELECT pr.name FROM membership_process_roles mpr JOIN process_roles pr ON pr.id=mpr.process_role_id WHERE mpr.membership_id=m.id AND (mpr.effective_to IS NULL OR mpr.effective_to>=current_date) ORDER BY pr.name) "processRoles",
      (SELECT count(*)::int FROM membership_teams mt WHERE mt.membership_id=m.id) teams,
      (SELECT count(*)::int FROM membership_regions mr WHERE mr.membership_id=m.id) regions,
      (SELECT count(DISTINCT x.capability)::int FROM (
        SELECT capability FROM permission_grants WHERE role_template_id=m.role_template_id AND effect='allow'
        UNION ALL SELECT capability FROM position_permission_grants WHERE position_id=m.position_id AND effect='allow'
        UNION ALL SELECT g.capability FROM membership_process_roles mr JOIN process_role_permission_grants g ON g.process_role_id=mr.process_role_id WHERE mr.membership_id=m.id AND g.effect='allow'
      ) x) capabilities,
      ARRAY(SELECT DISTINCT x.scope_type FROM (
        SELECT scope_type FROM permission_grants WHERE role_template_id=m.role_template_id AND effect='allow'
        UNION ALL SELECT scope_type FROM position_permission_grants WHERE position_id=m.position_id AND effect='allow'
        UNION ALL SELECT g.scope_type FROM membership_process_roles mr JOIN process_role_permission_grants g ON g.process_role_id=mr.process_role_id WHERE mr.membership_id=m.id AND g.effect='allow'
      ) x) scopes
    FROM organization_memberships m JOIN app_users u ON u.id=m.user_id JOIN role_templates r ON r.id=m.role_template_id LEFT JOIN positions p ON p.id=m.position_id
    WHERE m.organization_id=${actor.organizationId}::uuid ORDER BY u.display_name
  `);
}

export async function listAudit(actor: Actor, limit=20): Promise<AuditRow[]> {
  requireCapability(actor, "audit.read");
  if (actor.demo) return [
    {id:"a1",createdAt:"30.08 · 12:12",actor:"Анна Лебедева",action:"Предпросмотр прав",record:"Финансы",summary:"Проверка системы глазами пользователя"},
    {id:"a2",createdAt:"29.08 · 18:05",actor:"Елена Котова",action:"Принят расчёт",record:"РЦ Север · Комплектовщик",summary:"Зафиксирована принятая версия сценария"},
    {id:"a3",createdAt:"29.08 · 16:44",actor:"Алексей Волков",action:"Изменён факт времени",record:"Сергей Волков · 27.08",summary:"Исправлен факт с указанием причины"},
  ];
  return withTenant(actor.organizationId,actor.userId,async(sql)=>sql<AuditRow[]>`
    SELECT a.id,to_char(a.created_at,'DD.MM HH24:MI') "createdAt",COALESCE(u.display_name,'System') actor,a.action,a.resource_type||' · '||COALESCE(a.resource_id::text,'—') record,a.reason summary
    FROM audit_events a LEFT JOIN app_users u ON u.id=a.actor_user_id
    ORDER BY a.created_at DESC LIMIT ${limit}
  `);
}

export async function listProposals(actor: Actor): Promise<ProposalRow[]> { if(actor.demo)return allowed(actor,"sales.request.read",demo.proposals);requireCapability(actor,"sales.request.read");return withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<ProposalRow[]>`SELECT p.id,p.organization_id "organizationId",p.request_id "requestId",r.title request,c.name client,r.client_company_id "clientId",r.region_id "regionId",r.owner_user_id "ownerUserId",r.created_by_user_id "createdByUserId",r.assigned_team_id "teamId",p.version,p.status,cardinality(p.scenario_ids)::int "scenarioCount",COALESCE(p.total_value,0) "totalValue",to_char(p.created_at,'DD.MM.YYYY') "createdAt",u.display_name "createdBy" FROM proposals p JOIN requests r ON r.id=p.request_id JOIN client_companies c ON c.id=r.client_company_id JOIN app_users u ON u.id=p.created_by_user_id ORDER BY p.created_at DESC`;return rows.filter(row=>canReadRow(actor.access,"sales.request.read",row,actor))}) }
export async function listRateReferences(actor: Actor): Promise<RateReferenceRow[]> { if(actor.demo)return allowed(actor,"calculation.rate_reference.read",demo.rateReferences);requireCapability(actor,"calculation.rate_reference.read");return withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<RateReferenceRow[]>`SELECT rr.id,rr.organization_id "organizationId",s.name specialty,rg.name region,rr.region_id "regionId",rr.employment_model "employmentModel",rr.amount_min "amountMin",rr.amount_max "amountMax",rr.unit,rr.gross_net "grossNet",rr.source,COALESCE(to_char(rr.source_date,'DD.MM.YYYY'),'—') "sourceDate",rr.confidence,rr.comment,rr.created_by_user_id "createdByUserId" FROM rate_reference_entries rr JOIN specialties s ON s.id=rr.specialty_id JOIN regions rg ON rg.id=rr.region_id ORDER BY rr.source_date DESC NULLS LAST`;return rows.filter(row=>canReadRow(actor.access,"calculation.rate_reference.read",row,actor))}) }
export async function listLaunchTasks(actor: Actor): Promise<LaunchTaskRow[]> { if(actor.demo)return allowed(actor,"operations.object.read",demo.launchTasks);requireCapability(actor,"operations.object.read");return withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<LaunchTaskRow[]>`SELECT t.id,t.organization_id "organizationId",l.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",t.title,CASE WHEN t.parent_task_id IS NULL THEN 0 ELSE 1 END level,COALESCE(u.display_name,'—') owner,to_char(t.start_date,'DD.MM') start,to_char(t.end_date,'DD.MM') "end",to_char(t.baseline_start,'DD.MM') "baselineStart",to_char(t.baseline_end,'DD.MM') "baselineEnd",t.progress_pct progress,t.status,t.risk_level risk,t.is_milestone milestone,t.is_critical critical,t.owner_user_id "ownerUserId",t.created_by_user_id "createdByUserId",ARRAY(SELECT d.predecessor_task_id::text FROM launch_task_dependencies d WHERE d.successor_task_id=t.id) "dependencyIds",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds" FROM launch_tasks t JOIN launches l ON l.id=t.launch_id JOIN objects o ON o.id=l.object_id LEFT JOIN app_users u ON u.id=t.owner_user_id ORDER BY t.start_date,t.created_at`;return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor))}) }
export async function listAccruals(actor: Actor): Promise<AccrualRow[]> { if(actor.demo){const rows=allowed(actor,"finance.worker_accrual.read",demo.workers);return rows.map((x,index)=>({id:`acc-${index}`,organizationId:x.organizationId,workerId:x.id,worker:x.fullName,objectId:x.objectId!,object:x.object??"—",clientId:x.clientId,regionId:x.regionId,ownerUserId:x.ownerUserId,assigneeUserIds:x.assigneeUserIds,period:"16–31.08.2026",base:Number(x.accrued??0),premium:0,adjustment:0,total:Number(x.accrued??0),status:"approved"}))}requireCapability(actor,"finance.worker_accrual.read");return withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<AccrualRow[]>`SELECT a.id,a.organization_id "organizationId",a.worker_id "workerId",w.full_name worker,a.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",o.owner_user_id "ownerUserId",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds",to_char(a.period_start,'DD.MM')||'–'||to_char(a.period_end,'DD.MM.YYYY') period,a.base_amount base,a.premium_amount premium,a.adjustment_amount adjustment,a.total_amount total,a.status,a.created_by_user_id "createdByUserId" FROM worker_accruals a JOIN worker_profiles w ON w.id=a.worker_id JOIN objects o ON o.id=a.object_id ORDER BY a.period_end DESC,w.full_name`;return rows.filter(row=>canReadRow(actor.access,"finance.worker_accrual.read",row,actor))}) }
export async function listPayments(actor: Actor): Promise<PaymentRow[]> { if(actor.demo){const rows=allowed(actor,"finance.payments.read",demo.workers);return rows.flatMap((x,index)=>[{id:`adv-${index}`,organizationId:x.organizationId,workerId:x.id,worker:x.fullName,objectId:x.objectId,object:x.object,clientId:x.clientId,regionId:x.regionId,ownerUserId:x.ownerUserId,assigneeUserIds:x.assigneeUserIds,kind:"advance" as const,date:"25.08.2026",amount:Number(x.paid??0),status:"paid",reference:"DEMO"},{id:`pay-${index}`,organizationId:x.organizationId,workerId:x.id,worker:x.fullName,objectId:x.objectId,object:x.object,clientId:x.clientId,regionId:x.regionId,ownerUserId:x.ownerUserId,assigneeUserIds:x.assigneeUserIds,kind:"payment" as const,date:"05.09.2026",amount:Number(x.payable??0),status:"planned",reference:"DEMO"}])}requireCapability(actor,"finance.payments.read");return withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<PaymentRow[]>`SELECT p.id,p.organization_id "organizationId",p.worker_id "workerId",w.full_name worker,p.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",o.owner_user_id "ownerUserId",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds",'payment'::text kind,to_char(p.payment_date,'DD.MM.YYYY') date,p.amount,p.status,p.reference,p.created_by_user_id "createdByUserId" FROM worker_payments p JOIN worker_profiles w ON w.id=p.worker_id LEFT JOIN objects o ON o.id=p.object_id UNION ALL SELECT a.id,a.organization_id,a.worker_id,w.full_name,a.object_id,o.name,o.client_company_id,o.region_id,o.owner_user_id,ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL),'advance',to_char(a.payment_date,'DD.MM.YYYY'),a.amount,a.status,a.reference,a.created_by_user_id FROM advance_payments a JOIN worker_profiles w ON w.id=a.worker_id LEFT JOIN objects o ON o.id=a.object_id ORDER BY date DESC`;return rows.filter(row=>canReadRow(actor.access,"finance.payments.read",row,actor))}) }
export async function listIncidents(actor: Actor): Promise<IncidentRow[]> { if(actor.demo)return allowed(actor,"operations.object.read",demo.incidents);requireCapability(actor,"operations.object.read");return withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<IncidentRow[]>`SELECT i.id,i.organization_id "organizationId",i.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",i.title,i.incident_type type,to_char(i.occurred_at,'DD.MM HH24:MI') "occurredAt",i.severity,i.status,u.display_name responsible,w.full_name worker,i.description,i.responsible_user_id "ownerUserId",i.created_by_user_id "createdByUserId",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds" FROM incidents i JOIN objects o ON o.id=i.object_id LEFT JOIN app_users u ON u.id=i.responsible_user_id LEFT JOIN worker_profiles w ON w.id=i.worker_id ORDER BY i.occurred_at DESC`;return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor))}) }
