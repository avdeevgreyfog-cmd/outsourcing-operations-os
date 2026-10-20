import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as access from '../lib/core/access.mjs';
const require=createRequire(import.meta.url);
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),user=id(2),worker=id(3),object=id(4),specialty=id(5);
class AccessDeniedError extends Error{}
function compile(file,deps){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>deps[n]??require(n));return exports;}
function harness({capabilities=['worker.edit','operations.object.create'],duplicate=false,assigned=false}={}){
 const queries=[],actor={organizationId:org,userId:user,demo:false,teamIds:[],access:{capabilities,denies:[],scopes:Object.fromEntries(capabilities.map(c=>[c,[{type:'all_org',ids:[]}]]))}};
 const sql=async(strings,...values)=>{const text=strings.reduce((q,part,index)=>q+part+(index<values.length?`$${index+1}`:''),'');queries.push({text,values});
  if(text.includes('FROM objects'))return [{id:object,objectId:object,organizationId:org,ownerUserId:user,regionId:null,assigneeUserIds:[user]}];
  if(text.includes('FROM worker_profiles'))return duplicate?[{id:worker,fullName:'Иван Иванов'}]:[];
  if(text.includes('FROM specialties'))return [{id:specialty}];
  if(text.includes('FROM client_companies')||text.includes('FROM legal_entities')||text.includes('FROM regions'))return [{id:id(6)}];
  if(text.includes('INSERT INTO worker_profiles'))return [{id:worker}];
  if(text.includes('INSERT INTO objects'))return [{id:object,name:'Симферопольское / Боброво',code:'OBJ-TEST'}];
  if(text.includes('INSERT INTO')||text.includes('UPDATE')||text.includes('set_config')||text.includes('pg_advisory_xact_lock'))return [];
  throw Error(`Unexpected SQL: ${text}`);
 };
 sql.json=x=>x;sql.begin=fn=>fn(sql);
 const portalConfig=compile('lib/operations/employee-portal-config.ts',{});
 const deps={'@/lib/operations/employee-portal-config':portalConfig,'@/lib/operations/object-conditions':{resolveObjectConditionInTransaction:async()=>null,conditionScheduleParts:()=>({workDays:null,restDays:null})},'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},'@/lib/auth/server':{getCurrentActor:async()=>actor},'@/lib/access/server':{AccessDeniedError,requireCapability(a,c){if(!access.hasCapability(a.access,c))throw new AccessDeniedError(c)}},'@/lib/core/access.mjs':access,'@/lib/db/client':{db:()=>sql,withTenant:async(o,u,fn)=>{assert.equal(o,org);assert.equal(u,user);return fn(sql)}},'@/lib/operations/object-manager-options':{ObjectSettingsConflict:class extends Error{},assertEligibleObjectManagers:async()=>{},assertEligibleObjectRecruiters:async()=>{}},'@/lib/operations/launch-checklist':{defaultPrimarySiteVisitChecklist:()=>[]},'@/lib/data/service':{listObjects:async()=>[{id:object,objectId:object,organizationId:org}],listWorkers:async()=>[{id:worker,objectId:assigned?object:null,status:assigned?'active':'requires_assignment'}]}};
 return {queries,actor,deps,async post(file,body){const route=compile(file,deps);const response=await route.POST(new Request('http://local/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));return {response,body:await response.json()}}};
}
const writes=h=>h.queries.filter(q=>/^\s*(INSERT|UPDATE|DELETE)\b/.test(q.text));
test('quick start creates a worker from only a full name without invented employment or dates',async()=>{
 const h=harness(),{response,body}=await h.post('app/api/workers/route.ts',{fullName:'Иван Иванов'});
 assert.equal(response.status,201,JSON.stringify(body));assert.equal(body.workerId,worker);
 const inserted=writes(h).find(q=>q.text.includes('INSERT INTO worker_profiles'));assert.ok(inserted);
 assert.ok(inserted.values.includes('Иван Иванов'));
 assert.ok(!writes(h).some(q=>/INSERT INTO (employment_relations|worker_object_assignments|worker_rates|time_entries|worker_timesheet_links)/.test(q.text)));
 assert.ok(!h.queries.some(q=>q.values.some(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v))));
 assert.ok(inserted.text.includes('requires_assignment')||inserted.values.includes('requires_assignment'));
});
test('quick start rejects empty full name before writing',async()=>{const h=harness(),{response}=await h.post('app/api/workers/route.ts',{fullName:'   '});assert.equal(response.status,400);assert.equal(writes(h).length,0)});
test('quick start does not allow worker creation without capability',async()=>{const h=harness({capabilities:[]}),{response}=await h.post('app/api/workers/route.ts',{fullName:'Иван Иванов'});assert.equal(response.status,403);assert.equal(h.queries.length,0)});
test('quick start refuses a duplicate phone without mutating existing worker',async()=>{const h=harness({duplicate:true}),{response}=await h.post('app/api/workers/route.ts',{fullName:'Иван Иванов',phone:'+79990000001'});assert.equal(response.status,409);assert.equal(writes(h).length,0)});
test('assigned per-shift rate still requires paid hours',async()=>{const h=harness(),{response}=await h.post('app/api/workers/route.ts',{fullName:'Иван Иванов',objectId:object,specialtyId:specialty,startDate:'2026-10-01',rate:4500,rateUnit:'shift'});assert.equal(response.status,400);assert.equal(writes(h).length,0)});
test('a worker without assignment cannot receive a personal link',async()=>{const h=harness(),service=compile('lib/operations/worker-timesheet-portal.ts',h.deps);h.actor.access.capabilities.push('operations.shift.edit');h.actor.access.scopes['operations.shift.edit']=[{type:'all_org',ids:[]}];await assert.rejects(service.editWorkerLink(h.actor,object,worker,'create'),/не назначен/);assert.equal(writes(h).length,0)});
test('quick start active object accepts unknown client/legal entity/region/date without commercial chain',async()=>{const h=harness(),{response,body}=await h.post('app/api/objects/route.ts',{name:'Симферопольское / Боброво',status:'active',ownerUserId:user});assert.equal(response.status,201,JSON.stringify(body));const insert=writes(h).find(q=>q.text.includes('INSERT INTO objects'));assert.ok(insert);assert.ok(!h.queries.some(q=>q.values.some(v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v))));assert.ok(!writes(h).some(q=>/INSERT INTO (requests|proposals|contracts|launches)/.test(q.text)))});
