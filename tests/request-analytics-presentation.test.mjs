import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

const source=fs.readFileSync(new URL('../components/RequestAnalyticsTrendChart.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports={};
// Chart rendering needs the browser; these tests exercise presentation aggregation only.
new Function('require','exports',compiled)(()=>({}),exports);
const {bucketRequestTrendRows,requestTrendTotal}=exports;
const makeRows=(length,start='2026-09-01')=>Array.from({length},(_,index)=>{
 const date=new Date(`${start}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+index);
 return {date:date.toISOString().slice(0,10),label:'',newRequests:0,newHeadcount:0,proposalRequests:0,proposalHeadcount:0,agreedRequests:0,agreedHeadcount:0,conversionRequests:0,conversionHeadcount:0};
});

test('chart buckets preserve sparse event totals and both calendar ranges',()=>{
 const current=makeRows(30);current[1].newRequests=3;current[1].newHeadcount=15;current[28].proposalRequests=2;current[28].proposalHeadcount=8;
 const previous=makeRows(30,'2026-08-02');previous[20].agreedRequests=1;
 const points=bucketRequestTrendRows(current),comparison=bucketRequestTrendRows(previous);
 assert.equal(points.length,10);assert.equal(comparison.length,10);
 assert.equal(requestTrendTotal('new','requests',points),3);assert.equal(requestTrendTotal('new','headcount',points),15);
 assert.equal(requestTrendTotal('proposal','requests',points),2);assert.equal(requestTrendTotal('proposal','headcount',points),8);
 assert.equal(requestTrendTotal('agreed','requests',comparison),1);
 assert.ok(points[0].dateRange.includes('2026'));assert.ok(comparison[0].dateRange.includes('2026'));
 assert.notEqual(points[0].dateRange,comparison[0].dateRange);
 assert.equal(points.filter(point=>point.newRequests>0).length,1);
});

test('cumulative conversion stays unavailable until an incoming denominator exists',()=>{
 const rows=makeRows(15);rows[7].newRequests=2;rows[7].newHeadcount=10;rows[14].conversionRequests=50;rows[14].conversionHeadcount=20;
 const points=bucketRequestTrendRows(rows);
 assert.equal(points[0].conversionRequests,null);assert.equal(points[1].conversionHeadcount,null);
 assert.equal(points[2].conversionRequests,0);
 assert.equal(requestTrendTotal('conversion','requests',points),50);assert.equal(requestTrendTotal('conversion','headcount',points),20);
});

test('calendar agreement events alone cannot manufacture cohort conversion',()=>{
 const rows=makeRows(7);rows[3].agreedRequests=2;rows[3].agreedHeadcount=5;
 const points=bucketRequestTrendRows(rows);
 assert.equal(requestTrendTotal('agreed','requests',points),2);
 assert.equal(requestTrendTotal('conversion','requests',points),null);
 assert.equal(requestTrendTotal('conversion','headcount',points),null);
 assert.equal(requestTrendTotal('conversion','requests',[]),null);
});

test('partial final bucket is retained without rounding events or conversion',()=>{
 const rows=makeRows(16);rows[0].newRequests=3;rows[15].agreedRequests=1;rows[15].conversionRequests=33;
 const points=bucketRequestTrendRows(rows);
 assert.equal(points.length,6);assert.equal(points.at(-1).agreedRequests,1);
 assert.equal(requestTrendTotal('conversion','requests',points),33);
 assert.ok(!points.at(-1).dateRange.includes(' — '));
});
