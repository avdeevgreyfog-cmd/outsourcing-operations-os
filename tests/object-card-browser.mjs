import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:3203';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3203'],{env:{...process.env,DEMO_MODE:'true'},stdio:'inherit'});
let browser;
try{
 let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('QA server exited before readiness');try{if((await fetch(origin+'/login',{signal:AbortSignal.timeout(1000)})).status<500){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'QA server ready');browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{})});
 const errors=[];let checks=0;
 for(const width of [1440,390])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:1000}});await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:origin},{name:'oo_demo_role',value:'director',url:origin},{name:'oo_theme',value:theme,url:origin}]);
  await context.route('**/api/**',async route=>{if(['POST','PATCH','PUT','DELETE'].includes(route.request().method()))throw Error('Unexpected API write');await route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  for(const tab of (process.env.OBJECT_QA_TABS??'overview,workforce,staffing,shifts,timesheets,supply,contacts,finance,documents,quality,analytics,settings,history').split(',')){
   const r=await page.goto(`${origin}/objects/80000000-0000-4000-8000-000000000001?tab=${tab}&style=new`,{waitUntil:'networkidle'});assert.equal(r.status(),200);
   if(tab==='staffing')assert.equal(await page.locator('.object-staffing-metrics').count(),0,'duplicate staffing KPI row removed');
   if(tab==='overview')assert.equal(await page.locator('.object-overview-metrics').count(),0,'duplicate KPI row removed');
   const sizing=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert.ok(sizing.scroll<=sizing.width+1,`${tab} page overflow at ${width}`);
   const headings=await page.locator('.object-workspace-pilot .section-head h2,.object-workspace-pilot .object-module-head h2').evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).fontSize));assert.ok(headings.every(size=>size==='14px'),`${tab}: heading sizes ${headings}`);
   console.log(width,theme,tab,'fits / unified headings');
   await page.screenshot({path:`/tmp/object-card-${tab}-${width}-${theme}.png`,fullPage:true});checks++;
   if(tab==='shifts'){for(const name of ['Подтверждения','Персональные ссылки','Изменения сотрудников']){await page.getByRole('tab',{name,exact:true}).click();await page.screenshot({path:`/tmp/object-nested-${name==='Подтверждения'?'answers':name==='Персональные ссылки'?'links':'updates'}-${width}-${theme}.png`,fullPage:true});const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);assert.ok(overflow<=1);checks++;}await page.getByRole('tab',{name:'Персональные ссылки',exact:true}).click();for(const summary of ['Индивидуальные исключения из режима объекта','Настроить график сотрудника'])await page.getByText(summary,{exact:true}).click();await page.screenshot({path:`/tmp/object-link-settings-${width}-${theme}.png`,fullPage:true});checks++;}
   if(tab==='supply'){for(const name of ['Запасы','Комплекты и нормы','Заявки','Жильё','Выдача сотрудникам']){await page.getByRole('button',{name,exact:true}).click();assert.ok(await page.locator('.object-supply-workspace .object-view-content:not([hidden])').isVisible());await page.screenshot({path:`/tmp/object-supply-view-${checks}-${width}-${theme}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;}}
   if(tab==='settings'){for(const name of ['Команда объекта','Подбор','Условия работы','Параметры и основание']){await page.getByRole('button',{name,exact:true}).click();assert.ok(await page.locator('.object-settings-layout .object-view-content:not([hidden])').isVisible());assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));checks++;}await page.getByRole('button',{name:'Редактировать',exact:true}).click();await page.waitForFunction(()=>Array.from(document.querySelectorAll('.object-settings-workspace button')).some(b=>b.textContent.trim()==='Подбор'&&b.disabled));assert.ok(!(await page.getByRole('button',{name:'Подбор',exact:true}).isEnabled()));await page.getByRole('button',{name:'Отменить изменения',exact:true}).click();checks++;}
  }await context.close();
 }assert.deepEqual(errors,[]);console.log('Checked',checks,'tab/theme/width combinations');
}finally{await browser?.close();server.kill();}
