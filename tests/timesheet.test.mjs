import test from "node:test";
import assert from "node:assert/strict";
import { classifyAttendance, reconcile, splitPeriod } from "../lib/core/timesheet.mjs";

test("planned day off is not a no-show", () => {
  assert.equal(classifyAttendance({ planned: false, factHours: 0 }), "off");
});

test("assigned shift without fact is a no-show", () => {
  assert.equal(classifyAttendance({ planned: true, factHours: 0 }), "no_show");
});

test("half-month semantics", () => {
  assert.equal(splitPeriod("2026-08-15"), "first_half");
  assert.equal(splitPeriod("2026-08-16"), "second_half");
});

test("reconciliation exposes difference", () => {
  assert.deepEqual(reconcile(88, 80), { difference: 8, hasIssue: true });
});
