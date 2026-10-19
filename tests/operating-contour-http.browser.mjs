// Isolated real Next.js HTTP + postgres.js wire-protocol check. No external DB URL.
import fs from 'node:fs';import https from 'node:https';import http from 'node:http';import {execFileSync,spawn} from 'node:child_process';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {citext} from '@electric-sql/pglite/contrib/citext';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';import {PGLiteSocketServer} from '@electric-sql/pglite-socket';import {chromium} from 'playwright';
const pg=new PGlite({extensions:{citext,pgcrypto,btree_gist}});let socket,server,browser,tls;let serverLog='';const origin='https://localhost:3270',backend='http://127.0.0.1:3268';const certDir=fs.mkdtempSync('/tmp/operis-http-tls-');
try{
 for(const name of fs.readdirSync('migrations').filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort())await pg.exec(fs.readFileSync('migrations/'+name,'utf8'));
 const fixture=(await pg.query(`SELECT u.id manager,u.email::text email,o.slug organization FROM app_users u JOIN organization_memberships m ON m.user_id=u.id JOIN role_templates r ON r.id=m.role_template_id JOIN organizations o ON o.id=m.organization_id WHERE r.code='director' ORDER BY o.id LIMIT 1`)).rows[0];assert.ok(fixture);
 await pg.query(`UPDATE app_users SET password_hash=crypt($1,gen_salt('bf')) WHERE id=$2`,['isolated-http-fixture-password',fixture.manager]);
 const dates=(await pg.query(`SELECT (now() AT TIME ZONE 'Europe/Moscow')::date::text today,((now() AT TIME ZONE 'Europe/Moscow')::date-1)::text yesterday,((now() AT TIME ZONE 'Europe/Moscow')::date+1)::text tomorrow`)).rows[0];

 socket=new PGLiteSocketServer({db:pg,host:'127.0.0.1',port:55449,maxConnections:20});await socket.start();console.log('Isolated SQL socket ready');
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3268'],{env:{...process.env,DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:55449/postgres',DEMO_MODE:'false',SESSION_SECRET:'isolated-http-session-secret'},stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>{serverLog+=d});server.stderr.on('data',d=>{serverLog+=d});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(backend+'/login',{signal:AbortSignal.timeout(1000)})).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'Next server ready');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',certDir+'/key.pem','-out',certDir+'/cert.pem','-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 tls=https.createServer({key:fs.readFileSync(certDir+'/key.pem'),cert:fs.readFileSync(certDir+'/cert.pem')},(req,res)=>{const upstream=http.request(backend+req.url,{method:req.method,headers:{...req.headers,'x-forwarded-proto':'https'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});upstream.on('error',()=>{res.writeHead(502);res.end('Local proxy error')});req.pipe(upstream)});await new Promise(r=>tls.listen(3270,'127.0.0.1',r));
 browser=await chromium.launch({headless:true});const manager=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});const page=await manager.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/login');await page.getByLabel('Организация',{exact:true}).fill(fixture.organization);await page.getByLabel('Электронная почта',{exact:true}).fill(fixture.email);await page.getByLabel('Пароль',{exact:true}).fill('isolated-http-fixture-password');
 const signed=page.waitForResponse(r=>r.url().endsWith('/api/session/login'));await page.getByRole('button',{name:'Войти',exact:true}).click();const loginResponse=await signed;assert.equal(loginResponse.status(),200,'real password login');await loginResponse.finished();await page.waitForURL(origin+'/',{timeout:60000});assert.ok((await manager.cookies()).some(c=>c.name==='oo_session'&&c.secure),'real Secure session cookie');console.log('Real manager login passed');
 const post=async(url,data)=>{const r=await manager.request.post(origin+url,{data});const body=await r.json();assert.ok(r.ok(),url+' status '+r.status()+' '+JSON.stringify(body));return body;};

 const request=async(method,url,data)=>{const r=await manager.request.fetch(origin+url,{method,data});const body=await r.json();assert.ok(r.ok(),url+' status '+r.status()+' '+JSON.stringify(body));return body};
 const object=await post('/api/objects',{name:'Изолированный HTTP объект',status:'active'});assert.ok(object.id);
 const specialty=await post('/api/admin/directories',{kind:'specialty',name:'Изолированная HTTP специальность'});assert.ok(specialty.id);
 const first={specialtyId:specialty.id,shiftKind:'day',schedule:'5/2',startTime:'08:00',endTime:'20:00',shiftDurationHours:12,paidHours:11,paymentUnit:'shift',baseRate:4500,effectiveFrom:null,effectiveTo:null,status:'active'};
 const plan=await post('/api/staffing-plan/targets',{objectId:object.id,specialtyId:specialty.id,plannedCount:3,shiftKind:'day',effectiveFrom:null,effectiveTo:null,status:'active',initialCondition:first});assert.ok(plan.id);
 const [condition]=(await pg.query('SELECT id FROM object_specialty_conditions WHERE object_id=$1 AND specialty_id=$2',[object.id,specialty.id])).rows;assert.ok(condition.id,'combined plan save persists actual condition');
 const historical=await post('/api/workers',{fullName:'Изолированный HTTP исторический сотрудник'});assert.ok(historical.workerId);
 const transfer={objectId:object.id,specialtyId:specialty.id,effectiveFrom:null,dateUnknown:true,shiftKind:'day'};
 await post('/api/workers/'+historical.workerId+'/transfer',transfer);await post('/api/workers/'+historical.workerId+'/transfer',transfer);
 const unknownAssignments=(await pg.query('SELECT effective_from::text start,paid_hours_per_shift::float8 paid FROM worker_object_assignments WHERE worker_id=$1',[historical.workerId])).rows;assert.equal(unknownAssignments.length,1);assert.equal(unknownAssignments[0].start,null);assert.equal(unknownAssignments[0].paid,11);
 const link=await post('/api/operations/worker-confirmations',{action:'create',objectId:object.id,workerId:historical.workerId});assert.ok(link.path,'unknown historical start permits assigned employee access');
 const need=await post('/api/needs',{title:'Изолированная HTTP потребность',objectId:object.id,specialtyId:specialty.id,countRequired:2,shiftKind:'day',sourceKind:'object',staffingPlanTargetId:plan.id});assert.ok(need.id);
 const candidate=await post('/api/candidates',{fullName:'Изолированный HTTP кандидат',needId:need.id});assert.ok(candidate.candidateId);
 await request('PATCH','/api/candidates/'+candidate.candidateId+'/stage',{applicationId:candidate.applicationId,stage:'first_shift',plannedStartDate:'2026-10-13',plannedShiftKind:'day',actualStartAt:'2026-10-13T05:00:00.000Z',reason:'Изолированная проверка подтвержденного выхода',workflow:{firstShiftOutcome:'worked',employmentRelationType:'unspecified',travelState:'not_required'}});
 const [worker]=(await pg.query('SELECT id FROM worker_profiles WHERE origin_candidate_id=$1',[candidate.candidateId])).rows;assert.ok(worker);
 const [assignment]=(await pg.query('SELECT effective_from::text start,paid_hours_per_shift::float8 paid FROM worker_object_assignments WHERE worker_id=$1',[worker.id])).rows;assert.equal(assignment.start,'2026-10-13');assert.equal(assignment.paid,11);
 const series=await post('/api/shifts/series',{objectId:object.id,specialtyId:specialty.id,startDate:'2026-10-13',endDate:'2026-10-13',shiftKind:'day',demandCount:3,workerIds:[worker.id],inheritConditions:true});assert.ok(series);
 const hours={workerId:worker.id,objectId:object.id,workDate:'2026-10-13',value:11,reason:'Изолированный HTTP факт'};
 await request('PATCH','/api/timesheets/entries',hours);await request('PATCH','/api/timesheets/entries',hours);
 const facts=(await pg.query('SELECT fact_hours::float8 hours,compensation_snapshot compensation FROM time_entries WHERE worker_id=$1 AND work_date=$2::date',[worker.id,'2026-10-13'])).rows;assert.equal(facts.length,1);assert.equal(facts[0].hours,11);assert.equal(facts[0].compensation.day.amount,4500);
 const provenance=await request('GET','/api/timesheets/entries?objectId='+object.id+'&month=2026-10');assert.ok(provenance.entries.some(e=>e.hours===11&&e.source==='manual'));assert.ok(provenance.history.length>0);
 const before=JSON.stringify(facts[0].compensation);
 await post('/api/timesheets/workflow',{action:'finalize',objectId:object.id,periodStart:'2026-10-01',periodEnd:'2026-10-31'});
 const snapshots=JSON.stringify((await pg.query('SELECT snapshot_json FROM timesheet_snapshots WHERE object_id=$1 ORDER BY id',[object.id])).rows);
 await post('/api/objects/'+object.id+'/conditions',{...first,schedule:'6/1',baseRate:5000,effectiveFrom:'2026-10-15',supersedesId:condition.id});
 assert.equal(JSON.stringify((await pg.query('SELECT compensation_snapshot compensation FROM time_entries WHERE worker_id=$1 AND work_date=$2::date',[worker.id,'2026-10-13'])).rows[0].compensation),before);
 assert.equal(JSON.stringify((await pg.query('SELECT snapshot_json FROM timesheet_snapshots WHERE object_id=$1 ORDER BY id',[object.id])).rows),snapshots);
 const denied=await manager.request.patch(origin+'/api/timesheets/entries',{data:{...hours,value:12}});assert.ok(denied.status()>=400);
 assert.deepEqual(errors,[]);console.log('PASS isolated HTTP full contour: real Secure password session, object/plan/conditions/need/candidate/conversion/inherited assignment/series/hours/finalize/dated new conditions; no duplicate fact, frozen snapshots preserved. PGlite wire adapter, not native PostgreSQL locking proof.');
}catch(error){console.error(serverLog);throw error}finally{await browser?.close();server?.kill();await new Promise(r=>tls?tls.close(r):r());fs.rmSync(certDir,{recursive:true,force:true});await socket?.stop();await pg.close();}
