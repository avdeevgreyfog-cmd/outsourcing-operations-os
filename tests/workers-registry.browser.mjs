import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
const base=process.env.BASE_URL??"http://127.0.0.1:3000";
const artifacts=process.env.QA_ARTIFACT_DIR??"/tmp/operis-registry-qa";
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
const context=await browser.newContext({viewport:{width:1440,height:800},acceptDownloads:true});await context.addCookies([{name:'oo_workspace_mode',value:'demo',url:base},{name:'oo_demo_role',value:'director',url:base}]);const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/workers`,{waitUntil:'networkidle'});const r=page.locator('.operis-worker-registry');assert.equal(await r.locator('tbody tr').count(),20);assert.equal(await page.locator('[data-nextjs-dialog]').count(),0);const checks=['loads/no hydration errors','20 rows in natural page scroll'];
await r.getByRole('button',{name:'Группировка',exact:true}).click();await r.getByRole('combobox',{name:/^Первый уровень/}).selectOption('manager');await r.getByRole('combobox',{name:/^Второй уровень/}).selectOption('object');await r.getByRole('button',{name:'Закрыть настройки'}).click();assert((await r.locator('.operis-group-row').count())>2);const firstGroup=r.locator('.operis-group-row button').first();await firstGroup.click();assert.equal(await firstGroup.getAttribute('aria-expanded'),'false');await firstGroup.click();await page.screenshot({path:`${artifacts}/grouped.png`});checks.push('two levels / SVG collapse');
await r.getByRole('button',{name:'Колонки',exact:true}).click();await r.getByLabel('Телефон',{exact:true}).check();await r.getByRole('button',{name:'Закрепить: Телефон'}).click();await r.getByRole('button',{name:'Закрыть настройки'}).click();assert((await r.locator('th').allTextContents()).some(x=>x.includes('Телефон')));const resize=r.locator('.operis-column-resize').first();const bounds=await resize.boundingBox();await page.mouse.move(bounds.x+3,bounds.y+6);await page.mouse.down();await page.mouse.move(bounds.x+53,bounds.y+6);await page.mouse.up();checks.push('column visibility / pin / resize');
await r.getByRole('button',{name:'Основной',exact:false}).click();await r.getByLabel('Сохранить текущий вид').fill('Проверка команды');await r.getByRole('button',{name:'Сохранить',exact:true}).click();await page.reload({waitUntil:'networkidle'});assert((await r.getByRole('button',{name:'Проверка команды',exact:false}).count())>0);await r.getByRole('button',{name:'Проверка команды',exact:false}).click();await r.getByRole('button',{name:'Удалить вид Проверка команды'}).click();assert.equal(await r.getByRole('region',{name:'Представления реестра'}).count(),0,'Deleting the current view resets the preset and closes settings');checks.push('custom view persists / deletes');

// A custom view restores the actual work slice, not just its visible columns.
await r.getByRole('navigation',{name:'Состояние сотрудников'}).getByRole('button',{name:/^Действующие/}).click();
const firstActive=r.locator('tbody tr:has(.operis-person)').first();
const headerNames=(await r.locator('thead th').allTextContents()).map(name=>name.trim());
const objectName=(await firstActive.locator('td').nth(headerNames.indexOf('Объект')).innerText()).trim();
const managerName=(await firstActive.locator('td').nth(headerNames.indexOf('Менеджер')).innerText()).trim();
await r.getByRole('combobox',{name:'Быстрый фильтр по объекту',exact:true}).selectOption({label:objectName});
await r.getByRole('button',{name:/^Фильтры/}).click();
await r.getByRole('combobox',{name:/^Менеджер/}).selectOption({label:managerName});
await r.getByRole('button',{name:'Закрыть настройки',exact:true}).click();
await r.locator('thead').getByRole('button',{name:'Сотрудник',exact:true}).click();
assert.equal(await r.getByRole('columnheader',{name:/^Сотрудник/}).getAttribute('aria-sort'),'descending');
const sliceBeforeSave=await r.locator('.operis-person strong').allTextContents();
assert.ok(sliceBeforeSave.length>0,'Selected active object/manager slice contains workers');
await r.getByLabel('Поиск сотрудников').fill(sliceBeforeSave[0]);
assert.equal(await r.locator('.operis-person').count(),1);
await r.getByRole('button',{name:'Основной',exact:false}).click();
await r.getByLabel('Сохранить текущий вид').fill('QA: объект и менеджер');
await r.getByRole('button',{name:'Сохранить',exact:true}).click();
await r.getByRole('button',{name:'Закрыть настройки',exact:true}).click();
await page.reload({waitUntil:'networkidle'});
assert.equal(await r.getByLabel('Поиск сотрудников').inputValue(),'','Search is excluded from persisted views');
assert.equal(await r.getByRole('combobox',{name:'Быстрый фильтр по объекту',exact:true}).inputValue(),objectName);
assert.equal(await r.getByRole('navigation',{name:'Состояние сотрудников'}).getByRole('button',{name:/^Действующие/}).getAttribute('aria-current'),'page');
assert.equal(await r.getByRole('columnheader',{name:/^Сотрудник/}).getAttribute('aria-sort'),'descending');
assert.deepEqual(await r.locator('.operis-person strong').allTextContents(),sliceBeforeSave,'Reload restores filtered active workers in saved sort order');
await r.getByRole('button',{name:/^Фильтры/}).click();
assert.equal(await r.getByRole('combobox',{name:/^Менеджер/}).inputValue(),managerName);
await r.getByRole('button',{name:'Закрыть настройки',exact:true}).click();
// Applying a preset, then returning to the saved view, must restore the same slice.
await r.getByRole('button',{name:'QA: объект и менеджер',exact:false}).click();
await r.locator('.operis-view-option').getByRole('button',{name:'Основной',exact:false}).click();
assert.equal(await r.getByRole('combobox',{name:'Быстрый фильтр по объекту',exact:true}).inputValue(),'');
assert.equal(await r.getByRole('navigation',{name:'Состояние сотрудников'}).getByRole('button',{name:/^Все сотрудники/}).getAttribute('aria-current'),'page');
await r.getByRole('button',{name:'Основной',exact:false}).click();
await r.locator('.operis-view-option').getByRole('button',{name:'QA: объект и менеджер',exact:true}).click();
assert.equal(await r.getByRole('combobox',{name:'Быстрый фильтр по объекту',exact:true}).inputValue(),objectName);
assert.equal(await r.getByRole('navigation',{name:'Состояние сотрудников'}).getByRole('button',{name:/^Действующие/}).getAttribute('aria-current'),'page');
assert.equal(await r.getByRole('columnheader',{name:/^Сотрудник/}).getAttribute('aria-sort'),'descending');
assert.deepEqual(await r.locator('.operis-person strong').allTextContents(),sliceBeforeSave,'Selecting a custom view restores its filters, tab and sort');
await r.getByRole('button',{name:'QA: объект и менеджер',exact:false}).click();
await r.getByRole('button',{name:'Удалить вид QA: объект и менеджер',exact:true}).click();
// Deleting the selected view closes its panel and resets the primary preset.
assert.equal(await r.getByRole('combobox',{name:'Быстрый фильтр по объекту',exact:true}).inputValue(),'');
checks.push('custom view filters / active tab / sort persist and restore; search excluded');
await r.getByLabel('Поиск сотрудников').fill('Ермаков');assert.equal(await r.locator('tbody .operis-person').count(),1);await r.getByLabel('Выбрать страницу').check();assert((await r.locator('.operis-selection-bar').count())===1);const download=page.waitForEvent('download');await r.getByRole('button',{name:'Экспорт выбранных'}).click();assert.equal((await download).suggestedFilename(),'operis-workers.csv');await r.getByLabel('Поиск сотрудников').fill('невозможныйрезультат123');assert.equal(await r.locator('.operis-selection-bar').count(),0);assert(await r.getByText('Сотрудники не найдены').isVisible());await r.getByRole('button',{name:'Сбросить поиск и фильтры'}).click();checks.push('search / empty result / selection export / hidden selection cleared');
await r.locator('.operis-person').first().click();let drawer=page.getByRole('dialog');assert.equal(Math.round((await drawer.boundingBox()).width),560);await page.screenshot({path:`${artifacts}/quick-view.png`});const details=await drawer.getByRole('link',{name:'Подробнее'}).getAttribute('href');assert(/^\/workers\//.test(details));await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);await r.getByRole('button',{name:'Добавить сотрудника'}).click();drawer=page.getByRole('dialog');assert.equal(Math.round((await drawer.boundingBox()).width),560);await drawer.getByRole('button',{name:'Создать сотрудника'}).click();assert(await drawer.getByText('Укажите ФИО').isVisible());await page.screenshot({path:`${artifacts}/create.png`});await page.keyboard.press('Escape');checks.push('quick / create same 560px / validation / Escape');
await r.getByRole('button',{name:'Основной',exact:false}).click();await r.getByRole('button',{name:'Графики и смены',exact:true}).click();assert((await r.locator('th').allTextContents()).some(x=>x.includes('Сегодня')));await r.locator('[aria-label^="Действия:"]').first().click();assert(await r.getByRole('link',{name:'Открыть карточку',exact:true}).isVisible());assert((await r.getByRole('link',{name:'Расчёты',exact:true}).getAttribute('href')).endsWith('tab=accruals'));checks.push('schedule preset / row menu valid routes');
await context.addCookies([{name:'oo_demo_role',value:'recruiter',url:base}]);await page.goto(`${base}/workers`,{waitUntil:'networkidle'});assert.equal(await r.getByRole('button',{name:'Добавить сотрудника'}).count(),0);await r.getByRole('button',{name:'Колонки',exact:true}).click();assert.equal(await r.getByLabel('Начислено',{exact:true}).count(),0);await r.getByRole('button',{name:'Закрыть настройки'}).click();await r.getByRole('button',{name:'Основной',exact:false}).click();assert.equal(await r.getByRole('button',{name:'Расчёты',exact:true}).count(),0);await r.getByRole('button',{name:'Закрыть настройки'}).click();checks.push('recruiter cannot create/import or expose financial columns/preset');
await page.goto(`${base}/references/operis-ui-standard.html`,{waitUntil:'networkidle'});await page.getByRole('button',{name:'＋ Добавить сотрудника'}).click();assert.equal(Math.round((await page.getByRole('dialog').boundingBox()).width),560);await page.keyboard.press('Escape');checks.push('offline standard HTML demo drawer');// Shared inline settings stay in the canvas, clear of the mobile navigation rail.
for(const width of [1440,390])for(const theme of ['light','dark']){
 const c=await browser.newContext({viewport:{width,height:900}});await c.addCookies([{name:'oo_workspace_mode',value:'demo',url:base},{name:'oo_demo_role',value:'director',url:base},{name:'oo_theme',value:theme,url:base}]);
 const p=await c.newPage();p.on('pageerror',error=>errors.push(error.message));await p.goto(`${base}/workers`,{waitUntil:'networkidle'});await p.locator('.operis-worker-registry').getByRole('button',{name:'Колонки',exact:true}).click();
 const panel=p.locator('.operis-registry-popover.columns');const canvas=p.locator('.operis-worker-registry');const bounds=await panel.boundingBox(),container=await canvas.boundingBox();assert(bounds.x>=container.x-1&&bounds.x+bounds.width<=width+1,'Column controls stay inside the canvas');
 if(width===390) assert.ok(await p.locator('.registry-column-setting').first().evaluate(row=>row.querySelector('.registry-column-width').getBoundingClientRect().top>=row.querySelector('.registry-column-name').getBoundingClientRect().bottom),'Mobile column labels and width controls occupy separate rows');
 await p.getByRole('checkbox',{name:'Телефон',exact:true}).check();await p.screenshot({path:`${artifacts}/columns-${width}-${theme}.png`});await c.close();
}
checks.push('inline shared column settings accessible at1440/390 in light/dark');
assert.deepEqual(errors,[]);console.log(JSON.stringify({checks,errors}));} finally { await browser.close(); }
