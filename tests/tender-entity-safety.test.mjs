import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {canReadRow,hasCapability} from '../lib/core/access.mjs';
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
    if(query.startsWith('SELECT organization_id'))return [{organizationId:rowDenied?'other':'org',ownerUserId:'user',createdByUserId:'user',stage:'analysis',result}];
    if(query.includes('SELECT EXISTS'))return [{ok:true}];
    if(query.startsWith('UPDATE tenders')){
      writes.push(query);
      if(query.includes('conditions_json=conditions_json ||'))conditions={...conditions,...values[1]};
      return [];
    }
    if(query.startsWith('INSERT INTO activity_events')){writes.push(query);return [];}
    throw Error('Unexpected SQL '+query);
  };
  tx.json=value=>value;
  const api=load('app/api/tenders/[id]/route.ts',{
    'next/server':{NextResponse:{json:(body,{status=200}={})=>({body,status})}},
    '@/lib/auth/server':{getCurrentActor:async()=>a},'@/lib/access/server':auth,
    '@/lib/tenders/model':load('lib/tenders/model.ts'),'@/lib/core/access.mjs':{canReadRow},'@/lib/db/client':{withTenant:async(org,user,cb)=>cb(tx)},
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
