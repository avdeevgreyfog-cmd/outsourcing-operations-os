import test from 'node:test';
import assert from 'node:assert/strict';
import { inPortfolioScope, latestFinanceByObject, staffingSummary, portfolioSignals } from '../lib/core/portfolio.mjs';

test('portfolio keeps the analytics scope and tenant boundary', () => {
 const actor = { organizationId:'org', access:{capabilities:['analytics.portfolio.read'],denies:[],scopes:{'analytics.portfolio.read':[{type:'objects',ids:['a']}]}} };
 assert.equal(inPortfolioScope(actor,{id:'a',organizationId:'org'}),true);
 assert.equal(inPortfolioScope(actor,{id:'b',organizationId:'org'}),false);
 assert.equal(inPortfolioScope(actor,{id:'a',organizationId:'other'}),false);
 actor.access.denies.push('analytics.portfolio.read');
 assert.equal(inPortfolioScope(actor,{id:'a',organizationId:'org'}),false);
});
test('latest financial snapshots do not double-count historical periods', () => {
 const latest={objectId:'a',revenue:200}; const old={objectId:'a',revenue:100};
 const result=latestFinanceByObject([latest,{objectId:'b',revenue:80},old]);
 assert.equal(result.size,2); assert.equal(result.get('a'),latest);
});
test('unknown staffing is not 100 percent or a healthy zero', () => {
 assert.deepEqual(staffingSummary(0,0),{coverage:null,deficit:null});
 assert.deepEqual(staffingSummary(32,22),{coverage:69,deficit:10});
 assert.deepEqual(staffingSummary(10,12),{coverage:120,deficit:0});
});
test('signals distinguish recorded problems from absent source data', () => {
 assert.deepEqual(portfolioSignals({required:0,filled:0},null,null),[]);
 const signals=portfolioSignals({required:10,filled:6,risk:'critical'}, {contribution:-50}, {status:'draft'});
 assert.deepEqual(signals.map(row=>row.tab),['needs','overview','finance','timesheets']);
});
