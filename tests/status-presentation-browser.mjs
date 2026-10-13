import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const baseURL=new URL(process.env.BASE_URL??'http://127.0.0.1:3197');
const origin=baseURL.origin;
const output=process.env.STATUS_QA_OUTPUT;
const paths=['/tasks','/approvals','/organization/staff','/finance','/requests','/objects/80000000-0000-4000-8000-000000000001'];
const requiredStatuses=new Set(['/tasks','/organization/staff']);
const results=[],errors=[];
let server,browser;

async function waitForServer(){
  for(let attempt=0;attempt<150;attempt++){
    if(server.exitCode!==null)throw new Error(`Production server exited early with code ${server.exitCode}`);
    try{
      const response=await fetch(`${origin}/login`,{signal:AbortSignal.timeout(1500)});
      if(response.status<500)return;
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
  throw new Error(`Production server did not become ready at ${origin}`);
}

try{
  if(process.env.QA_START_SERVER==='1'){
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(baseURL.port||3197)],{
      env:{...process.env,DEMO_MODE:'true',NEXT_TELEMETRY_DISABLED:'1'},
      stdio:['ignore','inherit','inherit'],
    });
    await waitForServer();
  }
  if(output)await mkdir(output,{recursive:true});
  browser=await chromium.launch({headless:true});

  for(const width of [1440,390])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height:950},colorScheme:theme});
    await context.addCookies([
      {name:'oo_workspace_mode',value:'demo',url:origin},
      {name:'oo_demo_role',value:'director',url:origin},
      {name:'oo_theme',value:theme,url:origin},
    ]);
    const page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',error=>errors.push(`${width}/${theme}: ${error.message}`));

    for(const route of paths){
      const response=await page.goto(`${origin}${route}`,{waitUntil:'networkidle'});
      assert.equal(response?.status(),200,`${route} at ${width}/${theme} should return HTTP 200`);
      const statuses=await page.locator('.status').evaluateAll(nodes=>nodes.map(node=>{
        const style=getComputedStyle(node),dot=node.querySelector('i');
        return {text:node.textContent.trim(),background:style.backgroundColor,border:style.borderTopWidth,
          padding:style.paddingLeft,dot:dot?getComputedStyle(dot).width:null};
      }));
      if(requiredStatuses.has(route))assert.ok(statuses.length>0,`${route} at ${width}/${theme} should render statuses`);
      for(const status of statuses){
        const context=`${route} ${width}/${theme} ${JSON.stringify(status)}`;
        assert.equal(status.background,'rgba(0, 0, 0, 0)',`${context}: neutral background`);
        assert.equal(status.border,'0px',`${context}: no border`);
        assert.equal(status.padding,'0px',`${context}: no padding`);
        assert.equal(status.dot,'6px',`${context}: status dot should be 6px`);
      }
      if(route==='/tasks'){
        const bounds=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
        assert.ok(bounds.scrollWidth<=bounds.width+1,`/tasks at ${width}/${theme} overflows: ${JSON.stringify(bounds)}`);
        if(output)await page.screenshot({path:`${output}/tasks-${width}-${theme}.png`,fullPage:true});
      }
      assert.equal(await page.locator('[data-nextjs-dialog]').count(),0,`${route} at ${width}/${theme} should have no Next error overlay`);
      results.push({width,theme,path:route,statuses:statuses.length});
    }
    await context.close();
  }

  assert.deepEqual(errors,[],'all pages should render without uncaught browser errors');
  console.log(`Status presentation browser QA passed: ${results.length} page/theme/viewport checks; statuses required only on tasks and organization staff; no page errors.${output?` Screenshots: ${output}`:''}`);
}finally{
  await browser?.close();
  if(server&&server.exitCode===null){
    server.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);
    if(server.exitCode===null)server.kill('SIGKILL');
  }
}
