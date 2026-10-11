import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
function load(file,deps={}){
  const code=ts.transpileModule(fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('exports','require',code)(exports,name=>deps[name]??require(name));return exports;
}
const lockState=load('lib/commercial/request-lock-state.ts');
const guard=load('lib/commercial/request-lock.ts',{'./request-lock-state':lockState});
const requestId='00000000-0000-4000-8000-000000000001',organizationId='00000000-0000-4000-8000-000000000002';
function fixture({status='draft',accepted=false,archivedAt=null,missing=false}={}){
  const queries=[],row={status,archivedAt,updatedAt:'2026-10-11T12:00:00Z'};
  const tx=async(parts,...values)=>{
    const text=parts.join('?');queries.push({text,values});
    if(text.includes('FROM requests'))return missing?[]:[row];
    if(text.includes('FROM proposals'))return accepted?[{id:'accepted-proposal'}]:[];
    throw new Error(`Unexpected SQL: ${text}`);
  };
  return {queries,row,check:()=>guard.assertRequestCommercialEditable(tx,{organizationId},requestId)};
}
function assertLockOrderAndTenant(f){
  assert.equal(f.queries.length,2);assert.match(f.queries[0].text,/FROM requests/);assert.match(f.queries[0].text,/FOR UPDATE/);
  assert.match(f.queries[1].text,/FROM proposals/);assert.match(f.queries[1].text,/accepted_at IS NOT NULL/);
  for(const q of f.queries){assert.deepEqual(q.values,[requestId,organizationId]);assert.match(q.text,/organization_id=\?::uuid/);assert.equal(/^\s*(INSERT|UPDATE|DELETE)\b/.test(q.text),false);}
}
for(const status of ['draft','calculation','negotiation','lost','archived'])test(`accepted proposal locks commercial conditions regardless of request status ${status}`,async()=>{
  const f=fixture({status,accepted:true});await assert.rejects(f.check,error=>error instanceof guard.CommercialRequestConflict&&/приняты и зафиксированы/.test(error.message));assertLockOrderAndTenant(f);
});
for(const status of ['accepted','prelaunch','launch_ready','launched'])test(`commercial request status ${status} blocks editing even without accepted proposal row`,async()=>{
  const f=fixture({status});await assert.rejects(f.check,error=>error instanceof guard.CommercialRequestConflict&&/приняты и зафиксированы/.test(error.message));assertLockOrderAndTenant(f);
});
test('archive blocks edits with restoration instruction and retains request-before-proposal lock order',async()=>{
  const f=fixture({status:'draft',archivedAt:'2026-10-01'});await assert.rejects(f.check,error=>error instanceof guard.CommercialRequestConflict&&/восстановите заявку из архива/.test(error.message));assertLockOrderAndTenant(f);
});
test('editable request returns the locked current row after checking accepted proposals',async()=>{
  const f=fixture({status:'negotiation'});assert.equal(await f.check(),f.row);assertLockOrderAndTenant(f);
});
test('missing tenant request aborts before proposal lookup',async()=>{
  const f=fixture({missing:true});await assert.rejects(f.check,error=>error instanceof guard.CommercialRequestConflict&&/не найдена/.test(error.message));assert.equal(f.queries.length,1);assert.match(f.queries[0].text,/FOR UPDATE/);assert.deepEqual(f.queries[0].values,[requestId,organizationId]);
});
test('pure commercial lock state retains explicit accepted version signal independently of status',()=>{
  assert.equal(lockState.isRequestCommercialLocked({status:'draft',commercialLocked:true}),true);
  assert.equal(lockState.isRequestCommercialLocked({status:'negotiation',commercialLocked:false}),false);
});


// Acceptance itself must complete the sales stage: the freeze then prevents a
// subsequent manual stage PATCH from wiping the accepted decision.
function acceptanceFixture(accepted=false){
  const queries=[],proposalId='00000000-0000-4000-8000-000000000003',userId='00000000-0000-4000-8000-000000000004';
  const actor={organizationId,userId,demo:false,access:{capabilities:['sales.proposal.client_decision'],denies:[],scopes:{'sales.proposal.client_decision':[{type:'all_org',ids:[]}]}}};
  const tx=async(parts,...values)=>{
    const text=parts.join('?');queries.push({text,values});
    if(text.includes('SELECT request_id'))return [{requestId}];
    if(text.includes('FROM requests'))return [{status:'proposal_sent',archivedAt:null,updatedAt:'2026-10-11'}];
    if(text.includes('accepted_at IS NOT NULL'))return accepted?[{id:'previous'}]:[];
    if(text.includes('FROM proposals p JOIN requests'))return [{id:proposalId,requestId,status:'sent',organizationId,createdByUserId:userId}];
    if(text.includes('SELECT id FROM proposals'))return [];
    if(/^\s*UPDATE/.test(text))return [];
    throw Error(`Unexpected SQL: ${text}`);
  };
  tx.json=x=>x;tx.begin=()=>{throw Error('Nested transaction is unavailable');};
  class AccessDeniedError extends Error{}
  const access=require('../lib/core/access.mjs');
  const route=load('app/api/proposals/[id]/route.ts',{
    '@/lib/commercial/request-lock':guard,
    '@/lib/auth/server':{getCurrentActor:async()=>actor},
    '@/lib/access/server':{AccessDeniedError,requireCapability(a,c){if(!access.hasCapability(a.access,c))throw new AccessDeniedError(c);}},
    '@/lib/core/access.mjs':access,
    '@/lib/db/client':{withTenant:async(tenant,user,fn)=>{assert.equal(tenant,organizationId);assert.equal(user,userId);return fn(tx);}},
    '@/lib/commercial/proposal-template':{normalizeTemplateConfig:()=>({})},
    'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
  });
  return {queries,post:()=>route.PATCH(new Request('http://local',{method:'PATCH',body:JSON.stringify({action:'accept'})}),{params:Promise.resolve({id:proposalId})})};
}
test('acceptance atomically fixes the proposal and completes agreed sales stage under the request lock',async()=>{
  const f=acceptanceFixture();assert.equal((await f.post()).status,200);
  const updates=f.queries.filter(q=>/^\s*UPDATE/.test(q.text));assert.equal(updates.length,2);
  assert.match(updates[0].text,/accepted_at=now\(\)/);
  assert.match(updates[1].text,/workflow_stage_code='agreed'/);assert.match(updates[1].text,/closed_at=COALESCE/);
  assert.ok(updates[1].values.includes(organizationId));
  assert.match(f.queries[1].text,/FROM requests/);assert.match(f.queries[1].text,/FOR UPDATE/);
});
test('a previously accepted proposal blocks another acceptance before any write despite reset request status',async()=>{
  const f=acceptanceFixture(true);assert.equal((await f.post()).status,409);
  assert.equal(f.queries.some(q=>/^\s*UPDATE/.test(q.text)),false);
});
