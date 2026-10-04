import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const base=process.env.BASE_URL??'http://127.0.0.1:3000';
const artifacts=process.env.QA_ARTIFACT_DIR??'/tmp/operis-registry-adoption-qa';
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:1440,height:900}});
 await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:base},{name:'oo_demo_role',value:'director',url:base}]);
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const [route,search,quick,field] of [['candidates','Поиск кандидатов','Объект','Источник'],['needs?view=needs','Поиск потребностей','Объект','Специальность'],['objects','Поиск объектов','Статус','Менеджер']]){
  const key=route.split('?')[0];await page.goto(`${base}/${route}`,{waitUntil:'networkidle'});
  const root=page.locator('.operis-data-registry');const controls=root.locator('.operis-shared-registry-controls');const initial=await root.locator('table>tbody>tr').count();assert(initial>0);
  const heads=await root.locator('table>thead>tr>th').allTextContents();assert(heads.length>=8);
  await controls.getByRole('button',{name:'Фильтры',exact:false}).click();const panel=controls.getByRole('region',{name:'Дополнительные фильтры'});
  assert.equal(await panel.evaluate(el=>getComputedStyle(el).position),'relative');assert((await panel.boundingBox()).y+(await panel.boundingBox()).height<=(await root.locator('table').first().boundingBox()).y);
  await controls.getByRole('button',{name:field,exact:true}).click();const choices=controls.getByRole('option');const picked=await choices.nth(1).innerText();await choices.nth(1).click();assert(await controls.getByRole('button',{name:`Сбросить ${field}`,exact:true}).isVisible());
  await controls.getByRole('button',{name:`Сбросить ${field}`,exact:true}).click();assert.equal(await root.locator('table>tbody>tr').count(),initial);
  await controls.getByRole('button',{name:field,exact:true}).click();await page.keyboard.press('Escape');assert(await panel.isVisible());await page.keyboard.press('Escape');assert.equal(await panel.count(),0);assert(await controls.getByRole('button',{name:'Фильтры',exact:false}).evaluate(el=>el===document.activeElement));
  await controls.getByRole('button',{name:quick,exact:true}).click();await controls.getByRole('option').nth(1).click();assert(await controls.getByRole('button',{name:`Сбросить ${quick}`,exact:true}).isVisible());await controls.getByRole('button',{name:'Сбросить всё',exact:true}).click();
  await controls.getByRole('textbox',{name:search}).fill('несуществующая запись тест 123');assert.equal(await root.locator('table>tbody>tr').count(),0);await controls.getByRole('button',{name:'Очистить поиск',exact:true}).click();assert.equal(await root.locator('table>tbody>tr').count(),initial);
  await page.screenshot({path:`${artifacts}/${key}-1440.png`,fullPage:true});
  await controls.getByRole('button',{name:'Фильтры',exact:false}).click();await page.evaluate(()=>document.documentElement.dataset.theme='dark');await page.screenshot({path:`${artifacts}/${key}-filters-dark.png`});await controls.getByRole('button',{name:field,exact:true}).click();await page.screenshot({path:`${artifacts}/${key}-choice-dark.png`});await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  for(const width of [1920,1366,1024,768,390]){await page.setViewportSize({width,height:900});await page.waitForTimeout(250);await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert((await controls.boundingBox()).x+(await controls.boundingBox()).width<=width+1,`${route} at ${width}: ${JSON.stringify(await controls.boundingBox())}`);await page.screenshot({path:`${artifacts}/${key}-${width}.png`})}
  await page.setViewportSize({width:1440,height:900});console.log(JSON.stringify({route,initial,columns:heads.length,picked,checks:'filters/chips/reset/search/keyboard/widths/light/dark'}));
 }
 await page.goto(base+'/candidates',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Импорт базы',exact:true}).click();assert(await page.getByRole('heading',{name:'Импорт базы кандидатов'}).isVisible());assert(await page.locator('input[type=file]').isVisible());await page.getByRole('button',{name:'Закрыть',exact:true}).click();
 await page.goto(base+'/needs?view=needs',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Создать потребность',exact:true}).click();assert(await page.getByRole('heading',{name:'Новая потребность'}).isVisible());await page.getByRole('button',{name:'Отмена',exact:true}).click();
 await page.goto(base+'/objects',{waitUntil:'networkidle'});await page.getByRole('button',{name:'Добавить объект',exact:true}).click();assert(await page.getByRole('textbox',{name:'Название объекта',exact:true}).isVisible());await page.getByRole('button',{name:'Отмена',exact:true}).click();
 // Existing navigation and operational surfaces continue to use the same routes.
 await page.goto(base+'/objects',{waitUntil:'networkidle'});const object=await page.locator('.object-portfolio-table tbody a.cell-title').first().getAttribute('href');
 for(const tab of ['workforce','staffing','contacts','finance','documents','timesheets']){await page.goto(base+object+'?tab='+tab,{waitUntil:'networkidle'});assert(await page.locator('.operis-entity-tables').isVisible());await page.screenshot({path:`${artifacts}/object-${tab}.png`});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1))}
 await context.addCookies([{name:'oo_demo_role',value:'recruiter',url:base}]);await page.goto(base+'/objects',{waitUntil:'networkidle'});assert.equal(await page.getByRole('button',{name:'Добавить объект',exact:true}).count(),0);
 await page.goto(base+'/candidates',{waitUntil:'networkidle'});assert(await page.getByRole('textbox',{name:'Поиск кандидатов'}).isVisible());
 assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'passed',errors}));
}finally{await browser.close()}
