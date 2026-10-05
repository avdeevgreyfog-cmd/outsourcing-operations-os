import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTenderPeriod } from '../lib/tenders/analytics-calculation.mjs';
const row=(id,patch={})=>({id,createdAt:'2026-09-02T10:00:00Z',updatedAt:'2026-09-20T10:00:00Z',rawStage:'new',decision:'undecided',result:null,initialPrice:100,headcount:2,platform:'Площадка',customer:'Заказчик',ownerUserId:'owner',owner:'Менеджер',submittedAt:null,submissionDeadline:null,...patch});
const event=(tenderId,field,value,day)=>({tenderId,[field]:value,createdAt:`2026-09-${day}T10:00:00Z`,reasonCode:null});
const calculate=(rows,stages=[],decisions=[],results=[])=>calculateTenderPeriod(rows,stages,decisions,results,'2026-09-01','2026-09-30');
const stage=(result,code)=>result.stages.find(item=>item.code===code);
const dailyTotal=(result,field)=>result.daily.reduce((sum,point)=>sum+point[field],0);

test('calendar activity includes pre-period tenders while cohort metrics exclude them',()=>{
 const rows=[row('old',{createdAt:'2026-08-01T10:00:00Z',submittedAt:'2026-09-04T10:00:00Z'}),row('new',{submittedAt:'2026-09-05T10:00:00Z'})];
 const result=calculate(rows,[],[event('old','toDecision','participate','03')],[event('old','toResult','won','10'),event('new','toResult','lost','12')]);
 assert.equal(result.metrics.newTenders,1);assert.equal(result.metrics.submittedTenders,1);assert.equal(result.metrics.wonTenders,0);assert.equal(result.metrics.lostCount,1);
 assert.equal(dailyTotal(result,'submittedTenders'),2);assert.equal(dailyTotal(result,'participateTenders'),1);assert.equal(dailyTotal(result,'wonTenders'),1);
 assert.equal(result.metrics.winRateTenders,0);assert.equal(result.daily.at(-1).winRateTenders,50);
});

test('current state and updatedAt do not create missing history or dates',()=>{
 const result=calculate([row('unknown',{rawStage:'awaiting_result',decision:'participate',result:'won'})]);
 assert.equal(result.cohortWithoutHistory,1);assert.equal(stage(result,'new').tenders,1);
 assert.ok(result.stages.slice(1).every(item=>item.tenders===0));
 assert.equal(result.metrics.wonTenders,0);assert.equal(result.metrics.submittedTenders,0);assert.equal(dailyTotal(result,'wonTenders'),0);
 assert.equal(result.metrics.winRateTenders,null);assert.equal(result.metrics.avgDecisionHours,null);assert.equal(result.metrics.avgCycleDays,null);
});

test('explicit submittedAt records only submission and never invented prior stages',()=>{
 const result=calculate([row('submitted',{submittedAt:'2026-09-09T10:00:00Z',rawStage:'awaiting_result',submissionDeadline:'2026-09-10T10:00:00Z'})]);
 assert.equal(result.metrics.submittedTenders,1);assert.equal(stage(result,'submitted').tenders,1);
 assert.equal(stage(result,'participate').tenders,0);assert.equal(stage(result,'awaiting_result').tenders,0);
 assert.equal(result.metrics.avgSubmissionLeadHours,24);assert.equal(stage(result,'preparation').avgHours,null);
});

test('skipped stages use set intersections for conversion and gaps, never negative gaps or >100%',()=>{
 const rows=[row('skip',{initialPrice:900,headcount:10}),row('analysis',{initialPrice:100,headcount:2})];
 const result=calculate(rows,[event('skip','toStage','calculation','05'),event('analysis','toStage','analysis','04')]);
 assert.equal(stage(result,'analysis').tenders,1);assert.equal(stage(result,'participate').tenders,0);assert.equal(stage(result,'calculation').tenders,1);
 assert.equal(stage(result,'calculation').conversionTenders,null);assert.equal(stage(result,'analysis').notAdvancedTenders,1);assert.equal(stage(result,'analysis').notAdvancedValue,100);
 for(const item of result.stages)assert.ok(item.conversionTenders==null||item.conversionTenders<=100);
});

test('corrected result and reversed no-bid are counted once using latest recorded state',()=>{
 const result=calculate([row('fixed',{result:'lost',decision:'no_bid'})],[],[event('fixed','toDecision','no_bid','03'),event('fixed','toDecision','participate','04')],[event('fixed','toResult','lost','10'),event('fixed','toResult','won','11')]);
 assert.equal(result.metrics.wonTenders,1);assert.equal(result.metrics.lostCount,0);assert.equal(result.metrics.noBidCount,0);assert.equal(result.metrics.winRateTenders,100);
 assert.equal(result.lossMap.size,0);assert.equal(result.noBidMap.size,0);assert.equal(dailyTotal(result,'wonTenders'),1);assert.equal(dailyTotal(result,'lostTenders'),0);
});

