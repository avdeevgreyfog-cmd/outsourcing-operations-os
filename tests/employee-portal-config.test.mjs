import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
const source=readFileSync("lib/operations/employee-portal-config.ts","utf8");
const output=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
new Function("exports","require",output)(exports,()=>({}));
const cfg=exports;
test("portal defaults hide no sections, but can be made more restrictive",()=>{
 assert.equal(cfg.defaultPortalConfiguration.sections.timesheet,true);
 assert.equal(cfg.defaultPortalConfiguration.sections.documents,true);
 const v=cfg.resolvePortalConfiguration([
  {managerPhone:"+7000",sections:{documents:false}},
  {managerPhone:"+7111",sections:{timesheet:false}},
  {sections:{timesheet:true}},
  {managerPhone:"+7222",sections:{documents:true,workwear:false}}
 ]);
 assert.equal(v.managerPhone,"+7222");
 assert.equal(v.sections.documents,true);
 assert.equal(v.sections.timesheet,true);
 assert.equal(v.sections.workwear,false);
 assert.equal(v.sections.shifts,true);
});
test("one issued snapshot stays unchanged after later defaults update",()=>{
 const base=cfg.resolvePortalConfiguration([{managerPhone:"+7111",sections:{documents:true}}]);
 const issued=structuredClone(base);
 const edited=cfg.resolvePortalConfiguration([{managerPhone:"+7999",sections:{documents:false}}]);
 assert.equal(issued.managerPhone,"+7111");
 assert.equal(issued.sections.documents,true);
 assert.equal(edited.sections.documents,false);
});
test("reject malformed scopes, sections and time zones",()=>{
 assert.throws(()=>cfg.normalizePortalPatch({sections:{finance:true}}),/Неизвестный/);
 assert.throws(()=>cfg.normalizePortalPatch({sections:{documents:"yes"}}),/Некорректная видимость/);
 assert.throws(()=>cfg.normalizePortalPatch({validDays:0}),/Срок/);
 assert.throws(()=>cfg.normalizePortalPatch({timezone:"Invalid/Zone"}),/Неизвестный/);
 assert.throws(()=>cfg.normalizePortalPatch({managerPhone:"x".repeat(51)}),/Проверьте/);
});
test("explicit false remains false through overrides",()=>{
 const c=cfg.resolvePortalConfiguration([{sections:{confirm:false,hours:false}},{sections:{documents:false}}]);
 assert.equal(c.sections.confirm,false);
 assert.equal(c.sections.hours,false);
 assert.equal(c.sections.documents,false);
});
