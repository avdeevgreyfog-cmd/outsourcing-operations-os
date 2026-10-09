import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";
import { rankRateReferences } from "@/lib/commercial/rate-selection.mjs";

export type CalculationWorkspaceMeta = {
  id: string;
  organizationId: string;
  sourceType: "request" | "tender";
  sourceId: string;
  source: string;
  requestId: string | null;
  tenderId: string | null;
  version: number;
  status: string;
  economicsDate: string;
  projectCosts: Array<Record<string, unknown>>;
  allocationMode: "headcount" | "labor_hours";
  supersedesCalculationId: string | null;
  ownerUserId: string | null;
  createdByUserId: string;
  teamId: string | null;
  regionId: string | null;
  clientId: string | null;
  createdAt: string;
};

export type RateReference = {
  id: string;
  amountMin: number;
  amountMax: number;
  unit: string;
  paySemantics: string;
  employmentModel: string;
  source: string;
  sourceDate: string;
  confidence: string;
  regionId?: string | null;
  sourceType?: string | null;
  sourceStatus?: string | null;
  scheduleLabel?: string | null;
  alternatives?: RateReference[];
};

export type SupplyKitReference = {
  templateId:string;
  specialtyId:string;
  specialty:string;
  items:Array<{
    itemId:string;
    item:string;
    quantity:number;
    unit:string;
    replacementCycleDays:number|null;
    unitCost:number|null;
    priceId:string|null;
    priceEffectiveFrom:string|null;
  }>;
};

export type CalculationScenarioSeed = {
  id: string;
  organizationId: string;
  calculationId: string;
  sourceRoleId: string;
  modelId: string;
  name: string;
  inputs: Record<string, unknown>;
  costs: Array<Record<string, unknown>>;
  ownerUserId: string | null;
  createdByUserId: string;
  teamId: string | null;
  regionId: string | null;
  clientId: string | null;
};

export async function getCalculationWorkspaceMeta(actor: Actor, id: string): Promise<CalculationWorkspaceMeta | null> {
  requireCapability(actor, "calculation.scenario.read");
  if (actor.demo) return null;
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [row] = await sql<CalculationWorkspaceMeta[]>`
      SELECT c.id,c.organization_id "organizationId",
        CASE WHEN c.tender_id IS NOT NULL THEN 'tender' ELSE 'request' END "sourceType",
        COALESCE(c.tender_id,c.request_id) "sourceId",COALESCE(t.title,r.title,'Без источника') source,
        c.request_id "requestId",c.tender_id "tenderId",c.version,c.status,c.economics_date::text "economicsDate",
        COALESCE(c.project_costs_json,'[]'::jsonb) "projectCosts",c.allocation_mode "allocationMode",
        c.supersedes_calculation_id "supersedesCalculationId",c.owner_user_id "ownerUserId",c.created_by_user_id "createdByUserId",
        COALESCE(t.assigned_team_id,r.assigned_team_id) "teamId",COALESCE(t.region_id,r.region_id) "regionId",
        COALESCE(t.client_company_id,r.client_company_id) "clientId",c.created_at::text "createdAt"
      FROM calculations c
      LEFT JOIN requests r ON r.id=c.request_id
      LEFT JOIN tenders t ON t.id=c.tender_id
      WHERE c.id=${id}::uuid
    `;
    if (!row || !canReadRow(actor.access, "calculation.scenario.read", row, actor)) return null;
    return row;
  });
}

export async function getCalculationScenarioSeed(actor: Actor, scenarioId: string): Promise<CalculationScenarioSeed | null> {
  requireCapability(actor, "calculation.scenario.read");
  if (actor.demo) return null;
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const [row] = await sql<CalculationScenarioSeed[]>`
      SELECT cs.id,cs.organization_id "organizationId",cs.calculation_id "calculationId",COALESCE(cs.request_role_id,cs.tender_role_id) "sourceRoleId",
        cs.model_id "modelId",cs.name,cs.inputs_snapshot inputs,cs.cost_snapshot costs,c.owner_user_id "ownerUserId",cs.created_by_user_id "createdByUserId",
        COALESCE(r.assigned_team_id,t.assigned_team_id) "teamId",COALESCE(r.region_id,t.region_id) "regionId",COALESCE(r.client_company_id,t.client_company_id) "clientId"
      FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id
      LEFT JOIN requests r ON r.id=c.request_id LEFT JOIN tenders t ON t.id=c.tender_id
      WHERE cs.id=${scenarioId}::uuid
    `;
    if (!row || !canReadRow(actor.access, "calculation.scenario.read", row, actor)) return null;
    return row;
  });
}

