import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as evaluator from '../lib/core/access.mjs';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const organization='00000000-0000-4000-8000-000000000001';
const otherOrganization='00000000-0000-4000-8000-000000000002';
const workerId='88000000-0000-4000-8000-000000000001';
const user='10000000-0000-4000-8000-000000000001';
const otherUser='10000000-0000-4000-8000-000000000002';
const objectA='80000000-0000-4000-8000-000000000001';
const objectB='80000000-0000-4000-8000-000000000002';

const worker={id:workerId,organizationId:organization,fullName:'Рабочий',status:'active',objectId:objectA,object:'Объект А',
  ownerUserId:otherUser,createdByUserId:otherUser,regionId:'30000000-0000-4000-8000-000000000001',assigneeUserIds:[]};

const documents=[
  {id:'doc-a-missing',organizationId:organization,documentCode:'passport',employeeReportedAt:null,managerVerifiedAt:null,updatedAt:'2026-09-03T12:00:00.000Z',objectId:objectA,object:'Объект А',regionId:'30000000-0000-4000-8000-000000000001',ownerUserId:otherUser,assigneeUserIds:[]},
  {id:'doc-a-checked',organizationId:organization,documentCode:'passport',employeeReportedAt:'2026-09-02T12:00:00.000Z',managerVerifiedAt:'2026-09-03T12:00:00.000Z',updatedAt:'2026-09-03T12:00:00.000Z',objectId:objectA,object:'Объект А',regionId:'30000000-0000-4000-8000-000000000001',ownerUserId:otherUser,assigneeUserIds:[]},
  {id:'doc-a-reported',organizationId:organization,documentCode:'future_internal_code',employeeReportedAt:'2026-09-02T12:00:00.000Z',managerVerifiedAt:null,updatedAt:'2026-09-02T12:00:00.000Z',objectId:objectA,object:'Объект А',regionId:'30000000-0000-4000-8000-000000000001',ownerUserId:otherUser,assigneeUserIds:[]},
  {id:'doc-b-hidden',organizationId:organization,documentCode:'contract',employeeReportedAt:'2026-09-02T12:00:00.000Z',managerVerifiedAt:'2026-09-03T12:00:00.000Z',updatedAt:'2026-09-03T12:00:00.000Z',objectId:objectB,object:'Объект Б',regionId:'30000000-0000-4000-8000-000000000002',ownerUserId:otherUser,assigneeUserIds:[]},
  {id:'doc-foreign',organizationId:otherOrganization,documentCode:'snils',employeeReportedAt:null,managerVerifiedAt:null,updatedAt:'2026-09-03T12:00:00.000Z',objectId:objectA,object:'Чужая организация',regionId:'30000000-0000-4000-8000-000000000001',ownerUserId:user,assigneeUserIds:[user]},
];

const assignments=[
  {id:'assignment-a',organizationId:organization,objectId:objectA,object:'Объект А',regionId:'30000000-0000-4000-8000-000000000001',ownerUserId:otherUser,managerUserId:otherUser,effectiveFrom:'2026-09-01',effectiveTo:null,specialty:'Комплектовщик',workMode:'local',assigneeUserIds:[]},
  {id:'assignment-b',organizationId:organization,objectId:objectB,object:'Объект Б',regionId:'30000000-0000-4000-8000-000000000002',ownerUserId:otherUser,managerUserId:otherUser,effectiveFrom:'2026-08-01',effectiveTo:'2026-08-31',specialty:'Грузчик',workMode:'rotation',assigneeUserIds:[]},
  {id:'assignment-foreign',organizationId:otherOrganization,objectId:objectA,object:'Чужой объект',regionId:'30000000-0000-4000-8000-000000000001',ownerUserId:user,managerUserId:user,effectiveFrom:'2026-08-01',effectiveTo:null,specialty:'Комплектовщик',workMode:'local',assigneeUserIds:[user]},
];

const relations=[
  {id:'relation-employment',relationType:'employment',effectiveFrom:'2026-09-01',effectiveTo:null,contractReference:'ТК-18'},
  {id:'relation-custom',relationType:'custom',effectiveFrom:'2026-08-01',effectiveTo:'2026-08-31',contractReference:null},
];

