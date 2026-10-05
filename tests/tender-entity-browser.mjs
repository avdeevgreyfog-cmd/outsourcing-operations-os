import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BASE_URL??'http://127.0.0.1:3000';
const output=process.env.TENDER_ENTITY_QA_OUTPUT??'artifacts/tender-entity-qa';
const tabs=['overview','analysis','documents','calculations','approvals','submission','history'];
const id='a1000000-0000-4000-8000-000000000001';
const results=[],errors=[],writes=[];
await mkdir(output,{recursive:true});
let server,browser;
try{
  if(process.env.QA_START_SERVER==='1'){
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','3000'],{env:{...process.env,DEMO_MODE:'true'},stdio:['ignore','ignore','inherit']});
    for(let i=0;i<100;i++){
      try{const r=await fetch(base+'/login');if(r.status<500)break;}catch{}
      if(i===99)throw Error('Local server did not start');
      await new Promise(resolve=>setTimeout(resolve,100));
    }
  }
  browser=await chromium.launch({headless:true});
  for(const width of [1440,1024,768,390])for(const theme of ['light','dark']){
    const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,timezoneId:'America/New_York'});
    await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:base},{name:'oo_demo_role',value:'director',url:base},{name:'oo_theme',value:theme,url:base}]);
    context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
    await context.route('**/api/**',async route=>{if(['POST','PUT','PATCH','DELETE'].includes(route.request().method())){writes.push(route.request().url());await route.abort();}else await route.continue();});
    const page=await context.newPage();
    for(const tab of tabs){
      const response=await page.goto(`${base}/tenders/${id}?tab=${tab}`,{waitUntil:'networkidle'});
      assert.equal(response.status(),200,tab);
      assert.equal(await page.locator('.tender-entity h1').count(),1);
      assert.equal(await page.locator('[data-nextjs-dialog]').count(),0);
      assert.equal(await page.locator('.entity-tabs a.active').count(),1);
      const bounds=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth}));
      assert.ok(bounds.document<=bounds.viewport+1,`${width}/${theme}/${tab} overflow ${JSON.stringify(bounds)}`);
      assert.equal(await page.getByRole('button',{name:'Сохранить анализ',exact:true}).count(),0,'demo must not offer writes');
      if(tab==='overview'){
        assert.match(await page.locator('.tender-entity').innerText(),/МСК/);
        assert.match(await page.locator('.tender-responsibility-list').innerText(),/Елена Котова/);
        assert.equal(await page.locator('.summary-strip').count(),0);
      }
      if(tab==='documents'){
        const content=await page.locator('.tender-entity').innerText();
        assert.match(content,/Техническое задание/);assert.doesNotMatch(content,/technical_spec/);assert.match(content,/Обязательный/);assert.match(content,/Действует/);
      }
      await page.screenshot({path:`${output}/${tab}-${width}-${theme}.png`,fullPage:true});
      results.push(`${width}/${theme}/${tab}`);
    }
    // Navigate by actual tabs, ensuring working link destinations survive.
    await page.getByRole('link',{name:'Обзор',exact:true}).click();
    await page.getByRole('heading',{name:'Ключевые данные',exact:true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('tab'),'overview');
    assert.equal(await page.locator('.request-entity-side').count(),1);
    await context.close();
    console.log(`PASS ${width} ${theme}: 7 tabs, links, bounds`);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);
  await writeFile(output+'/report.json',JSON.stringify({results,errors,writes},null,2));
  console.log(`PASS ${results.length} card checks; no business writes or uncaught errors`);
}finally{await browser?.close();server?.kill('SIGTERM');}
