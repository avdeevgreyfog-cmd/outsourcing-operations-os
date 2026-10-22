import test from "node:test";
import assert from "node:assert/strict";
import { workerRatePresentation } from "../lib/ui/worker-rate.mjs";

test("shift compensation remains primary even when day and night amounts exist", () => {
  const value = workerRatePresentation({ rate: 5800, rateUnit: "shift", dayRate: 5800, nightRate: 5800, paidHoursPerShift: 11 });
  assert.equal(value.amount, 5800);
  assert.equal(value.unit, "shift");
  assert.equal(value.equivalent.unit, "hour");
  assert.equal(value.equivalent.amount, 5800 / 11);
});

test("hourly compensation offers a shift equivalent only for known paid hours", () => {
  assert.deepEqual(workerRatePresentation({ rate: 400, rateUnit: "hour", paidHoursPerShift: 11 }), {
    amount: 400, unit: "hour", equivalent: { amount: 4400, unit: "shift", hours: 11 },
  });
  assert.equal(workerRatePresentation({ rate: 5800, rateUnit: "shift" }).equivalent, null);
});

test("missing or unfamiliar units never imply hourly compensation", () => {
  for (const rateUnit of [undefined, "", "month"]) {
    const value = workerRatePresentation({ rate: 5800, rateUnit, paidHoursPerShift: 11 });
    assert.equal(value.unit, null);
    assert.equal(value.equivalent, null);
  }
  assert.equal(workerRatePresentation({ dayRate: 5800, rateUnit: "shift" }).unit, null);
  assert.equal(workerRatePresentation({ rate: null }), null);
});
