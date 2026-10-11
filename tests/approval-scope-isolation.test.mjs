import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {hasCapability} from '../lib/core/access.mjs';

const require=createRequire(import.meta.url);
const root=process.env.APPROVAL_ROUTE_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const org='00000000-0000-4000-8000-000000000001';
const user='10000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
const approval='20000000-0000-4000-8000-000000000001';
const AccessDeniedError=class AccessDeniedError extends Error {};

function makeActor({capabilities=['approval.read','approval.decide'],readScope='assigned_to_me',decideScope='assigned_to_me'}={}){
  return {organizationId:org,userId:user,demo:false,access:{capabilities,denies:[],allOrg:true,scopes:{
    'approval.read':readScope?[{type:readScope,ids:[]}]:[],
    'approval.decide':decideScope?[{type:decideScope,ids:[]}]:[],
    'finance.pnl.read':[{type:'all_org',ids:[]}],
  }}};
}

function compile(sourcePath,deps){
  const source=fs.readFileSync(path.join(root,sourcePath),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const compiledModule={};new Function('exports','require',compiled)(compiledModule,name => name === '@/lib/commercial/request-lock' ? compile('lib/commercial/request-lock.ts',{}) : name === './request-lock-state' || name === '@/lib/commercial/request-lock-state' ? compile('lib/commercial/request-lock-state.ts',{}) : deps[name]??require(name));return compiledModule;
}

function loadList(actor){
  const queries=[];
  const sql=async(parts,...values)=>{
    queries.push({text:parts.join('?'),values});
    const allOrg=values[values.length-3]===true;
    const rows=[
      {id:'own',requestedBy:user,approverUserId:other},
      {id:'assigned',requestedBy:other,approverUserId:user},
      {id:'unrelated',requestedBy:other,approverUserId:other},
    ];
    return rows.filter(row=>allOrg||row.requestedBy===user||row.approverUserId===user);
  };
  const deps={
    '@/lib/access/server':{requireCapability(target,key){if(!hasCapability(target.access,key))throw new AccessDeniedError(key);}},
    '@/lib/db/client':{withTenant:async(_org,_user,fn)=>fn(sql)},
  };
  const mod=compile('lib/commercial/approval-list.ts',deps);
  return {list:()=>mod.listAllApprovals(actor),queries};
}

function loadDecision(actor,{approverUserId=other,rowFound=true,linkedRequest=false,acceptedProposal=false,requestStatus='draft'}={}){
  const queries=[];
  const tx=async(parts,...values)=>{
    const text=parts.join('?');queries.push({text,values});
    if(text.includes('SELECT CASE WHEN'))return [{requestId:linkedRequest?approval:null}];
    if(text.includes('FROM requests')&&text.includes('FOR UPDATE')){assert.deepEqual(values,[approval,org]);return [{status:requestStatus,archivedAt:null,updatedAt:'v1'}];}
    if(text.includes('FROM proposals')&&text.includes('accepted_at IS NOT NULL')){assert.deepEqual(values,[approval,org]);return acceptedProposal?[{id:'accepted-proposal'}]:[];}
    if(text.includes('FROM approval_instances ai'))return rowFound?[{id:approval,subjectType:'contract',subjectId:approval,processCode:'commercial_contract',status:'pending',approverUserId}]:[];
    if(text.includes('FROM contracts WHERE'))return [{requestId:null}];
    return [];
  };
  tx.begin=fn=>fn(tx);tx.json=value=>value;
  const sql=async(parts,...values)=>tx(parts,...values);sql.begin=tx.begin;sql.json=tx.json;
  const deps={
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    '@/lib/auth/server':{getCurrentActor:async()=>actor},
    '@/lib/access/server':{AccessDeniedError,requireCapability(target,key){if(!hasCapability(target.access,key))throw new AccessDeniedError(key);}},
    '@/lib/db/client':{withTenant:async(_org,_user,fn)=>fn(sql)},
  };
  const mod=compile('app/api/approvals/[id]/decision/route.ts',deps);
  return {PATCH:mod.PATCH,queries};
}

const params={params:Promise.resolve({id:approval})};
const decisionRequest=()=>new Request('http://local/api/approvals/'+approval+'/decision',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({decision:'approve'})});
const noWrites=queries=>assert.equal(queries.some(query=>/^\s*(INSERT|UPDATE|DELETE)\b/i.test(query.text)),false);

test('approval list keeps requester and assigned rows without inheriting unrelated all_org',async()=>{
  const {list,queries}=loadList(makeActor({readScope:'assigned_to_me'}));
  const rows=await list();
  assert.deepEqual(rows.map(row=>row.id),['own','assigned']);
  assert.match(queries[0].text,/WHERE \? OR ai\.requested_by_user_id=\?::uuid OR aps\.approver_user_id=\?::uuid/);
});

test('approval list permits explicit approval.read all_org',async()=>{
  const {list}=loadList(makeActor({readScope:'all_org'}));
  assert.deepEqual((await list()).map(row=>row.id),['own','assigned','unrelated']);
});

test('approval list rejects missing approval.read capability',async()=>{
  const {list,queries}=loadList(makeActor({capabilities:['approval.decide']}));
  await assert.rejects(list(),AccessDeniedError);
  assert.equal(queries.length,0);
});

test('decision rejects unrelated approval all_org and performs no writes',async()=>{
  const {PATCH,queries}=loadDecision(makeActor({decideScope:'assigned_to_me'}));
  const response=await PATCH(decisionRequest(),params);
  assert.equal(response.status,403);noWrites(queries);
});

test('decision permits the assigned approver without approval.decide all_org',async()=>{
  const {PATCH,queries}=loadDecision(makeActor({decideScope:'assigned_to_me'}),{approverUserId:user});
  const response=await PATCH(decisionRequest(),params);
  assert.equal(response.status,200);
  assert.ok(queries.some(query=>query.text.includes('UPDATE approval_instances')));
});

test('decision permits approval-specific all_org',async()=>{
  const {PATCH,queries}=loadDecision(makeActor({decideScope:'all_org'}));
  const response=await PATCH(decisionRequest(),params);
  assert.equal(response.status,200);
  assert.ok(queries.some(query=>query.text.includes('UPDATE approval_instances')));
});

test('decision rejects missing approval.decide capability before querying or writing',async()=>{
  const {PATCH,queries}=loadDecision(makeActor({capabilities:['approval.read'],decideScope:'all_org'}));
  const response=await PATCH(decisionRequest(),params);
  assert.equal(response.status,403);assert.equal(queries.length,0);noWrites(queries);
});

test('stale approval decision cannot change accepted request commerce after request status resets',async()=>{
  const {PATCH,queries}=loadDecision(makeActor({decideScope:'assigned_to_me'}),{approverUserId:user,linkedRequest:true,acceptedProposal:true,requestStatus:'draft'});
  const response=await PATCH(decisionRequest(),params);assert.equal(response.status,409);assert.match((await response.json()).error,/приняты.*зафиксированы/i);noWrites(queries);
  assert.equal(queries.length,3);assert.match(queries[0].text,/SELECT CASE WHEN/);assert.match(queries[1].text,/FROM requests/);assert.match(queries[1].text,/FOR UPDATE/);assert.match(queries[2].text,/FROM proposals/);assert.match(queries[2].text,/accepted_at IS NOT NULL/);
  assert.equal(queries.some(q=>q.text.includes('JOIN approval_steps')),false,'request lock guard runs before locking stale approval rows');
});
