import test from "node:test";
import assert from "node:assert/strict";
import { calculateScenario, calculateCommercialScenario } from "../lib/core/calculator.mjs";

test("calculator includes employee and project costs", () => {
  const result = calculateScenario({
    workerNetHourly: 350,
    workers: 10,
    hoursPerWorker: 220,
    employeeCosts: [{ hourlyAmount: 110, enabled: true }, { hourlyAmount: 20, enabled: false }],
    projectCosts: [{ hourlyAmount: 22000, enabled: true }],
    targetMarginPct: 20
  });
  assert.equal(result.directHourly, 460);
  assert.equal(result.projectHourly, 10);
  assert.equal(result.totalCostHourly, 470);
  assert.equal(result.clientRateHourly, 587.5);
  assert.equal(result.marginPct, 20);
});

test("commercial calculator applies model rules and VAT without hardcoded tax rates", () => {
  const result = calculateCommercialScenario({
    workers: 10,
    hoursPerWorker: 220,
    hoursPerShift: 11,
    shiftsPerWorker: 20,
    workerPayAmount: 350,
    workerPayUnit: "hour",
    targetMarginPct: 20,
    pricingMode: "target_margin",
    billingUnit: "hour",
    vatMode: "with_vat",
    vatPct: 22,
    ruleVersionId: "rule-1",
    rules: { mandatoryChargePct: 30, minimumMarginPct: 15, roundingStep: 0.01, legalParametersVerified: true },
    costs: [{ amount: 22000, base: "project_month", enabled: true }],
  });
  assert.equal(result.workerPayMonthly, 770000);
  assert.equal(result.mandatoryChargesMonthly, 231000);
  assert.equal(result.monthlyCost, 1023000);
  assert.equal(result.clientRateNet, 581.25);
  assert.equal(result.clientRateGross, 709.13);
  assert.equal(result.marginPct, 20);
  assert.deepEqual(result.warnings, []);
});

test("company MROT plus supplement model splits the economic bases", () => {
  const result = calculateCommercialScenario({
    workers: 2, hoursPerWorker: 160, workerPayAmount: 100000, workerPayUnit: "month",
    pricingMode: "target_margin", targetMarginPct: 20, billingUnit: "hour", vatMode: "without_vat", ruleVersionId: "company-rule",
    rules: { payStructure:"mrot_plus_supplement", officialBasePerWorkerMonthly:30000, mandatoryChargeBase:"official_base", mandatoryChargePct:30, supplementCommissionPct:10, legalParametersVerified:true },
    costs: [],
  });
  assert.equal(result.workerPayMonthly, 200000);
  assert.equal(result.officialBaseMonthly, 60000);
  assert.equal(result.supplementMonthly, 140000);
  assert.equal(result.mandatoryChargesMonthly, 18000);
  assert.equal(result.supplementCommissionMonthly, 14000);
  assert.equal(result.monthlyCost, 232000);
});

test("client limit mode shows margin below company minimum", () => {
  const result = calculateCommercialScenario({
    workers: 5,
    hoursPerWorker: 220,
    hoursPerShift: 11,
    workerPayAmount: 400,
    workerPayUnit: "hour",
    pricingMode: "client_limit",
    billingUnit: "hour",
    clientLimit: 600,
    clientLimitVatMode: "without_vat",
    targetMarginPct: 18,
    vatMode: "without_vat",
    ruleVersionId: "rule-2",
    rules: { mandatoryChargePct: 20, minimumMarginPct: 18, legalParametersVerified: true },
    costs: [],
  });
  assert.equal(result.clientRateNet, 600);
  assert.equal(result.totalCostHourly, 480);
  assert.equal(result.marginPct, 20);
  assert.equal(result.warnings.includes("below_minimum_margin"), false);

  const low = calculateCommercialScenario({
    workers: 5,
    hoursPerWorker: 220,
    workerPayAmount: 400,
    workerPayUnit: "hour",
    pricingMode: "client_limit",
    billingUnit: "hour",
    clientLimit: 550,
    targetMarginPct: 18,
    vatMode: "without_vat",
    ruleVersionId: "rule-2",
    rules: { mandatoryChargePct: 20, minimumMarginPct: 18, legalParametersVerified: true },
    costs: [],
  });
  assert.equal(low.warnings.includes("below_minimum_margin"), true);
});

test("unit and mixed billing normalize monthly economics", () => {
  const unit = calculateCommercialScenario({
    workers: 4,
    hoursPerWorker: 220,
    hoursPerShift: 11,
    shiftsPerWorker: 20,
    unitsPerWorkerShift: 100,
    workerPayAmount: 330,
    workerPayUnit: "hour",
    targetMarginPct: 25,
    pricingMode: "target_margin",
    billingUnit: "unit",
    vatMode: "without_vat",
    ruleVersionId: "rule-3",
    rules: { mandatoryChargePct: 0, legalParametersVerified: true },
    costs: [],
  });
  assert.equal(unit.billableVolumeMonthly, 8000);
  assert.equal(unit.clientRateNet, 48.4);
  assert.equal(unit.marginPct, 25);

  const mixed = calculateCommercialScenario({
    workers: 4,
    hoursPerWorker: 220,
    hoursPerShift: 11,
    shiftsPerWorker: 20,
    workerPayAmount: 330,
    workerPayUnit: "hour",
    targetMarginPct: 20,
    pricingMode: "target_margin",
    billingUnit: "mixed",
    variableBillingUnit: "hour",
    fixedMonthlyNet: 100000,
    minimumMonthlyNet: 0,
    vatMode: "without_vat",
    ruleVersionId: "rule-4",
    rules: { mandatoryChargePct: 0, legalParametersVerified: true },
    costs: [],
  });
  assert.equal(mixed.fixedMonthlyNet, 100000);
  assert.equal(mixed.monthlyRevenueNet, 363005.6);
  assert.equal(mixed.marginPct, 20);
});

