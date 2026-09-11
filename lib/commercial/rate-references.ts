import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";

export type RateMemoryRow = {
  id: string;
  organizationId: string;
  specialty: string;
  region: string;
  regionId?: string | null;
  priceZone?: string | null;
  employmentModel: string;
  amountMin: number | null;
  amountMax: number | null;
  unit: string;
  grossNet: string;
  source: string;
  sourceType: string;
  sourceStatus: string;
  sourceDate: string;
  confidence: string;
  comment?: string | null;
  scheduleLabel?: string | null;
  housingIncluded?: boolean | null;
  shuttleIncluded?: boolean | null;
  fullCostMin?: number | null;
  fullCostMax?: number | null;
  clientRateMin?: number | null;
  clientRateMax?: number | null;
  marginMin?: number | null;
  marginMax?: number | null;
  createdByUserId?: string | null;
};

function demoRows(): RateMemoryRow[] {
  return demo.rateReferences.map((row) => {
    const matching = demo.calculations.filter((item) => item.role === row.specialty && item.regionId === row.regionId);
    const clientRates = matching.map((item) => Number(item.clientRate)).filter(Number.isFinite);
    const costs = matching.map((item) => Number(item.totalCost)).filter(Number.isFinite);
    const margins = matching.map((item) => Number(item.marginPct)).filter(Number.isFinite);
    return {
      id: row.id,
      organizationId: row.organizationId,
      specialty: row.specialty,
      region: row.region,
      regionId: row.regionId,
      priceZone: row.region,
      employmentModel: row.employmentModel,
      amountMin: Number(row.amountMin),
      amountMax: Number(row.amountMax),
      unit: row.unit,
      grossNet: row.grossNet,
      source: row.source,
      sourceType: "manual",
      sourceStatus: "reference",
      sourceDate: row.sourceDate,
      confidence: row.confidence,
      comment: row.comment,
      scheduleLabel: "Стандартные условия",
      housingIncluded: false,
      shuttleIncluded: false,
      fullCostMin: costs.length ? Math.min(...costs) : null,
      fullCostMax: costs.length ? Math.max(...costs) : null,
      clientRateMin: clientRates.length ? Math.min(...clientRates) : null,
      clientRateMax: clientRates.length ? Math.max(...clientRates) : null,
      marginMin: margins.length ? Math.min(...margins) : null,
      marginMax: margins.length ? Math.max(...margins) : null,
      createdByUserId: row.createdByUserId,
    };
  });
}

export async function listRateMemory(actor: Actor): Promise<RateMemoryRow[]> {
  requireCapability(actor, "calculation.rate_reference.read");
  if (actor.demo) return demoRows();
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<RateMemoryRow[]>`
    SELECT rr.id,rr.organization_id "organizationId",s.name specialty,COALESCE(rg.name,'Без региона') region,rr.region_id "regionId",
      COALESCE(NULLIF(to_jsonb(rr)->>'price_zone',''),rg.name) "priceZone",
      rr.employment_model "employmentModel",rr.amount_min::float8 "amountMin",rr.amount_max::float8 "amountMax",rr.unit,
      CASE rr.pay_semantics WHEN 'net' THEN 'На руки' ELSE 'До вычета' END "grossNet",rr.source,
      COALESCE(NULLIF(to_jsonb(rr)->>'source_type',''),'manual') "sourceType",
      COALESCE(NULLIF(to_jsonb(rr)->>'source_status',''),'reference') "sourceStatus",
      rr.source_date::text "sourceDate",rr.confidence,rr.notes comment,
      NULLIF(to_jsonb(rr)->>'schedule_label','') "scheduleLabel",
      NULLIF(to_jsonb(rr)->>'housing_included','')::boolean "housingIncluded",
      NULLIF(to_jsonb(rr)->>'shuttle_included','')::boolean "shuttleIncluded",
      NULLIF(to_jsonb(rr)->>'full_cost_min','')::float8 "fullCostMin",
      NULLIF(to_jsonb(rr)->>'full_cost_max','')::float8 "fullCostMax",
      NULLIF(to_jsonb(rr)->>'client_rate_min','')::float8 "clientRateMin",
      NULLIF(to_jsonb(rr)->>'client_rate_max','')::float8 "clientRateMax",
      NULLIF(to_jsonb(rr)->>'margin_min','')::float8 "marginMin",
      NULLIF(to_jsonb(rr)->>'margin_max','')::float8 "marginMax",
      rr.created_by_user_id "createdByUserId"
    FROM rate_reference_entries rr
    JOIN specialties s ON s.id=rr.specialty_id
    LEFT JOIN regions rg ON rg.id=rr.region_id
    ORDER BY rr.source_date DESC,rr.created_at DESC
  `);
}
