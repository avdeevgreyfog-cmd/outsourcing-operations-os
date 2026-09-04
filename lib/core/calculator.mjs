export const PERIOD_HOURS = Object.freeze({ hour: 1, shift: 11, month: 242 });

export const BILLING_UNITS = Object.freeze({
  hour: "hour",
  shift: "shift",
  unit: "unit",
  worker_month: "worker_month",
  project_month: "project_month",
  project_fixed: "project_fixed",
  mixed: "mixed",
});

/**
 * Backward-compatible wrapper for historical callers.
 * New commercial scenarios should use calculateCommercialScenario so pricing,
 * VAT and billing-unit semantics remain explicit in the snapshot.
 */
export function calculateScenario(input) {
  const hoursPerWorker = input.hoursPerWorker ?? PERIOD_HOURS.month;
  const workers = input.workers ?? 1;
  const directHourly = input.workerNetHourly + sumEnabled(input.employeeCosts);
  const projectHourly = sumEnabled(input.projectCosts) / Math.max(1, hoursPerWorker * workers);
  const totalCostHourly = directHourly + projectHourly;
  const targetMargin = clamp(input.targetMarginPct ?? 15, 0, 95) / 100;
  const clientRateHourly = input.clientRateHourly ?? roundMoney(totalCostHourly / (1 - targetMargin));
  const marginHourly = clientRateHourly - totalCostHourly;
  const marginPct = clientRateHourly === 0 ? 0 : (marginHourly / clientRateHourly) * 100;
  return {
    directHourly: roundMoney(directHourly),
    projectHourly: roundMoney(projectHourly),
    totalCostHourly: roundMoney(totalCostHourly),
    clientRateHourly: roundMoney(clientRateHourly),
    marginHourly: roundMoney(marginHourly),
    marginPct: roundMoney(marginPct),
    monthlyRevenue: roundMoney(clientRateHourly * hoursPerWorker * workers),
    monthlyCost: roundMoney(totalCostHourly * hoursPerWorker * workers),
    monthlyContribution: roundMoney(marginHourly * hoursPerWorker * workers)
  };
}

/**
 * Commercial engine. All legal/tax percentages are supplied through the active
 * rule version; the calculator itself contains no jurisdiction-specific tax rate.
 */
