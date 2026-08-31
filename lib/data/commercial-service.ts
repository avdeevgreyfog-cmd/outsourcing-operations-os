import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/commercial";
import type { CalculatorModelRule, CommercialApprovalRow, CommercialCalculationRow, CommercialCommentRow, CommercialHistoryRow, CommercialProposalRow, CommercialRateRow, CommercialRequestRow, CommercialRuleRow, ProvisionRow } from "@/lib/commercial/types";

function allowed<T extends {organizationId:string}>(actor:Actor,capability:string,rows:T[]):T[]{
  requireCapability(actor,capability);
  return rows.filter((row)=>canReadRow(actor.access,capability,row,actor));
}

export async function listCommercialRequests(actor:Actor):Promise<CommercialRequestRow[]> {
  if(actor.demo)return allowed(actor,"sales.request.read",demo.requests);
  requireCapability(actor,"sales.request.read");
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<CommercialRequestRow[]>`
      SELECT r.id,r.organization_id "organizationId",r.request_number number,r.title,r.commercial_stage stage,r.status "legacyStatus",
             r.business_result "businessResult",(r.archived_at IS NOT NULL) archived,to_char(r.archived_at,'DD.MM.YYYY HH24:MI') "archivedAt",
             r.close_reason "closeReason",r.close_comment "closeComment",to_char(r.closed_at,'DD.MM.YYYY HH24:MI') "closedAt",
             r.client_company_id "clientId",COALESCE(c.name,NULLIF(r.company_name_text,''),'Не указана') client,COALESCE(c.inn,r.inn_text) "companyInn",
             COALESCE(ct.full_name,r.contact_name) "contactName",COALESCE(ct.position,r.contact_position) "contactPosition",
             COALESCE(ct.phone,r.contact_phone) phone,COALESCE(ct.email,r.contact_email) email,r.source,
             r.site_name "siteName",COALESCE(r.location_text,r.city,r.address_text,'Не указана') location,r.address_text address,r.city,
             r.region_id "regionId",rg.name region,r.transport_access "transportAccess",r.nearest_transport "nearestTransport",r.logistics_comment "logisticsComment",
             r.owner_user_id "ownerUserId",COALESCE(owner.display_name,'Не назначен') owner,r.created_by_user_id "createdByUserId",r.assigned_team_id "teamId",
             to_char(r.created_at,'DD.MM.YYYY HH24:MI') "createdAt",to_char(r.updated_at,'DD.MM.YYYY HH24:MI') "updatedAt",
             to_char(r.expected_start_date,'DD.MM.YYYY') start,r.duration_text duration,r.schedule_json schedule,r.housing_rule housing,r.vat_mode vat,
             r.desired_client_rate "desiredClientRate",r.max_client_rate "maxClientRate",r.client_rate_vat_mode "clientRateVatMode",
             r.proposed_worker_pay "proposedWorkerPay",r.total_budget "totalBudget",r.monthly_limit "monthlyLimit",
             r.selected_scenario_id "selectedScenarioId",r.agreed_client_rate "agreedClientRate",r.accepted_proposal_id "acceptedProposalId",
             last_event.summary "lastAction",to_char(last_event.created_at,'DD.MM.YYYY HH24:MI') "lastActionAt",
             r.next_action "nextAction",to_char(r.next_action_at,'DD.MM.YYYY HH24:MI') "nextActionAt",
             COALESCE(sum(rr.count_required),0)::int "totalHeadcount",
             COALESCE(jsonb_agg(jsonb_build_object(
               'id',rr.id,'specialtyId',rr.specialty_id,'name',COALESCE(s.name,rr.specialty_name,'Позиция не указана'),'count',rr.count_required,
               'qualification',rr.qualification,'experience',rr.experience_text,'salaryTarget',rr.salary_target,'scheduleType',rr.schedule_type,
               'shiftStart',to_char(rr.shift_start,'HH24:MI'),'shiftEnd',to_char(rr.shift_end,'HH24:MI'),'presenceHours',rr.presence_hours,
               'paidHours',rr.paid_hours,'lunchMinutes',rr.lunch_minutes,'lunchPaid',rr.lunch_paid,'nightHours',rr.night_hours,
               'overtimeRule',rr.overtime_rule,'requirements',rr.requirements_json
             )) FILTER(WHERE rr.id IS NOT NULL),'[]'::jsonb) roles
      FROM requests r
      LEFT JOIN client_companies c ON c.id=r.client_company_id
      LEFT JOIN contacts ct ON ct.id=r.contact_id
      LEFT JOIN regions rg ON rg.id=r.region_id
      LEFT JOIN app_users owner ON owner.id=r.owner_user_id
      LEFT JOIN request_roles rr ON rr.request_id=r.id
      LEFT JOIN specialties s ON s.id=rr.specialty_id
      LEFT JOIN LATERAL (
        SELECT ae.summary,ae.created_at FROM activity_events ae
        WHERE ae.entity_type='request' AND ae.entity_id=r.id ORDER BY ae.created_at DESC LIMIT 1
      ) last_event ON true
      GROUP BY r.id,c.name,c.inn,ct.full_name,ct.position,ct.phone,ct.email,rg.name,owner.display_name,last_event.summary,last_event.created_at
      ORDER BY r.archived_at NULLS FIRST,r.updated_at DESC
    `;
    return rows.filter((row)=>canReadRow(actor.access,"sales.request.read",row,actor));
  });
}

