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
const organization='00000000-0000-4000-8000-000000000001';
const foreignOrganization='00000000-0000-4000-8000-000000000002';
const user='10000000-0000-4000-8000-000000000001';
const otherUser='10000000-0000-4000-8000-000000000002';
const candidate='85000000-0000-4000-8000-000000000001';
const olderObject='86000000-0000-4000-8000-000000000001';
const latestObject='86000000-0000-4000-8000-000000000002';
const outsideObject='86000000-0000-4000-8000-000000000003';
const olderRegion='89000000-0000-4000-8000-000000000001';
const latestRegion='89000000-0000-4000-8000-000000000002';
class AccessDeniedError extends Error {
  constructor(capability){super(`Forbidden: missing ${capability}`);this.capability=capability;}
}

const applicationRows=[
  {id:'88000000-0000-4000-8000-000000000001',organizationId:organization,ownerUserId:otherUser,managerUserId:otherUser,
    objectId:olderObject,regionId:olderRegion,clientId:null,assigneeUserIds:[user]},
  {id:'88000000-0000-4000-8000-000000000002',organizationId:organization,ownerUserId:otherUser,managerUserId:otherUser,
    objectId:latestObject,regionId:latestRegion,clientId:null,assigneeUserIds:[]},
];

function makeActor({capability=true,readCapability=false,scope='objects',ids=[olderObject],directOwner=otherUser,unrelatedAllOrg=false}={}){
  const capabilities=[...(capability?['recruiting.candidate.edit']:[]),...(readCapability?['recruiting.candidate.read']:[])];
  const scopes={};
  if(capability)scopes['recruiting.candidate.edit']=[{type:scope,ids}];
  if(readCapability)scopes['recruiting.candidate.read']=[{type:'all_org',ids:[]}];
  if(unrelatedAllOrg){capabilities.push('finance.read');scopes['finance.read']=[{type:'all_org',ids:[]}];}
  return {organizationId:organization,userId:user,demo:false,access:{capabilities,denies:[],allOrg:unrelatedAllOrg||scope==='all_org',scopes},
    directOwner,displayName:'Тест',email:'test@example.com',membershipId:'membership-1',roleCode:'recruiter',roleName:'Рекрутер',teamIds:[],orgUnitIds:[],regionIds:[]};
}

