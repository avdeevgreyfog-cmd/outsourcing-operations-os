import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type CommercialCalculationRow = {
  id: string;
  organizationId: string;
  requestId: string;
  request: string;
  role: string;
  requestRoleId: string;
  name: string;
  model: string;
  modelCode: string;
  status: string;
  workerNet: number | string;
  totalCost: number | string;
  clientRate: number | string;
  clientRateGross: number | string | null;
  billingUnit: string;
  pricingMode: string;
  marginPct: number | string;
  monthlyContribution: number | string;
  ruleVersion: number | null;
  ruleSource: string | null;
  createdByUserId?: string;
  ownerUserId?: string | null;
  teamId?: string | null;
  regionId?: string | null;
};

export async function listCommercialCalculations(actor: Actor): Promise<CommercialCalculationRow[]> {
  requireCapability(actor, "calculation.scenario.read");
  if (actor.demo) {
    return demo.calculations.map((item, index) => ({
      ...item,
      requestRoleId: index === 0 ? "74000000-0000-4000-8000-000000000001" : "74000000-0000-4000-8000-000000000002",
      modelCode: item.model === "Employment / TK" || item.model === "Employment" ? "employment" : String(item.model).toLowerCase(),
      clientRateGross: Number(item.clientRate) * 1.22,
      billingUnit: "hour",
      pricingMode: "target_margin",
      ruleVersion: 1,
      ruleSource: "Демонстрационная версия правил",
    })) as CommercialCalculationRow[];
  }
  return withTenant(actor.organizationId, actor.userId, async (sql) => {
    const rows = await sql<CommercialCalculationRow[]>`
      SELECT cs.id,cs.organization_id "organizationId",cs.name,cs.status,
        c.owner_user_id "ownerUserId",cs.created_by_user_id "createdByUserId",r.region_id "regionId",r.assigned_team_id "teamId",
        r.id "requestId",r.title request,rr.id "requestRoleId",s.name role,cm.name model,cm.code "modelCode",
        COALESCE((cs.inputs_snapshot->>'workerPayAmount')::numeric,(cs.inputs_snapshot->>'workerNetHourly')::numeric,0) "workerNet",
        COALESCE((cs.result_snapshot->>'totalCostHourly')::numeric,0) "totalCost",
        COALESCE((cs.result_snapshot->>'clientRateNet')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric,0) "clientRate",
        (cs.result_snapshot->>'clientRateGross')::numeric "clientRateGross",
        COALESCE(cs.result_snapshot->>'billingUnit','hour') "billingUnit",
        COALESCE(cs.result_snapshot->>'pricingMode','target_margin') "pricingMode",
        COALESCE((cs.result_snapshot->>'marginPct')::numeric,0) "marginPct",
        COALESCE((cs.result_snapshot->>'monthlyContribution')::numeric,0) "monthlyContribution",
        rv.version "ruleVersion",rv.source "ruleSource"
      FROM calculation_scenarios cs
      JOIN calculations c ON c.id=cs.calculation_id
      JOIN requests r ON r.id=c.request_id
      JOIN request_roles rr ON rr.id=cs.request_role_id
      JOIN specialties s ON s.id=rr.specialty_id
      JOIN calculation_models cm ON cm.id=cs.model_id
      LEFT JOIN calculation_rule_versions rv ON rv.id=cs.rule_version_id
      ORDER BY cs.created_at DESC
    `;
    return rows.filter((row) => canReadRow(actor.access, "calculation.scenario.read", row, actor));
  });
}
