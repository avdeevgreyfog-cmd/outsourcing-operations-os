import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { canReadRow } from "@/lib/core/access.mjs";
import * as demo from "@/lib/demo/data";
import * as demoOrg from "@/lib/demo/organization";
import { OWNER_SYSTEM_CAPABILITIES } from "@/lib/access/system";

type ScopedRow = {
  id?: string; organizationId: string; createdByUserId?: string; ownerUserId?: string; assigneeUserIds?: string[];
  teamId?: string; orgUnitId?: string; regionId?: string; objectId?: string; clientId?: string;
};
export type ClientRow = ScopedRow & { id:string; name:string; legalName?:string|null; status:string; contacts:number; requests:number; objects:number };
export type ClientContactRow = ScopedRow & { id:string; clientId:string; fullName:string; position?:string|null; phone?:string|null; email?:string|null; telegram?:string|null; whatsapp?:string|null; maxContact?:string|null; preferredChannel?:string|null; objectAssignments:{objectId:string;object:string;roles:string[]}[] };
export type RequestRoleRow = { name:string; count:number };
export type RequestRow = ScopedRow & { id:string; title:string; client:string; status:string; location:string; start?:string|null; roles:RequestRoleRow[]; schedule?:unknown; housing?:string|null; vat?:string|null };
export type CalculationRow = ScopedRow & { id:string; requestId:string; request:string; role:string; name:string; model:string; status:string; workerNet:number|string; totalCost:number|string; clientRate:number|string; marginPct:number|string; monthlyContribution:number|string };
export type ObjectPersonRow = { userId:string; name:string };
export type ObjectRiskReason = { code:string; label:string; detail:string };
export type ObjectRow = ScopedRow & { id:string; objectId?:string; ownerName?:string|null; sourceRequestId?:string|null; sourceProposalId?:string|null; name:string; code:string; client:string; status:string; region:string; address?:string|null; targetStart?:string|null; legalEntityId?:string|null; legalEntity?:string|null; additionalManagers?:ObjectPersonRow[]; recruitingMode?:"company_rules"|"object_team"; recruitingTeam?:ObjectPersonRow[]; activeRecruiters?:ObjectPersonRow[]; unassignedNeedCount?:number; defaultTransitionDays?:number; defaultDailyPaymentShifts?:number; defaultScheduleWorkDays?:number|null; defaultScheduleRestDays?:number|null; defaultShiftKind?:"day"|"night"|"mixed"; ppeTaskEnabled?:boolean; ppeTaskDueDays?:number|null; coverage:number; required:number; filled:number; deficit:number; risk?:string|null; riskReasons?:ObjectRiskReason[]; attentionReasons?:string[]; revenueForecast?:number|string|null; marginForecast?:number|string|null };
export type NeedRow = ScopedRow & { id:string; objectId:string; object:string; specialty:string; required:number; filled:number; deficit:number; deadline?:string|null; status:string };
export type CandidateRow = ScopedRow & { id:string; fullName:string; phone?:string|null; source?:string|null; stage:string; stageLabel?:string|null; need?:string|null; object?:string|null; objectId:string; nextAction?:string|null };
export type WorkerRow = ScopedRow & { id:string; originCandidateId?:string|null; fullName:string; phone?:string|null; status:string; source?:string|null; origin?:string|null; originalRecruiter?:string|null; managerName?:string|null; object?:string|null; objectId?:string|null; specialty?:string|null; specialtyId?:string|null; startDate?:string|null; employment?:string|null; employmentDocumentsStatus?:string|null; workMode?:string|null; paidHoursPerShift?:number|string|null; scheduleWorkDays?:number|null; scheduleRestDays?:number|null; scheduleShiftKind?:"day"|"night"|"mixed"|null; scheduleAnchorDate?:string|null; transitionDays?:number|null; dailyPaymentShifts?:number|null; clothingSize?:string|null; shoeSize?:string|null; heightCm?:number|null; issuedAssetCount?:number; issuedAssetNames?:string[]; ppeRequiredCount?:number; ppeIssuedCount?:number; ppeMissingNames?:string[]; absenceType?:string|null; absenceStatus?:string|null; absenceFrom?:string|null; absenceTo?:string|null; todayTimeCode?:string|null; todayFactHours?:number|string|null; todayEntrySource?:string|null; todayShiftAssigned?:boolean|null; todayShiftConfirmed?:boolean|null; todayShiftReserve?:boolean|null; todayShiftTime?:string|null; todayAttendanceEvent?:string|null; rate:number|string|null; rateUnit?:string|null; dayRate?:number|string|null; nightRate?:number|string|null; accrued:number|string|null; paid?:number|string|null; payable?:number|string|null };
export type ShiftRow = ScopedRow & { id:string; objectId:string; object:string; specialtyId:string; date:string; dateIso?:string|null; kind:string; time:string; specialty:string; demand:number; assigned:number; reserve:number; confirmed?:number|null; deficit:number; cost:number|string; status:string; workerIds:string[]; reserveWorkerIds:string[] };
export type TimesheetCellValue = number|string|null;
export type TimesheetWorkerRow = { workerId:string; name:string; rowKind?:"worker"|"candidate"; candidateId?:string|null; applicationId?:string|null; specialty?:string|null; effectiveFrom?:string|null; effectiveTo?:string|null; days?:Record<string,TimesheetCellValue>; dayCells?:Record<string,TimesheetCellValue>; nightCells?:Record<string,TimesheetCellValue>; plannedShiftKinds?:Record<string,"day"|"night"|"mixed">; plannedHours?:number|null; total:number|string; dayHours?:number|string|null; night?:number|string|null; overtime?:number|string|null; rate?:number|string|null; dayRate?:number|string|null; nightRate?:number|string|null; accrual?:number|string|null };
export type ReconciliationIssue = { id?:string; difference:number|string; worker:string; date:string; reason:string; owner:string; status?:string };
export type TimesheetSnapshotMeta = { id:string; status:string; version:number; hours:number; comment:string|null; createdAt:string };
export type TimesheetData = ScopedRow & { objectId:string; object:string; period:string; month:string; periodStart:string; periodEnd:string; clientHours:number; internalHours:number; discrepancy:number; status:string; rows:TimesheetWorkerRow[]; issue:ReconciliationIssue|null; internalSnapshot:TimesheetSnapshotMeta|null; clientSnapshot:TimesheetSnapshotMeta|null };
export type FinanceRow = ScopedRow & { id:string; objectId:string; object:string; revenue:number|string; workerCost:number|string; expenses:number|string; contribution:number|string; marginPct:number|string; planMarginPct?:number|string|null; periodStart?:string|null; periodEnd?:string|null };
export type TaskRow = ScopedRow & { id:string; title:string; status:string; priority:string; due?:string|null; entity?:string|null };
export type AccessUserRow = { id:string; membershipId:string; name:string; email:string|null; role:string; roleCode:string; processRoles:string[]; teams:number; regions:number; scopes:string[]; capabilities:number; systemCapabilities:string[]; isOwner:boolean };
export type AuditRow = { id:string; createdAt:string; actor:string; action:string; record:string; summary?:string|null };
export type ProposalRow = ScopedRow & { id:string; requestId:string; request:string; client:string; version:number; status:string; scenarioCount:number; totalValue:number|string; createdAt:string; createdBy:string };
export type RateReferenceRow = ScopedRow & { id:string; specialty:string; region:string; employmentModel:string; amountMin:number|string; amountMax:number|string; unit:string; grossNet:string; source:string; sourceDate:string; confidence:string; comment?:string|null };
export type LaunchTaskRow = ScopedRow & { id:string; launchId?:string|null; objectId:string; object:string; title:string; level:number; owner:string; start:string; end:string; startDate?:string|null; endDate?:string|null; baselineStart?:string|null; baselineEnd?:string|null; baselineStartDate?:string|null; baselineEndDate?:string|null; progress:number; status:string; risk:string; milestone:boolean; critical:boolean; dependencyIds:string[]; launchTarget?:string|null; launchForecast?:string|null; launchProgress?:number|null; launchRisk?:string|null };
export type AccrualRow = ScopedRow & { id:string; workerId:string; worker:string; objectId:string; object:string; period:string; periodStart?:string|null; periodEnd?:string|null; base:number|string; premium:number|string; adjustment:number|string; total:number|string; status:string };
export type PaymentRow = ScopedRow & { id:string; workerId:string; worker:string; objectId?:string|null; object?:string|null; kind:"advance"|"payment"; purpose?:"advance"|"daily_shift"|"other"|null; workDate?:string|null; date?:string|null; dateIso?:string|null; amount:number|string; status:string; reference?:string|null };
export type IncidentRow = ScopedRow & { id:string; objectId:string; object:string; title:string; type:string; occurredAt:string; occurredAtIso?:string|null; severity:string; status:string; responsibleUserId?:string|null; responsible?:string|null; workerId?:string|null; worker?:string|null; description:string; resolution?:string|null; financialEffectAmount?:number|string|null; financialEffectStatus?:"none"|"proposed"|"approved"|"rejected"|"applied"; financialEffectBasis?:string|null };
type TimesheetMeta = ScopedRow & { objectId:string; object:string };
type SnapshotMetaRow = { id:string; hours:number|string|null; status:string; version:number; comment:string|null; createdAt:string };

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

