import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BASE_URL??'http://127.0.0.1:3100';
const output=process.env.COMMERCIAL_FREEZE_QA_OUTPUT??'/tmp/operis-cf01-qa';
const key='operis.demo.commercial-workspace.v1';
await mkdir(output,{recursive:true});
let server;
if(process.env.QA_START_SERVER==='1'){
 server=spawn(process.execPath,['node_modules/next/dist/bin/next',process.env.QA_PRODUCTION==='1'?'start':'dev','--hostname','127.0.0.1','--port',new URL(base).port],{env:{...process.env,DEMO_MODE:'true',NEXT_TELEMETRY_DISABLED:'1'},stdio:'inherit'});
 let ready=false;
 for(let i=0;i<150;i++){if(server.exitCode!==null)throw Error('Server exited before ready');try{if((await fetch(base+'/login',{signal:AbortSignal.timeout(2000)})).status<500){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,200));}
 assert.ok(ready,'server ready');
}
const browser=await chromium.launch({headless:true});
const errors=[],writes=[];let checks=0,diagnosticPage;
async function assertFrozen(page,warning=true){
 if(warning)await page.getByRole('status').filter({hasText:'Коммерческие условия приняты и зафиксированы'}).waitFor();
 assert.equal(await page.getByRole('button',{name:'Редактировать',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Добавить позицию',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Изменить контакт',exact:true}).count(),0);
 assert.equal(await page.getByRole('link',{name:/Редактировать/}).count(),0);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'frozen request fits viewport');
}
try{
 for(const width of [1440,390])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme,timezoneId:'Europe/Moscow'});
  context.setDefaultTimeout(15000);
  await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:base},{name:'oo_demo_role',value:'director',url:base},{name:'oo_theme',value:theme,url:base}]);
  await context.route('**/api/**',async route=>{if(['POST','PATCH','PUT','DELETE'].includes(route.request().method())){writes.push(route.request().url());await route.abort();}else await route.continue();});
  const page=await context.newPage();diagnosticPage=page;
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(/hydration|hydrated/i.test(message.text()))errors.push(message.text());});
  await page.goto(`${base}/requests?style=new`,{waitUntil:'networkidle'});
  const link=page.locator('table tbody a[href^="/requests/"]').first();
  const requestPath=await link.getAttribute('href');
  await page.goto(`${base}${requestPath}?style=new`,{waitUntil:'networkidle'});
  const seedTitle=await page.locator('h1').innerText();
  await assertFrozen(page);
  await page.screenshot({path:`${output}/accepted-${width}-${theme}.png`,fullPage:true});checks++;
  await page.goto(`${base}${requestPath}?tab=positions&style=new`,{waitUntil:'networkidle'});
  await assertFrozen(page,false);
  assert.equal(await page.getByRole('button',{name:/Редактировать позицию/}).count(),0);
  await page.screenshot({path:`${output}/accepted-positions-${width}-${theme}.png`,fullPage:true});checks++;

  // Obtain a full, ordinary local payload through the normal creation workflow.
  // Reuse it only in this isolated context; the accepted seed fact remains intact.
  await page.goto(`${base}/requests/new`,{waitUntil:'networkidle'});
  await page.getByLabel('Название заявки',{exact:true}).fill('QA Изолированный черновик');
  await page.getByLabel('Компания / рабочее название',{exact:true}).fill('ООО QA');
  await page.getByLabel('Адрес объекта',{exact:true}).fill('Москва, Проверочная улица, 12');
  await page.getByLabel('Специальность',{exact:true}).fill('Комплектовщик');
  await page.getByLabel('Количество',{exact:true}).fill('12');
  await page.getByRole('button',{name:'Сохранить черновик',exact:true}).click();
  await page.waitForURL(/\/requests\/demo-local-/);
  await page.getByRole('heading',{name:'QA Изолированный черновик',exact:true}).waitFor();
  const draftId=new URL(page.url()).pathname.split('/').at(-1);
  for(const status of ['prelaunch','launch_ready','draft']){
   await page.evaluate(({key,draftId,seedId,seedTitle,status})=>{
    const records=JSON.parse(localStorage.getItem(key)??'[]'),draft=records.find(row=>row.id===draftId);
    if(!draft)throw Error('UI-created fixture missing');
    const fixture={...draft,id:seedId,payload:{...draft.payload,title:seedTitle},board:{...draft.board,id:seedId,title:seedTitle,status}};
    // Do not write commercialLocked:false or clear the accepted source fact.
    localStorage.setItem(key,JSON.stringify([...records.filter(row=>row.id!==seedId),fixture]));
   },{key,draftId,seedId:requestPath.split('/').at(-1),seedTitle,status});
   await page.goto(`${base}${requestPath}?style=new`,{waitUntil:'networkidle'});
   await assertFrozen(page);
   await page.goto(`${base}${requestPath}?tab=positions&style=new`,{waitUntil:'networkidle'});
   await assertFrozen(page,false);
   assert.equal(await page.getByRole('button',{name:/Редактировать позицию/}).count(),0);
   await page.screenshot({path:`${output}/override-${status}-${width}-${theme}.png`,fullPage:true});checks++;
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
 console.log(JSON.stringify({checks,viewports:2,themes:2,errors,writes,output}));
}catch(error){
 if(diagnosticPage&&!diagnosticPage.isClosed()){console.log('Failed URL:',diagnosticPage.url());console.log((await diagnosticPage.locator('body').innerText()).slice(-6000));await diagnosticPage.screenshot({path:`${output}/failure.png`,fullPage:true});}
 throw error;
}finally{await browser.close();server?.kill('SIGTERM');}