function makeHarness({actor=makeActor(),candidateOrg=organization,candidateExists=true,candidateCreator=otherUser,apps=applicationRows,unauthenticated=false,failActivity=false}={}){
  const queries=[];
  const tx=async(strings,...values)=>{
    const sql=strings.reduce((out,part,index)=>out+part+(index<values.length?`$${index+1}`:''),'');
    queries.push({sql,values});
    if(sql.includes('FROM candidates c')&&sql.includes('SELECT c.id,c.organization_id')){
      if(!candidateExists||!sql.includes('organization_id=$2::uuid'))return [];
      return [{id:candidate,organizationId:candidateOrg,ownerUserId:actor.directOwner,createdByUserId:candidateCreator,assigneeUserIds:[actor.directOwner,otherUser]}];
    }
    if(sql.includes('FROM candidate_applications ca')&&sql.includes('SELECT ca.id,ca.organization_id'))return apps;
    if(failActivity&&sql.includes('INSERT INTO activity_events'))throw new Error('database-secret-detail');
    return [];
  };
  tx.begin=fn=>fn(tx);
  const dependencies={
    'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
    '@/lib/auth/server':{getCurrentActor:async()=>unauthenticated?null:actor},
    '@/lib/access/server':{AccessDeniedError,requireCapability(currentActor,capability){if(!hasCapability(currentActor.access,capability))throw new AccessDeniedError(capability);}},
    '@/lib/core/access.mjs':{canReadRow},
    '@/lib/db/client':{withTenant:async(_organizationId,_userId,callback)=>callback(tx)},
  };
  const source=fs.readFileSync(path.join(root,'app/api/candidates/[id]/route.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const route={};new Function('exports','require',compiled)(route,name=>dependencies[name]??require(name));
  return {route,queries};
}

function patchRequest(contacts){
  const body={fullName:'Алексей Иванов',phone:'+70000000001',contacts};
  return new Request('http://local/api/candidates/'+candidate,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
}

function noWrites(queries){assert.equal(queries.some(query=>/\b(INSERT|UPDATE|DELETE)\b/.test(query.sql)),false);}
function writeQueries(queries){return queries.filter(query=>/\b(INSERT|UPDATE|DELETE)\b/.test(query.sql));}

for(const [scope,ids] of [['objects',[olderObject]],['region',[olderRegion]]]){
  test(`older ${scope}-scoped application permits edit when the latest application is outside scope`,async()=>{
    const actor=makeActor({scope,ids});
    const {route,queries}=makeHarness({actor});
    const response=await route.PATCH(patchRequest([{channel:'email',value:'alex@example.com',label:'Рабочая',isPreferred:true}] ),{params:Promise.resolve({id:candidate})});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{id:candidate});
    assert.equal(queries.filter(query=>query.sql.includes('FROM candidate_applications ca')).length,1);
    const appQuery=queries.find(query=>query.sql.includes('FROM candidate_applications ca'));
    assert.match(appQuery.sql,/ARRAY\[ca\.owner_user_id::text,ca\.manager_user_id::text,c\.current_recruiter_user_id::text,c\.original_recruiter_user_id::text\]/);
    assert.match(appQuery.sql,/FROM need_assignments na/);
    assert.match(appQuery.sql,/FROM object_assignments oa/);
    assert.match(appQuery.sql,/WHERE ca\.candidate_id=\$1::uuid AND ca\.organization_id=\$2::uuid/);
    assert.deepEqual(appQuery.values,[candidate,organization]);
    assert.doesNotMatch(appQuery.sql,/LIMIT\s+1/i,'the authorization check must inspect every application row');
    assert.ok(appQuery.sql.includes('ORDER BY ca.updated_at DESC'));
    assert.ok(writeQueries(queries).some(query=>query.sql.includes('UPDATE candidates')&&query.sql.includes('organization_id=$')));
    assert.ok(writeQueries(queries).some(query=>query.sql.includes('INSERT INTO candidate_contact_methods')));
    assert.ok(writeQueries(queries).some(query=>query.sql.includes('INSERT INTO activity_events')));
  });
}

test('older assigned application permits edit when the latest application is outside scope',async()=>{
  const actor=makeActor({scope:'assigned_to_me',ids:[]});
  const {route}=makeHarness({actor});
  const response=await route.PATCH(patchRequest(),{params:Promise.resolve({id:candidate})});
  assert.equal(response.status,200);
});

test('direct candidate assignment permits standalone edit with no applications',async()=>{
  const actor=makeActor({scope:'assigned_to_me',ids:[],directOwner:user});
  const {route,queries}=makeHarness({actor,apps:[]});
  const response=await route.PATCH(patchRequest(),{params:Promise.resolve({id:candidate})});
  assert.equal(response.status,200);
  assert.ok(writeQueries(queries).some(query=>query.sql.includes('UPDATE candidates')));
  assert.match(queries.find(query=>query.sql.includes('SELECT c.id,c.organization_id')).sql,/c\.id=\$1::uuid AND c\.organization_id=\$2::uuid/);
});

test('own_created candidate scope permits direct standalone edit with no applications',async()=>{
  const actor=makeActor({scope:'own_created',ids:[]});
  const {route,queries}=makeHarness({actor,apps:[],candidateCreator:user});
  const response=await route.PATCH(patchRequest(),{params:Promise.resolve({id:candidate})});
  assert.equal(response.status,200);
  assert.ok(writeQueries(queries).some(query=>query.sql.includes('UPDATE candidates')));
});

test('candidate edit-specific all_org scope permits standalone edit with no applications',async()=>{
  const actor=makeActor({scope:'all_org',ids:[]});
  const {route,queries}=makeHarness({actor,apps:[]});
  const response=await route.PATCH(patchRequest(),{params:Promise.resolve({id:candidate})});
  assert.equal(response.status,200);
  assert.ok(writeQueries(queries).some(query=>query.sql.includes('UPDATE candidates')));
});

test('unrelated all_org grant does not override restricted candidate edit scope',async()=>{
  const actor=makeActor({scope:'objects',ids:[outsideObject],unrelatedAllOrg:true});
  assert.equal(actor.access.allOrg,true);
  const {route,queries}=makeHarness({actor});
  const response=await route.PATCH(patchRequest(),{params:Promise.resolve({id:candidate})});
  assert.equal(response.status,403);
  noWrites(queries);
});

test('read capability without candidate edit capability is denied before SQL',async()=>{
  const actor=makeActor({capability:false,readCapability:true,scope:'all_org',ids:[]});
  const {route,queries}=makeHarness({actor});
  const response=await route.PATCH(patchRequest(),{params:Promise.resolve({id:candidate})});
  assert.equal(response.status,403);
  assert.match((await response.json()).error,/прав/i);
  assert.deepEqual(queries,[]);
});

test('read all_org access cannot authorize edit outside the candidate edit object scope',async()=>{
  const actor=makeActor({scope:'objects',ids:[outsideObject],readCapability:true});
  actor.access.scopes['recruiting.candidate.read']=[{type:'all_org',ids:[]}];
  actor.access.allOrg=true;
  const {route,queries}=makeHarness({actor});
  const response=await route.PATCH(patchRequest(),{params:Promise.resolve({id:candidate})});
  assert.equal(response.status,403);
  noWrites(queries);
});

for(const [name,options] of [
  ['missing candidate',{candidateExists:false}],
  ['foreign tenant candidate',{candidateOrg:foreignOrganization}],
]){
  test(`${name} is denied without writes`,async()=>{
    const {route,queries}=makeHarness({actor:makeActor({scope:'all_org',ids:[]}),...options});
    const response=await route.PATCH(patchRequest(),{params:Promise.resolve({id:candidate})});
    assert.equal(response.status,403);
    noWrites(queries);
    const candidateQuery=queries.find(query=>query.sql.includes('SELECT c.id,c.organization_id'));
    assert.match(candidateQuery.sql,/c\.id=\$1::uuid AND c\.organization_id=\$2::uuid/);
    assert.deepEqual(candidateQuery.values,[candidate,organization]);
  });
}

test('unauthenticated PATCH returns a localized 401',async()=>{
  const {route,queries}=makeHarness({unauthenticated:true});
  const response=await route.PATCH(patchRequest(),{params:Promise.resolve({id:candidate})});
  assert.equal(response.status,401);
  assert.deepEqual(await response.json(),{error:'Требуется вход в систему'});
  assert.deepEqual(queries,[]);
});

test('database failure returns a generic localized 500 without exposing SQL details',async()=>{
  const actor=makeActor({scope:'all_org',ids:[]});
  const {route}=makeHarness({actor,failActivity:true});
  const previous=console.error;
  console.error=()=>{};
  try{
    const response=await route.PATCH(patchRequest(),{params:Promise.resolve({id:candidate})});
    assert.equal(response.status,500);
    const body=await response.json();
    assert.equal(body.error,'Не удалось сохранить карточку кандидата');
    assert.equal(JSON.stringify(body).includes('database-secret-detail'),false);
  }finally{console.error=previous;}
});
