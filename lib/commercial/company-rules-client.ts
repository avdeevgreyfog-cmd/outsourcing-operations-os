"use client";

import type { CalculationModelOption } from "@/lib/commercial/calculation-models";
import type { ExpenseStandard, ScheduleStandard } from "@/lib/commercial/calculation-standards";

export type CompanyRulesDraft = {
  models: CalculationModelOption[];
  expenses: ExpenseStandard[];
  schedules: ScheduleStandard[];
  commercialPolicy?: CommercialPolicy;
};

export type CommercialPolicy = {
  minimumMarginPct: number;
  recommendedMarginPct: number;
  riskReservePct: number;
  vatPct: number;
  roundingStep: number;
  approvalBelowMarginPct: number;
  notes: string;
};

export const defaultCommercialPolicy: CommercialPolicy = {
  minimumMarginPct: 15,
  recommendedMarginPct: 18,
  riskReservePct: 2,
  vatPct: 22,
  roundingStep: 1,
  approvalBelowMarginPct: 15,
  notes: "Внутренние ориентиры компании. Проверьте применимость перед использованием в сделке.",
};

const KEY = "operis.company-calculation-rules.v1";
const EVENT = "operis:company-calculation-rules";

export function loadCompanyRulesDraft(): CompanyRulesDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<CompanyRulesDraft>;
    if (!Array.isArray(parsed.models) || !Array.isArray(parsed.expenses) || !Array.isArray(parsed.schedules)) return null;
    return { ...parsed, commercialPolicy: { ...defaultCommercialPolicy, ...(parsed.commercialPolicy ?? {}) } } as CompanyRulesDraft;
  } catch { return null; }
}

export function saveCompanyRulesDraft(value: CompanyRulesDraft) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeCompanyRulesDraft(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); };
}
