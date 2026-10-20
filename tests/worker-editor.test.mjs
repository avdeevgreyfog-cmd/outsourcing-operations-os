import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as access from '../lib/core/access.mjs';

// These are service/route tests with a stateful SQL double, not database integration tests.
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),user=id(2),workerId=id(3),objectId=id(4),region=id(5),relationId=id(6);
const initialWorker={id:workerId,organizationId:org,fullName:'Иван Иванов',phone:'+79000000000',email:null,city:null,
  birthDate:null,clothingSize:'L',shoeSize:'42',heightCm:180,notes:null,status:'active',updatedAt:'2026-10-01 10:00:00+00',
  createdByUserId:user,objectId,clientId:id(7),regionId:region,ownerUserId:id(8),assigneeUserIds:[user],
  source:'Подбор',originCandidateId:id(9),employmentDocumentsStatus:'completed'};
const initialPeriod={id:relationId,relationType:'gph',effectiveFrom:'2026-09-01',effectiveTo:'2026-09-30',contractReference:'ГПХ-1',metadata:{source:'candidate_first_shift',nested:{keep:true}}};
const clone=value=>structuredClone(value);
const scope=(type='all_org',ids=[])=>[{type,ids}];
function actor(read=scope(),edit=scope(),capabilities=['worker.read','worker.edit']){
  return {organizationId:org,userId:user,membershipId:id(10),teamIds:[],regionIds:[],orgUnitIds:[],demo:false,
    access:{capabilities,denies:[],allOrg:true,scopes:{'worker.read':read,'worker.edit':edit}}};
}
class AccessDeniedError extends Error {}
function compile(file,deps){
  const output=ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('exports','require',output)(exports,name=>deps[name]??require(name));return exports;
}
function harness({worker=initialWorker,periods=[initialPeriod],currentActor=actor(),failure=null}={}){
  const state={worker:clone(worker),periods:clone(periods),events:[]},queries=[],writes=[];
  const sql=async(strings,...values)=>{
    const text=strings.join('?');queries.push({text,values});
    if(failure)throw failure;
    if(text.includes('SELECT id FROM worker_profiles'))return state.worker?.id===values[0]&&state.worker.organizationId===values[1]?[{id:state.worker.id}]:[];
    if(text.includes('FROM worker_profiles w'))return state.worker?.id===values[0]?[clone(state.worker)]:[];
    if(text.includes('FROM employment_relations'))return clone(state.periods).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom)||a.id.localeCompare(b.id));
    if(text.includes('FROM activity_events e'))return state.events.map((e,i)=>({id:id(30+i),date:'2026-10-11',summary:e.summary,actor:'Менеджер',reason:e.metadata.reason,metadata:clone(e.metadata)}));
    writes.push({text,values});
    if(text.includes('UPDATE worker_profiles')){
      const keys=['fullName','phone','email','city','birthDate','clothingSize','shoeSize','heightCm','notes'];
      keys.forEach((key,i)=>{state.worker[key]=values[i];});state.worker.updatedAt='2026-10-11 11:00:00.123456+00';return [];
    }
    if(text.includes('UPDATE employment_relations')){
      const period=state.periods.find(p=>p.id===values[4]);
      Object.assign(period,{relationType:values[0],effectiveFrom:values[1],effectiveTo:values[2],contractReference:values[3]});return [];
    }
    if(text.includes('INSERT INTO employment_relations')){
      const newId=id(20);state.periods.push({id:newId,relationType:values[2],effectiveFrom:values[3],effectiveTo:values[4],contractReference:values[5],metadata:{}});return [{id:newId}];
    }
    if(text.includes('INSERT INTO activity_events')){state.events.push({verb:values[3],summary:values[4],metadata:clone(values[5])});return [];}
    throw new Error(`Unexpected SQL: ${text}`);
  };
  sql.json=value=>value;
  const deps={
    '@/lib/access/server':{AccessDeniedError,requireCapability(a,c){if(!access.hasCapability(a.access,c))throw new AccessDeniedError(c);}},
    '@/lib/core/access.mjs':access,
    '@/lib/db/client':{async withTenant(tenant,who,fn){assert.equal(tenant,org);assert.equal(who,user);return fn(sql);}},
    '@/lib/data/service':{async listWorkers(){return [state.worker];}},
  };
  const service=compile('lib/operations/worker-editor.ts',deps);
  const route=compile('app/api/workers/[id]/profile/route.ts',{
    ...deps,'@/lib/operations/worker-editor':service,'@/lib/auth/server':{async getCurrentActor(){return currentActor;}},
    'next/server':{NextResponse:{json(body,{status=200}={}){return new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});}}},
  });
  return {...service,route,state,queries,writes};
}
const profileChange=context=>({action:'profile',expectedVersion:context.profileVersion,profile:{...context.profile,fullName:'Иван Петров'}});
const periodChange=(context,period={relationType:'employment',effectiveFrom:'2026-10-01',effectiveTo:null,contractReference:null})=>({action:'period',expectedVersion:context.relationsVersion,period,reason:'Уточнение данных'});
const request=body=>new Request('http://localhost/api/workers/profile',{method:'PATCH',body:JSON.stringify(body)});
const params={params:Promise.resolve({id:workerId})};

