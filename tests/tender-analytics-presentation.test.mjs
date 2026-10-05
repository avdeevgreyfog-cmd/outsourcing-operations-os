import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketTenderActivity, tenderPercent, tenderActivityTooltip } from '../lib/tenders/analytics-presentation.mjs';
import { calculateTenderPeriod } from '../lib/tenders/analytics-calculation.mjs';

test('bucketed calendar bars sum counts and amounts while cumulative rates use the tail, including null',()=>{
 const result=calculateTenderPeriod([{id:'a',createdAt:'2026-09-02T10:00:00Z',initialPrice:300,headcount:3}],[],[],[{tenderId:'a',toResult:'won',createdAt:'2026-09-04T10:00:00Z'}],'2026-09-01','2026-09-30');
 const points=bucketTenderActivity(result.daily);
 assert.equal(points.length,10);assert.equal(points[0].newTenders,1);assert.equal(points[0].newValue,300);assert.equal(points[0].winRateTenders,null);
 assert.equal(points[1].wonTenders,1);assert.equal(points[1].wonValue,300);assert.equal(points[1].winRateTenders,100);assert.equal(points.at(-1).winRateTenders,100);
 assert.equal(points.reduce((sum,point)=>sum+point.wonTenders,0),1);assert.equal(points[0].dateRange,'2026-09-01 — 2026-09-03');
});

test('unknown percentages render dash and measured zero remains zero percent',()=>{
 assert.equal(tenderPercent(null),'—');assert.equal(tenderPercent(undefined),'—');assert.equal(tenderPercent(0),'0%');assert.equal(tenderPercent(50),'50%');
});


test('calendar and comparison tooltips show real full date intervals rather than aligned labels',()=>{
 const point={dateRange:'2026-09-01 — 2026-09-03',newTenders:2,participateTenders:1,submittedTenders:1,wonTenders:0,winRateTenders:null};
 const previous={...point,dateRange:'2026-08-02 — 2026-08-04',winRateTenders:50};
 const calendar=tenderActivityTooltip(point,previous,'tenders');
 assert.ok(calendar.includes('2026-09-01 — 2026-09-03'));assert.ok(calendar.includes('Новые: <strong>2</strong>'));
 const comparison=tenderActivityTooltip(point,previous,'tenders',true);
 assert.ok(comparison.includes('Текущий период · 2026-09-01 — 2026-09-03'));assert.ok(comparison.includes('Предыдущий период · 2026-08-02 — 2026-08-04'));
 assert.ok(comparison.includes('<strong>—</strong>'));assert.ok(comparison.includes('<strong>50%</strong>'));
 const missing=tenderActivityTooltip(point,undefined,'tenders',true);assert.ok(missing.includes('нет соответствующего интервала'));assert.equal(tenderActivityTooltip(undefined,undefined,'tenders'), '');
});
