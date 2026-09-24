import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

function moduleUrl(path){
  const source=ts.transpileModule(fs.readFileSync(new URL("../"+path,import.meta.url),"utf8"),{
    compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  }).outputText;
  return "data:text/javascript;base64,"+Buffer.from(source).toString("base64");
}

const {workerObjectState,workerTodayStatus}=await import(moduleUrl("lib/operations/workforce-status.ts"));
const today="2026-09-24";

test("confirmed intershift stays an object employee and is not a no-show",()=>{
  const worker={status:"active",absenceStatus:"confirmed",absenceType:"intershift",absenceFrom:"2026-09-18",absenceTo:"2026-09-28",todayTimeCode:"NO_SHOW"};
  assert.equal(workerObjectState(worker,today).key,"intershift");
  assert.equal(workerTodayStatus(worker,today).key,"intershift");
});

test("timesheet code drives the current-day status",()=>{
  assert.equal(workerTodayStatus({status:"active",todayTimeCode:"WORK",todayFactHours:11},today).key,"on_shift");
  assert.equal(workerTodayStatus({status:"active",todayTimeCode:"DAY_OFF",todayFactHours:0},today).key,"day_off");
  assert.equal(workerTodayStatus({status:"active",todayTimeCode:"NO_SHOW",todayFactHours:0},today).key,"no_show");
});

test("shift plan is a fallback when today's timesheet fact is not filled",()=>{
  assert.equal(workerTodayStatus({status:"active",todayShiftAssigned:true,todayShiftConfirmed:true},today).key,"assigned");
  assert.equal(workerTodayStatus({status:"active",todayShiftAssigned:true,todayShiftReserve:true},today).key,"reserve");
  assert.equal(workerTodayStatus({status:"active"},today).key,"unmarked");
});
