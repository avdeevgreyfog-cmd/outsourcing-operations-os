import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {createRequire} from 'node:module';
import * as access from '../lib/core/access.mjs';
const require=createRequire(import.meta.url),id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const org=id(1),user=id(2),worker=id(3),object=id(4);
function compile(file,deps){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>deps[n]??require(n));return exports;}
class AccessDeniedError extends Error{}
function harness({entry=null,assigned=null}={}){const links=[],directory=[],queries=[];let employed=true;
 const report={response:'working',shiftKind:'night',hours:null};
 const sql=async(strings,...values)=>{const q=strings.join('?');queries.push(q);
  if(q.includes('set_config'))return [];
  if(q.includes('FROM public_worker_timesheet_tokens'))return directory.filter(x=>x.hash===values[0]).map(x=>({tenantId:org,actorUserId:user,linkId:x.link}));
  if(q.includes('FROM worker_profiles w'))return employed?[{id:worker}]:[];
  if(q.includes('FROM employee_portal_config_overrides')||q.includes('FROM object_shift_reporting_settings WHERE')||q.includes('FROM objects o'))return [];
  if(q.includes('FROM worker_timesheet_links WHERE organization_id=')){
    return links.filter(l=>['active','paused'].includes(l.status)).slice(-1).map(l=>({id:l.id,status:l.status,ciphertext:l.ciphertext,valid:true}));
  }
  if(q.includes('SELECT l.id FROM worker_timesheet_links'))return links.filter(l=>l.id===values[0]&&values[1]===org&&l.hash===values[2]&&l.status==='active').map(l=>({id:l.id}));
  if(q.includes('SELECT l.worker_id'))return [{workerId:worker,objectId:object,owner:'manager',localToday:new Date().toISOString().slice(0,10),deadline:'22:00',timezone:'Europe/Moscow',paidHours:11,configuration:{}}];
  if(q.includes('FROM worker_shift_reports'))return q.includes('hours_reconciled_at IS NOT NULL')?[]:q.includes('SELECT shift_kind kind')?[{kind:report.shiftKind}]:[{...report}];
  if(q.includes('FROM time_entries'))return entry?[entry]:[];
  if(q.includes('SELECT sh.shift_kind kind'))return assigned?[assigned]:[];
  if(q.includes('FROM timesheet_snapshots')||q.includes('FROM shifts sh')||q.includes('FROM worker_shift_time_changes'))return [];
  if(q.includes('UPDATE worker_shift_reports SET reported_hours=')){report.hours=values[0];return [];}
  if(q.includes('UPDATE time_entries')||q.includes('INSERT INTO time_entries'))return [];
  if(q.includes('INSERT INTO worker_shift_reports')||q.includes('UPDATE worker_shift_reports'))return [];
  if(q.includes('SELECT token_ciphertext'))return links.filter(l=>l.status==='active').slice(-1).map(l=>({ciphertext:l.ciphertext}));
  if(q.includes('UPDATE worker_timesheet_links SET status=\'revoked\'')){links.filter(l=>l.status!=='revoked').forEach(l=>l.status='revoked');return [];}
  if(q.includes('UPDATE worker_timesheet_links SET status=')){links.filter(l=>['active','paused'].includes(l.status)).forEach(l=>l.status=values[0]);return [];} 
  if(q.includes('UPDATE worker_timesheet_links SET replaced_by_link_id='))return [];
  if(q.includes('INSERT INTO worker_timesheet_links')){const l={id:id(10+links.length),hash:values[3],ciphertext:values[4],status:'active'};links.push(l);return [{id:l.id}];}
  if(q.includes('INSERT INTO public_worker_timesheet_tokens')){directory.push({hash:values[0],link:values[3]});return [];}
  throw Error('Unexpected query '+q);
 };sql.begin=fn=>fn(sql);sql.json=x=>x;
 const actor={organizationId:org,userId:user,demo:false,access:{capabilities:['operations.shift.edit'],denies:[],scopes:{'operations.shift.edit':[{type:'all_org'}]}}};
 const config=compile('lib/operations/employee-portal-config.ts',{});
 const service=compile('lib/operations/worker-timesheet-portal.ts',{'@/lib/operations/employee-portal-config':config,'@/lib/access/server':{AccessDeniedError,requireCapability(a,c){if(!access.hasCapability(a.access,c))throw new AccessDeniedError(c);}},'@/lib/core/access.mjs':access,'@/lib/db/client':{db:()=>sql,withTenant:async(o,u,fn)=>{assert.equal(o,org);return fn(sql);}},'@/lib/data/service':{listObjects:async()=>[{id:object,objectId:object,organizationId:org}],listWorkers:async()=>[{id:worker,objectId:object,status:employed?'active':'dismissed'}]}});
 return {service,actor,sql,links,queries,setEmployed:v=>employed=v,run:action=>service.editWorkerLink(actor,object,worker,action)};
}
test('copy preserves token; pause/resume and rotation control access to the exact link',async()=>{
 process.env.SESSION_SECRET='isolated-test-key';const h=harness();const first=await h.run('create'),token=first.path.split('/').at(-1),ref=await h.service.resolveToken(token);
 assert.equal((await h.run('copy')).path,first.path);await h.service.assertEmployeeLinkActive(h.sql,ref,token);
 await assert.rejects(h.service.assertEmployeeLinkActive(h.sql,ref,'x'.repeat(43)),h.service.EmployeePortalAccessError);
 await h.run('pause');await assert.rejects(h.service.assertEmployeeLinkActive(h.sql,ref,token),h.service.EmployeePortalAccessError);
 await h.run('resume');await h.service.assertEmployeeLinkActive(h.sql,ref,token);
 const second=await h.run('rotate');assert.notEqual(second.path,first.path);await assert.rejects(h.service.assertEmployeeLinkActive(h.sql,ref,token),h.service.EmployeePortalAccessError);
 await h.run('revoke');await assert.rejects(h.run('resume'));assert.ok(h.links.every(l=>l.status==='revoked'));
});
test('dismissed worker cannot receive a new link or reactivate an old link',async()=>{process.env.SESSION_SECRET='isolated-test-key';const h=harness();await h.run('create');h.setEmployed(false);await assert.rejects(h.run('resume'));await assert.rejects(h.run('rotate'));assert.equal(h.links.length,1);});
test('malformed public token never reaches the database',async()=>{const h=harness();assert.equal(await h.service.resolveToken('short'),null);assert.equal(h.queries.length,0);});

