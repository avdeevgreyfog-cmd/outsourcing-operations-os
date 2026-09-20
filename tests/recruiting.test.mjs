import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
function loadSource(file, dependencies={}) {
 let source=ts.transpileModule(fs.readFileSync(new URL('../lib/recruiting/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 for(const [name,url] of Object.entries(dependencies)) source=source.replaceAll('"'+name+'"','"'+url+'"').replaceAll("'"+name+"'","'"+url+"'");
 return 'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
}
const model=loadSource('model.ts');
const {validateStageChange,workRisks,formatWorkDate}=await import(loadSource('workflow.ts',{'./model':model}));
const {buildPeriodAnalytics}=await import(loadSource('analytics-engine.ts',{'./model':model}));
const now=Date.parse('2026-09-19T12:00:00Z');

test('first shift requires planned date and a nonfuture fact; post-start placement cannot move backward',()=>{
 assert.ok(validateStageChange({stage:'new',plannedStartDate:null},{stage:'first_shift',actualStartAt:'2026-09-19T10:00:00Z'},now));
 assert.ok(validateStageChange({stage:'preparation',plannedStartDate:'2026-09-20'},{stage:'first_shift',actualStartAt:'2026-09-20T10:00:00Z'},now));
 assert.equal(validateStageChange({stage:'preparation',plannedStartDate:'2026-09-20'},{stage:'first_shift',actualStartAt:'2026-09-19T10:00:00Z'},now),null);
 assert.ok(validateStageChange({stage:'first_shift',plannedStartDate:'2026-09-20',actualStartAt:'2026-09-19T10:00:00Z'},{stage:'interview'},now));
});

test('retention milestones and reserve have concrete requirements; closed applicants are not overdue',()=>{
 const actual='2026-09-10T10:00:00Z';
 assert.ok(validateStageChange({stage:'first_shift',plannedStartDate:'2026-09-10',actualStartAt:actual},{stage:'retention_7'},Date.parse('2026-09-15T10:00:00Z')));
 assert.equal(validateStageChange({stage:'first_shift',plannedStartDate:'2026-09-10',actualStartAt:actual},{stage:'retention_7'},Date.parse('2026-09-18T10:00:00Z')),null);
 assert.ok(validateStageChange({stage:'retention_7',plannedStartDate:'2026-09-10',actualStartAt:actual},{stage:'retention_30'},Date.parse('2026-10-01T10:00:00Z')));
 assert.equal(validateStageChange({stage:'retention_7',plannedStartDate:'2026-09-10',actualStartAt:actual},{stage:'retention_30'},Date.parse('2026-10-11T10:00:00Z')),null);
 assert.ok(validateStageChange({stage:'interview',plannedStartDate:null},{stage:'reserve',workflow:{reserveReason:'Позже'}},now));
 assert.deepEqual(workRisks({stage:'rejected',plannedStartDate:null,nextActionAt:'2026-09-10'},now),[]);
});

test('cohort separates waiting, reserve and loss and does not treat skipped stage as normal conversion',()=>{
 const apps=['waiting','reserve','lost','skip'].map(applicationId=>({applicationId,createdAt:'2026-09-10T08:00:00Z',updatedAt:'2026-09-12T08:00:00Z',rawStage:'new',source:'Отклик'}));
 const events=[
  {applicationId:'waiting',toStage:'interview'},
  {applicationId:'reserve',toStage:'interview'},
  {applicationId:'lost',toStage:'interview'},
  {applicationId:'skip',toStage:'documents'},
 ].map(x=>({...x,createdAt:'2026-09-11T08:00:00Z'}));
 events.push(
  {applicationId:'reserve',toStage:'reserve',createdAt:'2026-09-12T08:00:00Z'},
  {applicationId:'lost',toStage:'rejected',reasonCode:'conditions',createdAt:'2026-09-12T08:00:00Z'},
 );
 const result=buildPeriodAnalytics(apps,events,'2026-09-01','2026-09-19');
 const interview=result.stages.find(x=>x.stage==='interview');
 assert.equal(interview.candidates,3);
 assert.equal(interview.waiting,1);
 assert.equal(interview.reserved,1);
 assert.equal(interview.lost,1);
 assert.equal(result.stages.find(x=>x.stage==='documents').conversion,0);
 assert.equal(buildPeriodAnalytics(apps,events,'2026-08-01','2026-08-31').metrics.totalCandidates,0);
 assert.equal(buildPeriodAnalytics(apps,events,'2026-09-01','2026-09-11').metrics.rejected,0);
});

test('work dates render identically on server and browser time zones',()=>{
 const previous=process.env.TZ;
 try{process.env.TZ='UTC';const server=formatWorkDate('2026-09-19T06:00:00Z');process.env.TZ='Europe/Berlin';assert.equal(formatWorkDate('2026-09-19T06:00:00Z'),server);assert.ok(server.includes('09:00'));}
 finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