export async function getCommercialRequest(actor:Actor,id:string):Promise<CommercialRequestRow|null>{
  const rows=await listCommercialRequests(actor);
  return rows.find((row)=>row.id===id)??null;
}

export async function listCommercialCalculations(actor:Actor):Promise<CommercialCalculationRow[]> {
  if(actor.demo)return allowed(actor,"calculation.scenario.read",demo.calculations);
  requireCapability(actor,"calculation.scenario.read");
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<CommercialCalculationRow[]>`
      SELECT cs.id,cs.organization_id "organizationId",c.id "calculationId",c.request_id "requestId",
             COALESCE(r.title,'Самостоятельный расчёт') request,c.source_kind "sourceKind",COALESCE(c.title,r.title,'Расчёт') "calculationTitle",
             COALESCE(s.name,rr.specialty_name,cs.inputs_snapshot->>'roleName','Без позиции') role,cs.name,cs.scenario_number "scenarioNumber",
             cm.name model,cm.model_type "modelType",cs.rule_version_id "ruleVersionId",cs.status,
             approval.status "approvalStatus",c.owner_user_id "ownerUserId",cs.created_by_user_id "createdByUserId",
             r.assigned_team_id "teamId",COALESCE(r.region_id,c.region_id) "regionId",
             COALESCE((cs.inputs_snapshot->>'workerNetHourly')::numeric,0) "workerNet",
             COALESCE((cs.result_snapshot->>'totalCostHourly')::numeric,0) "totalCost",
             COALESCE((cs.result_snapshot->>'clientRateHourly')::numeric,(cs.result_snapshot->>'clientRateExVat')::numeric,0) "clientRate",
             (cs.result_snapshot->>'clientRateWithVat')::numeric "clientRateWithVat",
             COALESCE((cs.result_snapshot->>'marginPct')::numeric,0) "marginPct",
             (cs.result_snapshot->>'monthlyRevenue')::numeric "monthlyRevenue",
             COALESCE((cs.result_snapshot->>'monthlyContribution')::numeric,0) "monthlyContribution",
             to_char(cs.created_at,'DD.MM.YYYY HH24:MI') "createdAt"
      FROM calculation_scenarios cs
      JOIN calculations c ON c.id=cs.calculation_id
      LEFT JOIN requests r ON r.id=c.request_id
      LEFT JOIN request_roles rr ON rr.id=cs.request_role_id
      LEFT JOIN specialties s ON s.id=rr.specialty_id
      JOIN calculation_models cm ON cm.id=cs.model_id
      LEFT JOIN LATERAL (
        SELECT ca.status FROM calculation_approvals ca WHERE ca.calculation_scenario_id=cs.id ORDER BY ca.round DESC LIMIT 1
      ) approval ON true
      ORDER BY cs.created_at DESC
    `;
    return rows.filter((row)=>canReadRow(actor.access,"calculation.scenario.read",row,actor));
  });
}

export async function listCommercialProposals(actor:Actor):Promise<CommercialProposalRow[]> {
  if(actor.demo)return allowed(actor,"sales.proposal.read",demo.proposals);
  requireCapability(actor,"sales.proposal.read");
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<CommercialProposalRow[]>`
      SELECT p.id,p.organization_id "organizationId",p.request_id "requestId",r.title request,
             COALESCE(c.name,NULLIF(r.company_name_text,''),'Не указана') client,r.client_company_id "clientId",
             p.version,p.status,cardinality(p.scenario_ids)::int "scenarioCount",COALESCE(p.total_value,0) "totalValue",
             to_char(p.valid_until,'DD.MM.YYYY') "validUntil",to_char(p.sent_at,'DD.MM.YYYY HH24:MI') "sentAt",
             to_char(p.accepted_at,'DD.MM.YYYY HH24:MI') "acceptedAt",p.supersedes_proposal_id "supersedesProposalId",
             p.client_payload "clientPayload",to_char(p.created_at,'DD.MM.YYYY') "createdAt",u.display_name "createdBy",
             r.region_id "regionId",r.owner_user_id "ownerUserId",p.created_by_user_id "createdByUserId",r.assigned_team_id "teamId"
      FROM proposals p JOIN requests r ON r.id=p.request_id
      LEFT JOIN client_companies c ON c.id=r.client_company_id JOIN app_users u ON u.id=p.created_by_user_id
      ORDER BY p.created_at DESC,p.version DESC
    `;
    return rows.filter((row)=>canReadRow(actor.access,"sales.proposal.read",row,actor));
  });
}