test("target-margin rounding never rounds rate below target and client-limit rounding never exceeds cap", () => {
  const target = calculateCommercialScenario({
    workers: 1,
    hoursPerWorker: 173,
    workerPayAmount: 333,
    workerPayUnit: "hour",
    pricingMode: "target_margin",
    targetMarginPct: 19,
    billingUnit: "hour",
    vatMode: "without_vat",
    ruleVersionId: "rule-round",
    rules: { mandatoryChargePct: 0, roundingStep: 1, legalParametersVerified: true },
    costs: [],
  });
  assert.ok(target.marginPct >= 19);

  const limit = calculateCommercialScenario({
    workers: 1,
    hoursPerWorker: 173,
    workerPayAmount: 250,
    workerPayUnit: "hour",
    pricingMode: "client_limit",
    clientLimit: 499.99,
    clientLimitVatMode: "without_vat",
    billingUnit: "hour",
    vatMode: "without_vat",
    ruleVersionId: "rule-round",
    rules: { mandatoryChargePct: 0, roundingStep: 1, legalParametersVerified: true },
    costs: [],
  });
  assert.ok(limit.clientRateNet <= 499.99);
});

test("target profit mode prices from required monthly contribution", () => {
  const result = calculateCommercialScenario({
    workers: 1,
    hoursPerWorker: 100,
    workerPayAmount: 100,
    workerPayUnit: "hour",
    pricingMode: "target_profit",
    targetMonthlyContribution: 2500,
    billingUnit: "hour",
    vatMode: "without_vat",
    ruleVersionId: "rule-profit",
    rules: { mandatoryChargePct: 0, roundingStep: 0.01, legalParametersVerified: true },
    costs: [],
  });
  assert.equal(result.monthlyCost, 10000);
  assert.equal(result.clientRateNet, 125);
  assert.equal(result.monthlyContribution, 2500);
  assert.equal(result.marginPct, 20);
});

test("minimum guaranteed volume is separate from minimum guaranteed payment", () => {
  const result = calculateCommercialScenario({
    workers: 1,
    hoursPerWorker: 100,
    workerPayAmount: 100,
    workerPayUnit: "hour",
    pricingMode: "target_margin",
    targetMarginPct: 20,
    billingUnit: "hour",
    minimumVolumeMonthly: 120,
    minimumMonthlyNet: 0,
    vatMode: "without_vat",
    ruleVersionId: "rule-volume",
    rules: { mandatoryChargePct: 0, roundingStep: 0.01, legalParametersVerified: true },
    costs: [],
  });
  assert.equal(result.billableVolumeMonthly, 100);
  assert.equal(result.guaranteedBillableVolumeMonthly, 120);
  assert.equal(result.minimumVolumeMonthly, 120);
  assert.ok(result.clientRateNet < 125);
  assert.ok(result.marginPct >= 20);
});

test("role-level monthly and fixed costs are not multiplied by headcount", () => {
  const result = calculateCommercialScenario({
    workers: 10,
    hoursPerWorker: 100,
    projectMonths: 2,
    workerPayAmount: 0,
    workerPayUnit: "hour",
    pricingMode: "target_margin",
    targetMarginPct: 0,
    billingUnit: "hour",
    vatMode: "without_vat",
    ruleVersionId: "rule-role-cost",
    rules: { mandatoryChargePct: 0, legalParametersVerified: true },
    costs: [
      { amount: 1000, base: "role_month", enabled: true },
      { amount: 2000, base: "role_fixed", enabled: true },
    ],
  });
  assert.equal(result.additionalCostsMonthly, 2000);
});

test("target profit can be expressed per billing unit", () => {
  const result = calculateCommercialScenario({
    workers: 1,
    hoursPerWorker: 100,
    workerPayAmount: 600,
    workerPayUnit: "hour",
    pricingMode: "target_profit",
    targetProfitPerBillingUnit: 100,
    billingUnit: "hour",
    vatMode: "without_vat",
    ruleVersionId: "rule-profit-per-hour",
    rules: { mandatoryChargePct: 0, roundingStep: 0.01, legalParametersVerified: true },
    costs: [],
  });
  assert.equal(result.clientRateNet, 700);
  assert.equal(result.monthlyContribution, 10000);
  assert.equal(result.targetProfitPerBillingUnit, 100);
});

test("piecework payment and periodic expenses use their actual calculation base", () => {
  const result = calculateCommercialScenario({
    workers: 2,
    hoursPerWorker: 100,
    shiftsPerWorker: 10,
    unitsPerWorkerShift: 25,
    workerPayAmount: 4,
    workerPayUnit: "unit",
    pricingMode: "target_margin",
    targetMarginPct: 0,
    billingUnit: "unit",
    vatMode: "without_vat",
    ruleVersionId: "rule-piecework",
    rules: { mandatoryChargePct: 0, legalParametersVerified: true },
    costs: [
      { amount: 1200, base: "per_worker_period", amortizationMonths: 12, enabled: true },
      { amount: 2, base: "percent_of_worker_pay", enabled: true },
    ],
  });
  assert.equal(result.workerPayMonthly, 2000);
  assert.equal(result.additionalCostsMonthly, 240);
  assert.equal(result.monthlyCost, 2240);
  assert.equal(result.clientRateNet, 4.49);
});
