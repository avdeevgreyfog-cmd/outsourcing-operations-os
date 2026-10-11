import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin=process.env.BASE_URL??'http://127.0.0.1:3197';
const output=process.env.FIRST_SHIFT_QA_OUTPUT;
const candidatePath='/candidates/85000000-0000-4000-8000-000000000006';
let server,browser;
const errors=[];
try{
  if(process.env.QA_START_SERVER==='1'){
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',new URL(origin).port],{env:{...process.env,DEMO_MODE:'true'},stdio:'inherit'});
    let ready=false;
    for(let i=0;i<150;i++){
      if(server.exitCode!==null)throw Error('Server exited');
      try{if((await fetch(`${origin}/login`)).status<500){ready=true;break;}}catch{}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    assert.ok(ready);
  }
  if(output)await mkdir(output,{recursive:true});
  browser=await chromium.launch({headless:true});
  let checks=0;
  for(const width of [1440,390])for(const theme of ['light','dark']){
    for(const surface of ['object','staffing','recruiting']){
      if(process.env.QA_ONLY&&`${surface}-${width}-${theme}`!==process.env.QA_ONLY)continue;
      const context=await browser.newContext({viewport:{width,height:950},colorScheme:theme,timezoneId:'Europe/Moscow'});
      await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:origin},{name:'oo_demo_role',value:'director',url:origin},{name:'oo_theme',value:theme,url:origin}]);
      const page=await context.newPage();
      page.on('pageerror',e=>errors.push(`${surface}: ${e.message}`));
      if(surface==='recruiting'){
        assert.equal((await page.goto(origin+candidatePath,{waitUntil:'networkidle'})).status(),200);
        await page.getByRole('button',{name:'Открыть рабочий этап',exact:true}).click();
        await page.getByRole('button',{name:/^Готов к первому выходу/}).click();
        await page.getByRole('button',{name:'Сохранить результат',exact:true}).click();
        await page.locator('.candidate-work-drawer').waitFor({state:'hidden'});
        await page.getByRole('button',{name:'Открыть рабочий этап',exact:true}).click();
        await page.getByRole('button',{name:/^Вышел на смену/}).click();
      }else{
        const path=surface==='object'?'/objects/80000000-0000-4000-8000-000000000001?tab=staffing':'/staffing-plan?view=funnel';
        assert.equal((await page.goto(origin+path,{waitUntil:'networkidle'})).status(),200);
        const pending=page.locator('article').filter({has:page.getByRole('button',{name:'Согласовать выход',exact:true})}).first();
        const name=await pending.locator('a[href^="/candidates/"]').first().innerText();
        const card=page.locator('article').filter({has:page.getByRole('link',{name,exact:true})}).first();
        await card.getByRole('button',{name:'Согласовать выход',exact:true}).click();
        await card.getByRole('button',{name:'Вышел',exact:true}).click();
      }
      const fields=page.locator('.first-shift-confirmation-fields');
      await fields.waitFor();
      const save=page.getByRole('button',{name:surface==='recruiting'?'Сохранить результат':'Сохранить подтверждение',exact:true});
      assert.equal(await save.isDisabled(),true,'explicit choice required');
      await fields.getByLabel('Фактическая дата и время выхода').fill('2026-10-01T08:00');
      await fields.getByLabel('Формат оформления').selectOption(surface==='staffing'?'unspecified':'gph');
      assert.equal(await save.isEnabled(),true);
      await page.waitForFunction(()=>{
        const box=document.querySelector('.first-shift-confirmation-fields')?.getBoundingClientRect();
        return box&&box.left>=-1&&box.right<=window.innerWidth+1;
      }).catch(async error=>{console.error(surface,width,theme,await fields.evaluate(node=>({left:node.getBoundingClientRect().left,right:node.getBoundingClientRect().right,viewport:window.innerWidth,body:document.body.scrollWidth,ui:document.documentElement.dataset.operisUi,parents:[...function*(){for(let p=node.parentElement;p;p=p.parentElement)yield p;}()].map(p=>({class:p.className,width:p.clientWidth,scroll:p.scrollWidth,overflow:getComputedStyle(p).overflowX,minWidth:getComputedStyle(p).minWidth,maxWidth:getComputedStyle(p).maxWidth})).slice(0,8)})));throw error;});
      // Capture the completed form before confirming; these are existing demo people,
      // not newly seeded customer records or database writes.
      if(output)await fields.screenshot({path:`${output}/${surface}-${width}-${theme}.png`});
      await save.click();
      await fields.waitFor({state:'hidden'});
      if(surface==='recruiting'){
        const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('operis.recruiting.applications.v3')??'[]')[0]);
        assert.equal(saved.actualStartAt,'2026-10-01T05:00:00.000Z');
        assert.equal(saved.workflow.employmentRelationType,'gph');
        await page.getByRole('button',{name:'Открыть рабочий этап',exact:true}).click();
        await page.getByRole('button',{name:/^Вышел на смену/}).click();
        assert.equal(await page.locator('.first-shift-confirmation-fields').count(),0,'confirmed date is protected');
      }else{
        await page.getByText(/первый выход подтверждён/).first().waitFor();
      }
      checks++;
      await context.close();
    }
  }
  assert.deepEqual(errors,[]);
  console.log(`First-shift browser QA passed: ${checks} three-surface/theme/viewport flows, selected date/type saved in demo; no page errors.`);
}finally{
  await browser?.close();
  if(server&&server.exitCode===null){
    server.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);
    if(server.exitCode===null)server.kill('SIGKILL');
  }
}
