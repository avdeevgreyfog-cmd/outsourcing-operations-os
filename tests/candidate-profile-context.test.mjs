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
const user='10000000-0000-4000-8000-000000000001';
const otherUser='10000000-0000-4000-8000-000000000002';
const candidateId='85000000-0000-4000-8000-000000000001';
const visibleApplication='86000000-0000-4000-8000-000000000001';
const hiddenApplication='86000000-0000-4000-8000-000000000002';
const visibleObject='87000000-0000-4000-8000-000000000001';
const hiddenObject='87000000-0000-4000-8000-000000000002';
const visibleRegion='88000000-0000-4000-8000-000000000001';
const hiddenRegion='88000000-0000-4000-8000-000000000002';

const applicationRows=[
  {applicationId:visibleApplication,candidateId,organizationId:organization,fullName:'Алексей Иванов',phone:'+70000000001',email:null,
    preferredChannel:'phone',preferredContact:'+70000000001',telegram:null,whatsapp:null,city:'Москва',source:'Отклик',sourceChannel:null,
    sourceCampaign:null,sourceReference:null,rawStage:'interview',needId:'89000000-0000-4000-8000-000000000001',need:'Подбор',
    objectId:visibleObject,object:'Объект 1',regionId:visibleRegion,clientId:null,ownerUserId:otherUser,owner:'Рекрутер',managerUserId:null,
    manager:null,assigneeUserIds:[],createdAt:'2026-10-01',updatedAt:'2026-10-02',nextActionAt:null,workflow:{},stageEnteredAt:null,
    nextAction:null,plannedStartDate:null,plannedArrivalAt:null,actualStartAt:null,rejectionReason:null,rejectionReasonCode:null,
    conditions:{},recentCommunications:[
      {id:'recent-visible',applicationId:visibleApplication,channel:'phone',summary:'Связь по доступному подбору',happenedAt:'02.10.2026 12:00',author:'Рекрутер'},
      {id:'recent-standalone',applicationId:null,channel:'phone',summary:'Общая связь кандидата',happenedAt:'01.10.2026 12:00',author:'Рекрутер'},
    ],documentSummary:{}},
  {applicationId:hiddenApplication,candidateId,organizationId:organization,fullName:'Алексей Иванов',phone:'+70000000001',email:null,
    preferredChannel:'phone',preferredContact:'+70000000001',telegram:null,whatsapp:null,city:'Москва',source:'Отклик',sourceChannel:null,
    sourceCampaign:null,sourceReference:null,rawStage:'documents',needId:'89000000-0000-4000-8000-000000000002',need:'Другой подбор',
    objectId:hiddenObject,object:'Объект 2',regionId:hiddenRegion,clientId:null,ownerUserId:otherUser,owner:'Другой рекрутер',managerUserId:null,
    manager:null,assigneeUserIds:[],createdAt:'2026-10-01',updatedAt:'2026-10-03',nextActionAt:null,workflow:{},stageEnteredAt:null,
    nextAction:null,plannedStartDate:null,plannedArrivalAt:null,actualStartAt:null,rejectionReason:null,rejectionReasonCode:null,
    conditions:{},recentCommunications:[],documentSummary:{}},
];

const communicationRows=[
  {id:'comm-visible',applicationId:visibleApplication,channel:'phone',direction:'outbound',summary:'Разрешённый контекст',happenedAt:'02.10.2026 12:00',author:'Рекрутер'},
  {id:'comm-hidden',applicationId:hiddenApplication,channel:'phone',direction:'outbound',summary:'Скрытый контекст',happenedAt:'03.10.2026 12:00',author:'Другой рекрутер'},
  {id:'comm-standalone',applicationId:null,channel:'phone',direction:'outbound',summary:'Отдельная коммуникация',happenedAt:'01.10.2026 12:00',author:'Рекрутер'},
];

function makeActor({scope='objects',ids=[visibleObject],direct=false,unrelatedAllOrg=false,capability=true}={}){
  const capabilities=[...(capability?['recruiting.candidate.read']:[])];
  const scopes={};
  if(capability)scopes['recruiting.candidate.read']=[{type:scope,ids}];
  if(unrelatedAllOrg){capabilities.push('finance.read');scopes['finance.read']=[{type:'all_org',ids:[]}];}
  return {userId:user,organizationId:organization,membershipId:'membership-1',displayName:'Тест',email:'test@example.com',
    roleCode:'recruiter',roleName:'Рекрутер',teamIds:[],orgUnitIds:[],regionIds:[],demo:false,
    access:{capabilities,denies:[],allOrg:unrelatedAllOrg,scopes},directCandidateAccess:direct};
}

