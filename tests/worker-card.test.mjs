import test from "node:test";
import assert from "node:assert/strict";
import { assignmentState, shiftsForWorker, visibleWorkerTabs } from "../lib/operations/worker-card.mjs";

test("worker schedule excludes coworkers and includes personal reserve across objects", () => {
  const rows=[
    {id:"coworker",workerIds:["other"],reserveWorkerIds:[],dateIso:"2026-10-04",time:"08:00"},
    {id:"reserve",workerIds:[],reserveWorkerIds:["worker"],dateIso:"2026-10-06",time:"20:00"},
    {id:"assigned",workerIds:["worker"],reserveWorkerIds:[],dateIso:"2026-10-05",time:"08:00"},
  ];
  assert.deepEqual(shiftsForWorker(rows,"worker").map(row=>row.id),["assigned","reserve"]);
});

test("future assignment is not current and the final day remains active", () => {
  assert.equal(assignmentState({effectiveFrom:"05.10.2026",effectiveTo:null},"2026-10-03"),"planned");
  assert.equal(assignmentState({effectiveFrom:"01.09.2026",effectiveTo:"03.10.2026"},"2026-10-03"),"current");
  assert.equal(assignmentState({effectiveFrom:"01.09.2026",effectiveTo:"02.10.2026"},"2026-10-03"),"completed");
});

test("worker tabs require both compensation and source capability", () => {
  const keys=["overview","accruals","payments","assets","housing","timesheets","incidents"];
  const access={sensitive:false,accruals:true,payments:true,assets:false,housing:false,timesheets:false,incidents:false};
  assert.deepEqual(visibleWorkerTabs(keys,access),["overview"]);
  assert.deepEqual(visibleWorkerTabs(keys,{...access,sensitive:true,payments:false}),["overview","accruals"]);
});