export async function getSupplyKitReferencesForRoles(
  actor: Actor,
  roles: Array<{ id:string; specialtyId:string|null|undefined; specialty:string }>,
  effectiveDate?: string | null,
): Promise<Record<string,SupplyKitReference>> {
  requireCapability(actor,"calculation.scenario.read");
  const output:Record<string,SupplyKitReference>={};
  if(actor.demo){
    for(const role of roles){
      if(!role.specialtyId)continue;
      output[role.id]={
        templateId:"demo-supply-kit-"+role.specialtyId,specialtyId:role.specialtyId,specialty:role.specialty,
        items:[
          {itemId:"demo-item-jacket",item:"Куртка рабочая",quantity:1,unit:"шт",replacementCycleDays:180,unitCost:4200,priceId:"demo-price-jacket",priceEffectiveFrom:"2026-09-01"},
          {itemId:"demo-item-boots",item:"Ботинки рабочие",quantity:1,unit:"пар",replacementCycleDays:180,unitCost:3200,priceId:"demo-price-boots",priceEffectiveFrom:"2026-09-01"},
          {itemId:"demo-item-gloves",item:"Перчатки рабочие",quantity:1,unit:"пар",replacementCycleDays:7,unitCost:120,priceId:"demo-price-gloves",priceEffectiveFrom:"2026-09-01"},
        ],
      };
    }
    return output;
  }
  const date=effectiveDate&&/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)?effectiveDate:null;
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    for(const role of roles){
      if(!role.specialtyId)continue;
      const [row]=await sql<Array<SupplyKitReference>>`
        SELECT t.id "templateId",t.specialty_id "specialtyId",s.name specialty,
          COALESCE(jsonb_agg(jsonb_build_object(
            'itemId',i.id,'item',i.name,'quantity',ti.quantity::numeric,'unit',i.unit,
            'replacementCycleDays',COALESCE(ti.replacement_cycle_days,i.default_replacement_cycle_days),
            'unitCost',price.unit_cost::numeric,'priceId',price.id,'priceEffectiveFrom',price.effective_from::text
          ) ORDER BY i.name) FILTER (WHERE ti.id IS NOT NULL),'[]'::jsonb) items
        FROM object_ppe_templates t
        JOIN specialties s ON s.id=t.specialty_id
        LEFT JOIN object_ppe_template_items ti ON ti.template_id=t.id
        LEFT JOIN inventory_items i ON i.id=ti.item_id
        LEFT JOIN LATERAL (
          SELECT p.id,p.unit_cost,p.effective_from
          FROM inventory_item_prices p
          WHERE p.item_id=i.id AND p.variant_id IS NULL
            AND p.effective_from<=COALESCE(${date}::date,current_date)
            AND (p.effective_to IS NULL OR p.effective_to>=COALESCE(${date}::date,current_date))
          ORDER BY p.effective_from DESC,p.created_at DESC LIMIT 1
        ) price ON true
        WHERE t.object_id IS NULL AND t.specialty_id=${role.specialtyId}::uuid AND t.active
        GROUP BY t.id,t.specialty_id,s.name
        ORDER BY t.updated_at DESC LIMIT 1
      `;
      if(row)output[role.id]={...row,items:row.items.map(item=>({...item,quantity:Number(item.quantity),unitCost:item.unitCost==null?null:Number(item.unitCost)}))};
    }
    return output;
  });
}

export async function getRateReferencesForRoles(
  actor: Actor,
  roles: Array<{ id: string; specialtyId: string | null | undefined; specialty?: string }>,
  regionId: string | null | undefined,
  effectiveDate?: string | null,
): Promise<Record<string, RateReference>> {
  requireCapability(actor, "calculation.rate_reference.read");
  if (actor.demo) {
    const output: Record<string, RateReference> = {};
    for (const role of roles) {
      const reference = demo.rateReferences.find(item => item.specialty === role.specialty && (!regionId || item.regionId === regionId))
        ?? demo.rateReferences.find(item => item.specialty === role.specialty);
      if (!reference) continue;
      output[role.id] = {
        id: reference.id,
        amountMin: Number(reference.amountMin),
        amountMax: Number(reference.amountMax),
        unit: reference.unit === "ч" ? "hour" : reference.unit,
        paySemantics: reference.grossNet === "На руки" ? "net" : "gross",
        employmentModel: reference.employmentModel,
        source: reference.source,
        sourceDate: reference.sourceDate,
        confidence: reference.confidence,
      };
    }
    return output;
  }
  const date = effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate) ? effectiveDate : null;
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const output: Record<string, RateReference> = {};
    for (const role of roles) {
      if (!role.specialtyId) continue;
      const candidates = await sql<Array<{
        id:string;amountMin:number|string;amountMax:number|string|null;unit:string;paySemantics:string;
        employmentModel:string;source:string;sourceDate:string;confidence:string;regionId:string|null;
        sourceType:string;sourceStatus:string;scheduleLabel:string|null;
      }>>`
        SELECT rr.id,rr.amount_min "amountMin",COALESCE(rr.amount_max,rr.amount_min) "amountMax",
          rr.unit,rr.pay_semantics "paySemantics",rr.employment_model "employmentModel",
          rr.source,rr.source_date::text "sourceDate",rr.confidence,rr.region_id "regionId",
          rr.source_type "sourceType",rr.source_status "sourceStatus",rr.schedule_label "scheduleLabel"
        FROM rate_reference_entries rr
        WHERE rr.organization_id=${actor.organizationId}::uuid AND rr.specialty_id=${role.specialtyId}::uuid
          AND rr.amount_min IS NOT NULL
          AND (${regionId ?? null}::uuid IS NULL OR rr.region_id=${regionId ?? null}::uuid OR rr.region_id IS NULL)
          AND rr.source_date<=COALESCE(${date}::date,current_date)
          AND rr.valid_from<=COALESCE(${date}::date,current_date)
          AND (rr.valid_to IS NULL OR rr.valid_to>=COALESCE(${date}::date,current_date))
        ORDER BY rr.source_date DESC,rr.created_at DESC LIMIT 60
      `;
      const selected=rankRateReferences(candidates,regionId??null,date??new Date().toISOString().slice(0,10));
      if(selected.length){
        const resolved=selected.map(row=>({...row,amountMin:Number(row.amountMin),amountMax:Number(row.amountMax)}));
        output[role.id]={...resolved[0],alternatives:resolved.slice(1)};
      }
    }
    return output;
  });
}
