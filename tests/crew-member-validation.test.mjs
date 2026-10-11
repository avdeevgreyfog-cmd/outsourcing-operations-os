import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {canReadRow,hasCapability} from '../lib/core/access.mjs';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const organizationId='00000000-0000-4000-8000-000000000001';
const foreignOrganizationId='00000000-0000-4000-8000-000000000002';
const userId='10000000-0000-4000-8000-000000000001';
const objectId='20000000-0000-4000-8000-000000000001';
const otherObjectId='20000000-0000-4000-8000-000000000002';
const memberA='30000000-0000-4000-8000-000000000001';
const memberB='30000000-0000-4000-8000-000000000002';
const leader='30000000-0000-4000-8000-000000000003';
const specialtyId='40000000-0000-4000-8000-000000000001';
const crewId='50000000-0000-4000-8000-000000000001';
const today=new Date().toISOString().slice(0,10);
const AccessDeniedError=class AccessDeniedError extends Error {};

function actorFor({scopeType='objects',scopeIds=[objectId],capability=true}={}){
  return {organizationId,userId,demo:false,access:{
    capabilities:capability?['operations.crew.manage']:[],denies:[],allOrg:false,
    scopes:{'operations.crew.manage':[{type:scopeType,ids:scopeIds}]},
  }};
}

