import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as access from '../lib/core/access.mjs';

const require=createRequire(import.meta.url);
const candidate={id:'person',organizationId:'org',createdByUserId:'other',ownerUserId:'other',assigneeUserIds:['other'],
  fullName:'Иван Петров',phone:'1234567',city:'Москва',preferredChannel:'phone',preferredContact:'1234567',source:'Отклик',
  owner:'Общий рекрутер',workerId:null,workerStatus:null,rawStatus:'active',updatedAt:'2026-10-10',
  formerWorkerExitReasonCode:null,formerWorkerExitReason:null,formerWorkerExitDate:null};
const apps=[
  {applicationId:'new-hidden',candidateId:'person',organizationId:'org',objectId:'hidden',regionId:'hidden-region',ownerUserId:'other',assigneeUserIds:[],
    rawStage:'documents',need:'Закрытый подбор',object:'Закрытый объект',owner:'Закрытый рекрутер',updatedAt:'2026-10-10'},
  {applicationId:'old-visible',candidateId:'person',organizationId:'org',objectId:'visible',regionId:'visible-region',ownerUserId:'me',assigneeUserIds:[],
    rawStage:'interview',need:'Доступный подбор',object:'Доступный объект',owner:'Мой рекрутер',updatedAt:'2026-10-01'},
];
function actor(type='objects',ids=['visible']){
  return {organizationId:'org',userId:'me',membershipId:'membership',teamIds:[],orgUnitIds:[],regionIds:[],demo:false,
    access:{capabilities:['recruiting.candidate.read','finance.read'],denies:[],allOrg:true,
      scopes:{'recruiting.candidate.read':[{type,ids}],'finance.read':[{type:'all_org',ids:[]}]}}};
}
function harness({people=[candidate],applications=apps}={}){
  const queries=[];
  const sql=async(parts,...values)=>{
    const text=parts.reduce((s,p,i)=>s+p+(i<values.length?`$${i+1}`:''),'');
    queries.push({text,values});
    if(text.includes('SELECT ca.id "applicationId"'))return applications;
    if(text.includes('FROM candidates c'))return people;
    throw Error('Unexpected query');
  };
  const source=fs.readFileSync(new URL('../lib/recruiting/service.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const dependencies={
    '@/lib/access/server':{requireCapability(a,c){if(!access.hasCapability(a.access,c))throw Error('Denied');}},
    '@/lib/core/access.mjs':access,'@/lib/db/client':{withTenant:async(_org,_user,fn)=>fn(sql)},
    '@/lib/demo/data':{},'./demo-timeline':{},
    './model':{normalizeRecruitingStage:s=>s,recruitingStageLabels:{interview:'Интервью',documents:'Документы'},needSourceLabels:{}},
  };
  const service={};new Function('exports','require',compiled)(service,n=>dependencies[n]??require(n));
  return {directory:service.listCandidateDirectory,queries};
}
for(const [type,ids] of [['objects',['visible']],['region',['visible-region']],['assigned_to_me',[]]]){
  test(`directory ${type} uses older accessible application without hidden latest fields/counts`,async()=>{
    const {directory,queries}=harness();
    const rows=await directory(actor(type,ids));
    assert.equal(rows.length,1);
    assert.equal(rows[0].latestObject,'Доступный объект');
    assert.equal(rows[0].latestNeed,'Доступный подбор');
    assert.equal(rows[0].latestStage,'interview');
    assert.equal(rows[0].owner,'Мой рекрутер');
    assert.equal(rows[0].applicationsCount,1);assert.equal(rows[0].activeApplications,1);
    assert.ok(!JSON.stringify(rows).includes('Закрытый'));
    for(const key of ['organizationId','ownerUserId','createdByUserId','assigneeUserIds'])assert.ok(!(key in rows[0]));
    const query=queries.find(q=>q.text.includes('FROM candidates c'));
    assert.match(query.text,/WHERE c\.organization_id=\$\d+::uuid/);assert.ok(query.values.includes('org'));
    assert.ok(!query.text.includes('count_apps'));assert.ok(!query.text.includes('latest.stage'));
  });
}
test('candidate-specific all_org sees both application contexts and true counts',async()=>{
  const {directory}=harness();const [row]=await directory(actor('all_org',[]));
  assert.equal(row.latestObject,'Закрытый объект');assert.equal(row.applicationsCount,2);assert.equal(row.activeApplications,2);
});
test('unrelated allOrg does not reveal a person without accessible applications or direct scope',async()=>{
  const {directory}=harness({applications:[apps[0]]});assert.deepEqual(await directory(actor()),[]);
});
test('direct assigned person without applications stays in directory with zero context counts',async()=>{
  const {directory}=harness({people:[{...candidate,ownerUserId:'me'}],applications:[]});
  const [row]=await directory(actor('assigned_to_me',[]));
  assert.equal(row.applicationsCount,0);assert.equal(row.activeApplications,0);assert.equal(row.latestNeed,null);
  assert.equal(row.latestObject,null);assert.equal(row.latestStage,null);assert.equal(row.owner,'Общий рекрутер');
});
test('foreign person is rejected even if a malformed supplied application matches its ID',async()=>{
  const {directory}=harness({people:[{...candidate,organizationId:'foreign'}]});assert.deepEqual(await directory(actor(),apps),[]);
});
test('preloaded application rows are re-evaluated and avoid a duplicate application query',async()=>{
  const {directory,queries}=harness();
  const [row]=await directory(actor(),apps.map(a=>({...a,stage:a.rawStage,stageLabel:'Интервью'})));
  assert.equal(row.applicationsCount,1);assert.equal(row.latestObject,'Доступный объект');
  assert.equal(queries.filter(q=>q.text.includes('SELECT ca.id "applicationId"')).length,0);
});
test('directory missing capability is denied before SQL',async()=>{
  const {directory,queries}=harness();const a=actor();a.access.capabilities=['finance.read'];
  await assert.rejects(directory(a),/Denied/);assert.deepEqual(queries,[]);
});
