import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../lib/commercial/request-analytics-calculation.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const exports={};
const workflow={};
new Function('exports',ts.transpileModule(fs.readFileSync(new URL('../lib/commercial/request-workflow.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(workflow);
new Function('exports','require',compiled)(exports,()=>workflow);
const {buildPeriodAnalytics,analyticsFromBoardRows,normalizeRequestAnalyticsFilters}=exports;
const stages=[{code:'new',label:'Новая',terminalKind:'active',sortOrder:0},{code:'clarification',label:'Уточнение',terminalKind:'active',sortOrder:1},{code:'proposal_client',label:'КП',terminalKind:'active',sortOrder:2},{code:'agreed',label:'Согласовано',terminalKind:'agreed',sortOrder:3},{code:'not_agreed',label:'Не согласовано',terminalKind:'not_agreed',sortOrder:4}];
const row=(id,patch={})=>({id,organizationId:'org',clientId:null,client:'Клиент',ownerUserId:'owner',owner:'Менеджер',regionId:null,source:'manual',createdByUserId:'owner',rawStage:'new',lossReasonCode:null,headcount:2,specialtyIds:[],createdAt:'2026-09-02T10:00:00Z',updatedAt:'2026-09-02T10:00:00Z',firstProposalAt:null,acceptedAt:null,...patch});
const event=(requestId,toStageCode,day)=>({requestId,toStageCode,createdAt:`2026-09-${day}T12:00:00Z`,lossReasonCode:null});

test('calendar events include older requests while cohort conversion excludes them',()=>{
 const rows=[row('old',{createdAt:'2026-08-01T10:00:00Z',rawStage:'agreed',updatedAt:'2026-09-10T12:00:00Z',firstProposalAt:'2026-09-04T12:00:00Z',acceptedAt:'2026-09-10T12:00:00Z'}),row('new',{rawStage:'agreed',updatedAt:'2026-09-10T12:00:00Z',acceptedAt:'2026-09-10T12:00:00Z'})];
 const result=buildPeriodAnalytics(rows,[event('old','agreed','10'),event('new','agreed','10')],'2026-09-01','2026-09-30',stages,rows);
 assert.equal(result.metrics.newRequests,1);assert.equal(result.metrics.agreedRequests,1);
 assert.equal(result.daily.reduce((n,day)=>n+day.agreedRequests,0),2);
 assert.equal(result.daily.reduce((n,day)=>n+day.proposalRequests,0),1);
 assert.equal(result.daily.at(-1).conversionRequests,100);
});

test('skipped stages are not fabricated and conversion uses intersection',()=>{
 const rows=[row('skipped',{rawStage:'agreed',updatedAt:'2026-09-10T12:00:00Z'}),row('waiting',{rawStage:'clarification',updatedAt:'2026-09-05T12:00:00Z'})];
 const result=buildPeriodAnalytics(rows,[event('skipped','agreed','10'),event('waiting','clarification','05')],'2026-09-01','2026-09-30',stages,rows);
 assert.equal(result.stages[1].requests,1);assert.equal(result.stages[2].requests,0);assert.equal(result.stages[3].requests,1);
 assert.deepEqual(result.stages[3].requestIds,['skipped']);
 assert.ok(result.stages.every(stage=>stage.conversionRequests<=100));
 assert.equal(result.stages[1].pendingRequests,1);assert.equal(result.stages[1].lostRequests,0);
});

test('pending requests and lost outcomes remain distinct',()=>{
 const rows=[row('waiting',{rawStage:'clarification',updatedAt:'2026-09-05T12:00:00Z'}),row('lost',{rawStage:'not_agreed',lossReasonCode:'price',updatedAt:'2026-09-10T12:00:00Z'})];
 const history=[event('waiting','clarification','05'),event('lost','clarification','05'),{...event('lost','not_agreed','10'),lossReasonCode:'price'}];
 const result=buildPeriodAnalytics(rows,history,'2026-09-01','2026-09-30',stages,rows);
 assert.equal(result.stages[1].notAdvancedRequests,2);assert.equal(result.stages[1].pendingRequests,1);assert.equal(result.stages[1].lostRequests,1);assert.equal(result.metrics.lostRequests,1);
});

test('empty cohort has no fabricated 100 percent entry conversion',()=>{
 const result=buildPeriodAnalytics([],[],'2026-09-01','2026-09-30',stages,[]);
 assert.equal(result.stages[0].conversionRequests,0);assert.equal(result.metrics.avgCycleDays,null);
});

test('board adapter uses exactly merged demo rows, excludes archived from current active snapshot',()=>{
 const board=[row('one'),row('two')].map(item=>({...item,workflowStageCode:'new',roles:[{name:'Грузчик',count:2}],lastProposalAt:null,closedAt:null,archivedAt:item.id==='two'?'2026-09-12T10:00:00Z':null}));
 const filters=normalizeRequestAnalyticsFilters({from:'2026-09-01',to:'2026-09-30'});
 const result=analyticsFromBoardRows(board,filters,stages);
 assert.equal(result.metrics.newRequests,2);assert.equal(result.metrics.activeRequests,1);assert.equal(result.comparison.newRequests,0);
 assert.deepEqual(result.stages[0].requestIds,['one','two']);
});

test('equal comparison period and ordered date range are normalized',()=>{
 const filters=normalizeRequestAnalyticsFilters({from:'2026-09-30',to:'2026-09-01'});
 assert.equal(filters.from,'2026-09-01');assert.equal(filters.to,'2026-09-30');assert.equal(filters.compareFrom,'2026-08-02');assert.equal(filters.compareTo,'2026-08-31');
});