export function calculateCommercialScenario(input) {
  const workers = positive(input.workers, 1);
  const hoursPerWorker = positive(input.hoursPerWorker, PERIOD_HOURS.month);
  const hoursPerShift = positive(input.hoursPerShift, PERIOD_HOURS.shift);
  const shiftsPerWorker = positive(input.shiftsPerWorker, hoursPerWorker / hoursPerShift);
  const projectMonths = positive(input.projectMonths, 1);
  const rules = input.rules ?? {};

  const workerPayUnit = input.workerPayUnit ?? "hour";
  const workerPayAmount = nonNegative(input.workerPayAmount ?? input.workerNetHourly ?? 0);
  const workerPayMonthly = convertWorkerPayToMonthly(workerPayAmount, workerPayUnit, {
    workers, hoursPerWorker, shiftsPerWorker,
  });

  const mandatoryChargePct = nonNegative(rules.mandatoryChargePct ?? 0);
  const mandatoryChargeFixedHourly = nonNegative(rules.mandatoryChargeFixedHourly ?? 0);
  const configuredMandatoryMonthly = workerPayMonthly * mandatoryChargePct / 100
    + mandatoryChargeFixedHourly * hoursPerWorker * workers;

  const additionalMonthly = (input.costs ?? []).filter((item) => item.enabled !== false)
    .reduce((sum, item) => sum + normalizeCostMonthly(item, {
      workers, hoursPerWorker, hoursPerShift, shiftsPerWorker, projectMonths,
      unitsPerWorkerShift: positive(input.unitsPerWorkerShift, 1),
    }), 0);

  const reservePct = nonNegative(rules.riskReservePct ?? 0);
  const subtotalBeforeReserve = workerPayMonthly + configuredMandatoryMonthly + additionalMonthly;
  const reserveMonthly = subtotalBeforeReserve * reservePct / 100;
  const monthlyCost = subtotalBeforeReserve + reserveMonthly;
  const totalCostHourly = monthlyCost / Math.max(1, hoursPerWorker * workers);

  const targetMarginPct = clamp(input.targetMarginPct ?? rules.recommendedMarginPct ?? 15, 0, 95);
  const minimumMarginPct = clamp(rules.minimumMarginPct ?? 0, 0, 95);
  const pricingMode = input.pricingMode === "client_limit" ? "client_limit" : "target_margin";
  const billingUnit = input.billingUnit ?? "hour";
  const variableBillingUnit = input.variableBillingUnit ?? "hour";
  const unitsPerWorkerShift = positive(input.unitsPerWorkerShift, 1);
  const fixedMonthlyNet = nonNegative(input.fixedMonthlyNet ?? 0);
  const minimumMonthlyNet = nonNegative(input.minimumMonthlyNet ?? 0);
  const vatPct = input.vatMode === "without_vat" || input.vatMode === "not_applicable"
    ? 0
    : nonNegative(input.vatPct ?? rules.vatPct ?? 0);

  const targetRevenueMonthly = monthlyCost / Math.max(0.05, 1 - targetMarginPct / 100);
  const billing = resolveBillingVolume({
    billingUnit,
    variableBillingUnit,
    workers,
    hoursPerWorker,
    shiftsPerWorker,
    unitsPerWorkerShift,
    projectMonths,
  });

  let clientRateNet;
  let revenueNetMonthly;
  let variableRateNet = null;

  if (billingUnit === "mixed") {
    const variableVolume = billing.variableVolumeMonthly;
    if (pricingMode === "client_limit") {
      variableRateNet = toNet(nonNegative(input.clientLimit ?? 0), input.clientLimitVatMode ?? "without_vat", vatPct);
      revenueNetMonthly = fixedMonthlyNet + variableRateNet * variableVolume;
    } else {
      const variableRevenueRequired = Math.max(0, targetRevenueMonthly - fixedMonthlyNet);
      variableRateNet = variableRevenueRequired / Math.max(1, variableVolume);
      revenueNetMonthly = fixedMonthlyNet + variableRateNet * variableVolume;
    }
    clientRateNet = variableRateNet;
  } else if (pricingMode === "client_limit") {
    clientRateNet = toNet(nonNegative(input.clientLimit ?? 0), input.clientLimitVatMode ?? "without_vat", vatPct);
    revenueNetMonthly = billingUnit === "project_fixed"
      ? clientRateNet / projectMonths
      : clientRateNet * billing.volumeMonthly;
  } else {
    clientRateNet = billingUnit === "project_fixed"
      ? targetRevenueMonthly * projectMonths
      : targetRevenueMonthly / Math.max(1, billing.volumeMonthly);
    revenueNetMonthly = billingUnit === "project_fixed"
      ? clientRateNet / projectMonths
      : clientRateNet * billing.volumeMonthly;
  }

  revenueNetMonthly = Math.max(revenueNetMonthly, minimumMonthlyNet);
  if (billingUnit !== "mixed" && billingUnit !== "project_fixed" && billing.volumeMonthly > 0 && minimumMonthlyNet > 0) {
    clientRateNet = Math.max(clientRateNet, minimumMonthlyNet / billing.volumeMonthly);
  }

  const roundingStep = positive(input.roundingStep ?? rules.roundingStep, 0.01);
  clientRateNet = roundToStep(clientRateNet, roundingStep);
  if (variableRateNet !== null) variableRateNet = roundToStep(variableRateNet, roundingStep);

  if (billingUnit === "mixed") {
    revenueNetMonthly = Math.max(minimumMonthlyNet, fixedMonthlyNet + clientRateNet * billing.variableVolumeMonthly);
  } else if (billingUnit === "project_fixed") {
    revenueNetMonthly = Math.max(minimumMonthlyNet, clientRateNet / projectMonths);
  } else {
    revenueNetMonthly = Math.max(minimumMonthlyNet, clientRateNet * billing.volumeMonthly);
  }

  const clientRateGross = roundMoney(clientRateNet * (1 + vatPct / 100));
  const clientVatAmount = roundMoney(clientRateGross - clientRateNet);
  const monthlyVat = roundMoney(revenueNetMonthly * vatPct / 100);
  const monthlyRevenueGross = roundMoney(revenueNetMonthly + monthlyVat);
  const monthlyContribution = revenueNetMonthly - monthlyCost;
  const marginPct = revenueNetMonthly <= 0 ? 0 : monthlyContribution / revenueNetMonthly * 100;
  const costPerBillingUnit = billingUnit === "project_fixed"
    ? monthlyCost * projectMonths
    : billingUnit === "mixed"
      ? monthlyCost / Math.max(1, billing.variableVolumeMonthly)
      : monthlyCost / Math.max(1, billing.volumeMonthly);
  const breakEvenRateNet = billingUnit === "project_fixed"
    ? monthlyCost * projectMonths
    : billingUnit === "mixed"
      ? Math.max(0, monthlyCost - fixedMonthlyNet) / Math.max(1, billing.variableVolumeMonthly)
      : costPerBillingUnit;
  const breakEvenRateGross = breakEvenRateNet * (1 + vatPct / 100);

  const clientLimitNet = input.clientLimit == null
    ? null
    : toNet(nonNegative(input.clientLimit), input.clientLimitVatMode ?? "without_vat", vatPct);
  const clientLimitDeviation = clientLimitNet == null ? null : clientRateNet - clientLimitNet;

  const warnings = [];
  if (marginPct + 0.0001 < minimumMarginPct) warnings.push("below_minimum_margin");
  if (clientLimitDeviation != null && clientLimitDeviation > 0.009) warnings.push("above_client_limit");
  if (rules.legalParametersVerified === false) warnings.push("rules_unverified");
  if (!input.ruleVersionId) warnings.push("rule_version_missing");

  return {
    pricingMode,
    billingUnit,
    variableBillingUnit: billingUnit === "mixed" ? variableBillingUnit : null,
    workers,
    hoursPerWorker: roundMoney(hoursPerWorker),
    shiftsPerWorker: roundMoney(shiftsPerWorker),
    billableVolumeMonthly: roundMoney(billing.volumeMonthly),
    variableVolumeMonthly: billingUnit === "mixed" ? roundMoney(billing.variableVolumeMonthly) : null,
    workerPayMonthly: roundMoney(workerPayMonthly),
    workerPayHourly: roundMoney(workerPayMonthly / Math.max(1, hoursPerWorker * workers)),
    mandatoryChargesMonthly: roundMoney(configuredMandatoryMonthly),
    additionalCostsMonthly: roundMoney(additionalMonthly),
    reserveMonthly: roundMoney(reserveMonthly),
    monthlyCost: roundMoney(monthlyCost),
    totalCostHourly: roundMoney(totalCostHourly),
    costPerBillingUnit: roundMoney(costPerBillingUnit),
    targetMarginPct: roundMoney(targetMarginPct),
    minimumMarginPct: roundMoney(minimumMarginPct),
    marginPct: roundMoney(marginPct),
    clientRateNet: roundMoney(clientRateNet),
    clientVatAmount,
    clientRateGross,
    vatPct: roundMoney(vatPct),
    monthlyRevenueNet: roundMoney(revenueNetMonthly),
    monthlyVat,
    monthlyRevenueGross,
    monthlyContribution: roundMoney(monthlyContribution),
    breakEvenRateNet: roundMoney(breakEvenRateNet),
    breakEvenRateGross: roundMoney(breakEvenRateGross),
    projectMonths: roundMoney(projectMonths),
    projectCost: roundMoney(monthlyCost * projectMonths),
    projectRevenueNet: roundMoney(revenueNetMonthly * projectMonths),
    projectContribution: roundMoney(monthlyContribution * projectMonths),
    fixedMonthlyNet: billingUnit === "mixed" ? roundMoney(fixedMonthlyNet) : null,
    minimumMonthlyNet: roundMoney(minimumMonthlyNet),
    clientLimitNet: clientLimitNet == null ? null : roundMoney(clientLimitNet),
    clientLimitDeviation: clientLimitDeviation == null ? null : roundMoney(clientLimitDeviation),
    ruleVersionId: input.ruleVersionId ?? null,
    warnings,
  };
}

