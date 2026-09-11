import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import type { SpecialtyRateStats } from "@/lib/commercial/request-workflow";
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

export type RateMemorySpecialtyStats = SpecialtyRateStats & { specialtyId: string };

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

export async function getRateMemorySpecialtyStats(actor: Actor): Promise<Map<string, RateMemorySpecialtyStats>> {
  requireCapability(actor,"calculation.rate_reference.read");
  if(actor.demo)return new Map();
  const rows=await withTenant(actor.organizationId,actor.userId,async sql=>sql<RateMemorySpecialtyStats[]>`
    SELECT rr.specialty_id "specialtyId",
      count(*) FILTER (WHERE rr.unit='hour')::int "sampleCount",
      min(COALESCE(rr.client_rate_min,rr.client_rate_max)) FILTER (WHERE rr.unit='hour')::float8 "clientRateMin",
      (percentile_cont(0.5) WITHIN GROUP (ORDER BY COALESCE(rr.client_rate_min,rr.client_rate_max)) FILTER (WHERE rr.unit='hour' AND COALESCE(rr.client_rate_min,rr.client_rate_max) IS NOT NULL))::float8 "clientRateMedian",
      max(COALESCE(rr.client_rate_max,rr.client_rate_min)) FILTER (WHERE rr.unit='hour')::float8 "clientRateMax",
      min(COALESCE(rr.amount_min,rr.amount_max)) FILTER (WHERE rr.unit='hour' AND rr.pay_semantics='net')::float8 "workerPayMin",
      max(COALESCE(rr.amount_max,rr.amount_min)) FILTER (WHERE rr.unit='hour' AND rr.pay_semantics='net')::float8 "workerPayMax"
    FROM rate_reference_entries rr
    WHERE rr.valid_from<=current_date AND (rr.valid_to IS NULL OR rr.valid_to>=current_date)
    GROUP BY rr.specialty_id
  `);
  return new Map(rows.map(row=>[row.specialtyId,row]));
}

export function mergeRateStats(base: SpecialtyRateStats, memory?: SpecialtyRateStats): SpecialtyRateStats {
  if(!memory||memory.sampleCount<=0)return base;
  const min=(a:number|null,b:number|null)=>a==null?b:b==null?a:Math.min(a,b);
  const max=(a:number|null,b:number|null)=>a==null?b:b==null?a:Math.max(a,b);
  const weightedMedian=base.clientRateMedian??memory.clientRateMedian;
  return {
    sampleCount:base.sampleCount+memory.sampleCount,
    clientRateMin:min(base.clientRateMin,memory.clientRateMin),
    clientRateMedian:weightedMedian,
    clientRateMax:max(base.clientRateMax,memory.clientRateMax),
    workerPayMin:min(base.workerPayMin,memory.workerPayMin),
    workerPayMax:max(base.workerPayMax,memory.workerPayMax),
  };
}