export async function listCommercialApprovals(actor:Actor,requestId?:string):Promise<CommercialApprovalRow[]> {
  if(actor.demo){
    requireCapability(actor,"calculation.scenario.read");
    const scenarioIds=requestId?demo.calculations.filter((row)=>row.requestId===requestId).map((row)=>row.id):null;
    return demo.approvals.filter((row)=>!scenarioIds||scenarioIds.includes(row.scenarioId));
  }
  requireCapability(actor,"calculation.scenario.read");
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<CommercialApprovalRow[]>`
    SELECT ca.id,ca.calculation_scenario_id "scenarioId",cs.name scenario,ca.round,ca.status,
           to_char(ca.requested_at,'DD.MM.YYYY HH24:MI') "requestedAt",requester.display_name "requestedBy",
           assignee.display_name "assignedTo",to_char(ca.decided_at,'DD.MM.YYYY HH24:MI') "decidedAt",decider.display_name "decidedBy",ca.comment
    FROM calculation_approvals ca JOIN calculation_scenarios cs ON cs.id=ca.calculation_scenario_id
    JOIN calculations c ON c.id=cs.calculation_id
    JOIN app_users requester ON requester.id=ca.requested_by_user_id
    LEFT JOIN app_users assignee ON assignee.id=ca.assigned_to_user_id LEFT JOIN app_users decider ON decider.id=ca.decided_by_user_id
    WHERE (${requestId??null}::uuid IS NULL OR c.request_id=${requestId??null}::uuid)
    ORDER BY ca.requested_at DESC
  `);
}

export async function listRequestComments(actor:Actor,requestId:string):Promise<CommercialCommentRow[]> {
  requireCapability(actor,"sales.request.read");
  if(actor.demo){
    const scenarioIds=demo.calculations.filter((row)=>row.requestId===requestId).map((row)=>row.id);
    const proposalIds=demo.proposals.filter((row)=>row.requestId===requestId).map((row)=>row.id);
    return demo.comments.filter((row)=>row.entityId===requestId||scenarioIds.includes(row.entityId)||proposalIds.includes(row.entityId));
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<CommercialCommentRow[]>`
    SELECT cm.id,cm.entity_type "entityType",cm.entity_id "entityId",cm.comment_type type,cm.body,u.display_name author,
           to_char(cm.created_at,'DD.MM.YYYY HH24:MI') "createdAt",cm.visibility
    FROM comments cm JOIN app_users u ON u.id=cm.created_by_user_id
    WHERE (cm.entity_type='request' AND cm.entity_id=${requestId}::uuid)
       OR (cm.entity_type IN ('calculation','calculation_scenario') AND cm.entity_id IN (
         SELECT cs.id FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id WHERE c.request_id=${requestId}::uuid
       ))
       OR (cm.entity_type='proposal' AND cm.entity_id IN (SELECT p.id FROM proposals p WHERE p.request_id=${requestId}::uuid))
    ORDER BY cm.created_at DESC
  `);
}

export async function listRequestHistory(actor:Actor,requestId:string):Promise<CommercialHistoryRow[]> {
  requireCapability(actor,"sales.request.read");
  if(actor.demo)return demo.history.filter((row)=>row.entityId===requestId||row.metadata?.requestId===requestId);
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<CommercialHistoryRow[]>`
    SELECT ae.id,ae.verb,ae.summary,COALESCE(u.display_name,'Система') actor,to_char(ae.created_at,'DD.MM.YYYY HH24:MI') "createdAt",
           ae.entity_type "entityType",ae.entity_id "entityId",ae.metadata
    FROM activity_events ae LEFT JOIN app_users u ON u.id=ae.actor_user_id
    WHERE (ae.entity_type='request' AND ae.entity_id=${requestId}::uuid) OR ae.metadata->>'requestId'=${requestId}
    ORDER BY ae.created_at DESC
  `);
}

export async function listRequestProvisions(actor:Actor,requestId:string):Promise<ProvisionRow[]> {
  requireCapability(actor,"sales.request.read");
  if(actor.demo)return demo.provisions[requestId]??[];
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<ProvisionRow[]>`
    SELECT id,code,provider,amount,unit,comment,parameters FROM request_provisions WHERE request_id=${requestId}::uuid ORDER BY code
  `);
}

