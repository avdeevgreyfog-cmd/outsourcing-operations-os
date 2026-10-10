import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BASE_URL??'http://127.0.0.1:3100';
const output=process.env.SALES_QA_OUTPUT??'artifacts/sales-interactions';
await mkdir(output,{recursive:true});
let server;
if(process.env.QA_START_SERVER==='1'){
 server=spawn(process.execPath,['node_modules/next/dist/bin/next',process.env.QA_PRODUCTION==='1'?'start':'dev','--hostname','127.0.0.1','--port','3100'],{env:{...process.env,DEMO_MODE:'true'},stdio:['ignore','ignore','inherit']});
 for(let i=0;i<150;i++){try{if((await fetch(base+'/login')).status<500)break;}catch{} await new Promise(r=>setTimeout(r,200));}
}
const browser=await chromium.launch({headless:true});
const errors=[],writes=[];
let checks=0;
try {
 for(const width of [1440,1024,768,390]) for(const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme});
  await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:base},{name:'oo_demo_role',value:'director',url:base},{name:'oo_theme',value:theme,url:base}]);
  await context.route('**/api/**',async route=>{if(['POST','PATCH','PUT','DELETE'].includes(route.request().method())){writes.push(route.request().url());await route.abort();}else await route.continue();});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(/hydration|hydrated/i.test(m.text()))errors.push(m.text());});
  for(const entity of ['requests','clients','tenders']) {
   assert.equal((await page.goto(`${base}/${entity}`,{waitUntil:'networkidle'})).status(),200);
   const title=page.locator('table tbody .sales-record-title').first();const name=await title.innerText();
   await title.click();let dialog=page.getByRole('dialog');await dialog.getByRole('heading',{name,exact:true}).waitFor();
   assert.equal(await dialog.locator('input[name="title"],input[name="name"]').count(),0,'name opens preview, not form');
   assert.ok((await dialog.boundingBox()).width<=Math.min(490,width)+1);
   await page.screenshot({path:`${output}/${entity}-${width}-${theme}.png`});
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
   await page.getByRole('button',{name:`Просмотр: ${name}`,exact:true}).click();await page.getByRole('dialog').getByRole('heading',{name,exact:true}).waitFor();
   await page.getByRole('dialog').getByRole('button',{name:'Закрыть',exact:true}).click();
   const bounds=await page.evaluate(()=>({w:innerWidth,s:document.documentElement.scrollWidth}));assert.ok(bounds.s<=bounds.w+1,'no page overflow');checks++;
   if(entity==='requests'&&width===1440&&theme==='light') {
    await title.click();await page.getByRole('dialog').getByRole('link',{name:'Редактировать',exact:true}).click();
    assert.equal(await page.getByLabel('Название заявки',{exact:true}).inputValue(),name);
    assert.ok(await page.getByLabel('Количество',{exact:true}).first().inputValue()!=='0');
    assert.equal(await page.getByText('Новая заявка',{exact:true}).count(),0);
    await page.getByLabel('Название заявки',{exact:true}).fill('QA Сохранённая заявка');
    await page.getByRole('button',{name:'Сохранить изменения',exact:true}).click();await page.waitForURL(/\/requests\?demo=/);
    await page.reload({waitUntil:'networkidle'});
    await page.getByRole('button',{name:'QA Сохранённая заявка',exact:true}).click();
    await page.getByRole('dialog').getByRole('link',{name:'Открыть карточку',exact:true}).click();
    await page.getByRole('heading',{name:'QA Сохранённая заявка',exact:true}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Сохранить изменения',exact:true}).count(),0,'full preview is not editing');
   }
   if(entity==='tenders'&&width===1440&&theme==='light') {
    await title.click();await page.getByRole('dialog').getByRole('button',{name:'Редактировать',exact:true}).click();
    dialog=page.getByRole('dialog');assert.equal(await dialog.locator('input[name="title"]').inputValue(),name);
    await dialog.locator('input[name="title"]').fill('QA Тендер сохранён');
    await dialog.getByRole('button',{name:'Сохранить изменения',exact:true}).click();await page.keyboard.press('Escape');
    await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'QA Тендер сохранён',exact:true}).waitFor();
    await page.getByRole('link',{name:'Открыть карточку: QA Тендер сохранён',exact:true}).click();
    await page.getByRole('heading',{name:'QA Тендер сохранён',exact:true}).waitFor();
    await page.getByRole('link',{name:'Редактировать',exact:true}).click();
    await page.getByRole('dialog').locator('input[name="title"]').waitFor();
    assert.equal(await page.getByRole('dialog').locator('input[name="title"]').inputValue(),'QA Тендер сохранён');
    await page.getByRole('dialog').getByRole('button',{name:'Отмена',exact:true}).click();
   }
   if(entity==='clients'&&width===1440&&theme==='light') {
    await title.click();await page.getByRole('dialog').getByRole('button',{name:'Редактировать',exact:true}).click();
    dialog=page.getByRole('dialog');assert.equal(await dialog.locator('input[name="name"]').inputValue(),name);
    await dialog.locator('input[name="name"]').fill('QA Несохранённый клиент');await dialog.getByRole('button',{name:'Отмена',exact:true}).click();
    assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await title.innerText(),name);
    await page.getByRole('link',{name:`Открыть карточку: ${name}`,exact:true}).click();await page.locator('h1').filter({hasText:name}).waitFor();
    await page.goto(`${base}/clients`,{waitUntil:'networkidle'});await page.getByRole('button',{name,exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Редактировать',exact:true}).click();
    await page.getByRole('dialog').locator('input[name="name"]').fill('QA Клиент сохранён');
    await page.getByRole('dialog').getByRole('button',{name:'Сохранить изменения',exact:true}).click();await page.keyboard.press('Escape');
    await page.reload({waitUntil:'networkidle'});await page.getByRole('button',{name:'QA Клиент сохранён',exact:true}).waitFor();
    await page.getByRole('link',{name:'Открыть карточку: QA Клиент сохранён',exact:true}).click();await page.getByRole('heading',{name:'QA Клиент сохранён',exact:true}).waitFor();
   }
  }
  await context.close();console.log(`PASS ${width} ${theme}`);
 }
 // Lost local draft cannot be saved as an empty replacement.
 const context=await browser.newContext();await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:base},{name:'oo_demo_role',value:'director',url:base}]);
 const page=await context.newPage();await page.goto(`${base}/requests/new?draft=demo-local-missing`,{waitUntil:'networkidle'});
 assert.equal(await page.getByRole('button',{name:'Сохранить изменения',exact:true}).count(),0);await context.close();
 if(process.env.QA_EXTENDED==='1')await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['tests/commercial-editability-browser.mjs'],{env:process.env,stdio:'inherit'});child.on('exit',code=>code===0?resolve():reject(new Error(`Extended browser QA failed: ${code}`)));});
 assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);console.log(`PASS ${checks} registry/theme/viewport checks, edit/preserve/reload/full-card/missing-draft checks`);
} finally {await browser.close();server?.kill('SIGTERM');}
