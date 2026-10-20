import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as access from '../lib/core/access.mjs';

const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),user=id(2),requestId=id(3),proposalId=id(4),scenarioId=id(5),roleId=id(6),specialtyId=id(7);
function compile(file,deps={}){const output=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const exports={};new Function('exports','require',output)(exports,name=>deps[name]??require(name));return exports;}
const snapshot=compile('lib/commercial/proposal-launch-snapshot.ts');
const pricing={scenarioId,billingUnit:'hour',variableBillingUnit:null,clientRateNet:700,clientRateGross:854,vatPct:22,fixedMonthlyNet:1000,minimumMonthlyNet:2500000,monthlyRevenueNet:2956800,projectMonths:2};
const role={role:'Комплектовщик',scenarioId,count:24,rateNet:700,rateGross:854,unit:'hour'};
const scenario={id:scenarioId,requestRoleId:roleId,specialtyId,workers:24,pricing};
const resolve=(content={roles:[role]},scenarios=[scenario],ids=[scenarioId])=>snapshot.resolveProposalLaunchSnapshot(content,ids,scenarios);

test('legacy valid proposal uses saved headcount and maps source role through saved scenario IDs',()=>{
  const [result]=resolve();assert.equal(result.count,24);assert.equal(result.requestRoleId,roleId);assert.equal(result.specialtyId,specialtyId);
  assert.equal(result.amount,700);assert.equal(result.unit,'hour');assert.deepEqual(result.pricing,pricing);
});
test('new saved pricing projection preserves fixed/minimum/VAT economics and hides unknown internals',()=>{
  const saved={...pricing,minimumMonthlyNet:2700000,internalCost:999999};
  const [result]=resolve({roles:[{...role,requestRoleId:roleId,specialtyId,workers:24,pricingSnapshot:saved}]});
  assert.equal(result.pricing.minimumMonthlyNet,2700000,'complete saved projection is authoritative');assert.equal('internalCost' in result.pricing,false);
});
test('mixed billing retains variable unit and fixed guarantee rather than flattening to hourly',()=>{
  const mixed={...pricing,billingUnit:'mixed',variableBillingUnit:'shift'};
  const [result]=resolve({roles:[{...role,unit:'mixed',pricingSnapshot:mixed}]},[{...scenario,pricing:mixed}]);
  assert.equal(result.unit,'shift');assert.equal(result.pricing.billingUnit,'mixed');assert.equal(result.pricing.fixedMonthlyNet,1000);assert.equal(result.pricing.minimumMonthlyNet,2500000);
});
test('missing, mixed or duplicate content/scenario snapshots require explicit correction',()=>{
  const cases=[{}, {roles:[]}, {roles:[{...role,count:30}]},{roles:[{...role,workers:30}]},{roles:[{...role,requestRoleId:id(99)}]},
    {roles:[{...role,specialtyId:id(99)}]},{roles:[{...role,rateNet:701}]},{roles:[{...role,unit:'shift'}]},
    {roles:[role,role]},{roles:[{...role,scenarioId:id(99)}]},{roles:[{...role,pricingSnapshot:{clientRateNet:700}}]}];
  for(const content of cases)assert.throws(()=>resolve(content),snapshot.ProposalLaunchSnapshotConflict);
  for(const workers of [null,undefined,0,24.5])assert.throws(()=>resolve({roles:[role]},[{...scenario,workers}]),snapshot.ProposalLaunchSnapshotConflict);
  assert.throws(()=>resolve({roles:[role]},[],[scenarioId]),snapshot.ProposalLaunchSnapshotConflict);
});

