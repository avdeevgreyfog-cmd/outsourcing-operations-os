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
const application='88000000-0000-4000-8000-000000000001';
const candidateId='85000000-0000-4000-8000-000000000001';
const need='87000000-0000-4000-8000-000000000001';
const object='86000000-0000-4000-8000-000000000001';
const specialty='89000000-0000-4000-8000-000000000001';
const worker='8a000000-0000-4000-8000-000000000001';
const relation='8b000000-0000-4000-8000-000000000001';
const actualStartAt='2026-10-01T21:30:00.000Z'; // 2026-10-01 UTC, 2026-10-02 in Moscow.

class AccessDeniedError extends Error {constructor(capability){super(`Forbidden: missing ${capability}`);this.capability=capability;}}
function actorFor({editScope='all_org',editIds=[],convertScope='all_org',convertIds=[],objectScope='objects',objectIds=[object],capabilities=['recruiting.candidate.edit','recruiting.candidate.convert']}={}){
  const scopes={};
  if(capabilities.includes('recruiting.candidate.edit'))scopes['recruiting.candidate.edit']=[{type:editScope,ids:editIds}];
  if(capabilities.includes('recruiting.candidate.convert'))scopes['recruiting.candidate.convert']=[{type:convertScope,ids:convertIds}];
  if(capabilities.includes('operations.object.edit'))scopes['operations.object.edit']=[{type:objectScope,ids:objectIds}];
  return {organizationId:organization,userId:user,demo:false,access:{capabilities,denies:[],allOrg:editScope==='all_org',scopes},teamIds:[],orgUnitIds:[],regionIds:[],roleCode:'recruiter'};
}

