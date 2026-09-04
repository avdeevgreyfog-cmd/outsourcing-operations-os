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