export async function listCommercialRates(actor:Actor):Promise<CommercialRateRow[]> {
  if(actor.demo)return allowed(actor,"calculation.rate_reference.read",demo.rates);
  requireCapability(actor,"calculation.rate_reference.read");
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<CommercialRateRow[]>`
      SELECT rr.id,rr.organization_id "organizationId",s.name specialty,COALESCE(rg.name,'Без региона') region,rr.region_id "regionId",
             rr.employment_model "employmentModel",rr.amount_min "amountMin",rr.amount_max "amountMax",rr.unit,
             COALESCE(rr.gross_net,rr.pay_semantics) "grossNet",rr.source,COALESCE(to_char(rr.source_date,'DD.MM.YYYY'),'—') "sourceDate",
             rr.confidence,COALESCE(rr.comment,rr.notes) comment,rr.source_kind "sourceKind",rr.schedule_code "scheduleCode",
             rr.workforce_mode "workforceMode",rr.housing_included "housingIncluded",rr.seasonality,rr.worker_pay "workerPay",
             rr.client_offer_rate "clientOfferRate",rr.actual_object_rate "actualObjectRate",rr.actual_margin_pct "actualMarginPct",
             rr.created_by_user_id "createdByUserId"
      FROM rate_reference_entries rr JOIN specialties s ON s.id=rr.specialty_id LEFT JOIN regions rg ON rg.id=rr.region_id
      ORDER BY rr.source_date DESC NULLS LAST
    `;
    return rows.filter((row)=>canReadRow(actor.access,"calculation.rate_reference.read",row,actor));
  });
}

export async function listCommercialRules(actor:Actor):Promise<CommercialRuleRow[]> {
  if(actor.demo){requireCapability(actor,"calculation.rules.read");return demo.rules;}
  requireCapability(actor,"calculation.rules.read");
  return withTenant(actor.organizationId,actor.userId,async sql=>sql<CommercialRuleRow[]>`
    SELECT id,category,version,to_char(effective_from,'DD.MM.YYYY') "effectiveFrom",to_char(effective_to,'DD.MM.YYYY') "effectiveTo",
           verified,source,rules_json rules,to_char(created_at,'DD.MM.YYYY HH24:MI') "createdAt"
    FROM commercial_rule_versions ORDER BY category,effective_from DESC,version DESC
  `);
}

export async function getCalculatorModelRules(actor:Actor):Promise<CalculatorModelRule[]> {
  requireCapability(actor,"calculation.scenario.read");
  if(actor.demo)return demo.calculatorModelRules;
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const common=await sql<Array<{rules:Record<string,unknown>}>>`
      SELECT rules_json rules FROM commercial_rule_versions
      WHERE category='commercial_defaults' AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
      ORDER BY effective_from DESC,version DESC LIMIT 1
    `;
    const commonRules=common[0]?.rules??{};
    const models=await sql<Array<{code:string;label:string;modelType:string;ruleVersionId:string|null;rules:Record<string,unknown>|null}>>`
      SELECT cm.code,cm.name label,cm.model_type "modelType",rv.id "ruleVersionId",rv.rules_json rules
      FROM calculation_models cm
      LEFT JOIN LATERAL (
        SELECT x.id,x.rules_json FROM calculation_rule_versions x WHERE x.calculation_model_id=cm.id
          AND x.effective_from<=current_date AND (x.effective_to IS NULL OR x.effective_to>=current_date)
        ORDER BY x.effective_from DESC,x.version DESC LIMIT 1
      ) rv ON true
      WHERE cm.active=true ORDER BY cm.name
    `;
    const number=(value:unknown,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
    return models.map((row)=>{
      const rules=row.rules??{};
      const defaults=(rules.defaults??commonRules.defaults??{}) as Record<string,unknown>;
      return {
        code:(row.modelType==='employment'?'employment':row.modelType==='gph'?'gph':row.modelType==='npd'?'npd':'custom') as CalculatorModelRule["code"],
        label:row.label,ruleVersionId:row.ruleVersionId,verified:Boolean(row.ruleVersionId),
        mandatoryChargePct:number(rules.mandatoryChargePct??rules.payrollChargePct),vatRatePct:number(commonRules.vatRatePct??rules.vatRatePct),
        minimumMarginPct:number(commonRules.minimumMarginPct,0),recommendedMarginPct:number(commonRules.recommendedMarginPct,15),
        defaults:{
          housingPerShift:number(defaults.housingPerShift),transportPerHour:number(defaults.transportPerHour),workwearPerWorkerMonth:number(defaults.workwearPerWorkerMonth),ppePerWorkerMonth:number(defaults.ppePerWorkerMonth),medicalPerWorkerMonth:number(defaults.medicalPerWorkerMonth),recruitmentProjectMonth:number(defaults.recruitmentProjectMonth),managementProjectMonth:number(defaults.managementProjectMonth),
        },
      };
    });
  });
}
