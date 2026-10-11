import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as access from '../lib/core/access.mjs';

// Route regression tests with SQL doubles; PostgreSQL behavior is not simulated.
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),user=id(2),workerId=id(3),date='2026-10-10';
function harness(periods){
  const state=structuredClone(periods),queries=[],writes=[],events=[];
  const actor={organizationId:org,userId:user,demo:false,teamIds:[],orgUnitIds:[],regionIds:[],access:{capabilities:['worker.offboarding.manage'],denies:[],scopes:{'worker.offboarding.manage':[{type:'all_org',ids:[]}]}}};
  const sql=async(strings,...values)=>{
    const text=strings.join('?');queries.push({text,values});
    if(text.includes('FROM worker_profiles w'))return [{id:workerId,fullName:'Рабочий',objectId:null,specialtyId:null,ownerUserId:null,regionId:null,assigneeUserIds:[]}];
    if(text.includes('current_date future'))return [{future:false}];
    if(text.includes('FROM employment_relations'))return structuredClone(state.filter(p=>p.effectiveTo===null||p.effectiveTo>date));
    if(text.trim().startsWith('SELECT'))return [];
    writes.push({text,values});
    if(text.includes('INSERT INTO worker_exit_processes'))return [{id:id(20)}];
    if(text.includes('UPDATE employment_relations')){for(const p of state)if(p.effectiveFrom<=date&&(p.effectiveTo===null||p.effectiveTo>date))p.effectiveTo=date;}
    if(text.includes('INSERT INTO activity_events'))events.push({text,values,metadata:values.at(-1)});
    return [];
  };
  sql.json=v=>v;sql.begin=fn=>fn(sql);
  class AccessDeniedError extends Error{}
  const deps={
    '@/lib/auth/server':{async getCurrentActor(){return actor;}},
    '@/lib/access/server':{AccessDeniedError,requireCapability(a,c){if(!access.hasCapability(a.access,c))throw new AccessDeniedError(c);}},
    '@/lib/core/access.mjs':access,
    '@/lib/db/client':{async withTenant(tenant,who,fn){assert.equal(tenant,org);assert.equal(who,user);return fn(sql);}},
    'next/server':{NextResponse:{json(body,{status=200}={}){return new Response(JSON.stringify(body),{status});}}},
  };
  const compiled=ts.transpileModule(fs.readFileSync(path.join(root,'app/api/workers/[id]/exit/route.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const route={};new Function('exports','require',compiled)(route,name=>deps[name]??require(name));
  return {state,queries,writes,events,complete:()=>route.POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({action:'complete',effectiveDate:date,reasonCode:'project_end',reason:'Проект завершён',returnToRecruiting:false})}),{params:Promise.resolve({id:workerId})})};
}
const period=(n,from,to)=>({id:id(n),relationType:'gph',effectiveFrom:from,effectiveTo:to,contractReference:'ГПХ'});

test('exit rejects a future employment period before all mutations and preserves the record',async()=>{
  for(const to of [null,'2026-12-01']){
    const initial=[period(5,'2026-10-11',to)],h=harness(initial),response=await h.complete();
    assert.equal(response.status,409);assert.match((await response.json()).error,/будущий период/);
    assert.deepEqual(h.state,initial);assert.equal(h.writes.length,0);
    assert.match(h.queries[0].text,/FOR UPDATE OF w/);
  }
});

test('exit truncates open and later-ending periods with before/after event, preserving closed history',async()=>{
  const initial=[period(5,'2026-09-01','2026-09-30'),period(6,'2026-10-01',null),period(7,'2026-10-02','2026-10-31')];
  const h=harness(initial),response=await h.complete();assert.equal(response.status,201);
  assert.deepEqual(h.state[0],initial[0]);assert.equal(h.state[1].effectiveTo,date);assert.equal(h.state[2].effectiveTo,date);
  assert.deepEqual(h.state.map(p=>p.id),initial.map(p=>p.id));
  const event=h.events.find(e=>e.text.includes("'employment_period_closed'"));assert.ok(event);
  assert.deepEqual(event.metadata.before,initial.slice(1));assert.deepEqual(event.metadata.after,h.state.slice(1));
  assert.equal(event.metadata.reason,'Проект завершён');
  const update=h.writes.find(q=>q.text.includes('UPDATE employment_relations'));
  assert.match(update.text,/organization_id/);assert.ok(update.values.includes(org));
  assert.match(update.text,/effective_to IS NULL OR effective_to>/);
  assert.equal(h.writes.some(q=>q.text.includes('DELETE FROM employment_relations')),false);
});
