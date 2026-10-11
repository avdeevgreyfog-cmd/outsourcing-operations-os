import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as access from '../lib/core/access.mjs';

// Executes the real route with SQL/tenant/template doubles, not a live database.
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),user=id(2),requestId=id(3),calculationId=id(4),roleId=id(5),scenarioId=id(6),specialtyId=id(7);
const baseScope={organizationId:org,ownerUserId:user,ownerName:'Менеджер',ownerEmail:'manager@example.com',createdByUserId:user,teamId:null,regionId:id(8),clientId:id(9),client:'Заказчик',
  title:'Заказ',vatMode:'with_vat',location:'Москва',startDate:'2026-10-15',durationText:'Месяц',schedule:{pattern:'5/2',paidHours:8},housingRule:'not_required',travelRule:'client',shuttleRule:null,ppeRule:'include',medicalRule:null,toolsRule:null,status:'proposal_ready',archivedAt:null};
const baseScenario={scenarioId,requestRoleId:roleId,specialtyId,role:'Комплектовщик',count:24,workers:24,hoursPerWorker:176,monthlyRevenueNet:2956800,vatPct:22,rateNet:700,rateGross:854,billingUnit:'hour',billingUnitLabel:null,
  pricingSnapshot:{scenarioId,billingUnit:'hour',variableBillingUnit:null,clientRateNet:700,clientRateGross:854,vatPct:22,fixedMonthlyNet:null,minimumMonthlyNet:null,monthlyRevenueNet:2956800,projectMonths:null}};
class AccessDeniedError extends Error{}
class CommercialRequestConflict extends Error{}
function harness({scenarios=[baseScenario],scope=baseScope,approved=true,locked=false,unexpected=null,capabilities=['sales.proposal.create']}={}){
  const queries=[],writes=[],steps=[];
  const actor={organizationId:org,userId:user,displayName:'Тест',email:'test@example.com',demo:false,teamIds:[],regionIds:[],orgUnitIds:[],access:{capabilities,denies:[],scopes:{'sales.proposal.create':[{type:'all_org',ids:[]}]}}};
  const sql=async(strings,...values)=>{
    const text=strings.join('?');queries.push({text,values});steps.push(text.trim().split('\n')[0]);
    if(unexpected)throw unexpected;
    if(text.includes('FROM requests r'))return [scope];
    if(text.includes('FROM calculations'))return approved?[{id:calculationId,version:2}]:[];
    if(text.includes('FROM request_roles rr'))return structuredClone(scenarios);
    if(text.includes('SELECT id,version FROM proposals'))return [{id:id(10),version:1}];
    writes.push({text,values});
    if(text.includes('INSERT INTO proposals'))return [{id:id(11),version:2,status:'draft'}];
    if(text.includes('UPDATE requests'))return [];
    throw Error('Unexpected SQL');
  };
  sql.json=value=>value;sql.begin=()=>{throw Error('Nested transaction begin is unavailable inside withTenant');};
  const deps={
    'next/server':{NextResponse:{json(body,{status=200}={}){return new Response(JSON.stringify(body),{status});}}},
    '@/lib/auth/server':{async getCurrentActor(){return actor;}},
    '@/lib/access/server':{AccessDeniedError,requireCapability(a,c){if(!access.hasCapability(a.access,c))throw new AccessDeniedError(c);}},
    '@/lib/core/access.mjs':access,
    '@/lib/db/client':{async withTenant(tenant,who,fn){assert.equal(tenant,org);assert.equal(who,user);return fn(sql);}},
    '@/lib/commercial/proposal-template':{async getDefaultProposalTemplate(){return {id:id(12),name:'Шаблон',kind:'operis',version:1,config:{intro:'Предложение'}};}},
    '@/lib/commercial/request-lock':{CommercialRequestConflict,async assertRequestCommercialEditable(tx,a,requested){assert.equal(tx,sql);assert.equal(a,actor);assert.equal(requested,requestId);steps.push('REQUEST LOCK');if(locked)throw new CommercialRequestConflict('Принятая коммерческая версия зафиксирована');return {status:scope.status,archivedAt:scope.archivedAt,updatedAt:'2026-10-11'};}},
  };
  const compiled=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/proposals/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const route={};new Function('exports','require',compiled)(route,name=>deps[name]??require(name));
  return {queries,writes,steps,post:()=>route.POST(new Request('http://localhost/api/proposals',{method:'POST',body:JSON.stringify({requestId})}))};
}