test('self-reported hours do not alter planned or manually recorded time entries before approval',async()=>{process.env.SESSION_SECRET='isolated-test-key';const date=new Date(Date.now()-86400000).toISOString().slice(0,10);for(const source of ['schedule','manual']){const h=harness({entry:{id:id(30),source,factHours:source==='manual'?8:0,timeCode:source==='manual'?'WORK':'PLANNED'}});const path=(await h.run('create')).path;await h.service.submitEmployeeReply(path.split('/').at(-1),{date,hours:7,reason:'Отработано меньше по факту'});const ledger=h.queries.filter(q=>q.includes('UPDATE time_entries')||q.includes('INSERT INTO time_entries'));assert.equal(ledger.length,0);}});

test('manager-assigned shift kind and reserve cannot be bypassed by employee confirmation',async()=>{process.env.SESSION_SECRET='isolated-test-key';for(const assigned of [{kind:'night',reserve:false},{kind:'day',reserve:true}]){const h=harness({assigned}),token=(await h.run('create')).path.split('/').at(-1);await assert.rejects(h.service.submitEmployeeReply(token,{date:new Date().toISOString().slice(0,10),response:'working',kind:'day'}),h.service.EmployeePortalError);assert.equal(h.queries.some(q=>q.includes('INSERT INTO worker_shift_reports')),false);}});
test('hours-only submission rejects a changed manager shift or reserve assignment',async()=>{
 process.env.SESSION_SECRET='isolated-test-key';const date=new Date(Date.now()-2*86400000).toISOString().slice(0,10);
 for(const assigned of [{kind:'day',reserve:false},{kind:'night',reserve:true}]){
  const h=harness({assigned});const {path}=await h.run('create');const token=path.split('/').at(-1);
  await assert.rejects(()=>h.service.submitEmployeeReply(token,{date,hours:10,reason:'Изменено фактическое время'}),/План смены изменён|Вы в резерве/);
  assert.ok(!h.queries.some(q=>q.includes('UPDATE worker_shift_reports SET reported_hours=')));
 }
});
