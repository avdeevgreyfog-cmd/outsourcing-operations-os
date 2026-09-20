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
const {validateStageChange,workRisks,formatWorkDate,displayRecruitingStage}=await import(loadSource('workflow.ts',{'./model':model}));
const {buildPeriodAnalytics}=await import(loadSource('analytics-engine.ts',{'./model':model}));
const now=Date.parse('2026-09-19T12:00:00Z');
test('actual start requires preparation, readiness and a nonfuture fact; completed placement cannot be dragged back',()=>{
 assert.ok(validateStageChange({stage:'new',plannedStartDate:null},{stage:'started',actualStartAt:'2026-09-19T10:00:00Z'},now));
 assert.ok(validateStageChange({stage:'ready',plannedStartDate:'2026-09-19',workflow:{confirmed:true,readiness:true}},{stage:'started',actualStartAt:'2026-09-20T10:00:00Z'},now));
 assert.equal(validateStageChange({stage:'ready',plannedStartDate:'2026-09-19',workflow:{confirmed:true,readiness:true}},{stage:'started',actualStartAt:'2026-09-19T10:00:00Z'},now),null);
 assert.equal(validateStageChange({stage:'preparation',plannedStartDate:'2026-09-19',workflow:{confirmed:true,readiness:true}},{stage:'started',actualStartAt:'2026-09-19T10:00:00Z'},now),null);
 assert.ok(validateStageChange({stage:'started',plannedStartDate:null},{stage:'contact'},now));
});
test('readiness and reserve have concrete requirements; closed applicants are not overdue',()=>{
 assert.ok(validateStageChange({stage:'preparation',plannedStartDate:null},{stage:'ready'},now));
 assert.equal(validateStageChange({stage:'preparation',plannedStartDate:null},{stage:'ready',plannedStartDate:'2026-09-20',workflow:{plannedShift:'08:00–20:00',confirmed:true,readiness:true}},now),null);
 assert.ok(validateStageChange({stage:'contact',plannedStartDate:null},{stage:'reserve',workflow:{reserveReason:'Позже'}},now));
 assert.deepEqual(workRisks({stage:'rejected',plannedStartDate:null,nextActionAt:'2026-09-10'},now),[]);
});
test('cohort separates waiting, reserve and loss and never invents skipped stages or prior-period data',()=>{
 const apps=['waiting','reserve','lost','skip'].map(applicationId=>({applicationId,createdAt:'2026-09-10T08:00:00Z',updatedAt:'2026-09-12T08:00:00Z',rawStage:'new',source:'Отклик'}));
 const events=[{applicationId:'waiting',toStage:'contact'},{applicationId:'reserve',toStage:'contact'},{applicationId:'lost',toStage:'contact'},{applicationId:'skip',toStage:'interview'}].map(x=>({...x,createdAt:'2026-09-11T08:00:00Z'}));
 events.push({applicationId:'reserve',toStage:'reserve',createdAt:'2026-09-12T08:00:00Z'},{applicationId:'lost',toStage:'rejected',reasonCode:'conditions',createdAt:'2026-09-12T08:00:00Z'});
 const result=buildPeriodAnalytics(apps,events,'2026-09-01','2026-09-19');
 const contact=result.stages.find(x=>x.stage==='contact');
 assert.equal(contact.candidates,3); assert.equal(contact.waiting,1); assert.equal(contact.reserved,1); assert.equal(contact.lost,1);
 assert.equal(result.stages.find(x=>x.stage==='interview').conversion,0);
 assert.equal(buildPeriodAnalytics(apps,events,'2026-08-01','2026-08-31').metrics.totalCandidates,0);
 assert.equal(buildPeriodAnalytics(apps,events,'2026-09-01','2026-09-11').metrics.rejected,0);
});

test('work dates render identically on server and browser time zones',()=>{
 const previous=process.env.TZ;
 try{process.env.TZ='UTC';const server=formatWorkDate('2026-09-19T06:00:00Z');process.env.TZ='Europe/Berlin';assert.equal(formatWorkDate('2026-09-19T06:00:00Z'),server);assert.ok(server.includes('09:00'));}
 finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});


test('retention columns are derived from actual first shift instead of manual stage changes',()=>{
 const firstShift='2026-09-01T08:00:00Z';
 assert.equal(displayRecruitingStage({stage:'started',actualStartAt:firstShift},Date.parse('2026-09-05T08:00:00Z')),'started');
 assert.equal(displayRecruitingStage({stage:'started',actualStartAt:firstShift},Date.parse('2026-09-08T08:00:00Z')),'retention_7');
 assert.equal(displayRecruitingStage({stage:'started',actualStartAt:firstShift},Date.parse('2026-10-01T08:00:00Z')),'retention_30');
 assert.equal(displayRecruitingStage({stage:'started',actualStartAt:firstShift,workerActive:false},Date.parse('2026-10-01T08:00:00Z')),'started');
 assert.equal(displayRecruitingStage({stage:'contact',actualStartAt:null},Date.parse('2026-10-01T08:00:00Z')),'contact');
});
