// Disposable embedded PostgreSQL. Never reads DATABASE_URL or external customer data.
// Uses actual service/exit SQL and RLS with a non-superuser role. Auth is injected;
// object/worker catalog projections read the real fixture DB. This does not test
// browser authentication, a production driver, or concurrent server connections.
import {PGlite} from '@electric-sql/pglite';
import {citext} from '@electric-sql/pglite/contrib/citext';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import fs from 'node:fs';
import nodePath from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {createRequire} from 'node:module';
import * as access from '../lib/core/access.mjs';
const require=createRequire(import.meta.url);
const pg=new PGlite({extensions:{citext,pgcrypto,btree_gist}});
try{
 for(const name of fs.readdirSync('migrations').filter(n=>/^\d{4}_.*\.sql$/.test(n)).sort()){
  await pg.exec(fs.readFileSync('migrations/'+name,'utf8'));
 }
 console.log('SCHEMA_READY');
 await pg.exec('CREATE ROLE portal_test_runtime NOLOGIN NOSUPERUSER NOBYPASSRLS; GRANT USAGE ON SCHEMA public TO portal_test_runtime; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO portal_test_runtime; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_test_runtime; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO portal_test_runtime;');
 const org='00000000-0000-4000-8000-000000000001',director='10000000-0000-4000-8000-000000000001';
 const query=async(q,args=[])=> (await pg.query(q,args)).rows;
 const [fixture]=await query(`SELECT w.id worker,a.object_id object,a.specialty_id specialty,o.owner_user_id manager FROM worker_profiles w JOIN worker_object_assignments a ON a.worker_id=w.id JOIN objects o ON o.id=a.object_id WHERE w.organization_id=$1 AND w.status='active' AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date) LIMIT 1`,[org]);assert.ok(fixture);
 const [dates]=await query(`SELECT (now() AT TIME ZONE 'Europe/Moscow')::date::text today,((now() AT TIME ZONE 'Europe/Moscow')::date-1)::text yesterday,((now() AT TIME ZONE 'Europe/Moscow')::date+1)::text tomorrow`);
 function adapter(handle){const sql=async(parts,...args)=> (await handle.query(parts.reduce((q,part,i)=>q+(i?'$'+i:'')+part,''),args)).rows;sql.json=v=>JSON.stringify(v);return sql;}
 const withTenant=(organizationId,userId,fn)=>pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE portal_test_runtime');await tx.query("SELECT set_config('app.organization_id',$1,true),set_config('app.user_id',$2,true)",[organizationId,userId]);return fn(adapter(tx));});
 const raw=adapter(pg);raw.begin=fn=>pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE portal_test_runtime');return fn(adapter(tx));});
 class AccessDeniedError extends Error{}
 const auth={AccessDeniedError,requireCapability(a,c){if(!access.hasCapability(a.access,c))throw new AccessDeniedError(c);}};
 const listObjects=a=>withTenant(a.organizationId,a.userId,sql=>sql`SELECT id,id "objectId",organization_id "organizationId",owner_user_id "ownerUserId",region_id "regionId" FROM objects`);
 const listWorkers=a=>withTenant(a.organizationId,a.userId,sql=>sql`SELECT w.id,w.status,w.full_name "fullName",a.object_id "objectId",w.organization_id "organizationId",o.owner_user_id "ownerUserId" FROM worker_profiles w JOIN worker_object_assignments a ON a.worker_id=w.id JOIN objects o ON o.id=a.object_id WHERE a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)`);
 const deps={'@/lib/access/server':auth,'@/lib/core/access.mjs':access,'@/lib/db/client':{db:()=>raw,withTenant},'@/lib/data/service':{listObjects,listWorkers}};
 const modules=new Map();
 function compile(file){file=nodePath.resolve(file);if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);new Function('exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,n=>{if(n in deps)return deps[n];if(n.startsWith('@/')||n.startsWith('.')){const base=n.startsWith('@/')?nodePath.resolve(n.slice(2)):nodePath.resolve(nodePath.dirname(file),n);const target=[base,base+'.ts',base+'.mjs',base+'/index.ts'].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile());if(!target)throw Error('Missing dependency '+n+' from '+file);return target.endsWith('.mjs')?require(target):compile(target)}return require(n)});return exports;}
 const portal=compile('lib/operations/worker-timesheet-portal.ts');deps['@/lib/operations/worker-timesheet-portal']=portal;const planning=compile('lib/operations/employee-planning.ts');
 const caps=['operations.shift.edit','operations.shift.read','time.time_entry.edit','worker.offboarding.manage'];
 const actor={organizationId:org,userId:director,demo:false,access:{capabilities:caps,denies:[],scopes:Object.fromEntries(caps.map(c=>[c,[{type:'all_org'}]]))}};
 const manager={...actor,userId:fixture.manager,access:{...actor.access,scopes:Object.fromEntries(caps.map(c=>[c,[{type:'assigned_to_me'}]]))}};
 process.env.SESSION_SECRET='disposable-embedded-postgres-fixture';
 const issue=()=>portal.editWorkerLink(actor,fixture.object,fixture.worker,'create');
 const [runtimeRole]=await withTenant(org,director,sql=>sql`SELECT current_user role,(SELECT rolsuper FROM pg_roles WHERE rolname=current_user) superuser`);assert.equal(runtimeRole.role,'portal_test_runtime');assert.equal(runtimeRole.superuser,false);
 const first=await issue(),token=first.path.split('/').at(-1);assert.ok(await portal.employeePortal(token));assert.equal(await portal.employeePortal('invalid'),null);assert.equal(await portal.employeePortal('A'.repeat(40)),null);
 assert.equal((await portal.editWorkerLink(manager,fixture.object,fixture.worker,'copy')).path,first.path);
 await withTenant(org,director,async sql=>{await sql`DELETE FROM time_entries WHERE worker_id=${fixture.worker}::uuid AND work_date BETWEEN ${dates.yesterday}::date AND ${dates.tomorrow}::date`;await sql`DELETE FROM shift_assignments WHERE worker_id=${fixture.worker}::uuid AND shift_id IN(SELECT id FROM shifts WHERE shift_date BETWEEN ${dates.yesterday}::date AND ${dates.tomorrow}::date)`;await sql`UPDATE timesheet_snapshots SET status='draft' WHERE object_id=${fixture.object}::uuid`;
 });
 deps['@/lib/auth/server']={getCurrentActor:async()=>manager};const shiftRoute=compile('app/api/objects/[id]/shift-plan/route.ts');const planned=await shiftRoute.POST(new Request('http://isolated.test/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'set_cells',cells:[dates.yesterday,dates.tomorrow].map(date=>({workerId:fixture.worker,date,kind:'day'}))})}),{params:Promise.resolve({id:fixture.object})});assert.equal(planned.status,200,await planned.text());
 const calendar=await planning.employeePlanning(token);assert.equal(calendar.days.find(d=>d.date===dates.tomorrow).kind,'day');await portal.submitEmployeeReply(token,{date:dates.tomorrow,response:'working',kind:'day'});await assert.rejects(()=>portal.submitEmployeeReply(token,{date:dates.tomorrow,hours:11}),/после завершения/);
 const changePlan=async kind=>{const r=await shiftRoute.POST(new Request('http://isolated.test/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'set_cell',workerId:fixture.worker,date:dates.tomorrow,kind})}),{params:Promise.resolve({id:fixture.object})});assert.equal(r.status,200,await r.text())};
 const assignmentStatus=async()=>{const [a]=await withTenant(org,director,sql=>sql`SELECT sa.confirmation_status status FROM shift_assignments sa JOIN shifts sh ON sh.id=sa.shift_id WHERE sa.worker_id=${fixture.worker}::uuid AND sh.object_id=${fixture.object}::uuid AND sh.shift_date=${dates.tomorrow}::date AND sa.confirmation_status<>'cancelled' LIMIT 1`);return a?.status};
 assert.equal(await assignmentStatus(),'confirmed','employee reply updates assignment confirmation');
 await portal.submitEmployeeReply(token,{date:dates.tomorrow,response:'cannot_work',reason:'Test fixture: cannot attend',kind:'day'});assert.equal(await assignmentStatus(),'declined');await portal.submitEmployeeReply(token,{date:dates.tomorrow,response:'working',kind:'day'});assert.equal(await assignmentStatus(),'confirmed');
 await changePlan('day');assert.equal((await portal.managerPortalData(manager,fixture.object)).reports.find(r=>r.workerId===fixture.worker&&r.date===dates.tomorrow).needsReconfirmation,false,'same plan keeps reply');assert.equal(await assignmentStatus(),'confirmed','same plan preserves assignment confirmation');
 await changePlan('night');let changed=(await portal.managerPortalData(manager,fixture.object)).reports.find(r=>r.workerId===fixture.worker&&r.date===dates.tomorrow);assert.equal(changed.needsReconfirmation,true,'new kind needs fresh confirmation');
 const night=(await planning.employeePlanning(token)).days.find(d=>d.date===dates.tomorrow);assert.equal(night.kind,'night');assert.equal(night.startTime,'20:00');assert.equal(night.endTime,'08:00');assert.equal(night.endsNextDay,true,'night ends on following local date');
 await portal.submitEmployeeReply(token,{date:dates.tomorrow,response:'working',kind:'night'});assert.equal((await portal.managerPortalData(manager,fixture.object)).reports.find(r=>r.workerId===fixture.worker&&r.date===dates.tomorrow).needsReconfirmation,false);
 await changePlan('off');assert.equal((await portal.managerPortalData(manager,fixture.object)).reports.find(r=>r.workerId===fixture.worker&&r.date===dates.tomorrow).needsReconfirmation,true);
 await changePlan('reserve_day');await assert.rejects(()=>portal.submitEmployeeReply(token,{date:dates.tomorrow,response:'working',kind:'day'}),/резерв/);
 await changePlan('day');await portal.submitEmployeeReply(token,{date:dates.tomorrow,response:'working',kind:'day'});
 console.log('PASS plan changes: same shift, day/night reconfirmation, local night clock, off, reserve');
 await portal.submitEmployeeReply(token,{date:dates.yesterday,response:'working',kind:'day'});
 await withTenant(org,director,sql=>sql`UPDATE shifts SET shift_kind='night' WHERE object_id=${fixture.object}::uuid AND shift_date=${dates.yesterday}::date`);await assert.rejects(()=>portal.submitEmployeeReply(token,{date:dates.yesterday,hours:10,reason:'Фактическая продолжительность 10 часов'}),/План смены изменён/);
 await withTenant(org,director,sql=>sql`UPDATE shifts SET shift_kind='day' WHERE object_id=${fixture.object}::uuid AND shift_date=${dates.yesterday}::date`);
 await withTenant(org,director,sql=>sql`UPDATE shift_assignments SET is_reserve=true WHERE worker_id=${fixture.worker}::uuid AND shift_id IN(SELECT id FROM shifts WHERE shift_date=${dates.yesterday}::date)`);await assert.rejects(()=>portal.submitEmployeeReply(token,{date:dates.yesterday,hours:10,reason:'Фактическая продолжительность 10 часов'}),/Вы в резерве/);
 await withTenant(org,director,sql=>sql`UPDATE shift_assignments SET is_reserve=false WHERE worker_id=${fixture.worker}::uuid AND shift_id IN(SELECT id FROM shifts WHERE shift_date=${dates.yesterday}::date)`);
 await portal.submitEmployeeReply(token,{date:dates.yesterday,hours:10,reason:'Фактическая продолжительность 10 часов'});
 let entries=await withTenant(org,director,sql=>sql`SELECT fact_hours::float8 hours,source FROM time_entries WHERE worker_id=${fixture.worker}::uuid AND work_date=${dates.yesterday}::date`);
 assert.equal(entries.some(e=>e.source==='worker_report'),false,'employee hours must not become time entry');
 let managerData=await portal.managerPortalData(manager,fixture.object);
 assert.equal(managerData.reports.find(r=>r.workerId===fixture.worker&&r.date===dates.yesterday).hours,10);
 assert.equal(managerData.reports.find(r=>r.workerId===fixture.worker&&r.date===dates.yesterday).reviewStatus,'pending');
 await portal.submitEmployeeReply(token,{date:dates.yesterday,response:'working',kind:'day'});
 assert.equal((await portal.employeePortal(token)).reports.find(r=>r.date===dates.yesterday).hours,10);
 await withTenant(org,director,sql=>sql`UPDATE time_entries SET source='manual',time_code='WORK',fact_hours=9,day_hours=9 WHERE worker_id=${fixture.worker}::uuid AND work_date=${dates.yesterday}::date`);
 await portal.submitEmployeeReply(token,{date:dates.yesterday,hours:11,reason:'Корректировка сотрудника'});
 entries=await withTenant(org,director,sql=>sql`SELECT fact_hours::float8 hours FROM time_entries WHERE worker_id=${fixture.worker}::uuid AND work_date=${dates.yesterday}::date`);
 assert.equal(entries[0].hours,9,'existing manager fact must not change on employee resubmission');
 await assert.rejects(()=>portal.reviewEmployeeHours(actor,fixture.object,fixture.worker,dates.yesterday,true,11),/уже внесены менеджером/);
 await portal.reviewEmployeeHours(actor,fixture.object,fixture.worker,dates.yesterday,true,9,'Сверено по данным объекта');
 entries=await withTenant(org,director,sql=>sql`SELECT fact_hours::float8 hours,source FROM time_entries WHERE worker_id=${fixture.worker}::uuid AND work_date=${dates.yesterday}::date`);
 assert.equal(entries[0].hours,9);assert.equal(entries[0].source,'manual');
 const [approvedReport]=await withTenant(org,director,sql=>sql`SELECT approved_hours::float8 hours,review_status status FROM worker_shift_reports WHERE worker_id=${fixture.worker}::uuid AND work_date=${dates.yesterday}::date`);
 assert.equal(approvedReport.status,'approved');assert.equal(approvedReport.hours,9);
 await assert.rejects(()=>portal.submitEmployeeReply(token,{date:dates.yesterday,hours:12,reason:'Повторное уточнение'}),/согласована/);
 const deniedBatch=await shiftRoute.POST(new Request('http://isolated.test/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'set_cells',cells:[{workerId:fixture.worker,date:dates.tomorrow,kind:'night'},{workerId:fixture.worker,date:dates.yesterday,kind:'clear'}]})}),{params:Promise.resolve({id:fixture.object})});assert.equal(deniedBatch.status,500);assert.match((await deniedBatch.json()).error,/факт/);assert.equal((await planning.employeePlanning(token)).days.find(d=>d.date===dates.tomorrow).kind,'day','failed batch rolls back earlier cell');assert.equal((await portal.managerPortalData(manager,fixture.object)).reports.find(r=>r.workerId===fixture.worker&&r.date===dates.tomorrow).needsReconfirmation,false,'failed batch keeps prior confirmation');
 const [snapshot]=await withTenant(org,director,sql=>sql`INSERT INTO timesheet_snapshots(organization_id,object_id,view_type,period_type,period_start,period_end,status,snapshot_json) VALUES(${org}::uuid,${fixture.object}::uuid,'internal','month',date_trunc('month',${dates.tomorrow}::date)::date,(date_trunc('month',${dates.tomorrow}::date)+interval '1 month'-interval '1 day')::date,'fixed','{}'::jsonb) RETURNING id`);assert.ok(snapshot);
 const lockedPlan=await shiftRoute.POST(new Request('http://isolated.test/plan',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'set_cell',workerId:fixture.worker,date:dates.tomorrow,kind:'off'})}),{params:Promise.resolve({id:fixture.object})});assert.equal(lockedPlan.status,500);assert.match((await lockedPlan.json()).error,/зафиксирован/);await withTenant(org,director,sql=>sql`UPDATE timesheet_snapshots SET status='draft' WHERE id=${snapshot.id}::uuid`);
 console.log('PASS protected plan: recorded fact, fixed period and atomic batch rollback');
 const reconciled=await portal.reconcileEmployeeHours(actor,fixture.object,dates.yesterday,dates.yesterday);assert.equal(reconciled.accepted,0);
 await portal.editWorkerLink(actor,fixture.object,fixture.worker,'pause');assert.equal(await portal.employeePortal(token),null);await assert.rejects(()=>portal.submitEmployeeReply(token,{date:dates.tomorrow,response:'working',kind:'day'}));
 await portal.editWorkerLink(actor,fixture.object,fixture.worker,'resume');assert.ok(await portal.employeePortal(token));
 const rotated=await portal.editWorkerLink(actor,fixture.object,fixture.worker,'rotate');let newToken=rotated.path.split('/').at(-1);assert.equal(await portal.employeePortal(token),null);assert.ok(await portal.employeePortal(newToken));
 const other={...actor,userId:'10000000-0000-4000-8000-000000000002',access:{...actor.access,scopes:Object.fromEntries(caps.map(c=>[c,[{type:'assigned_to_me'}]]))}};await assert.rejects(()=>portal.editWorkerLink(other,fixture.object,fixture.worker,'copy'),AccessDeniedError);
 const foreignOrg='00000000-0000-4000-8000-000000000099';assert.equal((await withTenant(foreignOrg,director,sql=>sql`SELECT id FROM worker_timesheet_links WHERE worker_id=${fixture.worker}::uuid`)).length,0);
 await assert.rejects(()=>withTenant(org,director,async sql=>{await sql`UPDATE worker_timesheet_links SET status='paused' WHERE worker_id=${fixture.worker}::uuid AND status='active'`;throw Error('rollback probe');}),/rollback probe/);assert.ok(await portal.employeePortal(newToken));
 await portal.editWorkerLink(actor,fixture.object,fixture.worker,'revoke');await assert.rejects(()=>portal.editWorkerLink(actor,fixture.object,fixture.worker,'resume'),/ссылка не найдена/);assert.equal(await portal.employeePortal(newToken),null);newToken=(await issue()).path.split('/').at(-1);assert.ok(await portal.employeePortal(newToken));
 deps['@/lib/auth/server']={getCurrentActor:async()=>actor};const exit=compile('app/api/workers/[id]/exit/route.ts');
 const callExit=body=>exit.POST(new Request('http://isolated.test/exit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),{params:Promise.resolve({id:fixture.worker})});
 const plannedExit=await callExit({action:'plan',effectiveDate:dates.tomorrow,reasonCode:'employee_request',replacementRequired:false,returnToRecruiting:false});assert.equal(plannedExit.status,201,await plannedExit.text());assert.ok(await portal.employeePortal(newToken));
 const completed=await callExit({action:'complete',effectiveDate:dates.today,reasonCode:'employee_request',returnToRecruiting:false});assert.equal(completed.status,201,await completed.text());assert.equal(await portal.employeePortal(newToken),null);
 const revoked=await withTenant(org,director,sql=>sql`SELECT status FROM worker_timesheet_links WHERE worker_id=${fixture.worker}::uuid`);assert.ok(revoked.every(l=>l.status==='revoked'));
 await withTenant(org,director,sql=>sql`UPDATE worker_profiles SET status='active' WHERE id=${fixture.worker}::uuid`);assert.equal(await portal.employeePortal(newToken),null);
 console.log('PASS PostgreSQL SQL/RLS/rollback: issue, manager plan route, calendar, confirmation, hours, manual protection, reconcile, pause/resume, rotate, assigned scope, foreign tenant, dismissal');
}finally{await pg.close();}