export async function listClientContacts(actor: Actor, clientId: string): Promise<ClientContactRow[]> {
  requireCapability(actor, "sales.client.read");
  if (actor.demo) {
    const client = demo.clients.find(row => row.id === clientId && canReadRow(actor.access, "sales.client.read", row, actor));
    if (!client) return [];
    const visibleObjects=demo.objects.filter(row=>row.clientId===clientId&&canReadRow(actor.access,"operations.object.read",row,actor));
    return demo.clientContacts.filter(contact=>contact.clientId===clientId).map(contact=>({
      ...contact,organizationId:actor.organizationId,clientId,
      objectAssignments:demo.objectContactAssignments.filter(link=>link.contactId===contact.id&&visibleObjects.some(object=>object.id===link.objectId)).map(link=>({
        objectId:link.objectId,object:visibleObjects.find(object=>object.id===link.objectId)?.name??"Объект",roles:link.roles,
      })),
    }));
  }
  return withTenant(actor.organizationId, actor.userId, async sql => {
    const [client] = await sql<Array<{id:string;organizationId:string;ownerUserId:string|null;regionId:string|null;teamId:string|null}>>`
      SELECT id,organization_id "organizationId",owner_user_id "ownerUserId",region_id "regionId",assigned_team_id "teamId"
      FROM client_companies WHERE id=${clientId}::uuid
    `;
    if(!client||!canReadRow(actor.access,"sales.client.read",{...client,clientId:client.id},actor))return [];
    const rows=await sql<ClientContactRow[]>`
      SELECT c.id,c.organization_id "organizationId",c.client_company_id "clientId",c.full_name "fullName",c.position,c.phone,c.email,
        c.telegram,c.whatsapp,c.max_contact "maxContact",c.communication_preference "preferredChannel",
        COALESCE(jsonb_agg(jsonb_build_object('objectId',o.id,'object',o.name,'roles',oca.roles) ORDER BY o.name)
          FILTER (WHERE oca.id IS NOT NULL AND oca.active),'[]'::jsonb) "objectAssignments"
      FROM contacts c
      LEFT JOIN object_contact_assignments oca ON oca.contact_id=c.id AND oca.active
      LEFT JOIN objects o ON o.id=oca.object_id
      WHERE c.client_company_id=${clientId}::uuid
      GROUP BY c.id
      ORDER BY c.full_name
    `;
    const objectScopes=await sql<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;clientId:string;assigneeUserIds:string[]}>>`
      SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",o.client_company_id "clientId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects o WHERE o.client_company_id=${clientId}::uuid
    `;
    const visibleObjectIds=new Set(objectScopes.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor)).map(row=>row.objectId));
    return rows.map(row=>({...row,objectAssignments:row.objectAssignments.filter(item=>visibleObjectIds.has(item.objectId))}));
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
  if (actor.demo) {
    const employeeNames=new Map(demoOrg.companyEmployees.map(item=>[item.userId,item.name]));
    const person=(userId:string)=>({userId,name:employeeNames.get(userId)??"Сотрудник"});
    const extraManagers:Record<string,string[]>={
      "80000000-0000-4000-8000-000000000001":["10000000-0000-4000-8000-000000000010"],
      "80000000-0000-4000-8000-000000000002":["10000000-0000-4000-8000-000000000004"],
    };
    const fixedRecruiters:Record<string,string[]>={
      "80000000-0000-4000-8000-000000000001":["10000000-0000-4000-8000-000000000012","10000000-0000-4000-8000-000000000013"],
      "80000000-0000-4000-8000-000000000004":["10000000-0000-4000-8000-000000000012","10000000-0000-4000-8000-000000000014"],
    };
    const entities=demoOrg.companyProfile.legalEntities;
    const rows=demo.objects.map((row,index)=>{
      const additionalIds=extraManagers[row.id]??[];
      const recruitingIds=fixedRecruiters[row.id]??[];
      const activeRecruiterIds=[...new Set(demo.needs.filter(need=>need.objectId===row.id&&need.ownerUserId).map(need=>need.ownerUserId as string))];
      const entity=entities[index%Math.max(entities.length,1)]??null;
      return {
        ...row,
        legalEntityId:entity?.id??null,
        legalEntity:entity?.shortName??entity?.name??null,
        additionalManagers:additionalIds.map(person),
        recruitingMode:recruitingIds.length?"object_team" as const:"company_rules" as const,
        recruitingTeam:recruitingIds.map(person),
        activeRecruiters:activeRecruiterIds.map(person),
        unassignedNeedCount:0,
        defaultTransitionDays:7,defaultDailyPaymentShifts:index===0?3:0,
        defaultScheduleWorkDays:index===0?5:null,defaultScheduleRestDays:index===0?2:null,defaultShiftKind:index===0?"mixed" as const:"day" as const,
        ppeTaskEnabled:true,ppeTaskDueDays:null,
        assigneeUserIds:[...new Set([...(row.assigneeUserIds??[]),...additionalIds,...recruitingIds])],
        coverage:Number(row.required)>0?Math.round(Number(row.filled)/Number(row.required)*100):0,
      };
    });
    return allowed(actor, "operations.object.read", rows);
  }
  requireCapability(actor, "operations.object.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<ObjectRow[]>`
      SELECT o.id, o.id "objectId", o.organization_id "organizationId", o.name, o.code, o.status, o.source_request_id "sourceRequestId",o.source_proposal_id "sourceProposalId",
             owner.display_name "ownerName",
             o.region_id "regionId", rg.name region,o.address_text address,o.owner_user_id "ownerUserId",o.created_by_user_id "createdByUserId",
             o.client_company_id "clientId",c.name client,to_char(o.target_start_date,'DD.MM') "targetStart",
             o.legal_entity_id "legalEntityId",COALESCE(le.short_name,le.name) "legalEntity",
             o.recruiting_routing_mode "recruitingMode",
             o.default_transition_days "defaultTransitionDays",o.default_daily_payment_shifts "defaultDailyPaymentShifts",
             o.default_schedule_work_days "defaultScheduleWorkDays",o.default_schedule_rest_days "defaultScheduleRestDays",
             o.default_shift_kind "defaultShiftKind",o.ppe_task_enabled "ppeTaskEnabled",o.ppe_task_due_days "ppeTaskDueDays",
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object('userId',oa.user_id,'name',u.display_name) ORDER BY u.display_name)
               FROM object_assignments oa JOIN app_users u ON u.id=oa.user_id
               WHERE oa.object_id=o.id AND oa.responsibility_type='additional_manager'
                 AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)
             ),'[]'::jsonb) "additionalManagers",
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object('userId',oa.user_id,'name',u.display_name) ORDER BY u.display_name)
               FROM object_assignments oa JOIN app_users u ON u.id=oa.user_id
               WHERE oa.object_id=o.id AND oa.responsibility_type='recruiter'
                 AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)
             ),'[]'::jsonb) "recruitingTeam",
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object('userId',x.user_id,'name',u.display_name) ORDER BY u.display_name)
               FROM (
                 SELECT DISTINCT na.recruiter_user_id user_id
                 FROM needs n
                 JOIN need_assignments na ON na.need_id=n.id
                 WHERE n.object_id=o.id AND n.status IN ('open','in_progress','paused')
                   AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL
               ) x JOIN app_users u ON u.id=x.user_id
             ),'[]'::jsonb) "activeRecruiters",
             (
               SELECT count(*)::int FROM needs n
               WHERE n.object_id=o.id AND n.status IN ('open','in_progress','paused')
                 AND NOT EXISTS (
                   SELECT 1 FROM need_assignments na
                   WHERE na.need_id=n.id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL
                 )
             ) "unassignedNeedCount",
             COALESCE(needs.required,0)::int required,COALESCE(workforce.working,0)::int filled,
             GREATEST(COALESCE(needs.required,0)-COALESCE(workforce.working,0),0)::int deficit,
             CASE WHEN COALESCE(needs.required,0)=0 THEN 0 ELSE round(100.0*COALESCE(workforce.working,0)/needs.required) END::int coverage,
             CASE
               WHEN COALESCE(needs.required,0)>0 AND COALESCE(workforce.working,0)*100.0/needs.required<60 THEN 'critical'
               WHEN COALESCE(needs.required,0)>0 AND COALESCE(workforce.working,0)*100.0/needs.required<80 THEN 'high'
               WHEN COALESCE(needs.required,0)>0 AND COALESCE(workforce.working,0)*100.0/needs.required<95 THEN 'watch'
               ELSE 'normal'
             END risk,
             ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects o
      JOIN client_companies c ON c.id=o.client_company_id
      JOIN regions rg ON rg.id=o.region_id
      LEFT JOIN legal_entities le ON le.id=o.legal_entity_id
      LEFT JOIN app_users owner ON owner.id=o.owner_user_id
      LEFT JOIN LATERAL (
        SELECT COALESCE(sum(n.count_required),0)::int required
        FROM needs n WHERE n.object_id=o.id AND n.source_kind<>'replacement' AND n.status NOT IN ('cancelled','archived')
      ) needs ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT a.worker_id)::int working
        FROM worker_object_assignments a
        JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
        WHERE a.object_id=o.id AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
      ) workforce ON true
      ORDER BY o.name
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
    const today=new Date().toISOString().slice(0,10);
    return rows.map((row,index) => {
      const activeAbsence=row.absenceStatus==="confirmed"&&row.absenceFrom&&row.absenceFrom<=today&&(!row.absenceTo||row.absenceTo>=today);
      const absenceCode=({intershift:"INTERSHIFT",vacation:"VACATION",sick:"SICK",personal:"ABSENCE",other:"ABSENCE"} as Record<string,string>)[row.absenceType??""];
      const simulatedCode=activeAbsence?absenceCode:index%13===7?"NO_SHOW":index%7===3?"DAY_OFF":"WORK";
      const enriched={
        ...row,
        phone:(row as WorkerRow).phone??`+7 900 300-${String(index+1).padStart(2,"0")}-${String(11+(index%89)).padStart(2,"0")}`,
        todayTimeCode:simulatedCode,
        todayFactHours:simulatedCode==="WORK"?Number(row.paidHoursPerShift??11):0,
        todayEntrySource:"timesheet",
        todayShiftAssigned:!activeAbsence&&simulatedCode!=="DAY_OFF",
        todayShiftConfirmed:!activeAbsence&&simulatedCode!=="DAY_OFF",
        todayShiftReserve:false,
        todayShiftTime:"08:00–20:00",
        todayAttendanceEvent:simulatedCode==="WORK"?"arrival":simulatedCode==="NO_SHOW"?"no_show":null,
        employmentDocumentsStatus:["completed","submitted","processing","collecting"][index%4],
        scheduleWorkDays:5,scheduleRestDays:2,scheduleShiftKind:(index%3===1?"night":"day") as "day"|"night",scheduleAnchorDate:row.startDate??today,
        transitionDays:7,dailyPaymentShifts:index<4?3:0,
        issuedAssetCount:index%4===0?0:2+(index%3),
        issuedAssetNames:index%4===0?[]:["Куртка","Брюки",...(index%3===0?["Ботинки"]:[])],
        ppeRequiredCount:3,ppeIssuedCount:index%4===0?0:Math.min(3,2+(index%3)),ppeMissingNames:index%4===0?["Куртка","Брюки","Ботинки"]:index%3===0?[]:["Ботинки"],
        dayRate:row.rate,nightRate:index%3===1?Number(row.rate??0)+50:row.rate,
      };
      return maySeeComp ? enriched : { ...enriched, rate: null, accrued: null, paid: null, payable: null };
    });
  }
  requireCapability(actor, "worker.read");
  const maySeeComp = !actor.access.denies.includes("worker.compensation.read") && (actor.access.capabilities.includes("*")||actor.access.capabilities.includes("worker.compensation.read"));
  const maySeeAssets = !actor.access.denies.includes("assets.read") && (actor.access.capabilities.includes("*")||actor.access.capabilities.includes("assets.read"));
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<WorkerRow[]>`
      SELECT w.id,w.origin_candidate_id "originCandidateId",w.organization_id "organizationId",w.full_name "fullName",w.phone,w.status,w.source,
             w.created_by_user_id "createdByUserId",woa.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",
             COALESCE(o.owner_user_id,woa.manager_user_id) "ownerUserId",
             ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
               || ARRAY[COALESCE(o.owner_user_id,woa.manager_user_id)::text] "assigneeUserIds",
             s.name specialty,woa.specialty_id "specialtyId",woa.effective_from::text "startDate",woa.work_mode "workMode",woa.paid_hours_per_shift "paidHoursPerShift",
             woa.schedule_work_days "scheduleWorkDays",woa.schedule_rest_days "scheduleRestDays",woa.schedule_shift_kind "scheduleShiftKind",woa.schedule_anchor_date::text "scheduleAnchorDate",
             woa.transition_days "transitionDays",woa.daily_payment_shifts "dailyPaymentShifts",w.employment_documents_status "employmentDocumentsStatus",
             w.clothing_size "clothingSize",w.shoe_size "shoeSize",w.height_cm "heightCm",
             er.relation_type employment,rec.display_name "originalRecruiter",mgr.display_name "managerName",w.source origin,
             absence.absence_type "absenceType",absence.status "absenceStatus",absence.planned_from::text "absenceFrom",absence.planned_to::text "absenceTo",
             today_entry.time_code "todayTimeCode",today_entry.fact_hours "todayFactHours",today_entry.source "todayEntrySource",
             (today_shift.shift_id IS NOT NULL) "todayShiftAssigned",(today_shift.confirmation_status='confirmed') "todayShiftConfirmed",today_shift.is_reserve "todayShiftReserve",today_shift.shift_time "todayShiftTime",today_shift.attendance_event "todayAttendanceEvent",
             ${maySeeAssets ? sql`COALESCE(worker_assets.item_count,0)` : sql`0`} "issuedAssetCount",
             ${maySeeAssets ? sql`COALESCE(worker_assets.names,ARRAY[]::text[])` : sql`ARRAY[]::text[]`} "issuedAssetNames",
             ${maySeeAssets ? sql`COALESCE(ppe.required_count,0)` : sql`0`} "ppeRequiredCount",
             ${maySeeAssets ? sql`COALESCE(ppe.issued_count,0)` : sql`0`} "ppeIssuedCount",
             ${maySeeAssets ? sql`COALESCE(ppe.missing_names,ARRAY[]::text[])` : sql`ARRAY[]::text[]`} "ppeMissingNames",
             ${maySeeComp ? sql`COALESCE(wr_day.amount,wr_any.amount,wr.amount)` : sql`NULL::numeric`} rate,${maySeeComp ? sql`COALESCE(wr_day.unit,wr_any.unit,wr.unit)` : sql`NULL::text`} "rateUnit",
             ${maySeeComp ? sql`COALESCE(wr_day.amount,wr_any.amount)` : sql`NULL::numeric`} "dayRate",
             ${maySeeComp ? sql`COALESCE(wr_night.amount,wr_any.amount)` : sql`NULL::numeric`} "nightRate",
             ${maySeeComp ? sql`COALESCE(wa.total_amount,0)` : sql`NULL::numeric`} accrued,
             ${maySeeComp ? sql`COALESCE(pay.paid,0)+COALESCE(adv.advances,0)` : sql`NULL::numeric`} paid,
             ${maySeeComp ? sql`GREATEST(COALESCE(wa.total_amount,0)-COALESCE(pay.paid,0)-COALESCE(adv.advances,0),0)` : sql`NULL::numeric`} payable
      FROM worker_profiles w
      LEFT JOIN LATERAL (
        SELECT * FROM worker_object_assignments x
        WHERE x.worker_id=w.id
        ORDER BY (x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)) DESC,x.effective_from DESC LIMIT 1
      ) woa ON true
      LEFT JOIN objects o ON o.id=woa.object_id
      LEFT JOIN specialties s ON s.id=woa.specialty_id
      LEFT JOIN app_users mgr ON mgr.id=COALESCE(o.owner_user_id,woa.manager_user_id)
      LEFT JOIN LATERAL (SELECT relation_type FROM employment_relations x WHERE x.worker_id=w.id AND (x.effective_to IS NULL OR x.effective_to>=current_date) ORDER BY x.effective_from DESC LIMIT 1) er ON true
      LEFT JOIN app_users rec ON rec.id=w.original_recruiter_user_id
      LEFT JOIN LATERAL (
        SELECT absence_type,status,planned_from,planned_to FROM worker_absence_plans x
        WHERE x.worker_id=w.id AND x.status IN ('tentative','confirmed') AND COALESCE(x.planned_to,'infinity'::date)>=current_date
        ORDER BY (x.planned_from<=current_date) DESC,(x.status='confirmed') DESC,x.planned_from LIMIT 1
      ) absence ON true
      LEFT JOIN LATERAL (
        SELECT te.time_code,te.fact_hours,te.source FROM time_entries te
        WHERE te.worker_id=w.id AND te.object_id=woa.object_id AND te.work_date=current_date
        ORDER BY te.updated_at DESC LIMIT 1
      ) today_entry ON true
      LEFT JOIN LATERAL (
        SELECT sh.id shift_id,sa.confirmation_status,sa.is_reserve,
          to_char(sh.starts_at,'HH24:MI')||'–'||to_char(sh.ends_at,'HH24:MI') shift_time,
          (SELECT ae.event_type FROM attendance_events ae WHERE ae.shift_assignment_id=sa.id ORDER BY ae.event_at DESC LIMIT 1) attendance_event
        FROM shift_assignments sa JOIN shifts sh ON sh.id=sa.shift_id
        WHERE sa.worker_id=w.id AND sh.object_id=woa.object_id AND sh.shift_date=current_date AND sa.confirmation_status<>'cancelled'
        ORDER BY sa.is_reserve,sh.starts_at LIMIT 1
      ) today_shift ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int item_count,array_agg(asset.item ORDER BY asset.item) names
        FROM (
          SELECT i.name||CASE WHEN NULLIF(m.variant,'') IS NULL THEN '' ELSE ' · '||m.variant END item
          FROM inventory_movements m JOIN inventory_items i ON i.id=m.item_id
          WHERE m.worker_id=w.id AND i.returnable
          GROUP BY i.id,i.name,m.variant
          HAVING sum(CASE WHEN m.movement_type='issue' THEN m.quantity WHEN m.movement_type='return' THEN -m.quantity WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity ELSE 0 END)>0
        ) asset
      ) worker_assets ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int required_count,
          count(*) FILTER (WHERE COALESCE(issued.qty,0)>=ti.quantity)::int issued_count,
          array_agg(i.name ORDER BY i.name) FILTER (WHERE COALESCE(issued.qty,0)<ti.quantity) missing_names
        FROM object_ppe_templates t
        JOIN object_ppe_template_items ti ON ti.template_id=t.id
        JOIN inventory_items i ON i.id=ti.item_id
        LEFT JOIN LATERAL (
          SELECT sum(CASE WHEN m.movement_type='issue' THEN m.quantity WHEN m.movement_type='return' THEN -m.quantity WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity ELSE 0 END)::numeric qty
          FROM inventory_movements m WHERE m.worker_id=w.id AND m.item_id=ti.item_id AND (ti.variant='' OR m.variant=ti.variant)
        ) issued ON true
        WHERE t.object_id=woa.object_id AND t.specialty_id=woa.specialty_id AND t.active
      ) ppe ON true
      LEFT JOIN LATERAL (SELECT amount,unit FROM worker_rates x WHERE x.worker_id=w.id AND (x.object_id=woa.object_id OR x.object_id IS NULL) AND x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date) ORDER BY (x.object_id=woa.object_id) DESC,x.effective_from DESC LIMIT 1) wr ON true
      LEFT JOIN LATERAL (SELECT amount,unit FROM worker_rates x WHERE x.worker_id=w.id AND (x.object_id=woa.object_id OR x.object_id IS NULL) AND x.day_night='any' AND x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date) ORDER BY (x.object_id=woa.object_id) DESC,x.effective_from DESC LIMIT 1) wr_any ON true
      LEFT JOIN LATERAL (SELECT amount,unit FROM worker_rates x WHERE x.worker_id=w.id AND (x.object_id=woa.object_id OR x.object_id IS NULL) AND x.day_night='day' AND x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date) ORDER BY (x.object_id=woa.object_id) DESC,x.effective_from DESC LIMIT 1) wr_day ON true
      LEFT JOIN LATERAL (SELECT amount,unit FROM worker_rates x WHERE x.worker_id=w.id AND (x.object_id=woa.object_id OR x.object_id IS NULL) AND x.day_night='night' AND x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date) ORDER BY (x.object_id=woa.object_id) DESC,x.effective_from DESC LIMIT 1) wr_night ON true
      LEFT JOIN LATERAL (SELECT id,total_amount,period_start,period_end FROM worker_accruals x WHERE x.worker_id=w.id ORDER BY x.period_end DESC LIMIT 1) wa ON true
      LEFT JOIN LATERAL (SELECT COALESCE(sum(amount),0)::numeric paid FROM worker_payments x WHERE x.worker_id=w.id AND x.status='paid' AND (wa.id IS NULL OR x.accrual_id=wa.id)) pay ON true
      LEFT JOIN LATERAL (SELECT COALESCE(sum(amount),0)::numeric advances FROM advance_payments x WHERE x.worker_id=w.id AND x.status='paid' AND (wa.id IS NULL OR x.payment_date BETWEEN wa.period_start AND wa.period_end)) adv ON true
      ORDER BY w.full_name
    `;
    return rows.filter((row) => canReadRow(actor.access, "worker.read", row, actor));
  });
}

