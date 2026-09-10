import type { Actor } from "@/lib/access/types";
import { withTenant } from "@/lib/db/client";

export type CalculationRuleConfig = {
  mandatoryChargePct?: number;
  mandatoryChargeFixedHourly?: number;
  riskReservePct?: number;
  minimumMarginPct?: number;
  recommendedMarginPct?: number;
  vatPct?: number;
  roundingStep?: number;
  legalParametersVerified?: boolean;
  notes?: string;
  [key: string]: unknown;
};

export type CalculationModelOption = {
  id: string;
  name: string;
  code: string;
  ruleVersionId: string | null;
  ruleVersion: number | null;
  ruleSource: string | null;
  ruleEffectiveFrom: string | null;
  ruleEffectiveTo: string | null;
  rules: CalculationRuleConfig;
};

const demoModels: CalculationModelOption[] = [
  {
    id: "76000000-0000-4000-8000-000000000001",
    name: "Трудовой договор",
    code: "employment",
    ruleVersionId: "77000000-0000-4000-8000-000000000011",
    ruleVersion: 2,
    ruleSource: "Демонстрационные правила компании. Не являются юридической или налоговой рекомендацией.",
    ruleEffectiveFrom: "2026-01-01",
    ruleEffectiveTo: null,
    rules: { mandatoryChargePct: 30, riskReservePct: 2, minimumMarginPct: 15, recommendedMarginPct: 18, vatPct: 22, roundingStep: 1, legalParametersVerified: false },
  },
  {
    id: "76000000-0000-4000-8000-000000000002",
    name: "ГПХ",
    code: "gph",
    ruleVersionId: "77000000-0000-4000-8000-000000000012",
    ruleVersion: 1,
    ruleSource: "Демонстрационные правила компании. Не являются юридической или налоговой рекомендацией.",
    ruleEffectiveFrom: "2026-01-01",
    ruleEffectiveTo: null,
    rules: { mandatoryChargePct: 18, riskReservePct: 3, minimumMarginPct: 16, recommendedMarginPct: 20, vatPct: 22, roundingStep: 1, legalParametersVerified: false },
  },
  {
    id: "76000000-0000-4000-8000-000000000003",
    name: "НПД / самозанятый",
    code: "npd",
    ruleVersionId: "77000000-0000-4000-8000-000000000013",
    ruleVersion: 1,
    ruleSource: "Демонстрационные правила компании. Не являются юридической или налоговой рекомендацией.",
    ruleEffectiveFrom: "2026-01-01",
    ruleEffectiveTo: null,
    rules: { mandatoryChargePct: 7, riskReservePct: 5, minimumMarginPct: 18, recommendedMarginPct: 22, vatPct: 22, roundingStep: 1, legalParametersVerified: false },
  },
  {
    id: "76000000-0000-4000-8000-000000000004",
    name: "Модель компании",
    code: "custom",
    ruleVersionId: "77000000-0000-4000-8000-000000000014",
    ruleVersion: 1,
    ruleSource: "Демонстрационная пользовательская модель.",
    ruleEffectiveFrom: "2026-01-01",
    ruleEffectiveTo: null,
    rules: { mandatoryChargePct: 12, riskReservePct: 4, minimumMarginPct: 17, recommendedMarginPct: 20, vatPct: 22, roundingStep: 1, legalParametersVerified: false },
  },
];

function safeDate(value?: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * Resolve the rule version that is valid on the economics date, not necessarily today.
 * This is important for future launches where a scheduled rule version may already exist.
 */
export async function getCalculationModels(actor: Actor, effectiveDate?: string | null): Promise<CalculationModelOption[]> {
  if (actor.demo) return demoModels;
  const date = safeDate(effectiveDate);
  return withTenant(actor.organizationId, actor.userId, async (sql) => sql<CalculationModelOption[]>`
    SELECT m.id,m.name,m.code,
      rv.id "ruleVersionId",rv.version "ruleVersion",rv.source "ruleSource",
      rv.effective_from::text "ruleEffectiveFrom",rv.effective_to::text "ruleEffectiveTo",
      COALESCE(rv.rules_json,'{}'::jsonb) rules
    FROM calculation_models m
    LEFT JOIN LATERAL (
      SELECT id,version,source,effective_from,effective_to,rules_json
      FROM calculation_rule_versions rv
      WHERE rv.calculation_model_id=m.id
        AND rv.effective_from<=COALESCE(${date}::date,current_date)
        AND (rv.effective_to IS NULL OR rv.effective_to>=COALESCE(${date}::date,current_date))
      ORDER BY rv.version DESC,rv.effective_from DESC
      LIMIT 1
    ) rv ON true
    WHERE m.active
    ORDER BY m.name
  `);
}
