import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {canReadRow,hasCapability} from '../lib/core/access.mjs';

const require=createRequire(import.meta.url);
const root=process.env.CANDIDATE_ROUTE_ROOT??path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const org='00000000-0000-4000-8000-000000000001';
const user='10000000-0000-4000-8000-000000000001';
const candidate='85000000-0000-4000-8000-000000000001';
const application='86000000-0000-4000-8000-000000000001';
const document='87000000-0000-4000-8000-000000000001';
const other='10000000-0000-4000-8000-000000000002';
class AccessDeniedError extends Error {}

function loadRoute(kind,{owner=user,scope='assigned_to_me',rowOrg=org,capability=true}={}){
  const queries=[];
  // Keep the real scope evaluator. The aggregate flag deliberately comes from
  // an unrelated grant, as it does for mixed grants in loadEffectiveAccess.
  const actor={organizationId:org,userId:user,demo:false,access:{
    capabilities:['sales.client.read',...(capability?['recruiting.candidate.read','recruiting.candidate.edit']:[])],
    denies:[],allOrg:true,scopes:{'sales.client.read':[{type:'all_org',ids:[]}],
      'recruiting.candidate.read':[{type:scope,ids:[]}],
      'recruiting.candidate.edit':[{type:scope,ids:[]}]},
  }};
  const tx=async(parts,...values)=>{
    const sql=parts.join('?');queries.push({sql,values});
    if(sql.includes('FROM candidate_applications ca')&&sql.includes('SELECT ca.id,')){
      // Emulate the selected columns, so missing tenant metadata fails using
      // the real evaluator, rather than a stub returning "allowed".
      return [{id:application,candidateId:candidate,ownerUserId:owner,assigneeUserIds:[owner],
        ...(sql.includes('ca.organization_id "organizationId"')?{organizationId:rowOrg}:{})}];
    }
    if(sql.includes('FROM candidates c'))return [{organizationId:rowOrg,ownerUserId:owner,createdByUserId:owner,assigneeUserIds:[owner]}];
    if(sql.includes('SELECT ndr.provider'))return [{name:'Паспорт',provider:'candidate',groupType:'employment'}];
    if(sql.includes('FROM recruiting_document_types'))return [{name:'Паспорт',provider:'candidate',groupType:'employment'}];
    if(sql.includes('SELECT dt.id'))return [{documentTypeId:document,name:'Паспорт',status:'verified'}];
    if(sql.includes('INSERT INTO candidate_communications'))return [{id:document}];
    return [];
  };
  tx.begin=fn=>fn(tx);tx.json=value=>value;
  const deps={
    '@/lib/auth/server':{getCurrentActor:async()=>actor},
    '@/lib/access/server':{AccessDeniedError,requireCapability(actor,key){if(!hasCapability(actor.access,key))throw new AccessDeniedError(key);}},
    '@/lib/core/access.mjs':{canReadRow},
    '@/lib/db/client':{withTenant:async(_org,_user,fn)=>fn(tx)},
  };
  const source=fs.readFileSync(path.join(root,`app/api/candidates/[id]/${kind}/route.ts`),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const route={};new Function('exports','require',compiled)(route,name=>deps[name]??require(name));
  return {route,queries};
}
const params={params:Promise.resolve({id:candidate})};
function patch(applicationId){return new Request('http://local/api/documents',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({applicationId,documentTypeId:document,status:'verified',note:'Проверено'})});}
function post(){return new Request('http://local/api/communications',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({channel:'phone',summary:'Обсудили дату выхода'})});}
function noWrites(queries){assert.equal(queries.some(q=>/\b(INSERT|UPDATE|DELETE)\b/.test(q.sql)),false);}

for(const scope of ['assigned_to_me','all_org']){
  test(`application documents GET permits ${scope} and returns saved data`,async()=>{
    const {route}=loadRoute('documents',{scope});
    const response=await route.GET(new Request('http://local/api/documents?applicationId='+application),params);
    assert.equal(response.status,200);assert.equal((await response.json()).items[0].status,'verified');
  });
  test(`application documents PATCH permits ${scope} and records update/history`,async()=>{
    const {route,queries}=loadRoute('documents',{scope});const response=await route.PATCH(patch(application),params);
    assert.equal(response.status,200);assert.ok(queries.some(q=>q.sql.includes('INSERT INTO candidate_documents')));
    assert.ok(queries.some(q=>q.sql.includes('INSERT INTO activity_events')));
  });
}
for(const [name,options] of [['unassigned candidate despite unrelated all_org',{owner:other}],['other organization',{rowOrg:other}],['missing capability',{capability:false}]]){
  test(`application documents GET rejects ${name}`,async()=>{
    const {route,queries}=loadRoute('documents',options);const response=await route.GET(new Request('http://local/api/documents?applicationId='+application),params);
    assert.equal(response.status,403);noWrites(queries);assert.equal(queries.some(q=>q.sql.includes('SELECT dt.id')),false);
  });
  test(`application documents PATCH rejects ${name} without writes`,async()=>{
    const {route,queries}=loadRoute('documents',options);const response=await route.PATCH(patch(application),params);
    assert.equal(response.status,403);noWrites(queries);
  });
}
for(const kind of ['documents','communications']){
  for(const [name,options,expected] of [['own candidate',{},kind==='documents'?200:201],['unrelated all_org only',{owner:other},403],['candidate-specific all_org',{owner:other,scope:'all_org'},kind==='documents'?200:201],['other tenant',{rowOrg:other},403]]){
    test(`${kind} standalone write: ${name}`,async()=>{
      const {route,queries}=loadRoute(kind,options);const response=kind==='documents'?await route.PATCH(patch(null),params):await route.POST(post(),params);
      assert.equal(response.status,expected);if(expected===403)noWrites(queries);else assert.ok(queries.some(q=>q.sql.includes(kind==='documents'?'INSERT INTO candidate_documents':'INSERT INTO candidate_communications')));
    });
  }
}
