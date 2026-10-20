import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {canReadRow,hasCapability} from '../lib/core/access.mjs';
import {validateTenderLaunchPricing} from '../lib/tenders/handoff.mjs';
const nativeRequire=createRequire(import.meta.url);
function load(path,deps={}){
  const code=ts.transpileModule(fs.readFileSync(new URL('../'+path,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const exports={};new Function('exports','require',code)(exports,name=>name in deps?deps[name]:nativeRequire(name));return exports;
}
const dates=load('lib/tenders/datetime.ts');
test('Moscow deadline input roundtrips across browser timezones and preserves original precision',()=>{
  const previous=process.env.TZ;
  try{for(const zone of ['UTC','Europe/Moscow','America/New_York']){
    process.env.TZ=zone;
    assert.equal(dates.tenderDateTimeInput('2026-10-05T18:30:42.123Z'),'2026-10-05T21:30');
    assert.equal(dates.tenderDateTimeIso('2026-10-05T21:30','2026-10-05T18:30:42.123Z'),'2026-10-05T18:30:42.123Z');
    assert.equal(dates.tenderDateTimeIso('2026-10-06T09:15'),'2026-10-06T06:15:00.000Z');
    assert.equal(dates.formatTenderDateTime('2026-10-05T18:30:00Z'),'05.10.2026 21:30 МСК');
  }}finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
test('deadline input rejects invalid calendar values and accepts explicit clear',()=>{
  for(const value of ['2026-02-30T09:00','2026-13-01T09:00','invalid'])assert.equal(dates.tenderDateTimeIso(value),null);
  assert.equal(dates.tenderDateTimeIso(''),null);
  assert.equal(dates.tenderDateTimeInput('invalid'),'');
});
const id='a1000000-0000-4000-8000-000000000001';
class AccessDeniedError extends Error{}
function actor(capabilities=['sales.tender.read','sales.tender.edit']){
  return {demo:false,userId:'user',organizationId:'org',membershipId:'member',teamIds:[],access:{capabilities,scopes:Object.fromEntries(capabilities.map(cap=>[cap,[{type:'all_org',ids:[]}]]))}};
}
const auth={AccessDeniedError,requireCapability(a,cap){if(!hasCapability(a.access,cap))throw new AccessDeniedError(cap);}};
function patchFixture({caps,result=null,rowDenied=false}={}){
  const a=actor(caps),writes=[];
  let conditions={legacy:'keep',subject:'before'};
  const tx=async(strings,...values)=>{
    const query=strings.join('?');
    if(query.startsWith('SELECT updated_at'))return [{organizationId:rowDenied?'other':'org',ownerUserId:'user',createdByUserId:'user',stage:'analysis',result,updatedAt:'v1'}];
    if(query.includes('SELECT EXISTS'))return [{ok:true}];
    if(query.startsWith('UPDATE tenders')){
      writes.push(query);
      if(query.includes('conditions_json=conditions_json ||'))conditions={...conditions,...values[1]};
      return [];
    }
    if(query.includes('INSERT INTO activity_events')){writes.push(query);return [];}
    throw Error('Unexpected SQL '+query);
  };
  tx.json=value=>value;
  const api=load('app/api/tenders/[id]/route.ts',{
    'next/server':{NextResponse:{json:(body,{status=200}={})=>({body,status})}},
    '@/lib/auth/server':{getCurrentActor:async()=>a},'@/lib/access/server':auth,
    '@/lib/commercial/edit-conflict':load('lib/commercial/edit-conflict.ts'),'@/lib/commercial/edit-history':load('lib/commercial/edit-history.ts'),'@/lib/tenders/model':load('lib/tenders/model.ts'),'@/lib/tenders/trading.mjs':{calculateTenderBidEconomics:async()=>{throw Error('Unexpected tender bid economics calculation in entity safety fixture');}},'@/lib/core/access.mjs':{canReadRow},'@/lib/db/client':{withTenant:async(org,user,cb)=>cb(tx)},
  });
  return {writes,conditions:()=>conditions,patch:body=>api.PATCH(new Request('http://localhost/api/tenders/'+id,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id})})};
}
test('edit-only users cannot set or clear results through nonterminal stage changes',async()=>{
  for(const [current,next] of [[null,'won'],['won',null]]){
    const f=patchFixture({result:current});const response=await f.patch({action:'stage',stage:'analysis',result:next});
    assert.equal(response.status,403);assert.equal(f.writes.length,0);
  }
});
test('ordinary stage movement preserves an existing result without requiring result capability',async()=>{
  const f=patchFixture({result:'won'});const response=await f.patch({action:'stage',stage:'calculation',result:'won'});
  assert.equal(response.status,200);assert.equal(f.writes.length,2);
});
test('result permission permits explicit outcome change and edit scope blocks all writes',async()=>{
  const f=patchFixture({caps:['sales.tender.edit','sales.tender.result']});
  assert.equal((await f.patch({action:'stage',stage:'analysis',result:'won'})).status,200);
  const denied=patchFixture({rowDenied:true});assert.equal((await denied.patch({action:'analysis',conditions:{subject:'new'}})).status,403);assert.equal(denied.writes.length,0);
});
test('analysis save merges submitted fields while retaining additional stored conditions',async()=>{
  const f=patchFixture();assert.equal((await f.patch({action:'analysis',conditions:{subject:'after'}})).status,200);
  assert.deepEqual(f.conditions(),{legacy:'keep',subject:'after'});
});
function serviceFixture({readCalculations=false,ownOnly=false}={}){
  const a=actor(['sales.tender.read',...(readCalculations?['calculation.scenario.read']:[])]);
  if(ownOnly)a.access.scopes['calculation.scenario.read']=[{type:'own_created',ids:[]}];
  let calculationQueries=0;
  const sql=async(strings)=>{
    const query=strings.join('?');
    if(query.includes('WHERE t.archived_at IS NULL'))return [{id,organizationId:'org',ownerUserId:'user',createdByUserId:'user',teamId:null,regionId:null,clientId:null}];
    if(query.includes('SELECT conditions_json conditions'))return [{conditions:{},submissionChecklist:[]}];
    if(query.includes('FROM calculations calc')){
      calculationQueries++;
      return ['user','other'].map((creator,i)=>({id:'calc'+i,scenarioId:'scenario'+i,organizationId:'org',ownerUserId:'user',createdByUserId:creator,roleId:'role',role:'Работа',name:'Сценарий',status:'draft',clientRate:100,clientRateGross:122,marginPct:20,billingUnit:'hour',model:'Модель'}));
    }
    return [];
  };
  const service=load('lib/tenders/service.ts',{'@/lib/access/server':auth,'@/lib/core/access.mjs':{canReadRow,hasCapability},'@/lib/db/client':{withTenant:async(org,user,cb)=>cb(sql)}});
  return {read:()=>service.getTender(a,id),queries:()=>calculationQueries};
}
test('tender details never query or return economics without scenario read capability',async()=>{
  const f=serviceFixture();const row=await f.read();assert.deepEqual(row.calculations,[]);assert.equal(f.queries(),0);
});
test('tender economics obey scenario row scope and omit internal permission metadata',async()=>{
  const f=serviceFixture({readCalculations:true,ownOnly:true});const row=await f.read();assert.equal(f.queries(),1);assert.equal(row.calculations.length,1);assert.equal(row.calculations[0].scenarioId,'scenario0');assert.equal('createdByUserId' in row.calculations[0],false);
});


function bidFixture({caps=['sales.tender.read','sales.tender.edit','sales.tender.submit'],stage='submitted',rowDenied=false}={}){
  const a=actor(caps),writes=[];
  const secretEconomics={status:'complete',revenueNet:100000,totalCostNet:70000,marginPct:30,vatPct:20,missing:[],sources:[{scenarioId:'hidden-scenario'}]};
  const tx=async(strings,...values)=>{
    const query=strings.join('?');
    if(query.includes('SELECT organization_id'))return [{organizationId:rowDenied?'other':'org',ownerUserId:'user',createdByUserId:'user',teamId:null,regionId:null,clientId:null,stage}];
    if(query.includes('SELECT COALESCE(max(round_number)'))return [{nextRound:2}];
    if(query.includes('INSERT INTO tender_bid_rounds')){writes.push(query);return [{id:'round-2',roundNumber:2,bidValue:90000,occurredAt:'2026-10-07T18:00:00Z'}];}
    if(query.includes('UPDATE tenders')){writes.push(query);return [];}
    if(query.includes('INSERT INTO activity_events')){writes.push(query);return [];}
    throw Error('Unexpected SQL '+query);
  };
  tx.json=value=>value;
  const api=load('app/api/tenders/[id]/bids/route.ts',{
    'next/server':{NextResponse:{json:(body,{status=200}={})=>({body,status})}},
    '@/lib/auth/server':{getCurrentActor:async()=>a},
    '@/lib/access/server':auth,
    '@/lib/core/access.mjs':{canReadRow},
    '@/lib/db/client':{withTenant:async(org,user,cb)=>cb(tx)},
    '@/lib/tenders/trading.mjs':{calculateTenderBidEconomics:async()=>secretEconomics},
  });
  return {writes,post:body=>api.POST(new Request('http://localhost/api/tenders/'+id+'/bids',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id})})};
}
test('bid round API stores server economics without returning sensitive snapshot',async()=>{
  const f=bidFixture();
  const response=await f.post({bidValue:90000,priceVatMode:'with_vat',reference:'step-2'});
  assert.equal(response.status,201);
  assert.equal(response.body.roundNumber,2);
  assert.equal('economics' in response.body,false);
  assert.equal(f.writes.length,3);
});
test('bid round API requires submit capability, edit row scope and submitted stage',async()=>{
  const noSubmit=bidFixture({caps:['sales.tender.read','sales.tender.edit']});
  assert.equal((await noSubmit.post({bidValue:90000,priceVatMode:'without_vat'})).status,403);
  assert.equal(noSubmit.writes.length,0);
  const denied=bidFixture({rowDenied:true});
  assert.equal((await denied.post({bidValue:90000,priceVatMode:'without_vat'})).status,403);
  assert.equal(denied.writes.length,0);
  const early=bidFixture({stage:'calculation'});
  const response=await early.post({bidValue:90000,priceVatMode:'without_vat'});
  assert.equal(response.status,500);
  assert.match(response.body.error,/после подачи/i);
  assert.equal(early.writes.length,0);
});

function launchFixture({caps=['sales.tender.read','sales.tender.launch'],rowDenied=false,stage='completed',result='won',clientId='client',regionId='region'}={}){
  const a=actor(caps),writes=[];
  const tx=async(strings)=>{
    const query=strings.join('?');
    if(query.includes('FROM tenders t WHERE t.id='))return [{tenderId:id,organizationId:rowDenied?'other':'org',clientId,regionId,legalEntityId:null,ownerUserId:'user',createdByUserId:'user',teamId:null,title:'Tender',stage,result,conditions:{}}];
    writes.push(query);
    throw Error('Unexpected write/read after launch preconditions: '+query);
  };
  tx.json=value=>value;
  const sql=Object.assign(tx,{begin:async cb=>cb(tx)});
  const api=load('app/api/tenders/[id]/launch/route.ts',{
    'next/server':{NextResponse:{json:(body,{status=200}={})=>({body,status})}},
    '@/lib/auth/server':{getCurrentActor:async()=>a},
    '@/lib/access/server':auth,
    '@/lib/core/access.mjs':{canReadRow},
    '@/lib/db/client':{withTenant:async(org,user,cb)=>cb(sql)},
    '@/lib/operations/launch-checklist':{defaultPrimarySiteVisitChecklist:()=>[]},
    '@/lib/tenders/handoff.mjs':{validateTenderLaunchPricing},
  });
  return {writes,post:body=>api.POST(new Request('http://localhost/api/tenders/'+id+'/launch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body??{})}),{params:Promise.resolve({id})})};
}
test('won tender handoff requires launch capability before database writes',async()=>{
  const f=launchFixture({caps:['sales.tender.read']});
  const response=await f.post({});
  assert.equal(response.status,403);
  assert.equal(f.writes.length,0);
});
test('won tender handoff enforces row scope and terminal won result before downstream writes',async()=>{
  const denied=launchFixture({rowDenied:true});
  assert.equal((await denied.post({})).status,403);
  assert.equal(denied.writes.length,0);
  const lost=launchFixture({result:'lost'});
  const lostResponse=await lost.post({});
  assert.equal(lostResponse.status,500);
  assert.match(lostResponse.body.error,/Выиграли/);
  assert.equal(lost.writes.length,0);
  const active=launchFixture({stage:'awaiting_result',result:null});
  const activeResponse=await active.post({});
  assert.equal(activeResponse.status,500);
  assert.match(activeResponse.body.error,/Выиграли/);
  assert.equal(active.writes.length,0);
});
test('won tender handoff requires linked client and region before downstream writes',async()=>{
  const noClient=launchFixture({clientId:null});
  const clientResponse=await noClient.post({});
  assert.equal(clientResponse.status,500);
  assert.match(clientResponse.body.error,/клиент/i);
  assert.equal(noClient.writes.length,0);
  const noRegion=launchFixture({regionId:null});
  const regionResponse=await noRegion.post({});
  assert.equal(regionResponse.status,500);
  assert.match(regionResponse.body.error,/регион/i);
  assert.equal(noRegion.writes.length,0);
});
