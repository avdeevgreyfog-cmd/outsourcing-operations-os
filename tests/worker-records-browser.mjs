import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin=process.env.BASE_URL??'http://127.0.0.1:3199';
const output=process.env.WORKER_RECORDS_QA_OUTPUT;
const path='/workers/88000000-0000-4000-8000-000000000001';
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
    assert.ok(ready,'server ready');
  }
  if(output)await mkdir(output,{recursive:true});
  browser=await chromium.launch({headless:true});
  let count=0;
  for(const width of [1440,390])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height:950},colorScheme:theme});
    await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:origin},{name:'oo_demo_role',value:'director',url:origin},{name:'oo_theme',value:theme,url:origin}]);
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    for(const tab of ['documents','incidents','history']){
      const response=await page.goto(`${origin}${path}?tab=${tab}`,{waitUntil:'networkidle'});
      assert.equal(response.status(),200);
      assert.equal(await page.locator('[data-nextjs-dialog]').count(),0);
      if(tab==='history'){
        assert.ok(await page.locator('.worker-records-history li').count()>0,'existing demo assignment visible');
        await page.getByRole('heading',{name:'История сотрудника',exact:true}).waitFor();
        await page.waitForFunction(()=>{
          const nav=document.querySelector('.entity-tabs'),active=nav?.querySelector('a.active');
          if(!nav||!active)return false;
          const n=nav.getBoundingClientRect(),a=active.getBoundingClientRect();
          return a.left>=n.left-1&&a.right<=n.right+1;
        });
        if(output)await page.screenshot({path:`${output}/worker-history-${width}-${theme}.png`,fullPage:true});
      }else{
        assert.ok(await page.locator('.empty').count()>0,'demo does not invent document/incident records');
      }
      count++;
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  console.log(`Worker records browser QA passed: ${count} tabs/theme/viewport checks; demo history populated from existing assignment; no page errors.`);
}finally{
  await browser?.close();
  if(server&&server.exitCode===null){
    server.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);
    if(server.exitCode===null)server.kill('SIGKILL');
  }
}