export async function listShifts(actor: Actor): Promise<ShiftRow[]> {
  if (actor.demo) {
    const visible=allowed(actor,"operations.shift.read",demo.shifts);
    const today=new Date().toISOString().slice(0,10);
    const tomorrowDate=new Date(today+"T00:00:00Z");tomorrowDate.setUTCDate(tomorrowDate.getUTCDate()+1);
    const tomorrow=tomorrowDate.toISOString().slice(0,10);
    const display=(value:string)=>new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"));
    const statusFor=(worker:WorkerRow)=>{const activeAbsence=worker.absenceStatus==="confirmed"&&worker.absenceFrom&&worker.absenceFrom<=today&&(!worker.absenceTo||worker.absenceTo>=today);const index=demo.workers.findIndex(item=>item.id===worker.id);return !activeAbsence&&index%7!==3};
    const normalize=(row:(typeof demo.shifts)[number],index:number,dateIso:string):ShiftRow=>{
      const candidates=demo.workers.filter(worker=>worker.objectId===row.objectId&&worker.specialty===row.specialty&&worker.status==="active"&&statusFor(worker));
      const workerIds=candidates.slice(0,Math.min(row.demand,candidates.length)).map(worker=>worker.id);
      const reserveWorkerIds=candidates.slice(workerIds.length,workerIds.length+Math.min(row.reserve,Math.max(candidates.length-workerIds.length,0))).map(worker=>worker.id);
      const assigned=workerIds.length;
      return {...row,date:display(dateIso),dateIso,specialtyId:candidates[0]?.specialtyId??`demo-specialty-${index+1}`,assigned,confirmed:Math.min(Number(row.confirmed??assigned),assigned),reserve:reserveWorkerIds.length,deficit:Math.max(row.demand-assigned,0),workerIds,reserveWorkerIds};
    };
    const normalized=visible.map((row,index)=>normalize(row,index,row.date==="21.09"?today:tomorrow));
    const firstObject=demo.objects[0];
    if(firstObject&&canReadRow(actor.access,"operations.shift.read",firstObject,actor)){
      const todayRows=demo.needs.filter(need=>need.objectId===firstObject.id).flatMap((need,index)=>{
        const all=demo.workers.filter(worker=>worker.objectId===firstObject.id&&worker.specialty===need.specialty&&worker.status==="active");
        const available=all.filter(statusFor);
        return (["day","night"] as const).flatMap((kind,kindIndex)=>{
          const workers=available.filter(worker=>demo.workers.findIndex(item=>item.id===worker.id)%2===kindIndex);
          if(!workers.length&&kind==="night")return [];
          const workerIds=workers.map(worker=>worker.id);
          const demand=Math.max(workerIds.length,1);
          return [{id:`demo-today-${firstObject.id}-${index}-${kind}`,organizationId:firstObject.organizationId,objectId:firstObject.id,object:firstObject.name,clientId:firstObject.clientId,regionId:firstObject.regionId,specialtyId:`demo-specialty-${index+1}`,date:display(today),dateIso:today,kind,time:kind==="day"?"08:00–20:00":"20:00–08:00",specialty:need.specialty,demand,assigned:workerIds.length,reserve:0,confirmed:workerIds.length,deficit:Math.max(demand-workerIds.length,0),cost:0,status:"open",ownerUserId:firstObject.ownerUserId,createdByUserId:firstObject.ownerUserId,assigneeUserIds:firstObject.assigneeUserIds??[],workerIds,reserveWorkerIds:[]} satisfies ShiftRow];
        });
      });
      normalized.push(...todayRows);
    }
    return normalized;
  }
  requireCapability(actor, "operations.shift.read");
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<ShiftRow[]>`
      SELECT sh.id,sh.organization_id "organizationId",sh.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",
             sh.specialty_id "specialtyId",to_char(sh.shift_date,'DD.MM') date,sh.shift_date::text "dateIso", sh.shift_kind kind,
             to_char(sh.starts_at,'HH24:MI')||'–'||to_char(sh.ends_at,'HH24:MI') time,
             s.name specialty,sh.demand_count demand,
             (SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled') assigned,
             (SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND sa.is_reserve AND sa.confirmation_status<>'cancelled') reserve,
             (SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status='confirmed') confirmed,
             GREATEST(sh.demand_count-(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled'),0) deficit,
             COALESCE(sh.planned_cost,0) cost,sh.status,o.owner_user_id "ownerUserId",sh.created_by_user_id "createdByUserId",
             ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds",
             ARRAY(SELECT sa.worker_id::text FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled' ORDER BY sa.created_at) "workerIds",
             ARRAY(SELECT sa.worker_id::text FROM shift_assignments sa WHERE sa.shift_id=sh.id AND sa.is_reserve AND sa.confirmation_status<>'cancelled' ORDER BY sa.created_at) "reserveWorkerIds"
      FROM shifts sh JOIN objects o ON o.id=sh.object_id JOIN specialties s ON s.id=sh.specialty_id ORDER BY sh.shift_date,sh.starts_at
    `;
    return rows.filter((row) => canReadRow(actor.access, "operations.shift.read", row, actor));
  });
}

