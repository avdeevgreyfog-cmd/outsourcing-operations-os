import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

// Isolated UI transport test: demo HTML is adapted in the browser only, and every
// mutation is intercepted. No customer writes or real database acceptance occurs.
const origin=process.env.BASE_URL??'http://127.0.0.1:3202';
const workerId='88000000-0000-4000-8000-000000000001';
const apiPath=`/api/workers/${workerId}/profile`,workerPath=`/workers/${workerId}`;
let server,browser,context,releaseFirst;
const errors=[],patches=[];let gets=0,adaptations=0;
try{
  if(process.env.QA_START_SERVER==='1'){
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',new URL(origin).port],{env:{...process.env,DEMO_MODE:'true',NEXT_TELEMETRY_DISABLED:'1'},stdio:'inherit'});
    let ready=false;
    for(let i=0;i<150;i++){
      if(server.exitCode!==null)throw Error('Production server exited');
      try{if((await fetch(`${origin}/login`,{signal:AbortSignal.timeout(2000)})).status<500){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    assert.ok(ready,'production server ready');
  }
  browser=await chromium.launch({headless:true});
  context=await browser.newContext({viewport:{width:1024,height:900},timezoneId:'Europe/Moscow'});
  context.setDefaultTimeout(15000);
  await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:origin},{name:'oo_demo_role',value:'director',url:origin}]);
  const seedResponse=await context.request.get(origin+apiPath);assert.equal(seedResponse.status(),200);
  let fixture=await seedResponse.json();assert.equal(fixture.canEdit,true);
  const firstGate=new Promise(resolve=>{releaseFirst=resolve;});
  await context.route('**/api/**',async route=>{
    const method=route.request().method(),pathname=new URL(route.request().url()).pathname;
    if(pathname===apiPath){
      if(method==='GET'){gets++;return route.fulfill({status:200,json:fixture});}
      assert.equal(method,'PATCH','only editor PATCH expected');
      const body=route.request().postDataJSON();patches.push(body);
      if(patches.length===1){await firstGate;return route.fulfill({status:500,json:{error:'QA временная ошибка сервера'}});}
      if(patches.length===2||patches.length===4)return route.fulfill({status:409,json:{error:'Данные изменились после открытия формы'}});
      assert.equal(patches.length,3,'unexpected extra PATCH');
      fixture={...fixture,profile:body.profile,profileVersion:'c'.repeat(64)};
      return route.fulfill({status:200,json:fixture});
    }
    if(['POST','PATCH','PUT','DELETE'].includes(method))throw Error(`Unexpected write intercepted: ${pathname}`);
    return route.continue();
  });
  await context.route(`**${workerPath}*`,async route=>{
    assert.equal(route.request().method(),'GET');
    // Prefetched sibling tabs do not contain the tested editor and may be cancelled by Next.
    if(route.request().headers()['next-router-prefetch']) return route.abort();
    const response=await route.fetch(),original=await response.text();
    const pattern=/(\\"demo\\":)true(?=,\\"block\\":\\"(?:profile|employment)\\")/g;
    const count=[...original.matchAll(pattern)].length;
    let body=original.replace(pattern,'$1false');
    const streamPattern=/("demo":)true(?=,"block":"(?:profile|employment)")/g;
    const streamCount=[...body.matchAll(streamPattern)].length;
    body=body.replace(streamPattern,'$1false');
    body=body.replace(/<p class="worker-editor-note">Демо: изменения действуют, пока открыт этот раздел\. После перехода или перезагрузки они исчезнут\.<\/p>/g,'');
    if(route.request().isNavigationRequest())assert.ok(count>0,'observed serialized WorkerDataEditor demo prop before browser-only adaptation');
    adaptations+=count+streamCount;
    return route.fulfill({response,body});
  });
  const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(/hydration|hydrated/i.test(message.text()))errors.push(message.text());});
  assert.equal((await page.goto(origin+workerPath,{waitUntil:'networkidle'})).status(),200);
  const section=page.locator('.worker-data-editor').filter({has:page.getByRole('heading',{name:'Личные данные',exact:true})});
  assert.equal(await section.getByText(/^Демо:/).count(),0);
  await section.getByRole('button',{name:'Редактировать',exact:true}).click();
  await section.getByLabel('ФИО',{exact:true}).fill('QA несохранённое имя');
  await section.getByRole('button',{name:'Сохранить',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.worker-data-editor form[aria-busy="true"]'));
  assert.equal(patches.length,1,'live transport branch actually sends intercepted PATCH');
  assert.equal(await section.getByRole('button',{name:'Отмена',exact:true}).isDisabled(),true);
  assert.equal(await section.getByRole('button',{name:'Сохранение…',exact:true}).isDisabled(),true);
  assert.equal(await section.getByLabel('ФИО',{exact:true}).isDisabled(),true);
  await section.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(patches.length,1,'duplicate submit blocked while busy');
  releaseFirst();await section.getByRole('alert').waitFor();
  assert.match(await section.getByRole('alert').innerText(),/QA временная ошибка/);
  assert.equal(await section.getByLabel('ФИО',{exact:true}).inputValue(),'QA несохранённое имя');
  assert.equal(await section.getByRole('button',{name:'Сохранить',exact:true}).isEnabled(),true);
  await section.getByRole('button',{name:'Сохранить',exact:true}).click();
  await section.getByRole('button',{name:'Загрузить текущие данные',exact:true}).waitFor();
  assert.equal(patches.length,2);assert.equal(await section.getByRole('button',{name:'Сохранить',exact:true}).isDisabled(),true);
  assert.equal(await section.getByLabel('ФИО',{exact:true}).inputValue(),'QA несохранённое имя');
  page.once('dialog',dialog=>dialog.dismiss());await section.getByRole('button',{name:'Загрузить текущие данные',exact:true}).click();
  assert.equal(gets,0,'dismissed dirty confirmation prevents reload');
  fixture={...fixture,profile:{...fixture.profile,fullName:'QA актуальное имя'},profileVersion:'b'.repeat(64)};
  page.once('dialog',dialog=>dialog.accept());await section.getByRole('button',{name:'Загрузить текущие данные',exact:true}).click();
  await section.getByText('QA актуальное имя',{exact:true}).waitFor();assert.equal(gets,1);
  await section.getByRole('button',{name:'Редактировать',exact:true}).click();
  assert.equal(await section.getByLabel('ФИО',{exact:true}).inputValue(),'QA актуальное имя');
  await section.getByLabel('ФИО',{exact:true}).fill('QA успешно сохранено');
  await section.getByRole('button',{name:'Сохранить',exact:true}).click();
  await section.getByText('QA успешно сохранено',{exact:true}).waitFor();
  assert.equal(patches[2].expectedVersion,'b'.repeat(64));
  await section.getByRole('button',{name:'Редактировать',exact:true}).click();
  assert.equal(await section.getByLabel('ФИО',{exact:true}).inputValue(),'QA успешно сохранено');
  await section.getByLabel('ФИО',{exact:true}).fill('QA отозван доступ');await section.getByRole('button',{name:'Сохранить',exact:true}).click();
  await section.getByRole('button',{name:'Загрузить текущие данные',exact:true}).waitFor();
  fixture={...fixture,canEdit:false};page.once('dialog',dialog=>dialog.accept());
  await section.getByRole('button',{name:'Загрузить текущие данные',exact:true}).click();
  await section.getByText('Редактирование недоступно для вашей роли или области доступа.',{exact:true}).waitFor();
  assert.equal(await section.getByRole('button',{name:'Редактировать',exact:true}).count(),0);
  await page.waitForLoadState('networkidle');
  assert.equal(patches.length,4);assert.ok(adaptations>0);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({coverage:'isolated mocked live UI transport; no real backend writes or DB acceptance',patches:patches.length,gets,adaptations,errors}));
}finally{
  releaseFirst?.();await context?.unrouteAll({behavior:'wait'});await browser?.close();
  if(server&&server.exitCode===null){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);if(server.exitCode===null)server.kill('SIGKILL');}
}
