import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin=process.env.BASE_URL??'http://127.0.0.1:3201';
const output=process.env.WORKER_EDITOR_QA_OUTPUT??'/tmp/operis-pp08-qa';
const workerPath='/workers/88000000-0000-4000-8000-000000000001';
let server,browser,diagnosticPage;
const errors=[],writes=[];
const section=(page,title)=>page.locator('.worker-data-editor').filter({has:page.getByRole('heading',{name:title,exact:true})});
try{
  await mkdir(output,{recursive:true});
  if(process.env.QA_START_SERVER==='1'){
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',new URL(origin).port],{env:{...process.env,DEMO_MODE:'true',NEXT_TELEMETRY_DISABLED:'1'},stdio:'inherit'});
    let ready=false;
    for(let i=0;i<150;i++){
      if(server.exitCode!==null)throw Error('Server exited before ready');
      try{if((await fetch(`${origin}/login`,{signal:AbortSignal.timeout(2000)})).status<500){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    assert.ok(ready,'server ready');
  }
  browser=await chromium.launch({headless:true});
  let checks=0;
  for(const width of [1440,1024,768,390])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,timezoneId:'Europe/Moscow'});
    context.setDefaultTimeout(15000);
    await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:origin},{name:'oo_demo_role',value:'director',url:origin},{name:'oo_theme',value:theme,url:origin}]);
    await context.route('**/api/**',async route=>{
      if(['POST','PATCH','PUT','DELETE'].includes(route.request().method())){writes.push(route.request().url());await route.abort();}else await route.continue();
    });
    const page=await context.newPage();diagnosticPage=page;
    page.on('pageerror',error=>errors.push(error.message));
    page.on('console',message=>{if(/hydration|hydrated/i.test(message.text()))errors.push(message.text());});
    const response=await page.goto(`${origin}${workerPath}?style=new`,{waitUntil:'networkidle'});
    assert.equal(response.status(),200);
    assert.equal(await page.locator('html').getAttribute('data-operis-ui'),'new','new UI baseline active');
    const profile=section(page,'Личные данные');
    await profile.getByRole('button',{name:'Редактировать',exact:true}).click();
    assert.ok(await profile.getByLabel('ФИО',{exact:true}).evaluate(node=>node===document.activeElement),'profile autofocus');
    assert.ok(await profile.getByLabel('ФИО',{exact:true}).evaluate(node=>node.getBoundingClientRect().height>=38),'profile input uses 38px master control');
    assert.ok(await profile.getByRole('button',{name:'Сохранить',exact:true}).evaluate(node=>node.getBoundingClientRect().height>=38),'save button uses 38px master control');
    const initialName=await profile.getByLabel('ФИО',{exact:true}).inputValue();
    await profile.getByLabel('ФИО',{exact:true}).fill(`QA ${width} ${theme}`);
    page.once('dialog',dialog=>dialog.dismiss());await page.keyboard.press('Escape');
    assert.equal(await profile.locator('form').count(),1,'dismissed Escape retains editor');
    page.once('dialog',dialog=>dialog.accept());await profile.getByRole('button',{name:'Отмена',exact:true}).click();
    assert.equal(await profile.locator('form').count(),0);
    assert.ok(await profile.getByRole('button',{name:'Редактировать',exact:true}).evaluate(node=>node===document.activeElement),'profile focus return');
    await profile.getByRole('button',{name:'Редактировать',exact:true}).click();
    assert.equal(await profile.getByLabel('ФИО',{exact:true}).inputValue(),initialName,'cancel discards input');
    await profile.getByLabel('Город',{exact:true}).fill(`QA Город ${width}`);
    await page.screenshot({path:`${output}/profile-editor-${width}-${theme}.png`,fullPage:true});
    assert.ok(await profile.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;}),'profile fits viewport');
    await profile.getByRole('button',{name:'Сохранить',exact:true}).click();
    await profile.getByRole('status').waitFor();
    await profile.getByText(`QA Город ${width}`,{exact:true}).waitFor();
    assert.match(await profile.getByRole('status').innerText(),/демо-сессии/);

    await page.reload({waitUntil:'networkidle'});
    assert.equal(await section(page,'Личные данные').getByText(`QA Город ${width}`,{exact:true}).count(),0,'demo profile clears on reload');
    await page.goto(`${origin}${workerPath}?tab=employment&style=new`,{waitUntil:'networkidle'});
    const employment=section(page,'Оформление');
    const originalPeriods=await employment.locator('.worker-period').count();
    assert.ok(originalPeriods>0,'existing demo relation supplied');
    const periodEdit=employment.locator('.worker-period').first().getByRole('button',{name:/Редактировать период/});
    const editId=await periodEdit.getAttribute('id');
    await periodEdit.click();
    assert.ok(['employment','gph','npd','custom'].includes(await employment.getByRole('combobox').inputValue()),'existing relation type prefilled');
    assert.ok(await employment.getByRole('combobox').evaluate(node=>node.getBoundingClientRect().height>=38),'employment select uses 38px master control');
    await employment.getByLabel('Конец периода',{exact:true}).fill('2090-01-01');
    await employment.locator('textarea').fill('QA исправление границы');
    await page.screenshot({path:`${output}/employment-editor-${width}-${theme}.png`,fullPage:true});
    assert.ok(await employment.evaluate(node=>{const r=node.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;}),'employment fits viewport');
    await employment.getByRole('button',{name:'Сохранить',exact:true}).click();
    await employment.getByRole('status').waitFor();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),editId,'period focus return');
    assert.equal(await employment.locator('.worker-period').count(),originalPeriods,'editing does not append');
    await employment.getByRole('button',{name:'Добавить период',exact:true}).click();
    assert.equal(await employment.getByRole('combobox').inputValue(),'','new relation requires explicit type');
    await employment.getByRole('combobox').selectOption('gph');
    await employment.getByLabel('Начало периода',{exact:true}).fill('2090-01-01');
    await employment.locator('textarea').fill('QA новый период');
    await employment.getByRole('button',{name:'Сохранить',exact:true}).click();
    await employment.getByRole('alert').waitFor();
    assert.match(await employment.getByRole('alert').innerText(),/пересекаются/);
    assert.equal(await employment.locator('textarea').inputValue(),'QA новый период','validation preserves input');
    await employment.getByLabel('Начало периода',{exact:true}).fill('2090-01-02');
    await employment.getByRole('button',{name:'Сохранить',exact:true}).click();
    await employment.getByRole('status').waitFor();
    assert.equal(await employment.locator('.worker-period').count(),originalPeriods+1);
    assert.ok(await employment.getByText('Запланирован',{exact:true}).count()>0);
    await employment.locator('summary').click();
    assert.ok(await employment.locator('.worker-edit-history li').count()>=2,'actual demo edits appear in history');
    await page.screenshot({path:`${output}/worker-saved-${width}-${theme}.png`,fullPage:true});
    const stored=await page.evaluate(()=>Object.keys(localStorage).filter(key=>/worker.*edit|edit.*worker/i.test(key)));
    assert.deepEqual(stored,[],'worker editor has no persisted demo state');
    await page.reload({waitUntil:'networkidle'});
    assert.equal(await section(page,'Оформление').locator('.worker-period').count(),originalPeriods,'demo changes disappear on reload');
    checks++;
    await context.close();
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  console.log(JSON.stringify({checks,viewports:4,themes:2,errors,writes,output}));
}catch(error){
  if(diagnosticPage&&!diagnosticPage.isClosed()){
    console.log('Failed URL:',diagnosticPage.url());console.log((await diagnosticPage.locator('body').innerText()).slice(-5000));
    await diagnosticPage.screenshot({path:`${output}/failure.png`,fullPage:true});
  }
  throw error;
}finally{
  await browser?.close();
  if(server&&server.exitCode===null){server.kill('SIGTERM');await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);if(server.exitCode===null)server.kill('SIGKILL');}
}
