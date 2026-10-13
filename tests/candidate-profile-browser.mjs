import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';

const origin=process.env.BASE_URL??'http://127.0.0.1:3198';
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
  browser=await chromium.launch({headless:true});
  for(const role of ['director','object','recruiter_staff']){
    const context=await browser.newContext();
    await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:origin},{name:'oo_demo_role',value:role,url:origin}]);
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(`${role}: ${error.message}`));
    assert.equal((await page.goto(`${origin}/candidates`,{waitUntil:'networkidle'})).status(),200);
    const link=page.locator('a.cell-title[href^="/candidates/"]').first();
    await link.waitFor();
    const name=await link.innerText(),path=await link.getAttribute('href');
    assert.equal((await page.goto(`${origin}${path}`,{waitUntil:'networkidle'})).status(),200);
    await page.getByRole('heading',{name,exact:true}).first().waitFor();
    for(const tab of ['Заявки','Документы','Активность']){
      await page.locator('.entity-tabs').getByRole('button',{name:new RegExp(`^${tab}`)}).click();
      assert.equal(await page.locator('[data-nextjs-dialog]').count(),0);
    }
    console.log(`${role}: directory, visible candidate card and three tabs passed`);
    await context.close();
  }
  assert.deepEqual(errors,[]);
}finally{
  await browser?.close();
  if(server&&server.exitCode===null){
    server.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);
    if(server.exitCode===null)server.kill('SIGKILL');
  }
}
