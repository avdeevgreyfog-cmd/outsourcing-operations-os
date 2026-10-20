import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import {navigationManifest} from '../lib/core/navigation-runtime.mjs';

const baseURL=new URL(process.env.BASE_URL??'http://127.0.0.1:3100');
const origin=baseURL.origin;
const proposalPrint='/proposals/7a000000-0000-4000-8000-000000000001/print';
const foundationRoutes=navigationManifest.flatMap(section=>section.groups.flatMap(group=>group.items))
  .filter(item=>item.status==='foundation')
  .map(item=>({label:item.label,href:item.href.split('?')[0]}));
const placeholderRoutes=foundationRoutes.filter(item=>item.href!=='/admin/modules');
const errors=[];
let server,browser;

function trackPage(page,label){page.on('pageerror',error=>errors.push(`${label}: ${error.message}`));}

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
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(baseURL.port||3100)],{
      env:{...process.env,DEMO_MODE:'true',SHOW_FOUNDATIONS:'true',NEXT_TELEMETRY_DISABLED:'1'},
      stdio:['ignore','inherit','inherit'],
    });
    await waitForServer();
  }
  assert.ok(foundationRoutes.length>0,'navigation runtime should provide foundation routes');
  browser=await chromium.launch({headless:true});

  const demoContext=await browser.newContext({viewport:{width:1440,height:900}});
  await demoContext.addCookies([
    {name:'oo_workspace_mode',value:'demo',url:origin},
    {name:'oo_demo_role',value:'director',url:origin},
  ]);
  const demoPage=await demoContext.newPage();demoPage.setDefaultTimeout(15000);trackPage(demoPage,'demo');

  const homeResponse=await demoPage.goto(`${origin}/`,{waitUntil:'networkidle'});
  assert.equal(homeResponse?.status(),200,'demo home should render');
  const nav=demoPage.locator('nav[aria-label="Основная навигация"]');
  for(const section of await nav.locator('.nav-section-button').all()){
    if(await section.getAttribute('aria-expanded')!=='true')await section.click();
  }
  for(const group of await nav.locator('.nav-subgroup > button').all()){
    if(await group.getAttribute('aria-expanded')!=='true')await group.click();
  }
  const navHrefs=await nav.locator('a').evaluateAll(anchors=>anchors.map(anchor=>anchor.getAttribute('href')));
  assert.ok(navHrefs.includes('/requests'),'expanded navigation should show active routes');
  assert.ok(navHrefs.includes('/admin/document-templates'),'implemented document templates route should remain visible');
  for(const item of foundationRoutes)assert.equal(navHrefs.includes(item.href),false,`foundation route ${item.href} must stay hidden in navigation`);

  await demoPage.keyboard.press('Control+k');
  const search=demoPage.getByRole('dialog',{name:'Быстрый переход'});
  await search.waitFor();
  const searchInput=demoPage.getByRole('textbox',{name:'Найти раздел'});
  for(const item of foundationRoutes){
    await searchInput.fill(item.label);
    await demoPage.waitForTimeout(30);
    const resultLabels=await demoPage.locator('.command-results button strong').allTextContents();
    assert.equal(resultLabels.includes(item.label),false,`foundation route ${item.href} must stay hidden in search`);
  }
  await demoPage.keyboard.press('Escape');

  for(const item of foundationRoutes){
    const response=await demoPage.goto(`${origin}${item.href}`,{waitUntil:'networkidle'});
    assert.equal(response?.status(),200,`demo ${item.href} should return HTTP 200`);
    if(placeholderRoutes.some(route=>route.href===item.href)){
      const pageText=await demoPage.locator('body').innerText();
      assert.match(pageText,/Раздел готовится/,`demo ${item.href} should show its foundation placeholder; rendered: ${pageText.slice(0,800)}`);
    }else if(item.href==='/admin/modules'){
      await demoPage.getByRole('heading',{name:'Паспорт платформы',exact:true}).waitFor();
    }
    assert.equal(await demoPage.locator('[data-nextjs-dialog]').count(),0,`demo ${item.href} should have no Next error overlay`);
  }
  const printResponse=await demoPage.goto(`${origin}${proposalPrint}`,{waitUntil:'networkidle'});
  assert.equal(printResponse?.status(),200,'demo proposal print should return HTTP 200');
  assert.equal(await demoPage.locator('.proposal-print-page').count(),1,'proposal print page should render');
  assert.equal(await demoPage.locator('[data-nextjs-dialog]').count(),0,'proposal print should have no Next error overlay');

  const unknownResponse=await demoPage.goto(`${origin}/definitely-not-a-navigation-module`,{waitUntil:'networkidle'});
  const unknownStatus=unknownResponse?.status();
  assert.ok(unknownStatus===404||unknownStatus===200,`unknown module should return 404 or a streamed soft 404, got ${unknownStatus}`);
  const unknownText=await demoPage.locator('body').innerText();
  assert.match(unknownText,/not found|не найден|404/i,'unknown module should render not-found UI');
  if(unknownStatus===200){
    const noindex=await demoPage.locator('meta[name="robots"]').evaluateAll(nodes=>nodes.some(node=>/noindex/i.test(node.getAttribute('content')??'')));
    assert.equal(noindex,true,'streamed soft 404 should include robots noindex');
  }

  const anonymousContext=await browser.newContext({viewport:{width:1280,height:800}});
  const anonymousPage=await anonymousContext.newPage();anonymousPage.setDefaultTimeout(15000);trackPage(anonymousPage,'anonymous');
  for(const route of [...foundationRoutes.map(item=>item.href),proposalPrint]){
    const response=await anonymousPage.goto(`${origin}${route}`,{waitUntil:'networkidle'});
    assert.ok(response&&response.status()<500,`anonymous ${route} must not return HTTP 5xx`);
    assert.equal(new URL(anonymousPage.url()).pathname,'/login',`anonymous ${route} should redirect to login`);
  }

  assert.deepEqual(errors,[],'browser pages should not raise uncaught page errors');
  console.log(`Authenticated route browser QA passed: ${foundationRoutes.length} manifest foundation routes (${placeholderRoutes.length} catchall placeholders) + proposal print return 200 for demo and redirect anonymous users to login; unknown route renders not-found UI (HTTP ${unknownStatus}${unknownStatus===200?', soft 404 with noindex':''}); foundations stay out of navigation/search; no page errors.`);
  await anonymousContext.close();await demoContext.close();
}finally{
  await browser?.close();
  if(server&&server.exitCode===null){
    server.kill('SIGTERM');
    await Promise.race([new Promise(resolve=>server.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,5000))]);
    if(server.exitCode===null)server.kill('SIGKILL');
  }
}
