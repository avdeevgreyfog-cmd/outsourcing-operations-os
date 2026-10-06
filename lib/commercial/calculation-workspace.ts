import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

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
      const [reference] = await sql<Array<{
        id:string;amountMin:number|string;amountMax:number|string;unit:string;paySemantics:string;employmentModel:string;source:string;sourceDate:string;confidence:string;
      }>>`
        SELECT id,amount_min "amountMin",COALESCE(amount_max,amount_min) "amountMax",unit,pay_semantics "paySemantics",employment_model "employmentModel",
          source,source_date::text "sourceDate",confidence
        FROM rate_reference_entries
        WHERE specialty_id=${role.specialtyId}::uuid
          AND amount_min IS NOT NULL
          AND (${regionId ?? null}::uuid IS NULL OR region_id=${regionId ?? null}::uuid OR region_id IS NULL)
          AND valid_from<=COALESCE(${date}::date,current_date)
          AND (valid_to IS NULL OR valid_to>=COALESCE(${date}::date,current_date))
        ORDER BY (region_id=${regionId ?? null}::uuid) DESC,source_date DESC,created_at DESC
        LIMIT 1
      `;
      if (reference) {
        output[role.id] = {
          id: reference.id,
          amountMin: Number(reference.amountMin),
          amountMax: Number(reference.amountMax),
          unit: reference.unit,
          paySemantics: reference.paySemantics,
          employmentModel: reference.employmentModel,
          source: reference.source,
          sourceDate: reference.sourceDate,
          confidence: reference.confidence,
        };
      }
    }
    return output;
  });
}