test('read and edit capabilities and row scopes are independently enforced',async()=>{
  for(const capabilities of [['worker.read'],['worker.edit'],[]]){
    const a=actor(scope(),scope(),capabilities),h=harness();
    if(capabilities.includes('worker.read'))assert.equal((await h.getWorkerEditorContext(a,workerId)).canEdit,false);
    else await assert.rejects(h.getWorkerEditorContext(a,workerId),AccessDeniedError);
    await assert.rejects(h.saveWorkerChange(a,workerId,{}),AccessDeniedError);assert.equal(h.writes.length,0);
  }
  const a=actor(scope('objects',[objectId]),scope('objects',[id(99)])),h=harness();
  const context=await h.getWorkerEditorContext(a,workerId);assert.equal(context.canEdit,false);
  await assert.rejects(h.saveWorkerChange(a,workerId,profileChange(context)),AccessDeniedError);assert.equal(h.writes.length,0);
});

test('assigned, object, region and own-created scopes permit only matching worker rows',async()=>{
  for(const [type,ids] of [['assigned_to_me',[]],['objects',[objectId]],['region',[region]],['own_created',[]]]){
    const a=actor(scope(type,ids),scope(type,ids)),h=harness();
    const context=await h.getWorkerEditorContext(a,workerId);assert.equal(context.canEdit,true);
    await h.saveWorkerChange(a,workerId,profileChange(context));assert.equal(h.state.worker.fullName,'Иван Петров');
    const hidden=harness({worker:{...initialWorker,objectId:id(99),regionId:id(99),createdByUserId:id(99),assigneeUserIds:[]}});
    await assert.rejects(hidden.getWorkerEditorContext(a,workerId),AccessDeniedError);assert.equal(hidden.writes.length,0);
  }
});

test('foreign tenant and aggregate allOrg without worker scopes never grant access',async()=>{
  const a=actor(),h=harness({worker:{...initialWorker,organizationId:id(99)}});
  await assert.rejects(h.getWorkerEditorContext(a,workerId),AccessDeniedError);
  await assert.rejects(h.saveWorkerChange(a,workerId,{action:'profile',expectedVersion:'a'.repeat(64),profile:{fullName:'Иван',phone:null,email:null,city:null,birthDate:null,clothingSize:null,shoeSize:null,heightCm:null,notes:null}}),e=>e.status===404);
  const unscoped=actor([],[]);await assert.rejects(harness().getWorkerEditorContext(unscoped,workerId),AccessDeniedError);
  assert.equal(h.writes.length,0);
});

test('profile correction preserves operational state and records before/after in refreshed context',async()=>{
  const a=actor(),h=harness(),before=await h.getWorkerEditorContext(a,workerId);
  const after=await h.saveWorkerChange(a,workerId,profileChange(before));
  assert.equal(after.profile.fullName,'Иван Петров');assert.notEqual(after.profileVersion,before.profileVersion);
  assert.equal(after.relationsVersion,before.relationsVersion);assert.equal(after.events.length,1);
  for(const key of ['status','source','originCandidateId','employmentDocumentsStatus'])assert.equal(h.state.worker[key],initialWorker[key]);
  assert.deepEqual(h.state.periods,[initialPeriod]);assert.deepEqual(h.state.events[0].metadata,{before:before.profile,after:after.profile,reason:null});
  assert.equal(h.state.events[0].verb,'profile_corrected');
  assert.equal(after.events[0].detail,'ФИО: Иван Иванов → Иван Петров');
  assert.match(h.queries[3].text,/FOR UPDATE/);
  for(const q of h.queries)if(q.text.includes('WHERE')){assert.match(q.text,/organization_id/);assert.ok(q.values.includes(org));}
});

