import test from "node:test";
import assert from "node:assert/strict";
import { calculateScenario } from "../lib/core/calculator.mjs";

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
