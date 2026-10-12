import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const origin='http://127.0.0.1:3203';
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3203'],{env:{...process.env,DEMO_MODE:'true'},stdio:'inherit'});
let browser;
try{
 let ready=false;for(let i=0;i<100;i++){if(server.exitCode!==null)throw Error('QA server exited before readiness');try{if((await fetch(origin+'/login',{signal:AbortSignal.timeout(1000)})).status<500){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,'QA server ready');browser=await chromium.launch({headless:true});
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
   console.log(width,theme,tab,sizing.scroll>sizing.width?'OVERFLOW':'fits');
   await page.screenshot({path:`/tmp/object-card-${tab}-${width}-${theme}.png`,fullPage:true});checks++;
  }await context.close();
 }assert.deepEqual(errors,[]);console.log('Checked',checks,'tab/theme/width combinations');
}finally{await browser?.close();server.kill();}
