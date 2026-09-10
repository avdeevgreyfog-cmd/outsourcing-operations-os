import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type CommercialCalculationRow = {
  id:string;calculationId:string;calculationVersion:number;calculationStatus:string;scenarioVersion:number;supersedesScenarioId:string|null;
  economicsDate:string|null;allocationMode:string;projectCosts:Array<Record<string,unknown>>;createdAt:string;
  organizationId:string;sourceType:"request"|"tender";sourceId:string;source:string;
  requestId:string|null;tenderId:string|null;request:string;role:string;sourceRoleId:string;requestRoleId:string|null;tenderRoleId:string|null;
  name:string;model:string;modelCode:string;status:string;workerNet:number|string;totalCost:number|string;clientRate:number|string;clientRateGross:number|string|null;
  billingUnit:string;billingUnitLabel:string|null;pricingMode:string;marginPct:number|string;monthlyContribution:number|string;warnings:string[];ruleVersion:number|null;ruleSource:string|null;
  rateReference:Record<string,unknown>|null;
  createdByUserId?:string;ownerUserId?:string|null;teamId?:string|null;regionId?:string|null;clientId?:string|null;
};

export async function listCommercialCalculations(actor:Actor):Promise<CommercialCalculationRow[]>{
  requireCapability(actor,"calculation.scenario.read");
  if(actor.demo){
    return demo.calculations.map((item,index)=>({
      ...item,
      calculationId:item.requestId,
      calculationVersion:1,
      calculationStatus:item.status==="accepted"?"approved":item.status==="review"?"review":"draft",
      scenarioVersion:index+1,
      supersedesScenarioId:null,
      economicsDate:"2026-09-01",
      allocationMode:"headcount",
      projectCosts:[],
      createdAt:"2026-09-01T12:00:00+03:00",
      sourceType:"request" as const,sourceId:item.requestId,source:item.request,requestId:item.requestId,tenderId:null,request:item.request,
      sourceRoleId:index===0?"74000000-0000-4000-8000-000000000001":"74000000-0000-4000-8000-000000000002",
      requestRoleId:index===0?"74000000-0000-4000-8000-000000000001":"74000000-0000-4000-8000-000000000002",tenderRoleId:null,
      modelCode:item.model==="Employment / TK"||item.model==="Employment"?"employment":String(item.model).toLowerCase(),clientRateGross:Number(item.clientRate)*1.22,
      billingUnit:"hour",billingUnitLabel:null,pricingMode:"target_margin",warnings:[],ruleVersion:1,ruleSource:"Демонстрационная версия правил",rateReference:null,clientId:null,
    })) as CommercialCalculationRow[];
  }
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<CommercialCalculationRow[]>`
      SELECT cs.id,c.id "calculationId",c.version "calculationVersion",c.status "calculationStatus",cs.version "scenarioVersion",
        cs.supersedes_scenario_id "supersedesScenarioId",c.economics_date::text "economicsDate",c.allocation_mode "allocationMode",
        COALESCE(c.project_costs_json,'[]'::jsonb) "projectCosts",cs.created_at::text "createdAt",
        cs.organization_id "organizationId",cs.name,cs.status,
        CASE WHEN c.tender_id IS NOT NULL THEN 'tender' ELSE 'request' END "sourceType",
        COALESCE(c.tender_id,c.request_id) "sourceId",COALESCE(t.title,r.title,'Без источника') source,
        c.request_id "requestId",c.tender_id "tenderId",COALESCE(r.title,t.title,'Без источника') request,
        COALESCE(tr.title,s.name,'Позиция') role,COALESCE(cs.tender_role_id,cs.request_role_id) "sourceRoleId",cs.request_role_id "requestRoleId",cs.tender_role_id "tenderRoleId",
        c.owner_user_id "ownerUserId",cs.created_by_user_id "createdByUserId",COALESCE(t.assigned_team_id,r.assigned_team_id) "teamId",
        COALESCE(t.region_id,r.region_id) "regionId",COALESCE(t.client_company_id,r.client_company_id) "clientId",
        cm.name model,cm.code "modelCode",
        COALESCE((cs.inputs_snapshot->>'workerPayAmount')::numeric,(cs.inputs_snapshot->>'workerNetHourly')::numeric,0) "workerNet",
        COALESCE((cs.result_snapshot->>'totalCostHourly')::numeric,0) "totalCost",
        COALESCE((cs.result_snapshot->>'clientRateNet')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric,0) "clientRate",
        (cs.result_snapshot->>'clientRateGross')::numeric "clientRateGross",COALESCE(cs.result_snapshot->>'billingUnit','hour') "billingUnit",
        cs.result_snapshot->>'billingUnitLabel' "billingUnitLabel",
        COALESCE(cs.result_snapshot->>'pricingMode','target_margin') "pricingMode",COALESCE((cs.result_snapshot->>'marginPct')::numeric,0) "marginPct",
        COALESCE((cs.result_snapshot->>'monthlyContribution')::numeric,0) "monthlyContribution",
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(cs.result_snapshot->'warnings','[]'::jsonb))),ARRAY[]::text[]) warnings,
        rv.version "ruleVersion",rv.source "ruleSource",cs.rate_reference_snapshot "rateReference"
      FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id
      LEFT JOIN requests r ON r.id=c.request_id LEFT JOIN tenders t ON t.id=c.tender_id
      LEFT JOIN request_roles rr ON rr.id=cs.request_role_id LEFT JOIN specialties s ON s.id=rr.specialty_id
      LEFT JOIN tender_roles tr ON tr.id=cs.tender_role_id
      JOIN calculation_models cm ON cm.id=cs.model_id LEFT JOIN calculation_rule_versions rv ON rv.id=cs.rule_version_id
      ORDER BY c.created_at DESC,cs.created_at DESC
    `;
    return rows.filter(row=>canReadRow(actor.access,"calculation.scenario.read",row,actor));
  });
}
