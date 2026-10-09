export function mergeCalculationRules<Model extends object, Policy extends object>(modelRules: Model | undefined, commercialPolicy: Policy): Model & Policy;
export function pricingTargetFields(pricingMode: string, targetProfitPerUnit: number): { targetMonthlyContribution: number; targetProfitPerBillingUnit: number | null };
export type AcceptedEconomicsRow = { monthlyRevenueNet: number | string | null; monthlyCost: number | string | null };
export type AcceptedEconomics = { marginPct: number | null; monthlyContribution: number | null; monthlyRevenueNet: number | null; monthlyCost: number | null };
export function aggregateAcceptedEconomics(rows: AcceptedEconomicsRow[]): AcceptedEconomics;