function makeHarness({apps=applicationRows,candidateOrg=organization,candidateOwner=otherUser}={}){
  const queries=[];
  const sql=async(strings,...values)=>{
    const text=strings.reduce((out,part,index)=>out+part+(index<values.length?`$${index+1}`:''),'');
    const query={text,values};queries.push(query);
    if(text.includes('FROM candidate_applications ca')&&text.includes('SELECT ca.id "applicationId"'))return apps;
    if(text.includes('FROM candidates c')&&text.includes('SELECT c.id,c.full_name')){
      return [{id:candidateId,fullName:'Алексей Иванов',phone:'+70000000001',email:null,preferredChannel:'phone',telegram:null,whatsapp:null,
        city:'Москва',birthDate:null,source:'Отклик',sourceChannel:null,sourceCampaign:null,sourceReference:null,notes:null,status:'candidate',
        originalRecruiter:'Рекрутер',currentRecruiter:'Рекрутер',organizationId:candidateOrg,ownerUserId:candidateOwner,
        createdByUserId:otherUser,assigneeUserIds:[candidateOwner],workerId:null,workerStatus:null}];
    }
    if(text.includes('SELECT cc.id,cc.application_id')){
      const appIds=values.find(value=>Array.isArray(value))??[];
      const direct=values.find(value=>typeof value==='boolean')===true;
      return communicationRows.filter(row=>row.applicationId===null?direct:appIds.includes(row.applicationId));
    }
    if(text.includes('SELECT h.id,h.application_id'))return [];
    if(text.includes('FROM candidate_contact_methods'))return [];
    if(text.includes('SELECT dt.id "documentTypeId"')){
      const appIds=values.find(value=>Array.isArray(value))??[];
      const rows=[];
      if(appIds.includes(visibleApplication))rows.push({documentTypeId:'doc-visible',name:'Документ доступного подбора',groupType:'employment',provider:'candidate',status:'received',note:null,needId:'need-visible',need:'Подбор',object:'Объект 1',requiredByStage:'documents',blocksProgress:true});
      if(appIds.includes(hiddenApplication))rows.push({documentTypeId:'doc-hidden',name:'Документ скрытого подбора',groupType:'employment',provider:'candidate',status:'received',note:null,needId:'need-hidden',need:'Другой подбор',object:'Объект 2',requiredByStage:'documents',blocksProgress:true});
      rows.push({documentTypeId:'doc-person',name:'Общий документ кандидата',groupType:'employment',provider:'candidate',status:'received',note:null,needId:null,need:null,object:null,requiredByStage:'documents',blocksProgress:true});
      return rows;
    }
    return [];
  };
  const withTenant=async(_organizationId,_userId,callback)=>callback(sql);
  const hasCapability=(access,key)=>evaluator.hasCapability(access,key);
  const dependencies={
    '@/lib/access/server':{requireCapability(currentActor,key){if(!hasCapability(currentActor.access,key))throw new Error(`Missing capability: ${key}`);}},
    '@/lib/core/access.mjs':evaluator,
    '@/lib/db/client':{withTenant},
    '@/lib/demo/data':{},
    './demo-timeline':{demoApplicationDetails:()=>({})},
    './model':{needSourceLabels:{},normalizeRecruitingStage:stage=>stage,recruitingStageLabels:{interview:'Интервью'}},
  };
  const source=fs.readFileSync(path.join(root,'lib/recruiting/service.ts'),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const service={};
  new Function('exports','require',compiled)(service,name=>dependencies[name]??require(name));
  return {getCandidateProfile:service.getCandidateProfile,queries};
}

function queryFor(queries,fragment){
  const query=queries.find(item=>item.text.includes(fragment));
  assert.ok(query,`Expected SQL query containing ${fragment}`);
  return query;
}

function profileCommunicationsQuery(queries){
  const query=queries.find(item=>item.text.includes('AND (cc.application_id=ANY('));
  assert.ok(query,'Expected the context-filtered candidate communications query');
  return query;
}

function assertApplicationIdsBound(query,expected,count=1){
  const matches=[...query.text.matchAll(/ANY\(\$(\d+)::uuid\[\]\)/g)];
  assert.ok(matches.length>=count,`Expected at least ${count} bound application ID predicate(s) in ${query.text}`);
  for(const match of matches.slice(0,count))assert.deepEqual(query.values[Number(match[1])-1],expected);
}

for(const [scope,ids] of [['objects',[visibleObject]],['region',[visibleRegion]]]){
  test(`candidate profile permits one ${scope}-visible application and isolates hidden contexts`,async()=>{
    const {getCandidateProfile,queries}=makeHarness({actor:makeActor({scope,ids})});
    const profile=await getCandidateProfile(makeActor({scope,ids}),candidateId);
    assert.ok(profile);
    assert.deepEqual(profile.applications.map(row=>row.applicationId),[visibleApplication]);
    assert.deepEqual(profile.applications[0].recentCommunications.map(row=>row.id),['recent-visible'],
      'application cards must not leak standalone communications when candidate access itself is denied');
    assert.deepEqual(profile.communications.map(row=>row.id),['comm-visible']);
    assert.deepEqual(profile.documents.map(row=>row.documentTypeId),['doc-visible','doc-person']);
    const communicationQuery=profileCommunicationsQuery(queries);
    assert.match(communicationQuery.text,/cc\.application_id=ANY\(\$\d+::uuid\[\]\)/);
    assert.match(communicationQuery.text,/cc\.application_id IS NULL AND \$\d+/);
    assertApplicationIdsBound(communicationQuery,[visibleApplication]);
    assert.equal(communicationQuery.values.find(value=>typeof value==='boolean'),false,
      'standalone communications require direct candidate access');
    assertApplicationIdsBound(queryFor(queries,'SELECT h.id,h.application_id'),[visibleApplication]);
    const documentsQuery=queryFor(queries,'SELECT dt.id "documentTypeId"');
    assert.match(documentsQuery.text,/ca0\.id=ANY\(\$\d+::uuid\[\]\)/);
    assert.match(documentsQuery.text,/ca\.id=ANY\(\$\d+::uuid\[\]\)/);
    assertApplicationIdsBound(documentsQuery,[visibleApplication],2);
  });
}

test('unrelated all_org grant does not expose a candidate with no directly or application-visible context',async()=>{
  const actor=makeActor({scope:'objects',ids:[visibleObject],unrelatedAllOrg:true});
  assert.equal(actor.access.allOrg,true);
  const inaccessibleApps=applicationRows.map(row=>({...row,objectId:hiddenObject,regionId:hiddenRegion}));
  const {getCandidateProfile,queries}=makeHarness({actor,apps:inaccessibleApps});
  assert.equal(await getCandidateProfile(actor,candidateId),null);
  assert.equal(queries.some(query=>query.text.includes('AND (cc.application_id=ANY(')),false);
});

test('foreign-tenant candidate is rejected before profile context is loaded',async()=>{
  const actor=makeActor({scope:'all_org',ids:[]});
  const {getCandidateProfile,queries}=makeHarness({actor,candidateOrg:otherOrganization});
  assert.equal(await getCandidateProfile(actor,candidateId),null);
  const candidateQuery=queryFor(queries,'FROM candidates c');
  assert.match(candidateQuery.text,/c\.organization_id=\$\d+::uuid/);
  assert.ok(candidateQuery.values.includes(organization));
  assert.equal(queries.some(query=>query.text.includes('AND (cc.application_id=ANY(')),false);
});

test('direct candidate access allows standalone communications with an empty application ID set',async()=>{
  const actor=makeActor({scope:'assigned_to_me',ids:[],direct:true});
  const {getCandidateProfile,queries}=makeHarness({actor,apps:[],candidateOwner:user});
  const profile=await getCandidateProfile(actor,candidateId);
  assert.ok(profile);
  assert.deepEqual(profile.applications,[]);
  assert.deepEqual(profile.communications.map(row=>row.id),['comm-standalone']);
  assert.deepEqual(profile.documents.map(row=>row.documentTypeId),['doc-person']);
  const communicationQuery=profileCommunicationsQuery(queries);
  assertApplicationIdsBound(communicationQuery,[]);
  assert.equal(communicationQuery.values.find(value=>typeof value==='boolean'),true);
  assertApplicationIdsBound(queryFor(queries,'SELECT h.id,h.application_id'),[]);
  assertApplicationIdsBound(queryFor(queries,'SELECT dt.id "documentTypeId"'),[],2);
});

test('candidate-specific all_org scope retains complete visible context and standalone communications',async()=>{
  const actor=makeActor({scope:'all_org',ids:[]});
  const {getCandidateProfile,queries}=makeHarness();
  const profile=await getCandidateProfile(actor,candidateId);
  assert.ok(profile);
  assert.deepEqual(profile.applications.map(row=>row.applicationId),[visibleApplication,hiddenApplication]);
  assert.deepEqual(profile.applications[0].recentCommunications.map(row=>row.id),['recent-visible','recent-standalone']);
  assert.deepEqual(profile.communications.map(row=>row.id),['comm-visible','comm-hidden','comm-standalone']);
  const communicationQuery=profileCommunicationsQuery(queries);
  assertApplicationIdsBound(communicationQuery,[visibleApplication,hiddenApplication]);
  assert.equal(communicationQuery.values.find(value=>typeof value==='boolean'),true);
  assertApplicationIdsBound(queryFor(queries,'SELECT dt.id "documentTypeId"'),[visibleApplication,hiddenApplication],2);
});

test('missing candidate read capability is denied before any SQL query',async()=>{
  const actor=makeActor({capability:false});
  const {getCandidateProfile,queries}=makeHarness();
  await assert.rejects(getCandidateProfile(actor,candidateId),/Missing capability: recruiting\.candidate\.read/);
  assert.deepEqual(queries,[]);
});

test('candidate scope denial with no accessible applications returns no profile',async()=>{
  const actor=makeActor({scope:'objects',ids:[visibleObject]});
  const {getCandidateProfile,queries}=makeHarness({actor,apps:applicationRows.map(row=>({...row,objectId:hiddenObject,regionId:hiddenRegion}))});
  assert.equal(await getCandidateProfile(actor,candidateId),null);
  assert.equal(queries.some(query=>query.text.includes('AND (cc.application_id=ANY(')),false);
});
