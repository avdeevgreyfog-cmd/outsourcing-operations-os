import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BASE_URL??'http://127.0.0.1:4012';
const dir=process.env.QA_ARTIFACT_DIR??'/tmp/operis-registry-consistency';await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1920,height:1000}});
 await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:base},{name:'oo_demo_role',value:'director',url:base}]);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));const report=[];
 for(const theme of ['light','dark']){
  const measurements=[];
  for(const route of ['workers','candidates','needs?view=needs','objects']){
   await page.goto(base+'/'+route,{waitUntil:'networkidle'});await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
   const root=page.locator('.operis-worker-registry,.operis-data-registry').first();
   const geometry=await root.evaluate(el=>{
    const find=s=>el.querySelector(s),style=s=>getComputedStyle(find(s)),rect=s=>find(s).getBoundingClientRect();
    const search='.operis-registry-search,.operis-shared-registry-search',quick='.operis-toolbar-filters>.operis-select,.operis-shared-registry-search-group>.operis-select';
    const head=rect('.operis-registry-header'),toolbar=rect('.operis-registry-toolbar,.operis-shared-registry-toolbar');
    return {titleFont:style('h1').fontSize,searchHeight:rect(search).height,searchWidth:rect(search).width,quickWidth:rect(quick).width,quickHeight:rect(quick).height,tableHeadHeight:rect('thead th').height,tableHeadFont:style('thead th').fontSize,cellFont:style('tbody td').fontSize,headerActionsHeight:rect('.operis-header-actions .button').height,actionsInHeader:rect('.operis-header-actions').y>=head.y&&rect('.operis-header-actions').bottom<=head.bottom+1,tableGap:rect('table').y-rect('.operis-registry-result,.operis-shared-registry-result,.object-portfolio-results').bottom,searchLeft:rect(search).x-toolbar.x};
   });
   assert(geometry.actionsInHeader,route+' header actions');assert.equal(geometry.searchLeft,0,route+' search alignment');assert(geometry.tableGap>=0&&geometry.tableGap<=1,route+' result/table gap: '+geometry.tableGap);measurements.push(geometry);report.push({route,theme,...geometry});
   await page.screenshot({path:dir+'/'+route.split('?')[0]+'-'+theme+'.png'});
  }
  for(const key of ['titleFont','searchHeight','searchWidth','quickWidth','quickHeight','tableHeadHeight','tableHeadFont','cellFont','headerActionsHeight'])assert.equal(new Set(measurements.map(x=>x[key])).size,1,theme+' inconsistent '+key+': '+JSON.stringify(measurements.map(x=>x[key])));
 }
 for(const width of [1440,1024,768,390])for(const route of ['workers','candidates','needs','objects']){
  await page.setViewportSize({width,height:900});await page.goto(base+'/'+route,{waitUntil:'networkidle'});await page.waitForTimeout(250);
  const root=page.locator('.operis-worker-registry,.operis-data-registry').first();const heading=root.locator('.operis-registry-heading');const box=await heading.boundingBox();assert(box.x+box.width<=width+1,route+' heading overflow at '+width);
  for(const button of await heading.locator('.button').all()){const b=await button.boundingBox();assert(b.x+b.width<=width+1,route+' action overflow at '+width)}
  await page.screenshot({path:dir+'/'+route+'-'+width+'.png'});
 }
 assert.deepEqual(errors,[]);await writeFile(dir+'/comparison.json',JSON.stringify(report,null,2));console.log(JSON.stringify({result:'passed',report,errors}));
}finally{await browser.close()}