function makeHarness({
  actor=actorFor(),
  current={},
  currentOrganization=organization,
  relations=[],
  existingWorker=null,
  existingAssignment=null,
  unauthenticated=false,
  candidateMissing=false,
  failActivity=false,
}={}){
  const queries=[];
  const currentRow={
    id:application,candidateId,needId:need,organizationId:currentOrganization,ownerUserId:user,managerUserId:null,objectId:object,
    clientId:null,regionId:'region-1',assigneeUserIds:[user],stage:'preparation',workflow:{travelState:'not_required'},
    plannedStartDate:'2026-10-02',plannedShiftKind:'day',plannedArrivalAt:null,actualStartAt:null,updatedAt:'2026-10-01T10:00:00.000Z',
    specialtyId:specialty,objectOwnerId:null,defaultTransitionDays:0,defaultDailyPaymentShifts:1,defaultScheduleWorkDays:null,
    defaultScheduleRestDays:null,defaultShiftKind:'day',ppeTaskEnabled:false,ppeTaskDueDays:null,sourceRequestRoleId:null,
    needSourceKind:'standard',replacementExitId:null,workMode:'local',paidHoursPerShift:8,fullName:'Алексей Иванов',...current,
  };
  const tx=async(strings,...values)=>{
    const sql=strings.reduce((out,part,index)=>out+part+(index<values.length?`$${index+1}`:''),'');
    queries.push({sql,values});
    if(failActivity&&sql.includes('INSERT INTO activity_events'))throw new Error('database-secret-detail');
    if(sql.includes('FROM candidate_applications ca')&&sql.includes('SELECT ca.id,ca.candidate_id'))return [currentRow];
    if(sql.includes('FROM candidates WHERE id=')&&sql.includes('FOR UPDATE'))return candidateMissing?[]:[{fullName:'Алексей Иванов',phone:'+70000000001',email:null,city:null,birthDate:null,notes:null,source:null,originalRecruiterUserId:null}];
    if(sql.includes('FROM need_document_requirements ndr')&&sql.includes('count(*)::int required'))return [{required:0,ready:0}];
    if(sql.includes('FROM worker_profiles WHERE origin_candidate_id'))return existingWorker?[existingWorker]:[];
    if(sql.includes('INSERT INTO worker_profiles'))return [{id:worker}];
    if(sql.includes('FROM employment_relations'))return relations.filter(row=>row.eligibleForDate!==false);
    if(sql.includes('INSERT INTO employment_relations'))return [{id:relation}];
    if(sql.includes('FROM worker_object_assignments'))return existingAssignment?[existingAssignment]:[];
    if(sql.includes('FROM worker_rates'))return [];
    if(sql.includes('FROM need_document_requirements ndr')&&sql.includes('SELECT dt.name'))return [];
    return [];
  };
  tx.begin=callback=>callback(tx);
  tx.json=value=>value;
  const workflowPath=path.join(root,'lib/recruiting/workflow.ts');
  const modelPath=path.join(root,'lib/recruiting/model.ts');
  const helperPath=path.join(root,'lib/recruiting/employment-episode.ts');
  function compileModule(file,deps={}){
    const source=fs.readFileSync(file,'utf8');
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    const exports={};new Function('exports','require',compiled)(exports,name=>deps[name]??require(name));return exports;
  }
  const realWorkflow=compileModule(workflowPath,{'./model':compileModule(modelPath)});
  const episode=compileModule(helperPath);
  const dependencies={
    // Legacy episode tests have no object-condition fixture; SQL inheritance is checked by operating-contour-db.
    '@/lib/operations/object-conditions':{resolveObjectConditionInTransaction:async()=>null,conditionScheduleParts:()=>({workDays:null,restDays:null})},
    'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
    '@/lib/auth/server':{getCurrentActor:async()=>unauthenticated?null:actor},
    '@/lib/access/server':{AccessDeniedError,requireCapability(currentActor,capability){if(!hasCapability(currentActor.access,capability))throw new AccessDeniedError(capability);}},
    '@/lib/core/access.mjs':{canReadRow,hasCapability},
    '@/lib/db/client':{withTenant:async(_organizationId,_userId,callback)=>callback(tx)},
    '@/lib/recruiting/model':compileModule(modelPath),
    '@/lib/recruiting/workflow':realWorkflow,
    '@/lib/recruiting/employment-episode':episode,
  };
  const routeFile=path.join(root,'app/api/candidates/[id]/stage/route.ts');
  const compiled=ts.transpileModule(fs.readFileSync(routeFile,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const route={};new Function('exports','require',compiled)(route,name=>dependencies[name]??require(name));
  return {route,queries,currentRow};
}

function request(body){return new Request(`http://local/api/candidates/${candidateId}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
function shiftBody(overrides={}){return {stage:'first_shift',plannedStartDate:'2026-10-02',workflow:{firstShiftOutcome:'worked',employmentRelationType:'employment'},actualStartAt, ...overrides};}
function writes(queries){return queries.filter(({sql})=>/^\s*(INSERT|UPDATE|DELETE)\b/m.test(sql));}
function assertNoWrites(queries){assert.deepEqual(writes(queries),[]);}
async function patch(route,body){return route.PATCH(request(body),{params:Promise.resolve({id:candidateId})});}

for(const type of ['employment','gph','npd','custom']){
  test(`first-shift confirmation inserts the explicitly selected ${type} episode using the Moscow calendar date`,async()=>{
    const {route,queries}=makeHarness();
    const response=await patch(route,shiftBody({workflow:{firstShiftOutcome:'worked',employmentRelationType:type}}));
    assert.equal(response.status,200);
    const insert=queries.find(query=>query.sql.includes('INSERT INTO employment_relations'));
    assert.ok(insert,`expected employment relation insert for ${type}`);
    assert.match(insert.sql,/\(\$4::timestamptz AT TIME ZONE 'Europe\/Moscow'\)::date/);
    assert.deepEqual(insert.values.slice(0,4),[organization,worker,type,actualStartAt]);
    const assignment=queries.find(query=>query.sql.includes('INSERT INTO worker_object_assignments'));
    assert.ok(assignment);
    assert.match(assignment.sql,/\(\$1[0-9]*::timestamptz AT TIME ZONE 'Europe\/Moscow'\)::date/);
  });
}

test('explicit unspecified conversion creates worker but does not invent an employment relation',async()=>{
  const {route,queries}=makeHarness();
  const response=await patch(route,shiftBody({workflow:{firstShiftOutcome:'worked',employmentRelationType:'unspecified'}}));
  assert.equal(response.status,200);
  assert.ok(queries.some(query=>query.sql.includes('INSERT INTO worker_profiles')));
  assert.equal(queries.some(query=>query.sql.includes('FROM employment_relations')||query.sql.includes('INSERT INTO employment_relations')),false);
  const activity=queries.find(query=>query.sql.includes('INSERT INTO activity_events'));
  assert.equal(activity.values.at(-1).employmentRelationType,'unspecified');
});

test('missing relation choice returns 422 before writes',async()=>{
  const {route,queries}=makeHarness();
  const response=await patch(route,shiftBody({workflow:{firstShiftOutcome:'worked'}}));
  assert.equal(response.status,422);
  assertNoWrites(queries);
});

test('new confirmation does not inherit an old workflow relation choice',async()=>{
  const {route,queries}=makeHarness({current:{workflow:{employmentRelationType:'employment'}}});
  const response=await patch(route,shiftBody({workflow:{firstShiftOutcome:'worked'}}));
  assert.equal(response.status,422);
  assertNoWrites(queries);
});

test('invalid relation enum returns 400 before SQL',async()=>{
  const {route,queries}=makeHarness();
  const response=await patch(route,shiftBody({workflow:{firstShiftOutcome:'worked',employmentRelationType:'contract'}}));
  assert.equal(response.status,400);
  assert.deepEqual(queries,[]);
});

test('rehire reuses the person and leaves a prior closed period intact while inserting a new episode',async()=>{
  const closed={id:'8b000000-0000-4000-8000-000000000002',relationType:'gph',coversStart:false,eligibleForDate:false};
  const {route,queries}=makeHarness({relations:[closed],existingWorker:{id:worker}});
  const response=await patch(route,shiftBody());
  assert.equal(response.status,200);
  const relationQuery=queries.find(query=>query.sql.includes('FROM employment_relations'));
  assert.match(relationQuery.sql,/effective_to IS NULL OR effective_to>=\(\$5::timestamptz AT TIME ZONE 'Europe\/Moscow'\)::date/);
  assert.deepEqual(relationQuery.values,[actualStartAt,actualStartAt,organization,worker,actualStartAt]);
  const inserted=queries.find(query=>query.sql.includes('INSERT INTO employment_relations'));
  assert.ok(inserted);
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO worker_profiles')),false);
  assert.ok(queries.some(query=>query.sql.includes("UPDATE worker_profiles SET status='active'")));
  assert.equal(queries.some(query=>query.sql.includes('UPDATE employment_relations')||query.sql.includes('DELETE FROM employment_relations')),false);
});

test('a matching episode covering the first shift is reused without a duplicate insert',async()=>{
  const {route,queries}=makeHarness({relations:[{id:relation,relationType:'employment',coversStart:true}]});
  const response=await patch(route,shiftBody());
  assert.equal(response.status,200);
  assert.equal(queries.filter(query=>query.sql.includes('FROM employment_relations')).length,1);
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO employment_relations')),false);
  const activity=queries.find(query=>query.sql.includes('INSERT INTO activity_events'));
  assert.equal(activity.values.at(-1).employmentRelationId,relation);
});

test('an overlapping conflicting episode returns 409 without overwriting employment history',async()=>{
  const prior={id:relation,relationType:'gph',coversStart:true};
  const {route,queries}=makeHarness({relations:[prior]});
  const response=await patch(route,shiftBody());
  assert.equal(response.status,409);
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO employment_relations')||query.sql.includes('UPDATE employment_relations')||query.sql.includes('DELETE FROM employment_relations')),false);
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO worker_profiles')),true);
  // This fake SQL harness records statements; it does not model transaction rollback.
});

test('a future episode conflicts with a first shift before its effective date',async()=>{
  const future={id:relation,relationType:'employment',coversStart:false,eligibleForDate:true};
  const {route,queries}=makeHarness({relations:[future]});
  const response=await patch(route,shiftBody());
  assert.equal(response.status,409);
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO employment_relations')),false);
  assert.equal(queries.some(query=>query.sql.includes('UPDATE employment_relations')||query.sql.includes('DELETE FROM employment_relations')),false);
  // The mock represents the future relation as selected by the overlap query; it does not model transaction rollback.
});

test('multiple potentially overlapping episodes conflict rather than choosing one',async()=>{
  const {route,queries}=makeHarness({relations:[
    {id:relation,relationType:'employment',coversStart:true},
    {id:'8b000000-0000-4000-8000-000000000002',relationType:'gph',coversStart:true},
  ]});
  const response=await patch(route,shiftBody());
  assert.equal(response.status,409);
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO employment_relations')),false);
  assert.equal(queries.some(query=>query.sql.includes('UPDATE employment_relations')||query.sql.includes('DELETE FROM employment_relations')),false);
  // The fake SQL harness cannot demonstrate rollback of earlier statements in the route transaction.
});

test('unexpected database failure returns a generic 500 without exposing database details',async()=>{
  const {route}=makeHarness({failActivity:true});
  const original=console.error;console.error=()=>{};
  try{
    const response=await patch(route,shiftBody());
    assert.equal(response.status,500);
    const body=await response.json();
    assert.equal(JSON.stringify(body).includes('database-secret-detail'),false);
  }finally{console.error=original;}
});

test('reconfirming an already confirmed first shift does not create another worker or episode',async()=>{
  const {route,queries}=makeHarness({current:{stage:'first_shift',actualStartAt,workflow:{firstShiftOutcome:'worked',employmentRelationType:'employment'}}});
  const response=await patch(route,{stage:'first_shift',workflow:{firstShiftOutcome:'worked',employmentRelationType:'employment'}});
  assert.equal(response.status,200);
  assert.equal(queries.some(query=>query.sql.includes('INSERT INTO worker_profiles')||query.sql.includes('FROM employment_relations')||query.sql.includes('INSERT INTO employment_relations')),false);
});

for(const change of [
  ['changing confirmed date',{stage:'first_shift',actualStartAt:'2026-10-03T00:00:00.000Z'}],
  ['revoking confirmed date',{stage:'first_shift',actualStartAt:null}],
]){
  test(`${change[0]} is rejected before writes`,async()=>{
    const {route,queries}=makeHarness({current:{stage:'first_shift',actualStartAt,workflow:{firstShiftOutcome:'worked',employmentRelationType:'employment'}}});
    const response=await patch(route,change[1]);
    assert.equal(response.status,422);
    assertNoWrites(queries);
  });
}

test('a legacy confirmed shift without a stored relation type can advance to retention',async()=>{
  const oldDate=new Date(Date.now()-8*86400000).toISOString();
  const {route,queries}=makeHarness({current:{stage:'first_shift',actualStartAt:oldDate,workflow:{firstShiftOutcome:'worked'}}});
  const response=await patch(route,{stage:'retention_7'});
  assert.equal(response.status,200);
  assert.equal(queries.some(query=>query.sql.includes('FROM employment_relations')||query.sql.includes('INSERT INTO employment_relations')),false);
  assert.ok(queries.some(query=>query.sql.includes('UPDATE candidate_applications')));
});

test('conversion scope is evaluated separately from a wider edit scope',async()=>{
  const actor=actorFor({editScope:'all_org',convertScope:'objects',convertIds:['86000000-0000-4000-8000-000000000099']});
  const {route,queries}=makeHarness({actor});
  const response=await patch(route,shiftBody());
  assert.equal(response.status,403);
  assertNoWrites(queries);
});

test('object feedback scope can confirm a first shift without recruiting conversion permission',async()=>{
  const actor=actorFor({capabilities:['operations.object.edit'],objectScope:'objects',objectIds:[object]});
  const {route,queries}=makeHarness({actor});
  const response=await patch(route,shiftBody({sourceContext:'object_feedback'}));
  assert.equal(response.status,200);
  assert.ok(queries.some(query=>query.sql.includes('INSERT INTO worker_profiles')));
});

test('object feedback outside its object scope is denied before writes',async()=>{
  const actor=actorFor({capabilities:['operations.object.edit'],objectScope:'objects',objectIds:['86000000-0000-4000-8000-000000000099']});
  const {route,queries}=makeHarness({actor});
  const response=await patch(route,shiftBody({sourceContext:'object_feedback'}));
  assert.equal(response.status,403);
  assertNoWrites(queries);
});

test('tenant mismatch is denied after scoped read and before writes',async()=>{
  const {route,queries}=makeHarness({currentOrganization:foreignOrganization});
  const response=await patch(route,shiftBody());
  assert.equal(response.status,403);
  assert.equal(queries.length,1);
  assertNoWrites(queries);
});

test('stale expected stage or timestamp returns 409 before writes',async()=>{
  const {route,queries}=makeHarness();
  const response=await patch(route,shiftBody({expectedStage:'documents'}));
  assert.equal(response.status,409);
  assertNoWrites(queries);
});
