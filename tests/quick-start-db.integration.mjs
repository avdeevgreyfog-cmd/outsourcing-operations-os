// Disposable PGlite, actual route SQL under NOSUPERUSER/NOBYPASSRLS.
// Never reads DATABASE_URL. Not evidence of native driver or concurrent transactions.
import {PGlite} from '@electric-sql/pglite';
import {citext} from '@electric-sql/pglite/contrib/citext';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createRequire} from 'node:module';
import postgres from 'postgres';
import * as access from '../lib/core/access.mjs';
const require=createRequire(import.meta.url),native=process.argv.includes('--native');
// Fixed disposable local endpoint; external DATABASE_URL is deliberately ignored.
const connection=native?postgres('postgresql://ubuntu@127.0.0.1:55439/operis_acceptance',{max:8,prepare:false,onnotice:()=>{}}):null;
const nativeHandle=sql=>({nativeSql:sql,exec:q=>sql.unsafe(q),query:async(q,args=[])=>( {rows:await sql.unsafe(q,args)} )});
const pg=native?{...nativeHandle(connection),transaction:fn=>connection.begin(tx=>fn(nativeHandle(tx))),close:()=>connection.end()}:new PGlite({extensions:{citext,pgcrypto,btree_gist}});
const org='00000000-0000-4000-8000-000000000001',user='10000000-0000-4000-8000-000000000001',foreign='00000000-0000-4000-8000-000000000002';
class AccessDeniedError extends Error{}
let actor;
const caps=['worker.edit','operations.object.create','operations.shift.edit','operations.shift.read','operations.object.edit','time.time_entry.edit','sales.client.create','sales.client.read','organization.manage','admin.permissions.manage','time.timesheet.submit'];
const fullActor={organizationId:org,userId:user,demo:false,teamIds:[],access:{capabilities:caps,denies:[],scopes:Object.fromEntries(caps.map(c=>[c,[{type:'all_org',ids:[]}]]))}};
actor=fullActor;
const fixturePhone=()=>'+7999'+String(parseInt(crypto.randomUUID().replaceAll('-','').slice(0,8),16)%10000000).padStart(7,'0');
const phone=fixturePhone(),importPhone=fixturePhone(),parallelPhone=fixturePhone(),racePhone=fixturePhone();
let savepoint=0;
function adapter(tx){const sql=tx.nativeSql?((parts,...values)=>tx.nativeSql(parts,...values)):async(parts,...values)=>(await tx.query(parts.reduce((q,part,i)=>q+(i?'$'+i:'')+part,''),values)).rows;sql.json=tx.nativeSql?tx.nativeSql.json:JSON.stringify;sql.unsafe=tx.nativeSql?tx.nativeSql.unsafe:async(q,args=[])=>(await tx.query(q,args)).rows;sql.begin=async fn=>{const name='quick_start_'+(++savepoint);await tx.exec('SAVEPOINT '+name);try{const result=await fn(sql);await tx.exec('RELEASE SAVEPOINT '+name);return result}catch(e){await tx.exec('ROLLBACK TO SAVEPOINT '+name);throw e}};return sql;}
const withTenant=(o,u,fn)=>pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE quick_start_runtime');await tx.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true)",[o,u]);return fn(adapter(tx));});
const deps={'next/server':{NextResponse:{json:(b,o)=>Response.json(b,o)}},'@/lib/auth/server':{getCurrentActor:async()=>actor},'@/lib/access/server':{AccessDeniedError,requireCapability(a,c){if(!access.hasCapability(a.access,c))throw new AccessDeniedError(c)}},'@/lib/core/access.mjs':access,'@/lib/db/client':{withTenant},'@/lib/operations/launch-checklist':{defaultPrimarySiteVisitChecklist:()=>[]}};
function compile(path){const exports={};new Function('exports','require',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>deps[n]??require(n));return exports;}
async function post(path,body,id){const response=await compile(path).POST(new Request('http://isolated.test/api',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),id?{params:Promise.resolve({id})}:undefined);return {status:response.status,body:await response.json()};}
try{
 if(!native)for(const name of fs.readdirSync('migrations').filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort())await pg.exec(fs.readFileSync('migrations/'+name,'utf8'));
 await pg.exec(`DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='quick_start_runtime') THEN CREATE ROLE quick_start_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS; END IF; END $$; GRANT USAGE ON SCHEMA public TO quick_start_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO quick_start_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO quick_start_runtime; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO quick_start_runtime;`);
 deps['@/lib/operations/object-management']={getObjectManagementOptions:()=>{throw new Error('not used by POST')}};
 deps['@/lib/operations/object-manager-options']=compile('lib/operations/object-manager-options.ts');
 for(const kind of ['client','legalEntity','region']){const name='QA inline '+kind+' '+crypto.randomUUID();const first=await post('app/api/objects/options/route.ts',{kind,name});assert.equal(first.status,201,JSON.stringify(first.body));const duplicate=await post('app/api/objects/options/route.ts',{kind,name:'  '+name.toUpperCase().replaceAll(' ','   ')+'  '});assert.equal(duplicate.status,409,JSON.stringify(duplicate.body));assert.equal(duplicate.body.duplicates[0].id,first.body.id);}
 console.log('PASS inline client/legal entity/region creation and normalized duplicate warning');
 const objectResult=await post('app/api/objects/route.ts',{name:'Симферопольское / Боброво',status:'active'});assert.equal(objectResult.status,201,JSON.stringify(objectResult.body));const object=objectResult.body.id;
 const [row]=await withTenant(org,user,s=>s`SELECT client_company_id,legal_entity_id,region_id,address_text,actual_start_date,target_start_date,status,owner_user_id FROM objects WHERE id=${object}::uuid`);assert.deepEqual(row,{client_company_id:null,legal_entity_id:null,region_id:null,address_text:null,actual_start_date:null,target_start_date:null,status:'active',owner_user_id:null});
 assert.equal((await withTenant(org,user,s=>s`SELECT id FROM launches WHERE object_id=${object}::uuid`)).length,0);
 const workerResult=await post('app/api/workers/route.ts',{fullName:'Исторический Иван'});assert.equal(workerResult.status,201,JSON.stringify(workerResult.body));const worker=workerResult.body.workerId;
 const [w]=await withTenant(org,user,s=>s`SELECT status,phone,onboarding_metadata FROM worker_profiles WHERE id=${worker}::uuid`);assert.equal(w.status,'requires_assignment');assert.equal(w.phone,null);assert.equal(w.onboarding_metadata.startDate,null);assert.equal(w.onboarding_metadata.relationType,null);
 for(const table of ['worker_object_assignments','employment_relations','worker_rates','time_entries','worker_timesheet_links']){const count=await pg.query('SELECT count(*)::int count FROM '+table+' WHERE worker_id=$1',[worker]);assert.equal(count.rows[0].count,0,table);}
 assert.equal((await withTenant(foreign,user,s=>s`SELECT id FROM objects WHERE id=${object}::uuid`)).length,0);
 assert.equal((await withTenant(foreign,user,s=>s`SELECT id FROM worker_profiles WHERE id=${worker}::uuid`)).length,0);
 const [foreignUser]=await pg.query('SELECT user_id FROM organization_memberships WHERE organization_id=$1 LIMIT 1',[foreign]).then(r=>r.rows);assert.ok(foreignUser);
 const [foreignObject]=await pg.query("INSERT INTO objects(organization_id,name,code,status,created_by_user_id) VALUES($1,'Foreign QA object',$2,'active',$3) RETURNING id",[foreign,'QA-'+crypto.randomUUID().slice(0,8),foreignUser.user_id]).then(r=>r.rows);assert.ok(foreignObject);
 await assert.rejects(()=>withTenant(org,user,s=>s`UPDATE worker_profiles SET onboarding_metadata=${s.json({objectId:foreignObject.id})}::jsonb WHERE id=${worker}::uuid`),/another organization/);
 const denied=await post('app/api/workers/route.ts',{fullName:'Другой контур',objectId:foreignObject.id});assert.equal(denied.status,403);
 deps['@/lib/data/service']={listObjects:a=>withTenant(a.organizationId,a.userId,s=>s`SELECT id,id "objectId",organization_id "organizationId",owner_user_id "ownerUserId",region_id "regionId" FROM objects`),listWorkers:a=>withTenant(a.organizationId,a.userId,s=>s`SELECT w.id,w.status,w.full_name "fullName",a.object_id "objectId",w.organization_id "organizationId",o.owner_user_id "ownerUserId" FROM worker_profiles w LEFT JOIN worker_object_assignments a ON a.worker_id=w.id AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date) LEFT JOIN objects o ON o.id=a.object_id`)};
 process.env.SESSION_SECRET='disposable-quick-start-fixture';const portal=compile('lib/operations/worker-timesheet-portal.ts');await assert.rejects(()=>portal.editWorkerLink(fullActor,object,worker,'create'),/не назначен/);
 const [specialty]=await withTenant(org,user,s=>s`SELECT id FROM specialties WHERE active LIMIT 1`);assert.ok(specialty);
 let transfer=await post('app/api/workers/[id]/transfer/route.ts',{objectId:object,specialtyId:specialty.id,effectiveFrom:'2026-01-01'},worker);assert.equal(transfer.status,500);assert.match(transfer.body.error,/менеджер/);
 await withTenant(org,user,s=>s`UPDATE objects SET owner_user_id=${user}::uuid WHERE id=${object}::uuid`);
 transfer=await post('app/api/workers/[id]/transfer/route.ts',{objectId:object,specialtyId:specialty.id,effectiveFrom:'2026-01-01',workMode:null},worker);assert.equal(transfer.status,201,JSON.stringify(transfer.body));
 const [assigned]=await withTenant(org,user,s=>s`SELECT w.status,a.effective_from::text start,a.work_mode FROM worker_profiles w JOIN worker_object_assignments a ON a.worker_id=w.id WHERE w.id=${worker}::uuid`);assert.equal(assigned.status,'active');assert.equal(assigned.start,'2026-01-01');assert.equal(assigned.work_mode,null);
 const link=await portal.editWorkerLink(fullActor,object,worker,'create');assert.ok(link.path,'assigned employee receives personal link');
 const created=await post('app/api/workers/route.ts',{fullName:'Имя до дубля',phone});assert.equal(created.status,201);
 const duplicate=await post('app/api/workers/route.ts',{fullName:'Переименовать нельзя',phone});assert.equal(duplicate.status,409);
 const [original]=await withTenant(org,user,s=>s`SELECT full_name FROM worker_profiles WHERE id=${created.body.workerId}::uuid`);assert.equal(original.full_name,'Имя до дубля');
 actor={...fullActor,access:{capabilities:[],denies:[],scopes:{}}};assert.equal((await post('app/api/workers/route.ts',{fullName:'Нет прав'})).status,403);actor=fullActor;
 deps['@/lib/operations/quick-start-import']=compile('lib/operations/quick-start-import.ts');
 const path='app/api/operations/quick-start/import/route.ts';
 const payload={objects:[{key:'o',id:object,name:'Симферопольское / Боброво'}],workers:[{key:'w',fullName:'QA импорт',phone:importPhone}],assignments:[{worker:'w',object:'o',specialtyId:specialty.id,startDate:'2026-01-01'}],hours:[{worker:'w',object:'o',date:'2026-01-02',hours:10,kind:'day'}]};
 const preview=await post(path,{action:'preview',payload});assert.equal(preview.status,200,JSON.stringify(preview.body));assert.equal(preview.body.canCommit,true,JSON.stringify(preview.body.issues));
 assert.equal((await withTenant(org,user,s=>s`SELECT id FROM worker_profiles WHERE phone=${importPhone}`)).length,0,'preview does not write');
 assert.equal((await post(path,{action:'commit',payload,digest:'0'.repeat(64)})).status,409,'invalid preview refuses commit');
 const imported=await post(path,{action:'commit',payload,digest:preview.body.digest});assert.equal(imported.status,200,JSON.stringify(imported.body));assert.equal(imported.body.hours,1);
 const [fact]=await withTenant(org,user,s=>s`SELECT w.full_name,w.status,t.fact_hours::float8 hours,a.work_mode FROM worker_profiles w JOIN worker_object_assignments a ON a.worker_id=w.id JOIN time_entries t ON t.worker_id=w.id WHERE w.phone=${importPhone}`);assert.deepEqual(fact,{full_name:'QA импорт',status:'active',hours:10,work_mode:null});
 const repeated=await post(path,{action:'preview',payload});assert.equal(repeated.status,200);assert.equal(repeated.body.canCommit,false,'historical fact never overwritten');assert.ok(repeated.body.issues.some(i=>/перезапись/.test(i.message)));
 const repeatedWithoutHours={...payload,hours:[]};const again=await post(path,{action:'preview',payload:repeatedWithoutHours});assert.equal(again.body.canCommit,true,JSON.stringify(again.body.issues));const replay=await post(path,{action:'commit',payload:repeatedWithoutHours,digest:again.body.digest});assert.equal(replay.status,200,JSON.stringify(replay.body));assert.equal(replay.body.workers,0);assert.equal(replay.body.assignments,0);
 const badStatus=await post(path,{action:'preview',payload:{workers:[{key:'bad',fullName:'Нельзя действующий без назначения',status:'active'}]}});assert.equal(badStatus.body.canCommit,false);
 const empty=await post(path,{action:'preview',payload:{workers:[{key:'bad',fullName:'  '}]}});assert.equal(empty.status,400);
 console.log('PASS import actual API/SQL: preview read-only, stale digest refused, 10 historical hours preserved, repeated import reuses IDs and refuses facts, status conflict, required minimum');
 if(native){
  const concurrentPayload={workers:[{key:'parallel',fullName:'QA concurrent '+crypto.randomUUID(),phone:parallelPhone}]};
  const check=await post(path,{action:'preview',payload:concurrentPayload});assert.equal(check.body.canCommit,true,JSON.stringify(check.body));
  const results=await Promise.all([post(path,{action:'commit',payload:concurrentPayload,digest:check.body.digest}),post(path,{action:'commit',payload:concurrentPayload,digest:check.body.digest})]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const [count]=await withTenant(org,user,s=>s`SELECT count(*)::int count FROM worker_profiles WHERE phone=${parallelPhone}`);assert.equal(count.count,1,'concurrent import creates one profile');
  const directPhone=racePhone,directPayload={workers:[{key:'race',fullName:'QA shared phone '+crypto.randomUUID(),phone:directPhone}]};
  const beforeRace=await post(path,{action:'preview',payload:directPayload});assert.equal(beforeRace.body.canCommit,true);
  const race=await Promise.all([post('app/api/workers/route.ts',{fullName:directPayload.workers[0].fullName,phone:directPhone}),post(path,{action:'commit',payload:directPayload,digest:beforeRace.body.digest})]);
  assert.equal(race.filter(r=>r.status===201||r.status===200).length,1,'one direct/import creation succeeds');assert.equal(race.filter(r=>r.status===409).length,1,'other detects changed/duplicate state');
  const [raceCount]=await withTenant(org,user,s=>s`SELECT count(*)::int count FROM worker_profiles WHERE phone=${directPhone}`);assert.equal(raceCount.count,1);
  console.log('PASS native concurrent direct creation versus import: one persisted worker, duplicate/stale second request rejected');
  const waitForBlocked=async n=>{for(let i=0;i<200;i++){const [{count}]=await connection`SELECT count(*)::int count FROM pg_stat_activity WHERE datname='operis_acceptance' AND wait_event_type='Lock'`;if(count>=n)return;await new Promise(r=>setTimeout(r,25))}throw Error('native requests did not reach lock barrier')};
  const [firstAssigned]=await connection`SELECT worker_id FROM worker_object_assignments WHERE object_id=${object}::uuid ORDER BY worker_id LIMIT 1`;
  for(const [day,importFirst] of [['2026-01-03',false],['2026-01-04',true]]){
   const hoursPayload={hours:[{worker,object,date:day,hours:10,kind:'day'}]};const checked=await post(path,{action:'preview',payload:hoursPayload});assert.equal(checked.body.canCommit,true,JSON.stringify(checked.body));
   let release,locked;const ready=new Promise(r=>locked=r),gate=new Promise(r=>release=r);
   const blocker=connection.begin(async tx=>{await tx`SELECT id FROM worker_profiles WHERE id=${firstAssigned.worker_id}::uuid FOR UPDATE`;locked();await gate});await ready;
   const finalize=()=>post('app/api/timesheets/workflow/route.ts',{action:'finalize',objectId:object,periodStart:day,periodEnd:day});const importHours=()=>post(path,{action:'commit',payload:hoursPayload,digest:checked.body.digest});let first,second;
   try{first=importFirst?importHours():finalize();await waitForBlocked(1);second=importFirst?finalize():importHours();await waitForBlocked(2)}finally{release();await blocker}
   const results=await Promise.all([first,second]),snapshot=results[importFirst?1:0],importedHours=results[importFirst?0:1];assert.equal(snapshot.status,201,JSON.stringify(snapshot.body));assert.equal(importedHours.status,importFirst?200:409,JSON.stringify(importedHours.body));
   const [snapshotData]=await connection`SELECT snapshot_json FROM timesheet_snapshots WHERE id=${snapshot.body.internalSnapshotId}::uuid`;assert.equal(snapshotData.snapshot_json.hours,importFirst?10:0);
   const [{count}]=await connection`SELECT count(*)::int count FROM time_entries WHERE worker_id=${worker}::uuid AND object_id=${object}::uuid AND work_date=${day}::date`;assert.equal(count,importFirst?1:0);
  }
  console.log('PASS native real workflow finalize/import races: fixed-first rejects import409 and keeps zero; import-first snapshot captures10, no stale frozen totals');
  const contexts=await Promise.all([org,foreign].map(tenant=>withTenant(tenant,user,async s=>(await s`SELECT current_setting('app.organization_id') organization`)[0].organization)));assert.deepEqual(contexts,[org,foreign]);
  console.log('PASS native PostgreSQL concurrency: two same-preview commits serialize, one succeeds/one stale409, one worker; concurrent tenant contexts isolated');
 }
 console.log('PASS quick start isolated PostgreSQL: object/worker null preservation, no launch/assignments/hours/links, RLS invisibility, metadata tenant integrity, cross-tenant refusal, manager gate, first assignment/status, duplicate no overwrite, capability');
}finally{await pg.close()}