export async function getTimesheet(actor: Actor, options?: { objectId?: string | null; month?: string | null }): Promise<TimesheetData | null> {
  requireCapability(actor, "time.timesheet.read");
  const requestedMonth=options?.month&&/^\\d{4}-\\d{2}$/.test(options.month)?options.month:new Date().toISOString().slice(0,7);
  const [year,monthNumber]=requestedMonth.split("-").map(Number);
  const periodStart=requestedMonth+"-01";
  const periodEnd=new Date(Date.UTC(year,monthNumber,0)).toISOString().slice(0,10);
  if (actor.demo) {
    const object=options?.objectId?demo.objects.find(row=>row.id===options.objectId):demo.objects.find(row=>canReadRow(actor.access,"time.timesheet.read",row,actor));
    if(!object||!canReadRow(actor.access,"time.timesheet.read",object,actor))return null;
    const endDay=Number(periodEnd.slice(8,10));const today=new Date().toISOString().slice(0,10);
    const objectWorkers=demo.workers.filter(worker=>worker.objectId===object.id&&worker.status==="active");
    const rows:TimesheetWorkerRow[]=objectWorkers.map((worker,index)=>{
      const days:Record<string,TimesheetCellValue>={};
      const start=worker.startDate??periodStart;const hours=Number(worker.paidHoursPerShift??11);
      for(let day=1;day<=endDay;day++){
        const date=`${requestedMonth}-${String(day).padStart(2,"0")}`;if(date<start)continue;
        const absence=worker.absenceStatus==="confirmed"&&worker.absenceFrom&&worker.absenceFrom<=date&&(!worker.absenceTo||worker.absenceTo>=date);
        if(absence){days[String(day)]=({intershift:"МВ",vacation:"О",sick:"Б",personal:"Н",other:"Н"} as Record<string,string>)[worker.absenceType??""]??"Н";continue;}
        const cycle=(day+index)%7;const planned=cycle<5;
        if(date>today)days[String(day)]=planned?"П":"В";else if(planned)days[String(day)]=index%13===7&&date===today?"НВ":hours;else days[String(day)]="В";
      }
      const total=Object.values(days).reduce<number>((sum,value)=>sum+(typeof value==="number"?value:0),0);
      const dayCells:Record<string,TimesheetCellValue>={},nightCells:Record<string,TimesheetCellValue>={};for(const [d,v] of Object.entries(days)){if(index%3===1)nightCells[d]=v;else dayCells[d]=v;}return {workerId:worker.id,name:worker.fullName,rowKind:"worker",specialty:worker.specialty??null,effectiveFrom:start,effectiveTo:null,days,dayCells,nightCells,plannedHours:hours,total,dayHours:index%3===1?0:total,night:index%3===1?total:0,overtime:0,rate:worker.rate,dayRate:worker.rate,nightRate:index%3===1?Number(worker.rate??0)+50:worker.rate,accrual:worker.accrued};
    });
    const plannedCandidate=demo.candidates.find(candidate=>candidate.objectId===object.id&&candidate.stage==="first_shift");
    if(plannedCandidate){const planDate=today>=periodStart&&today<=periodEnd?today:periodStart;rows.push({workerId:`candidate:${plannedCandidate.id}`,name:plannedCandidate.fullName,rowKind:"candidate",candidateId:plannedCandidate.id,specialty:plannedCandidate.need??null,days:{[String(Number(planDate.slice(8,10)))]:"П"},dayCells:{[String(Number(planDate.slice(8,10)))]:"П"},nightCells:{},plannedShiftKinds:{[String(Number(planDate.slice(8,10)))]:"day"},total:0,dayHours:0,night:0,overtime:0,rate:null,dayRate:null,nightRate:null,accrual:null});}
    const internalHours=rows.reduce((sum,row)=>sum+Number(row.total),0);
    const period=new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(periodStart+"T00:00:00Z"));
    return {...object,objectId:object.id,object:object.name,period,month:requestedMonth,periodStart,periodEnd,clientHours:internalHours,internalHours,discrepancy:0,status:"draft",rows,issue:null,internalSnapshot:null,clientSnapshot:null};
  }
  const maySeeComp=!actor.access.denies.includes("worker.compensation.read")&&(actor.access.capabilities.includes("*")||actor.access.capabilities.includes("worker.compensation.read"));
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const objectRows=await sql<TimesheetMeta[]>`
      SELECT id "objectId",name object,organization_id "organizationId",client_company_id "clientId",region_id "regionId",owner_user_id "ownerUserId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=objects.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects ORDER BY name
    `;
    const visible=objectRows.filter(row=>canReadRow(actor.access,"time.timesheet.read",row,actor));
    const meta=options?.objectId?visible.find(row=>row.objectId===options.objectId):visible[0];
    if(!meta)return null;

    const workers=await sql<Array<TimesheetWorkerRow & {organizationId:string;effectiveFrom:string;effectiveTo:string|null;scheduleWorkDays:number|null;scheduleRestDays:number|null;scheduleShiftKind:"day"|"night"|"mixed";scheduleAnchorDate:string|null}>>`
      SELECT DISTINCT w.id "workerId",w.full_name name,s.name specialty,0::numeric total,0::numeric night,0::numeric overtime,
        a.effective_from::text "effectiveFrom",a.effective_to::text "effectiveTo",a.schedule_work_days "scheduleWorkDays",a.schedule_rest_days "scheduleRestDays",a.schedule_shift_kind "scheduleShiftKind",a.schedule_anchor_date::text "scheduleAnchorDate",a.paid_hours_per_shift::numeric "plannedHours",
        ${maySeeComp?sql`COALESCE(CASE WHEN day_rate.unit='shift' AND a.paid_hours_per_shift>0 THEN day_rate.amount/a.paid_hours_per_shift ELSE day_rate.amount END,CASE WHEN any_rate.unit='shift' AND a.paid_hours_per_shift>0 THEN any_rate.amount/a.paid_hours_per_shift ELSE any_rate.amount END)`:sql`NULL::numeric`} rate,
        ${maySeeComp?sql`COALESCE(CASE WHEN day_rate.unit='shift' AND a.paid_hours_per_shift>0 THEN day_rate.amount/a.paid_hours_per_shift ELSE day_rate.amount END,CASE WHEN any_rate.unit='shift' AND a.paid_hours_per_shift>0 THEN any_rate.amount/a.paid_hours_per_shift ELSE any_rate.amount END)`:sql`NULL::numeric`} "dayRate",
        ${maySeeComp?sql`COALESCE(CASE WHEN night_rate.unit='shift' AND a.paid_hours_per_shift>0 THEN night_rate.amount/a.paid_hours_per_shift ELSE night_rate.amount END,CASE WHEN any_rate.unit='shift' AND a.paid_hours_per_shift>0 THEN any_rate.amount/a.paid_hours_per_shift ELSE any_rate.amount END)`:sql`NULL::numeric`} "nightRate",
        ${maySeeComp?sql`wa.total_amount`:sql`NULL::numeric`} accrual,
        w.organization_id "organizationId"
      FROM worker_profiles w
      JOIN worker_object_assignments a ON a.worker_id=w.id
      LEFT JOIN specialties s ON s.id=a.specialty_id
      LEFT JOIN LATERAL (SELECT amount,unit FROM worker_rates r WHERE r.worker_id=w.id AND r.object_id=${meta.objectId}::uuid AND r.day_night='any' AND r.effective_from<=${periodEnd}::date AND (r.effective_to IS NULL OR r.effective_to>=${periodStart}::date) ORDER BY r.effective_from DESC LIMIT 1) any_rate ON true
      LEFT JOIN LATERAL (SELECT amount,unit FROM worker_rates r WHERE r.worker_id=w.id AND r.object_id=${meta.objectId}::uuid AND r.day_night='day' AND r.effective_from<=${periodEnd}::date AND (r.effective_to IS NULL OR r.effective_to>=${periodStart}::date) ORDER BY r.effective_from DESC LIMIT 1) day_rate ON true
      LEFT JOIN LATERAL (SELECT amount,unit FROM worker_rates r WHERE r.worker_id=w.id AND r.object_id=${meta.objectId}::uuid AND r.day_night='night' AND r.effective_from<=${periodEnd}::date AND (r.effective_to IS NULL OR r.effective_to>=${periodStart}::date) ORDER BY r.effective_from DESC LIMIT 1) night_rate ON true
      LEFT JOIN LATERAL (
        SELECT total_amount FROM worker_accruals x
        WHERE x.worker_id=w.id AND x.object_id=${meta.objectId}::uuid
          AND x.period_end>=${periodStart}::date AND x.period_start<=${periodEnd}::date
        ORDER BY x.period_end DESC LIMIT 1
      ) wa ON true
      WHERE a.object_id=${meta.objectId}::uuid
        AND a.effective_from<=${periodEnd}::date
        AND (a.effective_to IS NULL OR a.effective_to>=${periodStart}::date)
      ORDER BY w.full_name
    `;
    const workerIds=workers.map(row=>row.workerId);
    const entries=workerIds.length?await sql<Array<{workerId:string;workDate:string;timeCode:string;factHours:number|string;dayHours:number|string;nightHours:number|string;overtimeHours:number|string;plannedShiftKind:"day"|"night"|"mixed"|null}>>`
      SELECT worker_id "workerId",work_date::text "workDate",time_code "timeCode",fact_hours "factHours",day_hours "dayHours",night_hours "nightHours",overtime_hours "overtimeHours",planned_shift_kind "plannedShiftKind"
      FROM time_entries
      WHERE object_id=${meta.objectId}::uuid AND worker_id=ANY(${workerIds}::uuid[])
        AND work_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
      ORDER BY work_date
    `:[];

    const codeLabels:Record<string,string>={PLANNED:"П",WORK_PENDING:"?",DAY_OFF:"В",VACATION:"О",INTERSHIFT:"МВ",SICK:"Б",NO_SHOW:"НВ",ABSENCE:"Н"};
    const byWorker=new Map<string,TimesheetWorkerRow>();
    for(const worker of workers){
      const row:TimesheetWorkerRow={workerId:worker.workerId,name:worker.name,rowKind:"worker",specialty:worker.specialty??null,effectiveFrom:worker.effectiveFrom,effectiveTo:worker.effectiveTo,days:{},dayCells:{},nightCells:{},plannedShiftKinds:{},plannedHours:worker.plannedHours==null?null:Number(worker.plannedHours),total:0,dayHours:0,night:0,overtime:0,rate:worker.rate,dayRate:worker.dayRate,nightRate:worker.nightRate,accrual:worker.accrual};
      if(worker.scheduleWorkDays!=null&&worker.scheduleRestDays!=null&&worker.scheduleWorkDays>0){
        const anchor=worker.scheduleAnchorDate??worker.effectiveFrom;const cycle=worker.scheduleWorkDays+worker.scheduleRestDays;
        for(let day=1;day<=Number(periodEnd.slice(8,10));day++){
          const date=`${requestedMonth}-${String(day).padStart(2,"0")}`;if(date<worker.effectiveFrom||(worker.effectiveTo&&date>worker.effectiveTo))continue;
          const diff=Math.floor((Date.parse(date+"T00:00:00Z")-Date.parse(anchor+"T00:00:00Z"))/86400000);
          const offset=((diff%cycle)+cycle)%cycle;const cell=offset<worker.scheduleWorkDays?"П":"В";row.days![String(day)]=cell;
          if(offset<worker.scheduleWorkDays){row.plannedShiftKinds![String(day)]=worker.scheduleShiftKind;if(worker.scheduleShiftKind==="night")row.nightCells![String(day)]="П";else row.dayCells![String(day)]="П";}else{row.dayCells![String(day)]="В";row.nightCells![String(day)]="В";}
        }
      }
      byWorker.set(worker.workerId,row);
    }
    for(const entry of entries){
      const row=byWorker.get(entry.workerId);if(!row)continue;
      const day=String(Number(entry.workDate.slice(8,10)));
      row.days??={};row.dayCells??={};row.nightCells??={};
      const code=entry.timeCode==="WORK"?null:codeLabels[entry.timeCode]??"Н";const dayHours=Number(entry.dayHours??0);const nightHours=Number(entry.nightHours??0);
      row.days[day]=code??Number(entry.factHours);
      if(code){const kind=entry.plannedShiftKind??row.plannedShiftKinds?.[day]??"day";if(kind==="night")row.nightCells[day]=code;else row.dayCells[day]=code;}else{if(dayHours>0)row.dayCells[day]=dayHours;if(nightHours>0)row.nightCells[day]=nightHours;}
      if(entry.plannedShiftKind)row.plannedShiftKinds![day]=entry.plannedShiftKind;
      row.total=Number(row.total)+Number(entry.factHours);row.dayHours=Number(row.dayHours??0)+dayHours;
      row.night=Number(row.night??0)+nightHours;row.overtime=Number(row.overtime??0)+Number(entry.overtimeHours);
    }
    const plannedCandidates=await sql<Array<{applicationId:string;candidateId:string;name:string;specialty:string;plannedStartDate:string;plannedShiftKind:"day"|"night"|"mixed"|null}>>`
      SELECT ca.id "applicationId",c.id "candidateId",c.full_name name,s.name specialty,ca.planned_start_date::text "plannedStartDate",ca.planned_shift_kind "plannedShiftKind"
      FROM candidate_applications ca JOIN candidates c ON c.id=ca.candidate_id JOIN needs n ON n.id=ca.need_id JOIN specialties s ON s.id=n.specialty_id
      WHERE ca.object_id=${meta.objectId}::uuid AND ca.stage='first_shift' AND ca.actual_start_at IS NULL
        AND ca.planned_start_date BETWEEN ${periodStart}::date AND ${periodEnd}::date
      ORDER BY ca.planned_start_date,c.full_name
    `;
    const candidateRows:TimesheetWorkerRow[]=plannedCandidates.map(candidate=>{const day=String(Number(candidate.plannedStartDate.slice(8,10)));return {workerId:`candidate:${candidate.applicationId}`,name:candidate.name,rowKind:"candidate",candidateId:candidate.candidateId,applicationId:candidate.applicationId,specialty:candidate.specialty,days:{[day]:"П"},dayCells:candidate.plannedShiftKind==="night"?{}:{[day]:"П"},nightCells:candidate.plannedShiftKind==="night"?{[day]:"П"}:{},plannedShiftKinds:{[day]:candidate.plannedShiftKind??"mixed"},total:0,dayHours:0,night:0,overtime:0,rate:null,dayRate:null,nightRate:null,accrual:null};});
    const rows=[...byWorker.values(),...candidateRows];
    const [clientSnap,internalSnap]=await Promise.all([
      sql<SnapshotMetaRow[]>`
        SELECT id,(snapshot_json->>'hours')::numeric hours,status,COALESCE(version,1)::int version,workflow_comment comment,to_char(created_at,'DD.MM.YYYY HH24:MI') "createdAt"
        FROM timesheet_snapshots
        WHERE object_id=${meta.objectId}::uuid AND view_type='client'
          AND period_start=${periodStart}::date AND period_end=${periodEnd}::date
        ORDER BY COALESCE(version,1) DESC,created_at DESC LIMIT 1
      `,
      sql<SnapshotMetaRow[]>`
        SELECT id,(snapshot_json->>'hours')::numeric hours,status,COALESCE(version,1)::int version,workflow_comment comment,to_char(created_at,'DD.MM.YYYY HH24:MI') "createdAt"
        FROM timesheet_snapshots
        WHERE object_id=${meta.objectId}::uuid AND view_type='internal'
          AND period_start=${periodStart}::date AND period_end=${periodEnd}::date
        ORDER BY COALESCE(version,1) DESC,created_at DESC LIMIT 1
      `,
    ]);
    const [issue]=await sql<Array<{difference:number|string;worker:string;date:string;reason:string;owner:string;status:string}>>`
      SELECT r.difference_hours difference,w.full_name worker,to_char(r.work_date,'DD.MM.YYYY') date,
        COALESCE(r.reason,'Причина не указана') reason,COALESCE(u.display_name,'Не назначен') owner,r.status
      FROM reconciliation_issues r
      LEFT JOIN worker_profiles w ON w.id=r.worker_id LEFT JOIN app_users u ON u.id=r.owner_user_id
      WHERE r.object_id=${meta.objectId}::uuid AND r.status<>'resolved'
        AND (r.work_date IS NULL OR r.work_date BETWEEN ${periodStart}::date AND ${periodEnd}::date)
      ORDER BY r.created_at DESC LIMIT 1
    `;
    const internalHours=rows.reduce((sum,row)=>sum+Number(row.total),0);
    const clientHours=Number(clientSnap?.[0]?.hours??internalHours);
    const period=new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(periodStart+"T00:00:00Z"));
    const mapSnapshot=(row:SnapshotMetaRow|undefined):TimesheetSnapshotMeta|null=>row?{id:row.id,status:row.status,version:Number(row.version??1),hours:Number(row.hours??0),comment:row.comment??null,createdAt:row.createdAt}:null;
    const internalSnapshot=mapSnapshot(internalSnap?.[0]);
    const clientSnapshot=mapSnapshot(clientSnap?.[0]);
    return {...meta,period,month:requestedMonth,periodStart,periodEnd,clientHours,internalHours,discrepancy:internalHours-clientHours,status:clientSnapshot?.status??internalSnapshot?.status??"draft",rows,issue:issue??null,internalSnapshot,clientSnapshot};
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
    const rows=await sql<TaskRow[]>`
      SELECT t.id,t.organization_id "organizationId",t.title,t.status,t.priority,t.assignee_user_id "ownerUserId",
        ARRAY[t.assignee_user_id::text] "assigneeUserIds",to_char(t.due_at,'DD.MM HH24:MI') due,
        CASE
          WHEN t.entity_type='candidate_application' THEN trim(concat_ws(' · ',c.full_name,COALESCE(n.title,s.name),o.name))
          WHEN t.entity_type='candidate' THEN COALESCE(c_direct.full_name,'Кандидат')
          WHEN t.entity_type='object' THEN COALESCE(task_object.name,'Объект')
          WHEN t.entity_type='worker' THEN COALESCE(task_worker.full_name,'Сотрудник')
          WHEN t.entity_type='supply_request' THEN COALESCE(task_supply.title,'Заявка на обеспечение')
          WHEN t.entity_type='timesheet' THEN COALESCE(task_timesheet_object.name,'Табель')
          ELSE COALESCE(NULLIF(t.entity_type,''),'Без связи')
        END entity,
        t.created_by_user_id "createdByUserId"
      FROM tasks t
      LEFT JOIN candidate_applications ca ON t.entity_type='candidate_application' AND ca.id=t.entity_id
      LEFT JOIN candidates c ON c.id=ca.candidate_id
      LEFT JOIN needs n ON n.id=ca.need_id
      LEFT JOIN specialties s ON s.id=n.specialty_id
      LEFT JOIN objects o ON o.id=ca.object_id
      LEFT JOIN candidates c_direct ON t.entity_type='candidate' AND c_direct.id=t.entity_id
      LEFT JOIN objects task_object ON t.entity_type='object' AND task_object.id=t.entity_id
      LEFT JOIN worker_profiles task_worker ON t.entity_type='worker' AND task_worker.id=t.entity_id
      LEFT JOIN supply_requests task_supply ON t.entity_type='supply_request' AND task_supply.id=t.entity_id
      LEFT JOIN timesheet_snapshots task_timesheet ON t.entity_type='timesheet' AND task_timesheet.id=t.entity_id
      LEFT JOIN objects task_timesheet_object ON task_timesheet_object.id=task_timesheet.object_id
      ORDER BY (t.status IN ('done','cancelled')),t.due_at NULLS LAST,t.created_at DESC
    `;
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
      const isOwner=u.code==="director";
      return {
        id:a.userId,
        membershipId:`demo-${a.userId}`,
        name:a.displayName,
        email:a.email,
        role:a.positionName??a.roleName,
        roleCode:a.roleCode,
        processRoles:employee?.roles.map(item=>item.name)??[],
        teams:a.teamIds.length,
        regions:a.regionIds.length,
        scopes:scopeSet,
        capabilities:a.access.capabilities.length,
        systemCapabilities:isOwner?[...OWNER_SYSTEM_CAPABILITIES]:[],
        isOwner,
      };
    });
  }
  return withTenant(actor.organizationId,actor.userId,async(sql)=>{
    const rows=await sql<AccessUserRow[]>`
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
        ) x) scopes,
        ARRAY(
          SELECT sg.capability
          FROM membership_system_grants sg
          WHERE sg.membership_id=m.id
            AND sg.valid_from<=now()
            AND (sg.valid_to IS NULL OR sg.valid_to>now())
          ORDER BY sg.capability
        ) "systemCapabilities",
        EXISTS(SELECT 1 FROM organization_owners oo WHERE oo.membership_id=m.id) "isOwner"
      FROM organization_memberships m
      JOIN app_users u ON u.id=m.user_id
      JOIN role_templates r ON r.id=m.role_template_id
      LEFT JOIN positions p ON p.id=m.position_id
      WHERE m.organization_id=${actor.organizationId}::uuid
      ORDER BY u.display_name
    `;
    return rows.map((row)=>row.isOwner
      ? {...row,systemCapabilities:[...new Set([...row.systemCapabilities,...OWNER_SYSTEM_CAPABILITIES])]}
      : row
    );
  });
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
export async function listLaunchTasks(actor: Actor): Promise<LaunchTaskRow[]> { if(actor.demo)return allowed(actor,"operations.object.read",demo.launchTasks);requireCapability(actor,"operations.object.read");return withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<LaunchTaskRow[]>`SELECT t.id,t.organization_id "organizationId",l.id "launchId",l.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",t.title,CASE WHEN t.parent_task_id IS NULL THEN 0 ELSE 1 END level,COALESCE(u.display_name,'—') owner,to_char(t.start_date,'DD.MM') start,to_char(t.end_date,'DD.MM') "end",t.start_date::text "startDate",t.end_date::text "endDate",to_char(t.baseline_start,'DD.MM') "baselineStart",to_char(t.baseline_end,'DD.MM') "baselineEnd",t.baseline_start::text "baselineStartDate",t.baseline_end::text "baselineEndDate",t.progress_pct progress,t.status,t.risk_level risk,t.is_milestone milestone,t.is_critical critical,to_char(l.target_date,'DD.MM.YYYY') "launchTarget",to_char(l.forecast_date,'DD.MM.YYYY') "launchForecast",l.progress_pct::int "launchProgress",l.risk_level "launchRisk",t.owner_user_id "ownerUserId",t.created_by_user_id "createdByUserId",ARRAY(SELECT d.predecessor_task_id::text FROM launch_task_dependencies d WHERE d.successor_task_id=t.id) "dependencyIds",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds" FROM launch_tasks t JOIN launches l ON l.id=t.launch_id JOIN objects o ON o.id=l.object_id LEFT JOIN app_users u ON u.id=t.owner_user_id ORDER BY l.target_date,t.start_date,t.created_at`;return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor))}) }
export async function listAccruals(actor: Actor): Promise<AccrualRow[]> { if(actor.demo){const rows=allowed(actor,"finance.worker_accrual.read",demo.workers);return rows.map((x,index)=>({id:`acc-${index}`,organizationId:x.organizationId,workerId:x.id,worker:x.fullName,objectId:x.objectId!,object:x.object??"—",clientId:x.clientId,regionId:x.regionId,ownerUserId:x.ownerUserId,assigneeUserIds:x.assigneeUserIds,period:"16–31.08.2026",periodStart:"2026-08-16",periodEnd:"2026-08-31",base:Number(x.accrued??0),premium:0,adjustment:0,total:Number(x.accrued??0),status:"approved"}))}requireCapability(actor,"finance.worker_accrual.read");return withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<AccrualRow[]>`SELECT a.id,a.organization_id "organizationId",a.worker_id "workerId",w.full_name worker,a.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",o.owner_user_id "ownerUserId",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds",to_char(a.period_start,'DD.MM')||'–'||to_char(a.period_end,'DD.MM.YYYY') period,a.period_start::text "periodStart",a.period_end::text "periodEnd",a.base_amount base,a.premium_amount premium,a.adjustment_amount adjustment,a.total_amount total,a.status,a.created_by_user_id "createdByUserId" FROM worker_accruals a JOIN worker_profiles w ON w.id=a.worker_id JOIN objects o ON o.id=a.object_id ORDER BY a.period_end DESC,w.full_name`;return rows.filter(row=>canReadRow(actor.access,"finance.worker_accrual.read",row,actor))}) }
export async function listPayments(actor: Actor): Promise<PaymentRow[]> { if(actor.demo){const rows=allowed(actor,"finance.payments.read",demo.workers);return rows.flatMap((x,index)=>[{id:`adv-${index}`,organizationId:x.organizationId,workerId:x.id,worker:x.fullName,objectId:x.objectId,object:x.object,clientId:x.clientId,regionId:x.regionId,ownerUserId:x.ownerUserId,assigneeUserIds:x.assigneeUserIds,kind:"advance" as const,purpose:index<4?"daily_shift" as const:"advance" as const,workDate:index<4?"2026-09-24":null,date:"25.09.2026",dateIso:"2026-09-25",amount:Number(x.paid??0),status:index%3===0?"planned":"paid",reference:index<4?"Первая смена":"DEMO"},{id:`pay-${index}`,organizationId:x.organizationId,workerId:x.id,worker:x.fullName,objectId:x.objectId,object:x.object,clientId:x.clientId,regionId:x.regionId,ownerUserId:x.ownerUserId,assigneeUserIds:x.assigneeUserIds,kind:"payment" as const,purpose:null,workDate:null,date:"05.09.2026",dateIso:"2026-09-05",amount:Number(x.payable??0),status:"planned",reference:"DEMO"}])}requireCapability(actor,"finance.payments.read");return withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<PaymentRow[]>`SELECT p.id,p.organization_id "organizationId",p.worker_id "workerId",w.full_name worker,p.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",o.owner_user_id "ownerUserId",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds",'payment'::text kind,NULL::text purpose,NULL::text "workDate",to_char(p.payment_date,'DD.MM.YYYY') date,p.payment_date::text "dateIso",p.amount,p.status,p.reference,p.created_by_user_id "createdByUserId" FROM worker_payments p JOIN worker_profiles w ON w.id=p.worker_id LEFT JOIN objects o ON o.id=p.object_id UNION ALL SELECT a.id,a.organization_id,a.worker_id,w.full_name,a.object_id,o.name,o.client_company_id,o.region_id,o.owner_user_id,ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL),'advance',a.payment_purpose,a.work_date::text,to_char(a.payment_date,'DD.MM.YYYY'),a.payment_date::text,a.amount,a.status,a.reference,a.created_by_user_id FROM advance_payments a JOIN worker_profiles w ON w.id=a.worker_id LEFT JOIN objects o ON o.id=a.object_id ORDER BY "dateIso" DESC NULLS LAST`;return rows.filter(row=>canReadRow(actor.access,"finance.payments.read",row,actor))}) }
export async function listIncidents(actor: Actor): Promise<IncidentRow[]> { if(actor.demo)return allowed(actor,"operations.object.read",demo.incidents).map(row=>({...row,financialEffectAmount:(row as IncidentRow).financialEffectAmount??null,financialEffectStatus:(row as IncidentRow).financialEffectStatus??"none" as const}));requireCapability(actor,"operations.object.read");return withTenant(actor.organizationId,actor.userId,async sql=>{const rows=await sql<IncidentRow[]>`SELECT i.id,i.organization_id "organizationId",i.object_id "objectId",o.name object,o.client_company_id "clientId",o.region_id "regionId",i.title,i.incident_type type,to_char(i.occurred_at,'DD.MM HH24:MI') "occurredAt",i.occurred_at::text "occurredAtIso",i.severity,i.status,i.responsible_user_id "responsibleUserId",u.display_name responsible,i.worker_id "workerId",w.full_name worker,i.description,i.resolution,i.financial_effect_amount "financialEffectAmount",i.financial_effect_status "financialEffectStatus",i.financial_effect_basis "financialEffectBasis",i.responsible_user_id "ownerUserId",i.created_by_user_id "createdByUserId",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_to IS NULL) "assigneeUserIds" FROM incidents i JOIN objects o ON o.id=i.object_id LEFT JOIN app_users u ON u.id=i.responsible_user_id LEFT JOIN worker_profiles w ON w.id=i.worker_id ORDER BY i.occurred_at DESC`;return rows.filter(row=>canReadRow(actor.access,"operations.object.read",row,actor))}) }