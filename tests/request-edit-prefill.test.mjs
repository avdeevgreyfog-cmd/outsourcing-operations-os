import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { createRequire } from 'node:module';

const nativeRequire=createRequire(import.meta.url);
function load(path,dependencies={}){
  const code=ts.transpileModule(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const result={};
  new Function('exports','require',code)(result,name=>name in dependencies?dependencies[name]:nativeRequire(name));
  return result;
}
const intake=load('lib/commercial/request-intake.ts');
const source='components/RequestIntakeWorkspacePolished.tsx';
const options={currentUserId:'owner',clients:[{id:'client',name:'Заказчик'}],members:[{id:'owner',name:'Менеджер'}],specialties:[],regions:[]};
function harness(props,record){
  const state=[],effects=[],timers=[];let cursor=0;let mounted=false;let saved;let pushed;
  const react={useState(initial){const index=cursor++;if(!(index in state))state[index]=typeof initial==='function'?initial():initial;return [state[index],next=>{state[index]=typeof next==='function'?next(state[index]):next;}];},useRef(initial){const index=cursor++;if(!(index in state))state[index]={current:initial};return state[index];},useMemo(callback){return callback();},useEffect(callback){if(!mounted)effects.push(callback);}};
  const windowMock={setTimeout(callback){timers.push(callback);return timers.length;},clearTimeout(){},addEventListener(){},removeEventListener(){}};
  const priorWindow=globalThis.window,priorDocument=globalThis.document;
  globalThis.window=windowMock;globalThis.document={addEventListener(){},removeEventListener(){}};
  const Component=load(source,{react,'next/link':{default:'a'},'next/navigation':{useRouter:()=>({push:path=>{pushed=path;},refresh(){}})},'@/lib/commercial/request-intake':intake,'@/lib/commercial/demo-workspace-client':{getDemoRequest:()=>record,saveDemoRequest:(payload,settings)=>{saved={payload,settings};return {id:settings.id};}}}).RequestIntakeWorkspacePolished;
  function render(){cursor=0;return Component(props);}
  try{render();for(const effect of effects)effect();for(const timer of timers)timer();mounted=true;}finally{globalThis.window=priorWindow;globalThis.document=priorDocument;}
  return {render,saved:()=>saved,pushed:()=>pushed};
}
function nodes(value){if(!value||typeof value!=='object')return [];if(Array.isArray(value))return value.flatMap(nodes);return [value,...nodes(value.props?.children)];}
function textOf(node){return typeof node==='string'?node:Array.isArray(node)?node.map(textOf).join(''):node?.props?textOf(node.props.children):'';}

test('demo editing prefills saved positions and can save the same entity with its workflow metadata',async()=>{
  const board={id:'demo-local-1',workflowStageCode:'negotiation',status:'review',proposalVersion:3,archivedAt:null};
  const payload={title:'Персонал на склад',clientId:'client',source:'manual',location:'Москва, склад',regionId:null,startDate:'2026-10-12',durationText:'3 месяца',vatMode:'with_vat',comments:'Сохранённая заметка',ownerUserId:'owner',observerUserIds:[],intake:{},roles:[{id:'role-1',specialtyName:'Комплектовщик',specialtyId:'specialty-1',count:12,schedule:{},requirements:{experienceMode:'required'},targetClientRate:720}]};
  const editor=harness({options,demo:true,demoRequestId:board.id},{id:board.id,payload,board});
  const tree=editor.render();
  assert.match(textOf(tree),/Редактирование заявки/);
  assert.doesNotMatch(textOf(tree),/Новая заявка/);
  const fields=nodes(tree).filter(node=>node.type==='input');
  assert.ok(fields.some(node=>node.props.value===payload.title));
  assert.ok(fields.some(node=>node.props.value==='Комплектовщик'));
  assert.ok(fields.some(node=>node.props.value===12));
  const save=nodes(tree).find(node=>node.type==='button'&&textOf(node)==='Сохранить изменения');
  await save.props.onClick();
  assert.equal(editor.saved().settings.id,board.id);
  assert.equal(editor.saved().settings.base.workflowStageCode,board.workflowStageCode);
  assert.equal(editor.saved().settings.base.proposalVersion,board.proposalVersion);
  assert.equal(editor.saved().payload.roles[0].id,'role-1');
  assert.equal(editor.saved().payload.roles[0].requirements.experienceMode,'required');
  assert.equal(editor.saved().payload.intake.provision.housing.provider,'unknown');
  assert.equal(editor.pushed(),'/requests?demo=demo-local-1');
});

test('missing demo draft shows unavailable state without allowing a blank save',()=>{
  const editor=harness({options,demo:true,demoRequestId:'demo-local-missing'},null);
  const tree=editor.render();
  assert.match(textOf(tree),/Не удалось загрузить заявку/);
  assert.equal(nodes(tree).filter(node=>node.type==='input').length,0);
  assert.equal(nodes(tree).filter(node=>node.type==='button'&&/Сохранить/.test(textOf(node))).length,0);
  assert.equal(editor.saved(),undefined);
});

test('seed request stays populated when no local override exists',()=>{
  const request={id:'seed',title:'Сохранённая заявка',clientId:'client',source:'manual',location:'Склад',schedule:{},roles:[{id:'role',specialtyId:'specialty',specialty:'Грузчик',count:4,schedule:{},requirements:{},targetClientRate:null}]};
  const editor=harness({options,demo:true,demoRequestId:'seed',request,intake:intake.emptyRequestIntake()},null);
  const tree=editor.render();
  assert.match(textOf(tree),/Редактирование заявки/);
  assert.ok(nodes(tree).some(node=>node.type==='input'&&node.props.value==='Грузчик'));
});

test('stage-only demo override keeps seed role identifiers and detailed intake',async()=>{
  const request={id:'seed',title:'Сохранённая заявка',clientId:'client',source:'manual',location:'Склад',schedule:{},roles:[{id:'seed-role',specialtyId:'seed-specialty',specialty:'Грузчик',count:4,schedule:{},requirements:{},targetClientRate:null}]};
  const initialIntake=intake.emptyRequestIntake();initialIntake.contact.phone='+79991234567';
  const payload={...request,observerUserIds:[],intake:{},roles:[{specialtyName:'Грузчик',count:4,schedule:{},requirements:{},targetClientRate:null}]};
  const editor=harness({options,demo:true,demoRequestId:'seed',request,intake:initialIntake},{id:'seed',payload,board:{id:'seed',workflowStageCode:'negotiation'}});
  const tree=editor.render();
  const save=nodes(tree).find(node=>node.type==='button'&&textOf(node)==='Сохранить изменения');
  await save.props.onClick();
  assert.equal(editor.saved().payload.intake.contact.phone,initialIntake.contact.phone);
  assert.equal(editor.saved().payload.roles[0].id,'seed-role');
  assert.equal(editor.saved().payload.roles[0].specialtyId,'seed-specialty');
});

test('real existing request sends PATCH for the original ID and retains saved role IDs',async()=>{
  const request={id:'existing-request',title:'Сохранённая заявка',clientId:'client',source:'manual',location:'Склад',schedule:{},roles:[{id:'saved-role',specialtyId:'specialty',specialty:'Грузчик',count:4,schedule:{},requirements:{},targetClientRate:650}]};
  const editor=harness({options,request,intake:intake.emptyRequestIntake()},null);
  const save=nodes(editor.render()).find(node=>node.type==='button'&&textOf(node)==='Сохранить изменения');
  const priorFetch=globalThis.fetch;let sent;
  globalThis.fetch=async(url,settings)=>{sent={url,settings};return {ok:true,json:async()=>({id:request.id})};};
  try{await save.props.onClick();}finally{globalThis.fetch=priorFetch;}
  assert.equal(sent.url,'/api/requests/existing-request/v2');
  assert.equal(sent.settings.method,'PATCH');
  const payload=JSON.parse(sent.settings.body);
  assert.equal(payload.title,request.title);
  assert.equal(payload.roles[0].id,'saved-role');
  assert.equal(payload.roles[0].targetClientRate,650);
  assert.equal(editor.pushed(),'/requests/existing-request');
});

const intakeServer=load('lib/commercial/request-intake-server.ts',{
  '@/lib/access/server':{},'@/lib/core/access.mjs':{},'@/lib/db/client':{},'@/lib/commercial/public-request-token-directory':{},'@/lib/commercial/service':{},'@/lib/commercial/request-intake':intake,
});
const legacy={client:'Старый клиент',location:'Склад № 2',schedule:{pattern:'6/1',presenceHours:12,paidHours:11},lunchPaid:true,housingRule:'Заказчик',travelRule:'Мы',shuttleRule:'Автобус от метро по согласованию',ppeRule:'Заказчик / Мы',medicalRule:'Мы / Заказчик',citizenshipRule:'РФ и ЕАЭС по требованиям клиента',toolsRule:'Не требуется'};

test('empty stored intake prefills legacy schedule, conditions and free-text requirements',()=>{
  const result=intakeServer.normalizeStoredRequestIntake({},legacy);
  assert.equal(result.companyName,legacy.client);
  assert.equal(result.object.siteName,legacy.location);
  assert.equal(result.schedule.pattern,'6/1');
  assert.equal(result.schedule.paidHours,11);
  assert.equal(result.schedule.lunchPaid,true);
  assert.equal(result.provision.housing.provider,'client');
  assert.equal(result.provision.workwear.provider,'client');
  assert.equal(result.provision.ppe.provider,'us');
  assert.equal(result.provision.shuttle.comment,legacy.shuttleRule);
  assert.equal(result.compliance.comment,legacy.citizenshipRule);
});

test('stored explicit false, null and empty values override legacy fallback',()=>{
  const result=intakeServer.normalizeStoredRequestIntake({companyName:'',schedule:{pattern:'',paidHours:null,lunchPaid:false},provision:{housing:{provider:'unknown',comment:''}},compliance:{workerCategories:[],comment:''}},legacy);
  assert.equal(result.companyName,'');
  assert.equal(result.schedule.pattern,'');
  assert.equal(result.schedule.paidHours,null);
  assert.equal(result.schedule.lunchPaid,false);
  assert.equal(result.provision.housing.provider,'unknown');
  assert.equal(result.compliance.comment,'');
  assert.deepEqual(result.compliance.workerCategories,[]);
  assert.equal(result.schedule.presenceHours,12);
});

test('legacy custom schedule labels survive as an explicit custom pattern',()=>{
  const result=intakeServer.normalizeStoredRequestIntake({}, {...legacy,schedule:{label:'Вахта 45/15'}});
  assert.equal(result.schedule.pattern,'custom');
  assert.equal(result.schedule.customPattern,'Вахта 45/15');
});