test('stale profile and relation snapshots fail before any write',async()=>{
  for(const action of ['profile','period']){
    const a=actor(),h=harness(),context=await h.getWorkerEditorContext(a,workerId);
    if(action==='profile')h.state.worker.clothingSize='XL';else h.state.periods[0].metadata.source='changed';
    const period=Object.fromEntries(Object.entries(initialPeriod).filter(([key])=>key!=='metadata'));
    await assert.rejects(h.saveWorkerChange(a,workerId,action==='profile'?profileChange(context):periodChange(context,period)),e=>e.status===409);
    assert.equal(h.writes.length,0);
  }
});

test('closed-period correction preserves id and metadata and supplies audit reason',async()=>{
  const a=actor(),h=harness({worker:{...initialWorker,status:'dismissed'}}),context=await h.getWorkerEditorContext(a,workerId);
  const period=Object.fromEntries(Object.entries(initialPeriod).filter(([key])=>key!=='metadata'));
  const result=await h.saveWorkerChange(a,workerId,periodChange(context,{...period,contractReference:'Исправлено'}));
  assert.equal(result.relations[0].id,relationId);assert.equal(result.relations[0].effectiveTo,'2026-09-30');
  assert.deepEqual(h.state.periods[0].metadata,initialPeriod.metadata);assert.notEqual(result.relationsVersion,context.relationsVersion);
  assert.deepEqual(h.state.events[0].metadata.before,period);assert.equal(h.state.events[0].metadata.after.contractReference,'Исправлено');
  assert.equal(h.state.events[0].metadata.reason,'Уточнение данных');assert.equal(h.state.events[0].verb,'employment_period_corrected');
  assert.equal(result.events[0].detail,'Номер / основание: ГПХ-1 → Исправлено');
});

test('event details project known old/new fields and omit internal metadata',async()=>{
  const a=actor(),h=harness();
  h.state.events.push({summary:'Проверенная правка',metadata:{reason:'Причина',internalSecret:'hidden-root',
    before:{fullName:'Иван Иванов',phone:null,internalSecret:'hidden-before'},
    after:{fullName:'Иван Петров',phone:'+79001234567',internalSecret:'hidden-after',metadata:{private:'hidden-nested'}}}});
  h.state.events.push({summary:'Закрыты периоды',metadata:{reason:'Выход завершён',
    before:[{...initialPeriod,internalSecret:'hidden-period'}],after:[{...initialPeriod,effectiveTo:'2026-09-20',internalSecret:'hidden-period'}]}});
  const context=await h.getWorkerEditorContext(a,workerId);
  assert.equal(context.events[0].detail,'ФИО: Иван Иванов → Иван Петров; Телефон: Не указано → +79001234567');
  assert.equal(context.events[1].detail,'Окончание: 2026-09-30 → 2026-09-20');
  assert.equal(context.events[0].reason,'Причина');
  assert.equal(JSON.stringify(context).includes('hidden-'),false);
  assert.equal(JSON.stringify(context).includes('candidate_first_shift'),false);
  assert.equal(context.events.some(event=>'metadata' in event||'before' in event||'after' in event),false);
  assert.equal(context.relations.some(period=>'metadata' in period),false);
});

test('independent profile and relation corrections preserve each other across loaded snapshots',async()=>{
  for(const first of ['profile','period']){
    const a=actor(),h=harness(),context=await h.getWorkerEditorContext(a,workerId);
    const profileBody=profileChange(context),periodBody=periodChange(context,{id:relationId,relationType:'gph',effectiveFrom:'2026-09-01',effectiveTo:'2026-09-30',contractReference:'Исправлено'});
    await h.saveWorkerChange(a,workerId,first==='profile'?profileBody:periodBody);
    const result=await h.saveWorkerChange(a,workerId,first==='profile'?periodBody:profileBody);
    assert.equal(result.profile.fullName,'Иван Петров');assert.equal(result.relations[0].contractReference,'Исправлено');
    assert.deepEqual(h.state.periods[0].metadata,initialPeriod.metadata);assert.equal(result.events.length,2);
  }
});

test('period creation keeps history and accepts adjacent disjoint inclusive periods',async()=>{
  const a=actor(),h=harness(),context=await h.getWorkerEditorContext(a,workerId);
  const result=await h.saveWorkerChange(a,workerId,periodChange(context));
  assert.equal(result.relations.length,2);assert.deepEqual(h.state.periods[0],initialPeriod);
  assert.equal(result.relations[1].id,id(20));assert.equal(h.state.events[0].metadata.before,null);
  assert.equal(h.state.events[0].verb,'employment_period_created');
});