function loadRoute({actor=actorFor(),objectExists=true,workers=[],specialty={id:specialtyId,organizationId,active:true},dbError=null}={}){
  const queries=[];const insertedMembers=[];let crewInserts=0;
  const sql=async(parts,...values)=>{
    const text=parts.join('?');const normalized=text.trimStart();queries.push({text,values});
    if(dbError&&normalized.startsWith('SELECT'))throw new Error(dbError);
    if(text.includes('FROM objects o'))return objectExists?[{id:objectId,ownerUserId:userId,regionId:null,assigneeUserIds:[userId]}]:[];
    if(text.includes('FROM specialties'))return specialty?.organizationId===organizationId&&specialty.active&&specialty.id===values[0]?[{id:specialty.id}]:[];
    if(text.includes('FROM worker_profiles w')){
      const requested=new Set(values.find(value=>Array.isArray(value)&&value.some(id=>[memberA,memberB,leader].includes(id)))??[]);
      return workers.filter(worker=>requested.has(worker.workerId)&&worker.organizationId===organizationId
        &&worker.assignmentOrganizationId===organizationId&&worker.status==='active'&&worker.objectId===objectId
        &&worker.effectiveFrom<=today&&(worker.effectiveTo===null||worker.effectiveTo>=today))
        .map(worker=>({workerId:worker.workerId,organizationId:worker.assignmentOrganizationId,objectId:worker.objectId,
          ownerUserId:userId,regionId:null,assigneeUserIds:[userId]}));
    }
    if(normalized.startsWith('INSERT INTO object_crews')){crewInserts++;return [{id:crewId}];}
    if(normalized.startsWith('INSERT INTO object_crew_members')){insertedMembers.push(values[2]);return [{id:'60000000-0000-4000-8000-000000000001'}];}
    return [];
  };
  sql.begin=fn=>fn(sql);sql.json=value=>value;
  const deps={
    'next/server':{NextResponse:{json:(body,init)=>Response.json(body,init)}},
    '@/lib/auth/server':{getCurrentActor:async()=>actor},
    '@/lib/access/server':{AccessDeniedError,requireCapability(target,key){if(!hasCapability(target.access,key))throw new AccessDeniedError(key);}},
    '@/lib/core/access.mjs':{canReadRow},
    '@/lib/db/client':{withTenant:async(_organization,_user,fn)=>fn(sql)},
  };
  const source=fs.readFileSync(path.join(root,'app/api/crews/route.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const routeModule={};new Function('exports','require',compiled)(routeModule,name=>deps[name]??require(name));
  return {POST:routeModule.POST,queries,insertedMembers,get crewInserts(){return crewInserts;}};
}

const worker=(workerId,overrides={})=>({workerId,organizationId,assignmentOrganizationId:organizationId,status:'active',objectId,effectiveFrom:'2020-01-01',effectiveTo:null,...overrides});
const payload=overrides=>({objectId,name:'Бригада участка',...overrides});
const post=body=>new Request('http://local/api/crews',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
const noWrites=queries=>assert.equal(queries.some(query=>/^\s*INSERT\b/i.test(query.text)),false);
const queryOf=(queries,fragment)=>queries.find(query=>query.text.includes(fragment));

test('crew creation permits optional leader and empty member list',async()=>{
  const {POST,queries,insertedMembers}=loadRoute();
  const response=await POST(post(payload({})));const body=await response.json();
  assert.equal(response.status,201);assert.equal(body.id,crewId);assert.deepEqual(insertedMembers,[]);
  assert.equal(queryOf(queries,'FROM worker_profiles w'),undefined);
});

test('crew creation accepts current assigned members under the actual object scope',async()=>{
  const {POST,insertedMembers}=loadRoute({workers:[worker(memberA),worker(memberB)]});
  const response=await POST(post(payload({memberIds:[memberA,memberB]})));
  assert.equal(response.status,201);assert.deepEqual(insertedMembers,[memberA,memberB]);
});

for(const [description,invalidWorker] of [
  ['foreign tenant',worker(memberA,{organizationId:foreignOrganizationId,assignmentOrganizationId:foreignOrganizationId})],
  ['inactive',worker(memberA,{status:'inactive'})],
  ['not assigned to this object',worker(memberA,{objectId:otherObjectId})],
  ['expired assignment',worker(memberA,{effectiveTo:'2025-12-31'})],
  ['future assignment',worker(memberA,{effectiveFrom:'2027-01-01'})],
]){
  for(const target of ['member','leader']){
    test(`crew creation rejects ${description} ${target} before writes`,async()=>{
      const id=invalidWorker.workerId;
      const body=target==='member'?payload({memberIds:[id]}):payload({leaderWorkerId:id,leaderMode:'working_leader'});
      const {POST,queries}=loadRoute({workers:[invalidWorker]});
      const response=await POST(post(body));
      assert.equal(response.status,400);noWrites(queries);
      const check=queryOf(queries,'FROM worker_profiles w');assert.ok(check);
      assert.match(check.text,/w\.organization_id=\?::uuid/);
      assert.match(check.text,/a\.organization_id=\?::uuid/);
      assert.match(check.text,/w\.status='active'/);
      assert.match(check.text,/a\.effective_from<=current_date/);
      assert.match(check.text,/a\.effective_to IS NULL OR a\.effective_to>=current_date/);
    });
  }
}

test('crew creation rejects a chosen dedicated leader with a foreign tenant assignment before writes',async()=>{
  const {POST,queries}=loadRoute({workers:[worker(leader,{organizationId:foreignOrganizationId,assignmentOrganizationId:foreignOrganizationId})]});
  const response=await POST(post(payload({leaderWorkerId:leader,leaderMode:'dedicated'})));
  assert.equal(response.status,400);noWrites(queries);
});

test('crew creation verifies provided specialty belongs to tenant and is active',async()=>{
  for(const [description,specialty] of [
    ['foreign tenant',{id:specialtyId,organizationId:foreignOrganizationId,active:true}],
    ['inactive',{id:specialtyId,organizationId,active:false}],
  ]){
    const {POST,queries}=loadRoute({specialty});
    const response=await POST(post(payload({specialtyId})));
    assert.equal(response.status,400,description);noWrites(queries);
    assert.ok(queryOf(queries,'FROM specialties'));
  }
});

test('working leader is included once even when repeated in memberIds',async()=>{
  const {POST,queries,insertedMembers}=loadRoute({workers:[worker(memberA),worker(leader)]});
  const response=await POST(post(payload({memberIds:[memberA,leader,memberA,leader],leaderWorkerId:leader,leaderMode:'working_leader'})));
  assert.equal(response.status,201);
  assert.deepEqual(insertedMembers,[memberA,leader]);
  const validation=queryOf(queries,'FROM worker_profiles w');
  const requestedIds=validation.values.find(value=>Array.isArray(value)&&value.includes(leader));
  assert.deepEqual(requestedIds,[memberA,leader]);
});

test('dedicated leader stays out of crew members and is not auto-added',async()=>{
  const {POST,insertedMembers}=loadRoute({workers:[worker(memberA),worker(leader)]});
  const response=await POST(post(payload({memberIds:[memberA],leaderWorkerId:leader,leaderMode:'dedicated'})));
  assert.equal(response.status,201);assert.deepEqual(insertedMembers,[memberA]);
});

test('dedicated leader explicitly submitted as a member is rejected before database writes',async()=>{
  const {POST,queries}=loadRoute();
  const response=await POST(post(payload({memberIds:[leader],leaderWorkerId:leader,leaderMode:'dedicated'})));
  assert.equal(response.status,400);assert.equal((await response.json()).error,'Выделенный бригадир не может одновременно входить в состав бригады');
  noWrites(queries);assert.equal(queries.length,0);
});

test('crew creation rejects an object outside the actor object scope without writes',async()=>{
  const actor=actorFor({scopeIds:[otherObjectId]});actor.access.allOrg=true;
  actor.access.scopes['finance.pnl.read']=[{type:'all_org',ids:[]}];
  const {POST,queries}=loadRoute({actor});
  const response=await POST(post(payload({memberIds:[memberA]})));
  assert.equal(response.status,403);noWrites(queries);assert.equal(queryOf(queries,'FROM worker_profiles w'),undefined);
});

test('crew creation rejects missing operations.crew.manage capability before query or writes',async()=>{
  const {POST,queries}=loadRoute({actor:actorFor({capability:false})});
  const response=await POST(post(payload({memberIds:[memberA]})));
  assert.equal(response.status,403);assert.equal(queries.length,0);noWrites(queries);
});

test('crew creation requires authentication before query or writes',async()=>{
  const {POST,queries}=loadRoute({actor:null});
  const response=await POST(post(payload({})));
  assert.equal(response.status,401);assert.deepEqual(await response.json(),{error:'Требуется вход в систему'});
  assert.equal(queries.length,0);noWrites(queries);
});

test('explicit object scope permits creation while unrelated all_org remains separate',async()=>{
  const actor=actorFor();actor.access.allOrg=true;actor.access.scopes['finance.pnl.read']=[{type:'all_org',ids:[]}];
  const {POST,queries,insertedMembers}=loadRoute({actor,workers:[worker(memberA)]});
  const response=await POST(post(payload({memberIds:[memberA]})));
  assert.equal(response.status,201);assert.deepEqual(insertedMembers,[memberA]);
  assert.match(queryOf(queries,'FROM objects o').text,/o\.organization_id=\?::uuid/);
});

test('database errors return a safe generic response',async()=>{
  const {POST,queries}=loadRoute({dbError:'secret database error detail'});
  const report=console.error;console.error=()=>{};
  try{
    const response=await POST(post(payload({})));
    assert.equal(response.status,500);assert.deepEqual(await response.json(),{error:'Не удалось создать бригаду'});noWrites(queries);
  }finally{console.error=report;}
});