const incidents=[
  {id:'incident-a',organizationId:organization,objectId:objectA,clientId:null,regionId:'30000000-0000-4000-8000-000000000001',object:'Объект А',title:'Сбой упаковочной линии',status:'open',occurredAtIso:'2026-09-05T10:00:00.000Z',workerId,ownerUserId:otherUser,createdByUserId:otherUser,assigneeUserIds:[],financialEffectAmount:900000,financialEffectBasis:'private detail'},
  {id:'incident-b',organizationId:organization,objectId:objectB,clientId:null,regionId:'30000000-0000-4000-8000-000000000002',object:'Объект Б',title:'Не доступен по worker scope',status:'resolved',occurredAtIso:'2026-09-04T10:00:00.000Z',workerId,ownerUserId:otherUser,createdByUserId:otherUser,assigneeUserIds:[],financialEffectAmount:2500},
  {id:'incident-other-worker',organizationId:organization,objectId:objectA,clientId:null,regionId:'30000000-0000-4000-0000-000000000001',object:'Объект А',title:'Другой сотрудник',status:'open',occurredAtIso:'2026-09-06T10:00:00.000Z',workerId:'88000000-0000-4000-8000-000000000002',ownerUserId:otherUser,createdByUserId:otherUser,assigneeUserIds:[]},
];

function actorFor({scope='objects',ids=[objectA],capabilities=['worker.read','operations.object.read'],allOrg=false}={}){
  return {organizationId:organization,userId:user,membershipId:'membership-1',displayName:'Проверяющий',email:'test@example.com',roleCode:'operator',roleName:'Оператор',
    teamIds:[],orgUnitIds:[],regionIds:[],demo:false,
    access:{capabilities,denies:[],allOrg,scopes:{'worker.read':[{type:scope,ids}],...(capabilities.includes('operations.object.read')?{'operations.object.read':[{type:'all_org',ids:[]}]}:{})}}};
}