test('inclusive boundary, interior and open-ended overlaps reject with no writes',async()=>{
  for(const [from,to] of [['2026-09-30',null],['2026-09-10','2026-09-20'],['2026-08-01',null]]){
    const a=actor(),h=harness(),context=await h.getWorkerEditorContext(a,workerId);
    await assert.rejects(h.saveWorkerChange(a,workerId,periodChange(context,{relationType:'npd',effectiveFrom:from,effectiveTo:to,contractReference:null})),/пересекается/);
    assert.equal(h.writes.length,0);
  }
});

test('foreign period identifiers and new periods for dismissed workers fail without writes',async()=>{
  for(const dismissed of [false,true]){
    const a=actor(),h=harness({worker:{...initialWorker,status:dismissed?'dismissed':'active'}}),context=await h.getWorkerEditorContext(a,workerId);
    const body=periodChange(context);if(!dismissed)body.period.id=id(99);
    await assert.rejects(h.saveWorkerChange(a,workerId,body),e=>e.status===409);assert.equal(h.writes.length,0);
  }
});

test('strict schemas reject invalid dates, inverted periods and operational fields',()=>{
  const h=harness(),base={action:'period',expectedVersion:'a'.repeat(64),reason:'Причина',period:{relationType:'npd',effectiveFrom:'2026-10-01',effectiveTo:null,contractReference:null}};
  for(const period of [{...base.period,effectiveFrom:'2026-02-30'},{...base.period,effectiveTo:'2026-09-30'},{...base.period,relationType:'unspecified'}])assert.equal(h.workerChangeSchema.safeParse({...base,period}).success,false);
  assert.equal(h.profileSchema.safeParse({...initialWorker,status:'dismissed'}).success,false);
});

test('demo context normalizes known localized relation labels without inventing unknown periods',async()=>{
  const a=actor();a.demo=true;
  for(const [employment,expected] of [['gph','gph'],['ГПХ','gph'],['ТК','employment']]){
    const h=harness({worker:{...initialWorker,employment,startDate:'2026-09-01'}});
    const context=await h.getWorkerEditorContext(a,workerId);
    assert.equal(context.relations.length,1);assert.equal(context.relations[0].relationType,expected);assert.equal(h.queries.length,0);
  }
  for(const worker of [{...initialWorker,employment:'Неизвестное оформление',startDate:'2026-09-01'},{...initialWorker,employment:'ГПХ',startDate:null}]){
    const h=harness({worker});assert.deepEqual((await h.getWorkerEditorContext(a,workerId)).relations,[]);assert.equal(h.queries.length,0);
  }
});

test('real route maps authentication, UUID, scope, validation and stale errors safely',async()=>{
  const unauth=harness({currentActor:null});assert.equal((await unauth.route.GET(request({}),params)).status,401);
  const h=harness();assert.equal((await h.route.GET(request({}),{params:Promise.resolve({id:'bad'})})).status,400);
  const readOnly=harness({currentActor:actor(scope(),scope(),['worker.read'])});assert.equal((await readOnly.route.PATCH(request({}),params)).status,403);
  assert.equal((await h.route.PATCH(request({}),params)).status,400);
  const malformed=new Request('http://localhost',{method:'PATCH',body:'{'});assert.equal((await h.route.PATCH(malformed,params)).status,400);
  const context=await h.getWorkerEditorContext(actor(),workerId),body=profileChange(context);body.expectedVersion='f'.repeat(64);
  assert.equal((await h.route.PATCH(request(body),params)).status,409);assert.equal(h.writes.length,0);
});

test('route hides unexpected database details and returns successful refreshed writes',async()=>{
  const failed=harness({failure:new Error('secret database connection detail')}),original=console.error;
  console.error=()=>{};
  try{const response=await failed.route.GET(request({}),params);assert.equal(response.status,500);assert.equal(JSON.stringify(await response.json()).includes('secret'),false);}finally{console.error=original;}
  const h=harness(),context=await h.getWorkerEditorContext(actor(),workerId);
  const response=await h.route.PATCH(request(profileChange(context)),params);assert.equal(response.status,200);
  assert.equal((await response.json()).profile.fullName,'Иван Петров');
});
