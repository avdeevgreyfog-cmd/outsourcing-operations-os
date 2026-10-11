import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {canReadRow,hasCapability} from '../lib/core/access.mjs';

const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),user=id(2),workerId=id(3),objectId=id(4),specialtyId=id(5),otherUser=id(6),otherObject=id(7);
const startDate='2026-10-11';
function compile(file,deps={}){
  const code=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('exports','require',code)(exports,name=>deps[name]??require(name));return exports;
}
const episode=compile('lib/recruiting/employment-episode.ts');
const period=(n,from,to,type='gph')=>({id:id(n),organizationId:org,workerId,relationType:type,effectiveFrom:from,effectiveTo:to,metadata:{source:'original'},contractReference:`REF-${n}`});
function actorFor(scopes=[{type:'all_org',ids:[]}]){
  return {organizationId:org,userId:user,demo:false,teamIds:[],orgUnitIds:[],regionIds:[],access:{capabilities:['worker.edit'],denies:[],scopes:{'worker.edit':scopes}}};
}
function harness({periods=[],existing=true,scopeActor=actorFor(),workerContext={},validSpecialty=true,failActivity=false,throwSecret=false}={}){
  const actor=scopeActor,queries=[],returnedEpisodes=[];
  const state={profiles:existing?[{id:workerId,organizationId:org,fullName:'До импорта',phone:'+79990000001',createdByUserId:otherUser,objectId,ownerUserId:otherUser,...workerContext}]:[],relations:structuredClone(periods),assignments:[],rates:[],events:[]};
  let workerCounter=100,relationCounter=200;
  const sql=async(strings,...values)=>{
    const text=strings.reduce((out,part,index)=>out+part+(index<values.length?`$${index+1}`:''),'');queries.push({text,values});
    if(throwSecret)throw Error('private database credential secret');
    if(text.includes('FROM objects o'))return [{id:objectId,ownerUserId:user,regionId:null,assigneeUserIds:[user]}];
    if(text.includes('FROM specialties'))return validSpecialty?[{id:specialtyId}]:[];
    if(text.includes('FROM worker_profiles WHERE organization_id')){
      const digits=value=>String(value??'').replace(/\D/g,'');
      return state.profiles.filter(row=>row.organizationId===values[0]&&digits(row.phone)===digits(values[1])).map(({id})=>({id}));
    }
    if(text.includes('FROM worker_profiles w'))return state.profiles.filter(row=>row.id===values[0]&&row.organizationId===values[1]).map(row=>({...row,clientId:null,regionId:null,assigneeUserIds:[]}));
    if(text.includes('FROM employment_relations')){
      const date=new Date(values[0]).toLocaleDateString('sv-SE',{timeZone:'Europe/Moscow'});
      return state.relations.filter(row=>row.organizationId===values[2]&&row.workerId===values[3]&&(row.effectiveTo===null||row.effectiveTo>=date)).map(row=>({id:row.id,relationType:row.relationType,coversStart:row.effectiveFrom<=date&&(row.effectiveTo===null||row.effectiveTo>=date)}));
    }
    if(text.includes('FROM worker_object_assignments'))return state.assignments.filter(row=>row.workerId===values[0]&&row.organizationId===values[1]&&(!text.includes('object_id=$3')||row.objectId===values[2])).map(row=>({...row}));
    if(text.includes('FROM worker_rates'))return state.rates.filter(row=>row.workerId===values[0]&&row.organizationId===values[1]&&row.objectId===values[2]&&row.specialtyId===values[3]);
    if(text.includes('INSERT INTO worker_profiles')){
      const row={id:id(workerCounter++),organizationId:values[0],fullName:values[1],phone:values[2],email:values[3],city:values[4],birthDate:values[5],createdByUserId:values[6]};state.profiles.push(row);return [{id:row.id}];
    }
    if(text.includes('UPDATE worker_profiles')){
      const row=state.profiles.find(row=>row.id===values[4]&&row.organizationId===values[5]);assert.ok(row);row.fullName=values[0];return [];
    }
    if(text.includes('INSERT INTO employment_relations')){
      const row={id:id(relationCounter++),organizationId:values[0],workerId:values[1],relationType:values[2],effectiveFrom:new Date(values[3]).toLocaleDateString('sv-SE',{timeZone:'Europe/Moscow'}),effectiveTo:null,metadata:values[4],createdByUserId:values[5]};state.relations.push(row);return [{id:row.id}];
    }
    if(text.includes('INSERT INTO worker_object_assignments')){state.assignments.push({id:id(300+state.assignments.length),organizationId:values[0],workerId:values[1],objectId:values[2],specialtyId:values[3],effectiveFrom:values[4]});return [];}
    if(text.includes('UPDATE worker_object_assignments'))return [];
    if(text.includes('INSERT INTO worker_rates')){state.rates.push({id:id(400+state.rates.length),organizationId:values[0],workerId:values[1],specialtyId:values[2],objectId:values[3],amount:values[4]});return [];}
    if(text.includes('INSERT INTO activity_events')){if(failActivity)throw Error('private database credential secret');state.events.push(values.at(-1));return [];}
    throw Error(`Unhandled SQL in import harness: ${text}`);
  };
  sql.json=value=>value;
  class AccessDeniedError extends Error{}
  const dependencies={
    'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
    '@/lib/auth/server':{getCurrentActor:async()=>actor},
    '@/lib/access/server':{AccessDeniedError,requireCapability(a,c){if(!hasCapability(a.access,c))throw new AccessDeniedError(c);}},
    '@/lib/core/access.mjs':{canReadRow,hasCapability},
    '@/lib/db/client':{async withTenant(tenant,who,fn){assert.equal(tenant,org);assert.equal(who,user);const snapshot=structuredClone(state);try{return await fn(sql);}catch(error){Object.assign(state,snapshot);throw error;}}},
    '@/lib/recruiting/employment-episode':{...episode,async ensureEmploymentEpisode(...args){const result=await episode.ensureEmploymentEpisode(...args);returnedEpisodes.push(result);return result;}},
  };
  const route=compile('app/api/workers/import/route.ts',dependencies);
  return {state,queries,returnedEpisodes,async post(overrides={}){
    const body={objectId,specialtyId,startDate,relationType:'gph',rows:[{fullName:'После импорта',phone:'+7 (999) 000-00-01',rate:450}],...overrides};
    const response=await route.POST(new Request('http://local/api/workers/import',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
    return {response,body:await response.json()};
  }};
}
const domainWrites=h=>h.queries.filter(q=>/^\s*(INSERT|UPDATE|DELETE)\b/.test(q.text)&&!q.text.includes('activity_events'));
function assertTenantBound(h){for(const q of h.queries){assert.ok(q.values.includes(org),`tenant bound: ${q.text}`);assert.match(q.text,/organization_id/);}}
function assertLockedBefore(h){
  const lock=h.queries.findIndex(q=>q.text.includes('FROM worker_profiles WHERE organization_id'));
  assert.ok(lock>=0);assert.match(h.queries[lock].text,/FOR UPDATE/);
  for(let i=0;i<h.queries.length;i++)if(h.queries[i].text.includes('FROM worker_profiles w')||h.queries[i].text.includes('FROM employment_relations')||/^\s*(UPDATE|INSERT)\b/.test(h.queries[i].text)&&!h.queries[i].text.includes('activity_events'))assert.ok(i>lock,'existing worker lock precedes contextual/period reads and mutations');
}

test('worker import reuses covering same-type finite episode ID without modifying historical relation',async()=>{
  const original=[period(10,'2026-10-01','2026-10-11')],h=harness({periods:original});
  const {response,body}=await h.post();assert.equal(response.status,201);assert.deepEqual({created:body.created,reused:body.reused,assigned:body.assigned,issues:body.issues},{created:0,reused:1,assigned:1,issues:[]});
  assert.deepEqual(h.returnedEpisodes,[original[0].id]);assert.deepEqual(h.state.relations,original);assert.equal(h.state.profiles.length,1);
  assert.equal(h.queries.some(q=>/UPDATE employment_relations|DELETE FROM employment_relations|INSERT INTO employment_relations/.test(q.text)),false);
  assert.equal(h.state.assignments[0].workerId,workerId);assert.equal(h.state.rates[0].workerId,workerId);assertTenantBound(h);assertLockedBefore(h);
});

for(const [name,periods] of [
  ['finite different-type covering',[period(10,'2026-10-01','2026-10-31','npd')]],
  ['finite future',[period(10,'2026-10-12','2026-10-31')]],
  ['open future',[period(10,'2026-10-12',null)]],
  ['multiple covering and future',[period(10,'2026-10-01','2026-10-31'),period(11,'2026-11-01',null)]],
])test(`worker import skips ${name} conflict before profile, assignment and rate writes`,async()=>{
  const h=harness({periods}),before=structuredClone(h.state),{response,body}=await h.post();assert.equal(response.status,201);assert.equal(body.created,0);assert.equal(body.reused,0);assert.equal(body.assigned,0);assert.equal(body.issues.length,1);assert.equal(body.issues[0].row,2);assert.equal(body.issues[0].workerId,workerId);assert.match(body.issues[0].message,/период/);
  assert.deepEqual(domainWrites(h),[]);assert.deepEqual(h.state.profiles,before.profiles);assert.deepEqual(h.state.relations,periods);assert.deepEqual(h.state.assignments,[]);assert.deepEqual(h.state.rates,[]);assertTenantBound(h);assertLockedBefore(h);
});

test('worker import appends after closed finite history with worker_import metadata and preserves prior ID',async()=>{
  const original=[period(10,'2026-10-01','2026-10-10')],h=harness({periods:original}),{response,body}=await h.post();assert.equal(response.status,201);assert.equal(body.reused,1);assert.deepEqual(h.state.relations[0],original[0]);assert.equal(h.state.relations.length,2);
  const added=h.state.relations[1];assert.notEqual(added.id,original[0].id);assert.equal(added.workerId,workerId);assert.equal(added.effectiveFrom,startDate);assert.equal(added.effectiveTo,null);assert.deepEqual(added.metadata,{source:'worker_import'});assert.equal(added.createdByUserId,user);assert.deepEqual(h.returnedEpisodes,[added.id]);assertTenantBound(h);assertLockedBefore(h);
});

test('worker import creates unique workers and all downstream rows bind their returned IDs; duplicate phone reuses',async()=>{
  const h=harness({existing:false}),{response,body}=await h.post({rows:[{fullName:'Новый один',phone:'+79990000011',rate:300},{fullName:'Новый два',phone:'+79990000012',rate:400},{fullName:'Повтор один',phone:'+7 (999) 000-00-11',rate:300}]});
  assert.equal(response.status,201);assert.equal(body.created,2);assert.equal(body.reused,1);assert.equal(body.assigned,2);assert.deepEqual(body.issues,[]);assert.equal(h.state.profiles.length,2);
  const ids=h.state.profiles.map(row=>row.id);assert.equal(new Set(ids).size,2);assert.deepEqual(h.state.relations.map(row=>row.workerId),ids);assert.deepEqual(h.state.assignments.map(row=>row.workerId),ids);assert.deepEqual(h.state.rates.map(row=>row.workerId),ids);assert.deepEqual(h.returnedEpisodes,[h.state.relations[0].id,h.state.relations[1].id,h.state.relations[0].id]);assertTenantBound(h);
});

test('worker import checks existing worker scope independently even when target object is allowed',async()=>{
  const actor=actorFor([{type:'own_created',ids:[]},{type:'objects',ids:[objectId]}]);
  const h=harness({scopeActor:actor,workerContext:{createdByUserId:otherUser,objectId:otherObject,ownerUserId:otherUser}}),{response,body}=await h.post();
  assert.equal(response.status,201);assert.match(body.issues[0].message,/Недостаточно прав/);assert.equal(body.reused,0);assert.deepEqual(domainWrites(h),[]);assert.equal(h.queries.some(q=>q.text.includes('FROM employment_relations')),false);assertLockedBefore(h);assertTenantBound(h);
});

for(const overrides of [{specialtyId:id(999)},{specialtyId:null},{rows:[{fullName:'Рабочий',phone:'+79990000001',specialtyName:'Неизвестная'}]}])test(`worker import skips invalid specialty without domain writes (${JSON.stringify(overrides)})`,async()=>{
  const h=harness({validSpecialty:false}),{response,body}=await h.post(overrides);assert.equal(response.status,201);assert.equal(body.created,0);assert.equal(body.reused,0);assert.equal(body.assigned,0);assert.equal(body.issues.length,1);assert.match(body.issues[0].message,/специальност/i);assert.deepEqual(domainWrites(h),[]);assert.equal(h.queries.some(q=>q.text.includes('FROM worker_profiles')),false);assertTenantBound(h);
});

test('worker import safe 500 hides internal database detail and rolls back prior mutations',async()=>{
  const h=harness({existing:false,failActivity:true}),before=structuredClone(h.state),original=console.error;console.error=()=>{};
  try{const {response,body}=await h.post();assert.equal(response.status,500);assert.deepEqual(body,{error:'Не удалось импортировать сотрудников'});assert.doesNotMatch(JSON.stringify(body),/secret|credential|private/);assert.deepEqual(h.state,before);assert.ok(domainWrites(h).length>0,'failure occurs after tentative writes');}finally{console.error=original;}
});
