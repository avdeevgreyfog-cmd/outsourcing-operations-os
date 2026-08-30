import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { canReadRow } from "@/lib/core/access.mjs";
import * as demo from "@/lib/demo/data";

type ScopedRow = {
  id?: string; organizationId: string; createdByUserId?: string; ownerUserId?: string; assigneeUserIds?: string[];
  teamId?: string; regionId?: string; objectId?: string; clientId?: string;
};
export type ClientRow = ScopedRow & { id:string; name:string; legalName?:string|null; status:string; contacts:number; requests:number; objects:number };
export type RequestRoleRow = { name:string; count:number };
export type RequestRow = ScopedRow & { id:string; title:string; client:string; status:string; location:string; start?:string|null; roles:RequestRoleRow[]; schedule?:unknown; housing?:string|null; vat?:string|null };
export type CalculationRow = ScopedRow & { id:string; requestId:string; request:string; role:string; name:string; model:string; status:string; workerNet:number|string; totalCost:number|string; clientRate:number|string; marginPct:number|string; monthlyContribution:number|string };
export type ObjectRow = ScopedRow & { id:string; name:string; code:string; client:string; status:string; region:string; targetStart?:string|null; coverage:number; required:number; filled:number; deficit:number; risk?:string|null; revenueForecast?:number|string|null; marginForecast?:number|string|null };
export type NeedRow = ScopedRow & { id:string; objectId:string; object:string; specialty:string; required:number; filled:number; deficit:number; deadline?:string|null; status:string };
export type CandidateRow = ScopedRow & { id:string; fullName:string; phone?:string|null; source?:string|null; stage:string; stageLabel?:string|null; need?:string|null; object?:string|null; objectId:string; nextAction?:string|null };
export type WorkerRow = ScopedRow & { id:string; fullName:string; status:string; source?:string|null; origin?:string|null; originalRecruiter?:string|null; object?:string|null; objectId?:string|null; employment?:string|null; rate:number|string|null; accrued:number|string|null; paid?:number|string|null; payable?:number|string|null };
export type ShiftRow = ScopedRow & { id:string; objectId:string; object:string; date:string; kind:string; time:string; specialty:string; demand:number; assigned:number; reserve:number; confirmed?:number|null; deficit:number; cost:number|string; status:string };
export type TimesheetWorkerRow = { workerId:string; name:string; days?:Record<string,number|null>; total:number|string; client?:number|string|null; night?:number|string|null; overtime?:number|string|null; rate?:number|string|null; accrual?:number|string|null };
export type ReconciliationIssue = { id?:string; difference:number|string; worker:string; date:string; reason:string; owner:string; status?:string };
export type TimesheetData = ScopedRow & { objectId:string; object:string; period:string; clientHours:number; internalHours:number; discrepancy:number; status:string; rows:TimesheetWorkerRow[]; issue:ReconciliationIssue|null };
export type FinanceRow = ScopedRow & { id:string; objectId:string; object:string; revenue:number|string; workerCost:number|string; expenses:number|string; contribution:number|string; marginPct:number|string; planMarginPct?:number|string|null };
export type TaskRow = ScopedRow & { id:string; title:string; status:string; priority:string; due?:string|null; entity?:string|null };
export type AccessUserRow = { id:string; name:string; email:string|null; role:string; roleCode:string; teams:number; regions:number; scopes:string[]; capabilities:number };
export type AuditRow = { id:string; createdAt:string; actor:string; action:string; record:string; summary?:string|null };
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
      SELECT o.id, o.organization_id "organizationId", o.name, o.code, o.status, o.region_id "regionId", rg.name region,
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
             p.revenue,p.worker_cost "workerCost",p.object_expenses expenses,p.contribution,p.margin_pct "marginPct",
             ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds"
      FROM pnl_snapshots p JOIN objects o ON o.id=p.object_id WHERE p.scenario='fact' ORDER BY p.period_end DESC
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
      return { id:a.userId, name:a.displayName, email:a.email, role:a.roleName, roleCode:a.roleCode, teams:a.teamIds.length, regions:a.regionIds.length, scopes:scopeSet, capabilities:a.access.capabilities.length };
    });
  }
  return withTenant(actor.organizationId,actor.userId,async(sql)=>sql<AccessUserRow[]>`
    SELECT u.id,u.display_name name,u.email,r.name role,r.code "roleCode",
      (SELECT count(*)::int FROM membership_teams mt WHERE mt.membership_id=m.id) teams,
      (SELECT count(*)::int FROM membership_regions mr WHERE mr.membership_id=m.id) regions,
      (SELECT count(*)::int FROM permission_grants pg WHERE pg.role_template_id=m.role_template_id AND pg.effect='allow') capabilities,
      ARRAY(SELECT DISTINCT pg.scope_type FROM permission_grants pg WHERE pg.role_template_id=m.role_template_id AND pg.effect='allow') scopes
    FROM organization_memberships m JOIN app_users u ON u.id=m.user_id JOIN role_templates r ON r.id=m.role_template_id
    WHERE m.organization_id=${actor.organizationId}::uuid ORDER BY u.display_name
  `);
}

export async function listAudit(actor: Actor, limit=20): Promise<AuditRow[]> {
  requireCapability(actor, "audit.read");
  if (actor.demo) return [
    {id:"a1",createdAt:"30.08 · 12:12",actor:"Анна Лебедева",action:"permission.preview",record:"Finance",summary:"Preview системы глазами пользователя"},
    {id:"a2",createdAt:"29.08 · 18:05",actor:"Елена Котова",action:"calculation.accept",record:"РЦ Север · Комплектовщик",summary:"Зафиксирован accepted scenario snapshot"},
    {id:"a3",createdAt:"29.08 · 16:44",actor:"Алексей Волков",action:"time_entry.update",record:"Сергей Волков · 27.08",summary:"Исправлен факт с указанием причины"},
  ];
  return withTenant(actor.organizationId,actor.userId,async(sql)=>sql<AuditRow[]>`
    SELECT a.id,to_char(a.created_at,'DD.MM HH24:MI') "createdAt",COALESCE(u.display_name,'System') actor,a.action,a.resource_type||' · '||COALESCE(a.resource_id::text,'—') record,a.reason summary
    FROM audit_events a LEFT JOIN app_users u ON u.id=a.actor_user_id
    ORDER BY a.created_at DESC LIMIT ${limit}
  `);
}