test('proposal freezes consistent approved economics and source role identity after request lock',async()=>{
  const h=harness(),response=await h.post();assert.equal(response.status,201);assert.equal(h.steps[0],'REQUEST LOCK');
  const insert=h.writes.find(q=>q.text.includes('INSERT INTO proposals'));assert.ok(insert);
  const content=insert.values[5];assert.equal(insert.values[4],2956800);assert.deepEqual(insert.values[3],[scenarioId]);
  assert.deepEqual(content.roles[0],{role:'Комплектовщик',specialtyId,requestRoleId:roleId,count:24,workers:24,hoursPerWorker:176,monthlyRevenueNet:2956800,rateNet:700,rateGross:854,unit:'hour',unitLabel:null,scenarioId,pricingSnapshot:baseScenario.pricingSnapshot,
    source:{calculationId,calculationVersion:2,requestRoleId:roleId,scenarioId}});
  assert.equal(content.calculationId,calculationId);assert.equal(content.calculationVersion,2);
  assert.equal(h.writes.length,2);
  const scopeQuery=h.queries.find(q=>q.text.includes('FROM requests r'));assert.match(scopeQuery.text,/r\.organization_id=/);assert.ok(scopeQuery.values.includes(org));
  const query=h.queries.find(q=>q.text.includes('FROM request_roles rr'));
  assert.match(query.text,/cs\.calculation_id=/);assert.match(query.text,/cs\.request_role_id=rr\.id/);assert.match(query.text,/cs\.status='accepted'/);
  assert.equal(/COALESCE\([^\n]*workers[^\n]*rr\.count_required/.test(query.text),false,'no live workers fallback');
});

test('changed role headcount cannot reuse old revenue or silently reprice approved scenarios',async()=>{
  const h=harness({scenarios:[{...baseScenario,count:30}]});const response=await h.post();
  assert.equal(response.status,409);assert.match((await response.json()).error,/Численность.*изменилась/);assert.equal(h.writes.length,0);
});

test('missing, zero and fractional snapshot workers require recalculation without writes',async()=>{
  for(const workers of [null,undefined,0,-1,24.5]){
    const h=harness({scenarios:[{...baseScenario,workers}]}),response=await h.post();
    assert.equal(response.status,409);assert.match((await response.json()).error,/не зафиксирована численность/);assert.equal(h.writes.length,0);
  }
});

test('each current request role needs an accepted scenario from the same approved calculation',async()=>{
  for(const scenarios of [[],[{...baseScenario,scenarioId:null}],[baseScenario,{...baseScenario,requestRoleId:id(99),scenarioId:null}]]){
    const h=harness({scenarios}),response=await h.post();assert.equal(response.status,409);assert.match((await response.json()).error,/не для всех позиций/);assert.equal(h.writes.length,0);
  }
  const h=harness({approved:false});assert.equal((await h.post()).status,409);assert.equal(h.writes.length,0);
});

test('multiple consistent positions preserve individual monthly revenues and their exact total',async()=>{
  const second={...baseScenario,requestRoleId:id(21),scenarioId:id(22),count:5,workers:5,monthlyRevenueNet:616000};
  const h=harness({scenarios:[baseScenario,second]});assert.equal((await h.post()).status,201);
  const insert=h.writes.find(q=>q.text.includes('INSERT INTO proposals'));
  assert.equal(insert.values[4],3572800);assert.deepEqual(insert.values[5].roles.map(r=>[r.count,r.monthlyRevenueNet]),[[24,2956800],[5,616000]]);
});

test('permanent commercial lock rejects creation even at prelaunch before source reads',async()=>{
  const h=harness({locked:true,scope:{...baseScope,status:'prelaunch'}});const response=await h.post();
  assert.equal(response.status,409);assert.equal(h.queries.length,0);assert.equal(h.writes.length,0);
});

test('missing permission and foreign tenant scope do not create proposals',async()=>{
  for(const config of [{capabilities:[]},{scope:{...baseScope,organizationId:id(99)}}]){
    const h=harness(config);assert.equal((await h.post()).status,403);assert.equal(h.writes.length,0);
  }
});

test('unexpected errors return a safe message without exposing database internals',async()=>{
  const h=harness({unexpected:Error('private database connection string')}),original=console.error;console.error=()=>{};
  try{const response=await h.post();assert.equal(response.status,500);assert.equal(JSON.stringify(await response.json()).includes('private'),false);assert.equal(h.writes.length,0);}finally{console.error=original;}
});