// Route tests below use SQL doubles and never perform real database writes.
function harness({content={roles:[role]},scenarios=[scenario],existing=false,dbFailure=null}={}){
  const queries=[],writes=[];
  const actor={organizationId:org,userId:user,demo:false,teamIds:[],orgUnitIds:[],regionIds:[],access:{capabilities:['sales.proposal.launch'],denies:[],scopes:{'sales.proposal.launch':[{type:'all_org',ids:[]}]}}};
  const sql=async(strings,...values)=>{
    const text=strings.join('?');queries.push({text,values});if(dbFailure)throw dbFailure;
    if(text.includes('SELECT request_id'))return [{requestId}];
    if(text.includes('SELECT id FROM requests'))return [{id:requestId}];
    if(text.includes('FROM proposals p JOIN requests'))return [{proposalId,requestId,proposalStatus:'accepted',proposalVersion:1,scenarioIds:[scenarioId],content,organizationId:org,clientId:id(8),regionId:id(9),ownerUserId:user,createdByUserId:user,teamId:null,title:'Заказ',location:'Москва',startDate:'2026-10-15'}];
    if(text.includes('FROM objects WHERE source_proposal_id'))return existing?[{id:id(20),name:'Объект',code:'EXISTING',contractId:id(21)}]:[];
    if(text.includes('FROM calculation_scenarios cs'))return structuredClone(scenarios);
    if(text.includes('FROM legal_entities'))return [{id:id(10),primary:true}];
    if(text.includes("resolve_organization_responsibility('object_launch'"))return [{userId:user}];
    if(text.includes('count(*)::int count FROM client_rates'))return [{count:1}];
    if(text.trim().startsWith('SELECT')||text.trim().startsWith('WITH'))return [];
    writes.push({text,values});
    if(text.includes('INSERT INTO objects'))return [{id:id(20),name:'Объект',code:'QA'}];
    if(text.includes('INSERT INTO launches('))return [{id:id(21),targetDate:'2026-10-15'}];
    if(text.includes('INSERT INTO needs('))return [{id:id(22),countRequired:values[4],specialtyId:values[3]}];
    if(text.includes('INSERT INTO contract_versions'))return [{id:id(24)}];
    if(text.includes('INSERT INTO contracts('))return [{id:id(23)}];
    return [];
  };
  sql.json=value=>value;sql.begin=()=>{throw Error('Nested transaction begin is unavailable inside withTenant');};
  class AccessDeniedError extends Error{}
  const route=compile('app/api/proposals/[id]/launch/route.ts',{
    '@/lib/commercial/proposal-launch-snapshot':snapshot,
    '@/lib/auth/server':{async getCurrentActor(){return actor;}},
    '@/lib/access/server':{AccessDeniedError,requireCapability(a,c){if(!access.hasCapability(a.access,c))throw new AccessDeniedError(c);}},
    '@/lib/core/access.mjs':access,
    '@/lib/db/client':{async withTenant(tenant,who,fn){assert.equal(tenant,org);assert.equal(who,user);return fn(sql);}},
    '@/lib/operations/launch-checklist':{defaultPrimarySiteVisitChecklist:()=>[]},
    'next/server':{NextResponse:{json(body,{status=200}={}){return new Response(JSON.stringify(body),{status});}}},
  });
  return {queries,writes,post:()=>route.POST(new Request('http://localhost',{method:'POST',body:'{}'}),{params:Promise.resolve({id:proposalId})})};
}
test('actual launch route rejects invalid snapshot before creating object or any other writes',async()=>{
  for(const content of [{roles:[{...role,count:30}]},{roles:[]},{roles:[{...role,requestRoleId:id(99)}]}]){
    const h=harness({content}),response=await h.post();assert.equal(response.status,409);assert.match((await response.json()).error,/снимок/);assert.equal(h.writes.length,0);
    assert.match(h.queries[1].text,/FOR UPDATE/,'request lock remains before joined proposal lock');
  }
});
test('actual launch inserts saved count despite changed live count and preserves rich rate pricing',async()=>{
  const h=harness({scenarios:[{...scenario,liveCount:30}]});assert.equal((await h.post()).status,201);
  const need=h.writes.find(q=>q.text.includes('INSERT INTO needs('));assert.equal(need.values[4],24);assert.equal(need.values[2],roleId);
  assert.equal(need.text.includes('FROM request_roles'),false);assert.equal(need.text.includes('rr.count_required'),false);
  const rate=h.writes.find(q=>q.text.includes('INSERT INTO client_rates'));assert.equal(rate.values[5],700);assert.deepEqual(rate.values[7],pricing);
  const source=h.queries.find(q=>q.text.includes('FROM calculation_scenarios cs'));assert.match(source.text,/organization_id=/);assert.ok(source.values.includes(org));
  assert.equal(source.text.includes('rr.count_required'),false);
});
test('idempotent existing-object return precedes legacy snapshot checks and creates nothing',async()=>{
  const h=harness({content:{},existing:true}),response=await h.post();assert.equal(response.status,201);assert.equal((await response.json()).alreadyExists,true);
  assert.equal(h.writes.length,0);assert.equal(h.queries.some(q=>q.text.includes('FROM calculation_scenarios cs')),false);
});
test('actual launch route hides unexpected backend details',async()=>{
  const h=harness({dbFailure:Error('private db string')}),original=console.error;console.error=()=>{};
  try{const response=await h.post();assert.equal(response.status,500);assert.equal(JSON.stringify(await response.json()).includes('private'),false);}finally{console.error=original;}
});
