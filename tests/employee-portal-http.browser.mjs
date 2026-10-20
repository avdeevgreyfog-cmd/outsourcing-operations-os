// Isolated real Next.js HTTP + postgres.js wire-protocol check. No external DB URL.
import fs from 'node:fs';import https from 'node:https';import http from 'node:http';import {execFileSync,spawn} from 'node:child_process';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {citext} from '@electric-sql/pglite/contrib/citext';import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';import {PGLiteSocketServer} from '@electric-sql/pglite-socket';import {chromium} from 'playwright';
const pg=new PGlite({extensions:{citext,pgcrypto,btree_gist}});let socket,server,browser,tls;let serverLog='';const origin='https://localhost:3220',backend='http://127.0.0.1:3218';const certDir=fs.mkdtempSync('/tmp/operis-http-tls-');
try{
 for(const name of fs.readdirSync('migrations').filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort())await pg.exec(fs.readFileSync('migrations/'+name,'utf8'));
 const fixture=(await pg.query(`SELECT w.id worker,a.object_id object,o.owner_user_id manager,u.email::text email,org.slug organization FROM worker_profiles w JOIN worker_object_assignments a ON a.worker_id=w.id JOIN objects o ON o.id=a.object_id JOIN app_users u ON u.id=o.owner_user_id JOIN organizations org ON org.id=o.organization_id WHERE w.status='active' AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date) ORDER BY w.id LIMIT 1`)).rows[0];assert.ok(fixture);const qaOrganizationId=(await pg.query('SELECT id FROM organizations WHERE slug=$1',[fixture.organization])).rows[0].id;
 await pg.query(`UPDATE app_users SET password_hash=crypt($1,gen_salt('bf')) WHERE id=$2`,['isolated-http-fixture-password',fixture.manager]);
 const dates=(await pg.query(`SELECT (now() AT TIME ZONE 'Europe/Moscow')::date::text today,((now() AT TIME ZONE 'Europe/Moscow')::date-1)::text yesterday,((now() AT TIME ZONE 'Europe/Moscow')::date+1)::text tomorrow`)).rows[0];
 await pg.query(`DELETE FROM time_entries WHERE worker_id=$1 AND work_date BETWEEN $2::date AND $3::date`,[fixture.worker,dates.yesterday,dates.tomorrow]);await pg.query(`UPDATE timesheet_snapshots SET status='draft' WHERE object_id=$1`,[fixture.object]);
 socket=new PGLiteSocketServer({db:pg,host:'127.0.0.1',port:55439,maxConnections:20});await socket.start();console.log('Isolated SQL socket ready');
 server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3218'],{env:{...process.env,DATABASE_URL:'postgresql://postgres:postgres@127.0.0.1:55439/postgres',DEMO_MODE:'false',SESSION_SECRET:'isolated-http-session-secret'},stdio:['ignore','pipe','pipe']});server.stdout.on('data',d=>{serverLog+=d});server.stderr.on('data',d=>{serverLog+=d});
 let ready=false;for(let i=0;i<100;i++){try{if((await fetch(backend+'/login',{signal:AbortSignal.timeout(1000)})).status===200){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'Next server ready');
 execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',certDir+'/key.pem','-out',certDir+'/cert.pem','-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
 tls=https.createServer({key:fs.readFileSync(certDir+'/key.pem'),cert:fs.readFileSync(certDir+'/cert.pem')},(req,res)=>{const upstream=http.request(backend+req.url,{method:req.method,headers:{...req.headers,'x-forwarded-proto':'https'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});upstream.on('error',()=>{res.writeHead(502);res.end('Local proxy error')});req.pipe(upstream)});await new Promise(r=>tls.listen(3220,'127.0.0.1',r));
 browser=await chromium.launch({headless:true});const manager=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});const page=await manager.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/login');await page.getByLabel('Организация',{exact:true}).fill(fixture.organization);await page.getByLabel('Электронная почта',{exact:true}).fill(fixture.email);await page.getByLabel('Пароль',{exact:true}).fill('isolated-http-fixture-password');
 const signed=page.waitForResponse(r=>r.url().endsWith('/api/session/login'));await page.getByRole('button',{name:'Войти',exact:true}).click();const loginResponse=await signed;assert.equal(loginResponse.status(),200,'real password login');await loginResponse.finished();await page.waitForURL(origin+'/',{timeout:60000});assert.ok((await manager.cookies()).some(c=>c.name==='oo_session'&&c.secure),'real Secure session cookie');console.log('Real manager login passed');
 const post=async(url,data)=>{const r=await manager.request.post(origin+url,{data});const body=await r.json();assert.ok(r.ok(),url+' status '+r.status()+' '+JSON.stringify(body));return body;};
 const link=await post('/api/operations/worker-confirmations',{action:'create',objectId:fixture.object,workerId:fixture.worker});assert.ok(link.path);assert.equal(link.expiresAt,null,'full-time employee link has no implicit 30-day expiry');
 const beforePreview=(await pg.query('SELECT last_opened_at employee_opened,last_manager_preview_at manager_preview,expires_at expiry FROM worker_timesheet_links WHERE worker_id=$1 ORDER BY created_at DESC LIMIT 1',[fixture.worker])).rows[0];
 assert.equal(beforePreview.expiry,null);assert.equal(beforePreview.employee_opened,null);
 // Mimic an old automatically generated 30-day expiry, then execute the actual migration
 // against disposable PostgreSQL only. The bearer token and link ID must survive unchanged.
 await pg.query("UPDATE worker_timesheet_links SET expires_at=created_at+interval '30 days' WHERE worker_id=$1 AND status='active'",[fixture.worker]);
 const legacySql=fs.readFileSync('migrations/0082_employee_portal_legacy_expiration.sql','utf8');
 await pg.query(legacySql);
 const legacyAfter=(await pg.query("SELECT expires_at expiry FROM worker_timesheet_links WHERE worker_id=$1 AND status='active'",[fixture.worker])).rows[0];
 assert.equal(legacyAfter.expiry,null,'legacy generated 30-day expiry is removed without rotating token');
 assert.equal((await manager.request.get(origin+link.path)).status(),200,'original bearer token remains valid after migration');

 const preview=await manager.newPage();preview.on('pageerror',e=>errors.push(e.message));
 await preview.goto(origin+'/employee-preview?objectId='+fixture.object+'&workerId='+fixture.worker,{waitUntil:'domcontentloaded',timeout:60000});
 await preview.getByText('Режим предпросмотра менеджера. Действия сотрудника недоступны и не сохраняются.').waitFor();
 await preview.getByText('Рабочая информация',{exact:true}).waitFor({timeout:20000});
 const previewState=(await pg.query('SELECT last_opened_at employee_opened,last_manager_preview_at manager_preview FROM worker_timesheet_links WHERE worker_id=$1 ORDER BY created_at DESC LIMIT 1',[fixture.worker])).rows[0];
 assert.equal(previewState.employee_opened,null,'manager preview cannot count as employee access');assert.ok(previewState.manager_preview,'manager preview must have separate audit');
 assert.equal(await preview.getByRole('button',{name:'Подтвердить выход'}).count(),0);
 const previewAudit=(await pg.query("SELECT count(*)::int count FROM worker_portal_events WHERE worker_id=$1 AND event_type='previewed_by_manager'",[fixture.worker])).rows[0].count;
 assert.equal(previewAudit,1);await preview.close();
 console.log('Permanent link issued and audited manager preview did not touch employee opening');
 await post('/api/objects/'+fixture.object+'/shift-plan',{action:'set_cells',cells:[dates.yesterday,dates.tomorrow].map(date=>({workerId:fixture.worker,date,kind:'day'}))});console.log('Manager plan saved');
 const employee=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:900}});const mobile=await employee.newPage();mobile.on('pageerror',e=>errors.push(e.message));await mobile.goto(origin+link.path+'?layout=mobile',{waitUntil:'networkidle'});assert.ok(await mobile.locator('.worker-self-frame').isVisible());assert.ok(!(await mobile.getByText('Ссылка недействительна или приостановлена',{exact:false}).count()));assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),true,'mobile viewport overflow');
 const desktopContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1440,height:900}});
 const desktop=await desktopContext.newPage();
 desktop.on('pageerror',e=>errors.push(e.message));
 await desktop.goto(origin+link.path+'?layout=desktop',{waitUntil:'networkidle'});
 assert.ok(await desktop.locator('.worker-self-frame').isVisible(),'desktop employee cabinet rendered');
 console.log('Employee mobile and desktop cabinets rendered');
 const demoCabinet=await employee.newPage();demoCabinet.on('pageerror',e=>errors.push(e.message));
 await demoCabinet.goto(origin+'/employee-timesheet/demo',{waitUntil:'networkidle'});
 await demoCabinet.getByRole('button',{name:'Табель'}).last().click();
 const demoTotals=await demoCabinet.locator('.worker-self-totals').innerText();
 assert.match(demoTotals,/План/);assert.match(demoTotals,/Передано сотрудником\s*0 ч/);
 assert.match(demoTotals,/Согласовано менеджером\s*0 ч/);
 assert.match(demoTotals,/Принято в расчёт\s*0 ч/);
 assert.ok((await demoCabinet.getByText('План: 11 ч').count())>0,'demo should show planned hours as plan instead of worked');
 assert.equal(await demoCabinet.getByText('Фактически отработанные часы сотрудником пока не переданы.',{exact:false}).count()>0,true);
 await demoCabinet.close();
 console.log('Demo month renders 11-hour plan and zero confirmed/submitted hours consistently');
 const token=link.path.split('/').at(-1);const publicUrl=origin+'/api/public/worker-timesheet/'+token;
 const futureReply=await employee.request.post(publicUrl,{data:{date:dates.tomorrow,response:'working',kind:'day'}});assert.equal(futureReply.status(),200,await futureReply.text());
 await post('/api/objects/'+fixture.object+'/shift-plan',{action:'set_cell',workerId:fixture.worker,date:dates.tomorrow,kind:'night'});
 const pendingData=await (await manager.request.get(origin+'/api/operations/worker-confirmations?objectId='+fixture.object)).json();assert.equal(pendingData.reports.find(r=>r.workerId===fixture.worker&&r.date===dates.tomorrow).needsReconfirmation,true);console.log('Manager API reports pending reconfirmation');
 await mobile.reload({waitUntil:'networkidle'});await mobile.getByText('Менеджер изменил план. Подтвердите актуальную смену ещё раз.',{exact:true}).waitFor();const reconfirm=mobile.waitForResponse(r=>r.url()===publicUrl&&r.request().method()==='POST');await mobile.getByRole('button',{name:'Подтвердить выход',exact:true}).click();assert.equal((await reconfirm).status(),200);await mobile.getByText('Вы подтвердили выход на эту смену.',{exact:true}).waitFor();console.log('Changed manager plan requires fresh employee confirmation in mobile UI');
 for(const data of [{date:dates.yesterday,response:'working',kind:'day'},{date:dates.yesterday,hours:10,reason:'Фактически десять часов'}]){const r=await employee.request.post(publicUrl,{data});assert.ok(r.ok(),'employee POST '+r.status()+' '+await r.text());}
 const report=await manager.request.get(origin+'/api/operations/worker-confirmations?objectId='+fixture.object);assert.equal(report.status(),200);const body=await report.json();assert.equal(body.reports.find(r=>r.workerId===fixture.worker&&r.date===dates.yesterday).hours,10);console.log('Employee hours visible to manager');
 let entries=(await pg.query('SELECT fact_hours::float8 hours,source FROM time_entries WHERE worker_id=$1 AND work_date=$2::date',[fixture.worker,dates.yesterday])).rows;
 assert.ok(entries.every(e=>e.source!=='worker_report'),'employee hours pending before review');
 await post('/api/operations/worker-confirmations',{action:'review_hours',objectId:fixture.object,workerId:fixture.worker,date:dates.yesterday,approve:true,approvedHours:10,comment:'Сверено менеджером'});
 entries=(await pg.query('SELECT fact_hours::float8 hours,source FROM time_entries WHERE worker_id=$1 AND work_date=$2::date',[fixture.worker,dates.yesterday])).rows;
 assert.equal(entries[0].hours,10);assert.equal(entries[0].source,'manual');
 const lockedReply=await employee.request.post(publicUrl,{data:{date:dates.yesterday,hours:12,reason:'Поздняя корректировка'}});assert.equal(lockedReply.status(),400);assert.match((await lockedReply.json()).error,/согласована/);console.log('Manager-approved hours persisted and protected');
 const approval=await employee.request.get(publicUrl);assert.equal(approval.status(),200);
 const approvedData=await approval.json();
 assert.equal(approvedData.reports.find(r=>r.date===dates.yesterday).reviewStatus,'approved');
 const hoursBefore=(await pg.query('SELECT fact_hours::float8 hours FROM time_entries WHERE worker_id=$1 AND work_date=$2::date',[fixture.worker,dates.yesterday])).rows[0].hours;
 const dispute=await employee.request.post(publicUrl,{data:{action:'dispute_hours',date:dates.yesterday,reason:'hours',comment:'По моим данным смена длилась дольше'}});
 assert.equal(dispute.status(),200,await dispute.text());
 const disputedData=await (await employee.request.get(publicUrl)).json();
 assert.ok(disputedData.disputes.some(d=>d.date===dates.yesterday&&d.status==='open'));
 const managerDisputes=await (await manager.request.get(origin+'/api/operations/worker-confirmations?objectId='+fixture.object)).json();
 const activeDispute=managerDisputes.hourDisputes.find(d=>d.workerId===fixture.worker&&d.date===dates.yesterday);
 assert.ok(activeDispute,'manager receives employee hour dispute');
 assert.equal((await pg.query('SELECT fact_hours::float8 hours FROM time_entries WHERE worker_id=$1 AND work_date=$2::date',[fixture.worker,dates.yesterday])).rows[0].hours,hoursBefore);
 await post('/api/operations/worker-confirmations',{action:'resolve_hours_dispute',objectId:fixture.object,workerId:fixture.worker,disputeId:activeDispute.id,status:'resolved'});
 console.log('Disputed hours create manager case and preserve approved timesheet');
 await post('/api/operations/worker-confirmations',{action:'set_onboarding',objectId:fixture.object,workerId:fixture.worker,stage:'requested',comment:'Передайте СНИЛС менеджеру',showAfterCompleted:false});
 const onboardingData=await (await employee.request.get(publicUrl)).json();
 assert.equal(onboardingData.details.onboarding.stage,'requested');
 assert.equal(onboardingData.config.sections.documents,true);
 assert.ok(onboardingData.details.documents.length>0);
 await post('/api/operations/worker-confirmations',{action:'set_document_status',objectId:fixture.object,workerId:fixture.worker,code:'snils',status:'received'});
 assert.equal((await (await employee.request.get(publicUrl)).json()).details.documents.find(d=>d.code==='snils').status,'received');
 await post('/api/operations/worker-confirmations',{action:'set_onboarding',objectId:fixture.object,workerId:fixture.worker,stage:'completed',comment:null,showAfterCompleted:false});
 const completedData=await (await employee.request.get(publicUrl)).json();
 assert.equal(completedData.config.sections.documents,false);
 assert.deepEqual(completedData.details.documents,[]);
 await post('/api/operations/worker-confirmations',{action:'set_onboarding',objectId:fixture.object,workerId:fixture.worker,stage:'completed',comment:'Нужно обновить СНИЛС',showAfterCompleted:true});
 const manualDocuments=await (await employee.request.get(publicUrl)).json();
 assert.equal(manualDocuments.config.sections.documents,true,'manager can explicitly restore document checklist after onboarding');
 assert.ok(manualDocuments.details.documents.length>0);
 await post('/api/operations/worker-confirmations',{action:'set_onboarding',objectId:fixture.object,workerId:fixture.worker,stage:'completed',comment:null,showAfterCompleted:false});
 console.log('Onboarding and document state visibility independently verified');
 const sizes=await employee.request.post(publicUrl,{data:{action:'sizes',clothingSize:'54',shoeSize:'43',gloveSize:'9',comment:'Нужна куртка посвободнее'}});
 assert.equal(sizes.status(),200,await sizes.text());
 const sizesBody=await (await manager.request.get(origin+'/api/operations/worker-confirmations?objectId='+fixture.object)).json();
 const pendingSize=sizesBody.sizeRequests.find(x=>x.workerId===fixture.worker);
 assert.ok(pendingSize,'manager receives employee PPE size request');
 const workerSizesBefore=(await pg.query('SELECT clothing_size clothing FROM worker_profiles WHERE id=$1',[fixture.worker])).rows[0];
 assert.notEqual(workerSizesBefore.clothing,'54','pending size must not mutate profile');
 await post('/api/operations/worker-confirmations',{action:'review_sizes',objectId:fixture.object,workerId:fixture.worker,requestId:pendingSize.id,approve:true});
 const workerSizesAfter=(await pg.query('SELECT clothing_size clothing,glove_size gloves FROM worker_profiles WHERE id=$1',[fixture.worker])).rows[0];
 assert.equal(workerSizesAfter.clothing,'54');assert.equal(workerSizesAfter.gloves,'9');
 console.log('Manager approval of PPE size changes passed');
 await post('/api/operations/worker-confirmations',{action:'save_portal_configuration',scope:'object',scopeId:fixture.object,objectId:fixture.object,config:{sections:{contacts:false}}});
 assert.equal((await (await employee.request.get(publicUrl)).json()).config.sections.contacts,false,'active link inherits changed object contact visibility');
 await post('/api/operations/worker-confirmations',{action:'save_portal_configuration',scope:'worker',scopeId:fixture.worker,objectId:fixture.object,config:{sections:{contacts:true}}});
 assert.equal((await (await employee.request.get(publicUrl)).json()).config.sections.contacts,true,'worker override wins on active link');
 await post('/api/operations/worker-confirmations',{action:'save_portal_configuration',scope:'object',scopeId:fixture.object,objectId:fixture.object,config:{sections:{}}});
 await post('/api/operations/worker-confirmations',{action:'save_portal_configuration',scope:'worker',scopeId:fixture.worker,objectId:fixture.object,config:{sections:{}}});
 console.log('Existing link inherits object and worker overrides without being reissued');
 await post('/api/operations/worker-confirmations',{action:'save_portal_configuration',scope:'object',scopeId:fixture.object,objectId:fixture.object,config:{managerPhone:'+79990000001',sections:{contacts:true}}});
 const contactEnabled=await (await employee.request.get(publicUrl)).json();assert.equal(contactEnabled.config.sections.contacts,true);assert.equal(contactEnabled.details.managerPhone,'+79990000001');
 await mobile.reload({waitUntil:'networkidle'});assert.equal(await mobile.getByRole('link',{name:'Позвонить менеджеру'}).count(),1);
 assert.equal(await mobile.getByText('Важные контакты',{exact:true}).count(),0);
 await post('/api/operations/worker-confirmations',{action:'save_portal_configuration',scope:'object',scopeId:fixture.object,objectId:fixture.object,config:{sections:{contacts:false}}});
 assert.equal((await (await employee.request.get(publicUrl)).json()).config.sections.contacts,false);
 await mobile.reload({waitUntil:'networkidle'});assert.equal(await mobile.getByRole('link',{name:'Позвонить менеджеру'}).count(),0);
 await post('/api/operations/worker-confirmations',{action:'save_portal_configuration',scope:'object',scopeId:fixture.object,objectId:fixture.object,config:{sections:{}}});
 
 console.log('Contact button obeys inherited visibility and is not duplicated in Profile');
 const qaOrg=qaOrganizationId;
 const adjustmentId=(await pg.query(`INSERT INTO worker_pay_adjustments(organization_id,worker_id,object_id,period_start,period_end,amount,adjustment_type,reason,employee_description,status,created_by_user_id)
 VALUES($1,$2,$3,$4::date,$5::date,123.45,'deduction','Проверяемая корректировка','Тестовое удержание только для QA','review',$6) RETURNING id`,
 [qaOrg,fixture.worker,fixture.object,dates.yesterday,dates.today,fixture.manager])).rows[0].id;
 await post('/api/operations/worker-confirmations',{action:'save_portal_configuration',scope:'object',scopeId:fixture.object,objectId:fixture.object,config:{sections:{payAdjustments:true}}});
 const adjustmentView=await (await employee.request.get(publicUrl)).json();
 assert.equal(adjustmentView.details.adjustments.find(x=>x.id===adjustmentId).status,'review');
 const question=await employee.request.post(publicUrl,{data:{action:'question_adjustment',adjustmentId,question:'Почему указана эта корректировка?'}});
 assert.equal(question.status(),200,await question.text());
 const persistedQuestion=(await pg.query('SELECT count(*)::int count FROM worker_pay_adjustment_questions WHERE adjustment_id=$1',[adjustmentId])).rows[0].count;
 assert.equal(persistedQuestion,1);
 assert.equal((await pg.query('SELECT count(*)::int count FROM worker_accruals WHERE worker_id=$1 AND period_start=$2::date',[fixture.worker,dates.yesterday])).rows[0].count,0,'question must not create accruals');
 await post('/api/operations/worker-confirmations',{action:'save_portal_configuration',scope:'object',scopeId:fixture.object,objectId:fixture.object,config:{sections:{}}});
 console.log('Opt-in adjustment visibility and employee question create no payroll postings');
 await post('/api/operations/worker-confirmations',{action:'pause',objectId:fixture.object,workerId:fixture.worker});assert.equal((await employee.request.get(publicUrl)).status(),404);assert.equal((await employee.request.post(publicUrl,{data:{date:dates.tomorrow,response:'working',kind:'day'}})).status(),403);await mobile.reload({waitUntil:'networkidle'});await mobile.getByText('Ссылка недействительна или приостановлена',{exact:false}).waitFor();await post('/api/operations/worker-confirmations',{action:'resume',objectId:fixture.object,workerId:fixture.worker});assert.equal((await employee.request.get(publicUrl)).status(),200);
 const twoDaysExpiry=new Date(Date.now()+2*86400000).toISOString();
 const rotated=await post('/api/operations/worker-confirmations',{action:'rotate',objectId:fixture.object,workerId:fixture.worker,expiresAt:twoDaysExpiry,config:{sections:{documents:false,workwear:false,contacts:false,timesheet:false}}});assert.equal(rotated.expiresAt,twoDaysExpiry,'temporary link expiry explicitly set by manager');assert.notEqual(rotated.path,link.path);assert.equal((await employee.request.get(publicUrl)).status(),404);let newPublicUrl=origin+'/api/public/worker-timesheet/'+rotated.path.split('/').at(-1);assert.equal((await employee.request.get(newPublicUrl)).status(),200);
 const protectedData=await (await employee.request.get(newPublicUrl)).json();
 assert.equal(protectedData.configuration,undefined,'raw link snapshot must not be exposed');
 assert.equal(protectedData.config.managerPhone,undefined,'hidden contacts must not leak through configuration');
 assert.equal(protectedData.details.managerPhone,null,'manager phone hidden');
 assert.deepEqual(protectedData.details.documents,[],'document checklist hidden');
 assert.deepEqual(protectedData.details.workwear,[],'PPE hidden');
 assert.deepEqual(protectedData.plans,[],'timesheet data hidden');
 for(const request of [{action:'document',code:'passport',reported:true},{action:'sizes',clothingSize:'52',shoeSize:'43'}]){
   const deniedSection=await employee.request.post(newPublicUrl,{data:request});
   assert.equal(deniedSection.status(),403,'hidden employee action blocked server-side');
 }
 const hiddenMenu=await employee.newPage();await hiddenMenu.goto(origin+rotated.path,{waitUntil:'networkidle'});
 await hiddenMenu.getByRole('button',{name:'Профиль'}).last().click();
 assert.equal(await hiddenMenu.getByRole('button',{name:/Документы/}).count(),0,'hidden documents removed from navigation');
 console.log('Per-link hidden documents, PPE, contacts and timesheet protected in UI and API');
 const sectionCases=[
   ['shifts',null],['confirm',{date:dates.tomorrow,response:'working',kind:'night'}],
   ['decline',{date:dates.tomorrow,response:'cannot_work',reason:'Не смогу выйти'}],
   ['scheduleChanges',{action:'plan_day',date:dates.tomorrow,kind:'off'}],
   ['hours',{date:dates.yesterday,hours:10}],
   ['timesheet',null],['documents',{action:'document',code:'passport',reported:true}],
   ['employment',null],['workwear',{action:'sizes',clothingSize:'52',shoeSize:'43'}],
   ['contacts',null],['objectInfo',null]
 ];
 for(const [section,request] of sectionCases){
   const previousUrl=newPublicUrl;
   const nextLink=await post('/api/operations/worker-confirmations',{
     action:'rotate',objectId:fixture.object,workerId:fixture.worker,config:{sections:{[section]:false}}
   });
   newPublicUrl=origin+'/api/public/worker-timesheet/'+nextLink.path.split('/').at(-1);
   assert.equal((await employee.request.get(previousUrl)).status(),404,'rotated link must be invalid');
   const response=await employee.request.get(newPublicUrl);assert.equal(response.status(),200);
   const payload=await response.json();
   assert.equal(payload.config.sections[section],false,'hidden section must remain hidden');
   assert.equal(payload.configuration,undefined,'internal link snapshot never public');
   if(section==='shifts')assert.ok(payload.planning.days.length<=5,'calendar must be limited to immediate actions');
   if(section==='timesheet')assert.deepEqual(payload.plans,[]);
   if(section==='documents')assert.deepEqual(payload.details.documents,[]);
   if(section==='workwear')assert.deepEqual(payload.details.workwear,[]);
   if(section==='contacts')assert.equal(payload.details.managerPhone,null);
   if(section==='employment')assert.equal(payload.details.employment,'hidden');
   if(section==='objectInfo')assert.equal(payload.config.instruction,'');
   if(request){
     const forbidden=await employee.request.post(newPublicUrl,{data:request});
     assert.equal(forbidden.status(),403,'disabled action '+section+' must not reach service');
   }
 }
 console.log('Every employee section checked through isolated real HTTP permissions');

 const denied=await manager.request.post(origin+'/api/workers/'+fixture.worker+'/exit',{data:{action:'plan',effectiveDate:dates.today,reasonCode:'employee_request',replacementRequired:false,returnToRecruiting:false}});assert.equal(denied.status(),403,'manager cannot bypass offboarding permission');
 const director=(await pg.query(`SELECT u.id,u.email::text email FROM app_users u JOIN organization_memberships m ON m.user_id=u.id JOIN role_templates r ON r.id=m.role_template_id JOIN organizations o ON o.id=m.organization_id WHERE r.code='director' AND o.slug=$1 LIMIT 1`,[fixture.organization])).rows[0];assert.ok(director);await pg.query(`UPDATE app_users SET password_hash=crypt($1,gen_salt('bf')) WHERE id=$2`,['isolated-http-fixture-password',director.id]);
 const directorLogin=await manager.request.post(origin+'/api/session/login',{data:{organization:fixture.organization,email:director.email,password:'isolated-http-fixture-password'}});assert.equal(directorLogin.status(),200,await directorLogin.text());
 await post('/api/workers/'+fixture.worker+'/exit',{action:'plan',effectiveDate:dates.today,reasonCode:'employee_request',replacementRequired:false,returnToRecruiting:false});assert.equal((await employee.request.get(newPublicUrl)).status(),404,'link must block on effective dismissal date even before manual completion');
 const materialized=(await pg.query("SELECT status,block_reason FROM worker_timesheet_links WHERE worker_id=$1 AND status='revoked' ORDER BY revoked_at DESC LIMIT 1",[fixture.worker])).rows[0];
 assert.equal(materialized.block_reason,'dismissal');assert.equal(materialized.status,'revoked');
 const systemEvent=(await pg.query("SELECT actor_user_id,details->>'initiator' initiator FROM worker_portal_events WHERE worker_id=$1 AND event_type='blocked_on_exit' AND actor_user_id IS NULL ORDER BY created_at DESC LIMIT 1",[fixture.worker])).rows[0];
 assert.ok(systemEvent);assert.equal(systemEvent.initiator,'system');
 await post('/api/workers/'+fixture.worker+'/exit',{action:'complete',effectiveDate:dates.today,reasonCode:'employee_request',returnToRecruiting:false});assert.equal((await employee.request.get(newPublicUrl)).status(),404);
 const exitAudit=(await pg.query("SELECT count(*)::int count FROM worker_portal_events WHERE worker_id=$1 AND event_type='blocked_on_exit'",[fixture.worker])).rows[0].count;
 assert.ok(exitAudit>=1,'completed offboarding records the automatic revocation event');
 const exitReason=(await pg.query("SELECT block_reason reason,status FROM worker_timesheet_links WHERE worker_id=$1 AND token_hash=encode(digest($2,'sha256'),'hex') LIMIT 1",[fixture.worker,newPublicUrl.split('/').at(-1)])).rows[0];
 if(exitReason)assert.equal(exitReason.reason,'dismissal');
assert.equal((await employee.request.post(newPublicUrl,{data:{date:dates.tomorrow,response:'working',kind:'day'}})).status(),403);
 assert.deepEqual(errors,[]);console.log('PASS HTTP session / manager plan / employee mobile / timesheet / reconcile / pause+resume / rotation / dismissal read+write guards');
 fs.writeFileSync('/tmp/employee-portal-http-server.log',serverLog);
}catch(error){console.error(error);throw error;}finally{fs.writeFileSync('/tmp/employee-portal-http-server.log',serverLog);await browser?.close();server?.kill();await new Promise(r=>tls?tls.close(r):r());fs.rmSync(certDir,{recursive:true,force:true});await socket?.stop();await pg.close();}