function loadService({actor=actorFor(),docRows=documents,assignmentRows=assignments,relationRows=relations,incidentRows=incidents}={}){
  const queries=[];let incidentCalls=0;let insideTenant=false;
  const sql=async(strings,...values)=>{
    const text=strings.reduce((out,part,index)=>out+part+(index<values.length?`$${index+1}`:''),'');
    queries.push({text,values});
    if(text.includes('FROM worker_document_checklist d'))return docRows;
    if(text.includes('FROM worker_object_assignments wa'))return assignmentRows;
    if(text.includes('FROM employment_relations'))return relationRows;
    return [];
  };
  const deps={
    '@/lib/access/server':{AccessDeniedError:class AccessDeniedError extends Error{},requireCapability(currentActor,key){if(!evaluator.hasCapability(currentActor.access,key))throw new Error(`Missing capability: ${key}`);}},
    '@/lib/core/access.mjs':evaluator,
    '@/lib/data/service':{async listIncidents(currentActor){incidentCalls++;assert.equal(currentActor,actor);assert.equal(insideTenant,false,'incidents are loaded outside the worker-record tenant session');return incidentRows;}},
    '@/lib/db/client':{withTenant:async(tenant,userId,callback)=>{assert.equal(tenant,organization);assert.equal(userId,user);insideTenant=true;try{return await callback(sql);}finally{insideTenant=false;}}},
  };
  const source=fs.readFileSync(path.join(root,'lib/operations/worker-records.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const service={};new Function('exports','require',compiled)(service,name=>deps[name]??require(name));
  return {getWorkerRecords:service.getWorkerRecords,queries,get incidentCalls(){return incidentCalls;}};
}

test('worker records scope object history and checklist before returning safe projections',async()=>{
  const actor=actorFor({allOrg:true});
  const harness=loadService({actor});
  const result=await harness.getWorkerRecords(actor,worker);
  assert.deepEqual(result.documents.map(row=>[row.id,row.name,row.status]),[
    ['doc-a-missing','Паспорт','missing'],['doc-a-checked','Паспорт','checked'],['doc-a-reported','Другой документ','reported'],
  ]);
  assert.deepEqual(result.history.map(row=>row.id),['assignment:assignment-a','relation:relation-employment','relation:relation-custom']);
  assert.equal(result.history[0].object,'Объект А');
  assert.match(result.history[0].detail,/С 01\.09\.2026/);
  assert.match(result.history[0].detail,/Комплектовщик/);
  assert.equal(result.history[1].title,'Оформление: Трудовой договор');
  assert.equal(result.history[1].detail,'С 01.09.2026 · Договор №ТК-18');
  assert.deepEqual(result.incidents,[{id:'incident-a',title:'Сбой упаковочной линии',object:'Объект А',status:'open',occurredAt:'2026-09-05T10:00:00.000Z'}]);
  assert.equal(JSON.stringify(result).includes('900000'),false);
  assert.equal(JSON.stringify(result).includes('private detail'),false);
  assert.equal(JSON.stringify(result).includes('future_internal_code'),false);
  assert.equal(harness.incidentCalls,1);
  for(const query of harness.queries){
    assert.match(query.text,/organization_id=\$\d+::uuid/);
    assert.ok(query.values.includes(organization));
  }
  assert.match(harness.queries.find(query=>query.text.includes('FROM worker_document_checklist d')).text,/o\.organization_id=d\.organization_id/);
  assert.match(harness.queries.find(query=>query.text.includes('FROM worker_object_assignments wa')).text,/o\.organization_id=wa\.organization_id/);
});

test('unrelated aggregate all_org does not reveal checklist or assignment records outside worker.read scope',async()=>{
  const actor=actorFor({scope:'objects',ids:[objectA],allOrg:true});
  const harness=loadService({actor});
  const result=await harness.getWorkerRecords(actor,worker);
  assert.equal(actor.access.allOrg,true);
  assert.equal(result.documents.some(row=>row.id==='doc-b-hidden'),false);
  assert.equal(result.history.some(row=>row.id==='assignment:assignment-b'),false);
  assert.equal(result.incidents.some(row=>row.id==='incident-b'),false);
});

test('foreign or inaccessible worker is rejected before any query',async()=>{
  const actor=actorFor({scope:'objects',ids:[objectA]});
  const harness=loadService({actor});
  await assert.rejects(harness.getWorkerRecords(actor,{...worker,organizationId:otherOrganization}),/worker\.read/);
  await assert.rejects(harness.getWorkerRecords(actor,{...worker,objectId:objectB}),/worker\.read/);
  assert.deepEqual(harness.queries,[]);
  assert.equal(harness.incidentCalls,0);
});

test('missing worker.read capability is rejected before any query',async()=>{
  const actor=actorFor({capabilities:['operations.object.read']});
  const harness=loadService({actor});
  await assert.rejects(harness.getWorkerRecords(actor,worker),/Missing capability: worker\.read/);
  assert.deepEqual(harness.queries,[]);
});

test('incidents are omitted without operations.object.read',async()=>{
  const actor=actorFor({capabilities:['worker.read']});
  const harness=loadService({actor});
  const result=await harness.getWorkerRecords(actor,worker);
  assert.deepEqual(result.incidents,[]);
  assert.equal(harness.incidentCalls,0);
});

test('demo history uses only supplied start date and object and returns no invented documents',async()=>{
  const actor=actorFor({});actor.demo=true;
  const demoIncidents=incidents.map(incident=>({...incident,workerId:null}));
  const harness=loadService({actor,incidentRows:demoIncidents});
  const result=await harness.getWorkerRecords(actor,{...worker,startDate:'2026-09-01'});
  assert.deepEqual(result.documents,[]);
  assert.deepEqual(result.history,[{id:`worker-start:${workerId}`,date:'2026-09-01',title:'Назначение на объект',object:'Объект А',detail:''}]);
  assert.deepEqual(result.incidents,[],'demo incidents without a worker link stay unlinked');
  assert.deepEqual(harness.queries,[]);
});

test('missing demo start date and object produce no invented history',async()=>{
  const actor=actorFor({});actor.demo=true;
  const result=await loadService({actor}).getWorkerRecords(actor,{...worker,startDate:null,object:null});
  assert.deepEqual(result.history,[]);
  assert.deepEqual(result.documents,[]);
});