export function sumEnabled(items = []) {
  return items.filter((item) => item.enabled !== false).reduce((sum, item) => sum + Number(item.hourlyAmount ?? 0), 0);
}

export function compareScenarios(scenarios) {
  return [...scenarios].sort((a, b) => b.result.marginPct - a.result.marginPct);
}

function convertWorkerPayToMonthly(amount, unit, context) {
  if (unit === "shift") return amount * context.shiftsPerWorker * context.workers;
  if (unit === "month" || unit === "worker_month") return amount * context.workers;
  return amount * context.hoursPerWorker * context.workers;
}

function normalizeCostMonthly(item, context) {
  const amount = nonNegative(item.amount ?? item.monthlyAmount ?? item.hourlyAmount ?? 0);
  switch (item.base) {
    case "per_shift": return amount * context.shiftsPerWorker * context.workers;
    case "per_worker_month": return amount * context.workers;
    case "project_month": return amount;
    case "project_fixed": return amount / Math.max(1, context.projectMonths);
    case "per_unit": return amount * context.unitsPerWorkerShift * context.shiftsPerWorker * context.workers;
    case "per_hour":
    default: return amount * context.hoursPerWorker * context.workers;
  }
}

function resolveBillingVolume(input) {
  const hours = input.hoursPerWorker * input.workers;
  const shifts = input.shiftsPerWorker * input.workers;
  const units = input.unitsPerWorkerShift * shifts;
  const variableVolumeMonthly = resolveSimpleVolume(input.variableBillingUnit, { hours, shifts, units, workers: input.workers });
  if (input.billingUnit === "project_fixed") return { volumeMonthly: 1 / input.projectMonths, variableVolumeMonthly };
  if (input.billingUnit === "mixed") return { volumeMonthly: variableVolumeMonthly, variableVolumeMonthly };
  return { volumeMonthly: resolveSimpleVolume(input.billingUnit, { hours, shifts, units, workers: input.workers }), variableVolumeMonthly };
}

function resolveSimpleVolume(unit, values) {
  if (unit === "shift") return values.shifts;
  if (unit === "unit") return values.units;
  if (unit === "worker_month") return values.workers;
  if (unit === "project_month") return 1;
  return values.hours;
}

function toNet(value, vatMode, vatPct) {
  if (vatMode === "with_vat" && vatPct > 0) return value / (1 + vatPct / 100);
  return value;
}

function roundToStep(value, step) {
  if (!Number.isFinite(value)) return 0;
  const safeStep = positive(step, 0.01);
  return Math.round(value / safeStep) * safeStep;
}

function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || 0)); }
function nonNegative(value) { return Math.max(0, Number(value) || 0); }
function positive(value, fallback) { const n = Number(value); return Number.isFinite(n) && n > 0 ? n : fallback; }
