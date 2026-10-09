/** Shared financial rules for both preview and persistence. */
export function mergeCalculationRules(modelRules = {}, commercialPolicy = {}) {
  return { ...modelRules, ...commercialPolicy };
}

/** The UI asks for profit per billing unit, not profit per month. */
export function pricingTargetFields(pricingMode, targetProfitPerUnit) {
  const value = Number(targetProfitPerUnit);
  const safeValue = Number.isFinite(value) && value >= 0 ? value : 0;
  return {
    targetMonthlyContribution: 0,
    targetProfitPerBillingUnit: pricingMode === "target_profit" ? safeValue : null,
  };
}

/** Use comparable sums instead of averaging percentages across positions. */
export function aggregateAcceptedEconomics(rows) {
  const unknown = { marginPct: null, monthlyContribution: null, monthlyRevenueNet: null, monthlyCost: null };
  if (!rows.length) return unknown;
  const values = rows.map(row => ({
    revenue: row.monthlyRevenueNet == null ? null : Number(row.monthlyRevenueNet),
    cost: row.monthlyCost == null ? null : Number(row.monthlyCost),
  }));
  if (values.some(v => v.revenue == null || !Number.isFinite(v.revenue) || v.cost == null || !Number.isFinite(v.cost))) return unknown;
  const revenue = values.reduce((total,v) => total + v.revenue, 0);
  const cost = values.reduce((total,v) => total + v.cost, 0);
  return { marginPct: revenue > 0 ? (revenue - cost) / revenue * 100 : null,
    monthlyContribution: revenue - cost, monthlyRevenueNet: revenue, monthlyCost: cost };
}