test('history after period end does not change as-of cohort outcome',()=>{
 const result=calculateTenderPeriod([row('fixed')],[],[],[event('fixed','toResult','lost','10'),{...event('fixed','toResult','won','11'),createdAt:'2026-10-01T10:00:00Z'}],'2026-09-01','2026-09-30');
 assert.equal(result.metrics.lostCount,1);assert.equal(result.metrics.wonTenders,0);assert.equal(result.metrics.winRateTenders,0);
});

test('empty and unweighted populations keep unknown denominators null',()=>{
 const empty=calculate([]);assert.equal(stage(empty,'new').conversionTenders,null);assert.equal(empty.metrics.winRateTenders,null);assert.equal(empty.daily.at(-1).winRateTenders,null);
 const result=calculate([row('zero',{initialPrice:null,headcount:0})],[],[],[event('zero','toResult','won','10')]);
 assert.equal(result.metrics.winRateTenders,100);assert.equal(result.metrics.winRateValue,null);assert.equal(result.metrics.winRateHeadcount,null);
 assert.equal(stage(result,'won').shareValue,null);assert.equal(result.breakdowns.platforms[0].winRateHeadcount,null);
});

test('pending and recorded terminal outcomes are separate gap counts',()=>{
 const rows=[row('pending'),row('lost'),row('declined')];
 const result=calculate(rows,rows.map(item=>event(item.id,'toStage','analysis','04')),[event('declined','toDecision','no_bid','05')],[event('lost','toResult','lost','10')]);
 assert.equal(stage(result,'analysis').notAdvancedTenders,3);assert.equal(stage(result,'analysis').pendingTenders,1);assert.equal(stage(result,'analysis').lostTenders,2);
});

test('duration averages use chronological recorded pairs and exclude missing transitions',()=>{
 const result=calculate([row('pair'),row('missing')],[event('pair','toStage','analysis','03'),event('missing','toStage','calculation','05')],[event('pair','toDecision','participate','04')]);
 assert.equal(stage(result,'analysis').avgHours,24);assert.equal(stage(result,'participate').avgHours,null);assert.equal(result.metrics.avgDecisionHours,48);
});

test('partially missing budget or headcount invalidates weighted denominators instead of counting unknown as zero',()=>{
 const rows=[row('won',{initialPrice:100,headcount:2}),row('lost',{initialPrice:null,headcount:null})];
 const result=calculate(rows,[],[],[event('won','toResult','won','10'),event('lost','toResult','lost','11')]);
 assert.equal(result.metrics.winRateTenders,50);assert.equal(result.metrics.winRateValue,null);assert.equal(result.metrics.winRateHeadcount,null);
 assert.equal(result.metrics.incomingValue,100);assert.equal(result.metrics.incomingHeadcount,2);
 assert.equal(result.daily.at(-1).winRateValue,null);assert.equal(result.daily.at(-1).winRateHeadcount,null);
 assert.equal(stage(result,'new').shareValue,null);assert.equal(result.breakdowns.platforms[0].winRateValue,null);
});

test('won and failed are terminal facts even when the next funnel stage is missing',()=>{
 const result=calculate([row('won'),row('failed')],[],[],[event('won','toResult','won','10'),event('failed','toResult','failed','11')]);
 assert.equal(stage(result,'new').notAdvancedTenders,2);assert.equal(stage(result,'new').pendingTenders,0);assert.equal(stage(result,'new').lostTenders,2);
});

test('unverified historical snapshots cannot fabricate transition dates or durations',()=>{
 const result=calculate([row('legacy',{rawStage:'calculation',decision:'participate',result:'won'})],[{...event('legacy','toStage','calculation','20'),historicalSnapshot:true}],[{...event('legacy','toDecision','participate','20'),historicalSnapshot:true}],[{...event('legacy','toResult','won','20'),historicalSnapshot:true}]);
 assert.equal(result.uncertainHistoryCount,3);assert.equal(result.cohortWithoutHistory,1);assert.equal(stage(result,'calculation').tenders,0);assert.equal(result.metrics.wonTenders,0);
 assert.equal(result.metrics.avgCycleDays,null);assert.equal(result.metrics.avgDecisionHours,null);assert.equal(dailyTotal(result,'wonTenders'),0);
});
