import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import XLSX from 'xlsx';

// Run only against an isolated server with DEMO_MODE=true. All business write
// requests are blocked: demo creation/import remain ephemeral browser state.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const output = process.env.TENDERS_QA_OUTPUT ?? 'artifacts/tenders-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [], writes = [], results = [];
const prefix = 'operis.tenders.views.v1:';
const observations = {};
const viewChoice = page => page.getByLabel('Сохранённый вид тендеров');
const search = page => page.getByRole('searchbox', { name: 'Поиск по тендерам', exact: true });
async function contextFor(width = 1440, theme = 'light', role = 'director') {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme, acceptDownloads: true });
  context.setDefaultTimeout(10000);
  await context.addCookies([{ name: 'oo_workspace_mode', value: 'demo', url: baseURL }, { name: 'oo_demo_role', value: role, url: baseURL }, { name: 'oo_theme', value: theme, url: baseURL }]);
  await context.route('**/api/tenders**', async route => {
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(route.request().method())) {
      writes.push(`${route.request().method()} ${route.request().url()}`);
      await route.abort();
    } else await route.continue();
  });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  return context;
}
async function goto(page, path = '/tenders') {
  const response = await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, path);
  if (path === '/tenders' || path.startsWith('/tenders?')) await page.getByRole('group', { name: 'Вид тендеров', exact: true }).waitFor();
  assert.equal(await page.locator('[data-nextjs-dialog]').count(), 0);
}
async function bounded(page, name) {
  await page.evaluate(() => scrollTo(0, 0));
  const sizes = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth }));
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  assert.ok(sizes.actual <= sizes.width + 1, `${name}: document overflow ${JSON.stringify(sizes)}`);
}
async function assertCleanTextFlow(page, scope, name) {
  const issues = await page.locator(scope).evaluate(root => {
    const containers = [
      ...root.querySelectorAll('.request-v2-nav-summary,.request-v2-section>header,.section-head,.tender-analysis-head,.tender-section-head,.tender-submission-head,.tender-comments header')
    ].filter(element => {
      const style=getComputedStyle(element), rect=element.getBoundingClientRect();
      return style.display!=='none' && style.visibility!=='hidden' && rect.width>0 && rect.height>0;
    });
    const selectors='h1,h2,h3,h4,p,strong,span,small';
    const collisions=[];
    for (const container of containers) {
      const candidates=[...container.querySelectorAll(selectors)].filter(element => {
        if (element.closest('[hidden]')) return false;
        const style=getComputedStyle(element), rect=element.getBoundingClientRect();
        return style.display!=='none' && style.visibility!=='hidden' && rect.width>0 && rect.height>0 && (element.textContent??'').trim();
      });
      for (let i=0;i<candidates.length;i++) for (let j=i+1;j<candidates.length;j++) {
        const a=candidates[i], b=candidates[j];
        if (a.contains(b)||b.contains(a)) continue;
        const ar=a.getBoundingClientRect(), br=b.getBoundingClientRect();
        const overlapX=Math.min(ar.right,br.right)-Math.max(ar.left,br.left);
        const overlapY=Math.min(ar.bottom,br.bottom)-Math.max(ar.top,br.top);
        if (overlapX>1 && overlapY>1) collisions.push({
          container:container.className||container.tagName,
          a:(a.textContent??'').trim().slice(0,80),
          b:(b.textContent??'').trim().slice(0,80),
          overlapX:Math.round(overlapX*10)/10,
          overlapY:Math.round(overlapY*10)/10
        });
      }
    }
    return collisions.slice(0,20);
  });
  assert.deepEqual(issues, [], `${name}: text blocks overlap ${JSON.stringify(issues)}`);
}
async function layout(page) {
  return page.locator('.tender-table').evaluate(table => ({
    headers: Array.from(table.querySelectorAll('thead th')).map(cell => cell.getAttribute('aria-label') ?? cell.textContent.trim()),
    widths: Array.from(table.querySelectorAll('col')).map(col => col.style.width),
    pinned: Array.from(table.querySelectorAll('thead th.registry-pinned-cell')).map(cell => ({ label: cell.getAttribute('aria-label'), left: cell.style.left })),
  }));
}
async function scenario(name, work) {
  if (process.env.QA_SCENARIOS && !new RegExp(process.env.QA_SCENARIOS).test(name)) return;
  const started = Date.now();
  try { await work(); results.push({ name, status: 'passed', ms: Date.now() - started }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); }
}
async function geometry(page) {
  const value = await page.locator('.tender-table').evaluate(table => ({ header: table.querySelector('thead tr').getBoundingClientRect().height, rows: Array.from(table.querySelectorAll('tbody tr:not(.requests-group-row)')).map(row => row.getBoundingClientRect().height), cells: Array.from(table.querySelectorAll('.requests-cell-content')).map(cell => cell.getBoundingClientRect().height) }));
  assert.ok(Math.abs(value.header - 42) <= 1, `Header height ${value.header}`);
  assert.ok(value.rows.length > 0 && value.rows.every(height => Math.abs(height - 60) <= 1), `Row heights ${value.rows}`);
  assert.ok(value.cells.every(height => height <= 36.5), 'Summary cells use no more than two lines');
}
async function drawer(page, width) {
  const dialog = page.getByRole('dialog'); await dialog.waitFor();
  assert.equal(await dialog.evaluate(el => el.tagName), 'DIALOG');
  const box = await dialog.boundingBox(); assert.ok(Math.abs(box.width - Math.min(width, 490)) <= 1, `Drawer width ${box.width}`);
  assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'Modal focus starts inside');
  assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden');
  const footer = await dialog.locator('.sales-drawer-content > footer').boundingBox();
  assert.ok(footer.height >= 67 && footer.y + footer.height <= 1001, `Fixed drawer footer ${JSON.stringify(footer)}`);
  // Native modal makes background controls inert. Chrome may transfer focus to
  // browser chrome at the tab boundary; require that page content cannot receive it.
  await page.locator('.tender-registry > .sales-toolbar button').first().evaluate(el => el.focus());
  assert.equal(await dialog.evaluate(el => el.contains(document.activeElement)), true, 'Background controls are inert while modal is open');
}
async function dock(page, targetSelector, label) {
  await page.setViewportSize({ width: 1024, height: 300 });
  await page.locator(targetSelector).evaluate(target => scrollTo(0, target.getBoundingClientRect().top + scrollY - 15));
  const region = page.getByRole('region', { name: label, exact: true }); await region.waitFor();
  await region.focus(); await region.press('End');
  await page.waitForFunction(({ targetSelector, label }) => { const target = document.querySelector(targetSelector), dock = document.querySelector(`[aria-label="${label}"]`); return target && dock && target.scrollLeft > 0 && Math.abs(target.scrollLeft - dock.scrollLeft) <= 1; }, { targetSelector, label });
  await region.press('Home');
  await page.waitForFunction(selector => document.querySelector(selector)?.scrollLeft === 0, targetSelector);
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.evaluate(() => scrollTo(0, 0));
}
try {
  await scenario('filters, sorting, shared columns, groups and saved views', async () => {
    const context = await contextFor(); const page = await context.newPage();
    try {
      await goto(page); await geometry(page);
      assert.equal(await page.locator('.tender-kpi-overview,.sales-metrics').count(), 0, 'KPIs belong to analytics');
      const titles = await page.locator('.tender-table tbody .cell-title').allTextContents();
      await search(page).fill('qa-nothing-matches-927162'); await page.getByText('Тендеры не найдены', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Очистить поиск', exact: true }).click(); await page.locator('.tender-table').waitFor();
      await page.getByLabel('Фильтр по этапу').selectOption('new'); assert.equal(await viewChoice(page).inputValue(), 'custom');
      await page.getByRole('button', { name: 'Фильтры', exact: true }).click();
      const platform = page.locator('.requests-registry-fields').getByLabel('Площадка'); const platformValue = await platform.locator('option').nth(1).getAttribute('value');
      await platform.selectOption(platformValue); await platform.press('Escape');
      await page.getByRole('button', { name: /Снять фильтр: Площадка:/ }).click();
      await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
      assert.equal(await page.getByLabel('Фильтр по этапу').inputValue(), '');
      await page.getByRole('columnheader', { name: 'Тендер', exact: true }).getByRole('button').click();
      assert.equal(await page.getByRole('columnheader', { name: 'Тендер', exact: true }).getAttribute('aria-sort'), 'ascending');
      const sorted = await page.locator('.tender-table tbody .cell-title').allTextContents();
      assert.deepEqual(sorted, [...titles].sort((a, b) => a.localeCompare(b, 'ru')));
      await page.getByRole('columnheader', { name: 'Тендер', exact: true }).getByRole('button').click();
      assert.deepEqual(await page.locator('.tender-table tbody .cell-title').allTextContents(), [...sorted].reverse());
      const initial = await layout(page);
      await page.getByRole('button', { name: 'Колонки', exact: true }).click();
      assert.equal(await page.getByRole('checkbox', { name: 'Тендер', exact: true }).isDisabled(), true);
      for (const label of ['Источник', 'Решение об участии', 'Площадка', 'Результат']) await page.getByRole('checkbox', { name: label, exact: true }).check();
      const widthInput = page.getByRole('spinbutton', { name: 'Ширина: Коммерция', exact: true });
      await widthInput.fill('340'); assert.equal(await widthInput.inputValue(), '340'); await widthInput.press('Enter');
      await page.getByRole('button', { name: 'Закрепить: Коммерция', exact: true }).click();
      await page.getByRole('button', { name: 'Выше: Источник', exact: true }).click();
      await page.getByRole('checkbox', { name: 'Источник', exact: true }).press('Escape');
      assert.equal(await page.locator('#tender-registry-options').count(), 0);
      assert.equal(await page.getByRole('button', { name: 'Колонки', exact: true }).evaluate(el => el === document.activeElement), true);
      const separator = page.getByRole('separator', { name: 'Ширина: Тендер', exact: true });
      await separator.focus(); await separator.press('ArrowRight'); assert.equal(await separator.getAttribute('aria-valuenow'), '350');
      await separator.press('ArrowLeft');
      const resizeBox = await separator.boundingBox();
      await page.mouse.move(resizeBox.x + resizeBox.width / 2, resizeBox.y + resizeBox.height / 2);
      await page.mouse.down(); await page.mouse.move(resizeBox.x + resizeBox.width / 2 + 30, resizeBox.y + resizeBox.height / 2); await page.mouse.up();
      assert.equal(await separator.getAttribute('aria-valuenow'), '370', 'Pointer resize changes width');
      await separator.focus(); for (let i = 0; i < 3; i++) await separator.press('ArrowLeft');
      const saved = await layout(page);
      assert.equal(saved.widths[saved.headers.indexOf('Коммерция')], '340px');
      assert.ok(saved.pinned.some(cell => cell.label === 'Коммерция' && cell.left === initial.widths[0]));
      assert.ok(saved.headers.indexOf('Источник') < saved.headers.indexOf('Ответственный'));
      await page.getByRole('button', { name: 'Группировка', exact: true }).click();
      await page.getByRole('combobox', { name: 'Первый уровень', exact: true }).selectOption('stage');
      await page.getByRole('combobox', { name: 'Второй уровень', exact: true }).selectOption('owner');
      await page.getByRole('combobox', { name: 'Второй уровень', exact: true }).press('Escape');
      assert.deepEqual((await page.locator('.requests-group-row button').evaluateAll(buttons => [...new Set(buttons.map(button => button.style.paddingLeft))])).sort(), ['14px', '36px']);
      const group = page.locator('.requests-group-row button').first(); await group.click(); assert.equal(await group.getAttribute('aria-expanded'), 'false'); await group.click();
      await page.getByLabel('Фильтр по этапу').selectOption('new');
      await search(page).fill('qa-query-excluded-from-view');
      await page.getByRole('button', { name: 'Сохранить представление', exact: true }).click(); await page.getByPlaceholder('Например, Подготовка к подаче').fill('QA: тендеры');
      await page.getByRole('button', { name: 'Сохранить вид', exact: true }).click();
      await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await search(page).inputValue(), '', 'Search is excluded from saved views');
      assert.equal(await page.getByLabel('Фильтр по этапу').inputValue(), 'new', 'Saved stage filter survives reload');
      assert.equal(await viewChoice(page).locator('option:checked').textContent(), 'QA: тендеры');
      assert.deepEqual(await layout(page), saved, 'Column order, widths and pinning persist');
      await page.getByRole('button', { name: 'Группировка', exact: true }).click();
      assert.equal(await page.getByRole('combobox', { name: 'Первый уровень', exact: true }).inputValue(), 'stage');
      assert.equal(await page.getByRole('combobox', { name: 'Второй уровень', exact: true }).inputValue(), 'owner');
      await page.getByRole('combobox', { name: 'Второй уровень', exact: true }).press('Escape');
      const prefs = await page.evaluate(prefix => Object.entries(localStorage).filter(([key]) => key.startsWith(prefix)), prefix);
      assert.equal(prefs.length, 1); assert.ok(prefs[0][0].includes(':director:demo:'));
      assert.ok(!prefs[0][1].includes('query') && !prefs[0][1].includes('initialPrice') && !prefs[0][1].includes('submissionDeadline'));
      await context.addCookies([{ name: 'oo_demo_role', value: 'recruiter', url: baseURL }]); await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await viewChoice(page).inputValue(), 'active', 'Role preferences have independent scope');
      await context.addCookies([{ name: 'oo_demo_role', value: 'director', url: baseURL }]); await page.reload({ waitUntil: 'networkidle' });
      assert.equal(await viewChoice(page).locator('option:checked').textContent(), 'QA: тендеры');
      await page.getByRole('button', { name: 'Сохранить представление', exact: true }).click();
      await page.getByRole('button', { name: 'Удалить текущий вид', exact: true }).click();
      assert.equal(await viewChoice(page).locator('option', { hasText: 'QA: тендеры' }).count(), 0);
      await bounded(page, 'configured-table-1440-light');
    } finally { await context.close(); }
  });
  await scenario('native preview, ephemeral demo create, Excel and board', async () => {
    const context = await contextFor(); const page = await context.newPage();
    try {
      await goto(page);
      const preview = page.getByRole('button', { name: /^Просмотр:/ }).first(); await preview.click(); await drawer(page, 1440);
      for (const heading of ['Состояние и подача', 'Условия закупки', 'Готовность']) await page.getByRole('dialog').getByRole('heading', { name: heading, exact: true }).waitFor();
      await bounded(page, 'preview-1440-light'); await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0); assert.equal(await preview.evaluate(el => el === document.activeElement), true);
      const fullLink = page.locator('.tender-table tbody a.cell-title').first(); assert.ok((await fullLink.getAttribute('href')).startsWith('/tenders/'));
      const title = await fullLink.textContent();
      const fullHref = await fullLink.getAttribute('href');
      await page.getByRole('button', { name: `Просмотр: ${title}`, exact: true }).click();
      assert.equal(await page.getByRole('dialog').getByRole('link', { name: 'Открыть карточку' }).getAttribute('href'), await fullLink.getAttribute('href'));
      await page.keyboard.press('Escape');
      await goto(page, fullHref); await page.getByRole('heading', { name: title, exact: true }).waitFor();
      await goto(page);
      const add = page.getByRole('link', { name: 'Добавить тендер', exact: true }); assert.equal(await add.getAttribute('href'), '/tenders/new'); await add.click();
      await page.locator('.tender-create-workspace').waitFor();
      assert.equal(await page.getByRole('button', { name: /Быстрое заполнение/ }).getAttribute('aria-pressed'), 'true');
      await page.getByLabel('Название тендера *', { exact: true }).fill('QA — временный тендер');
      await page.getByLabel('Заказчик по закупке', { exact: true }).fill('QA Test Customer');
      await page.getByLabel('НМЦК / начальная цена, ₽', { exact: true }).fill('13579');
      const createFields = await page.locator('.tender-create-workspace label').evaluateAll(labels => labels.map(label => { const control=label.querySelector('input,select,textarea'); const outer=label.getBoundingClientRect(); const inner=control?.getBoundingClientRect(); return inner ? { left:inner.left,right:inner.right,top:inner.top,outerLeft:outer.left,outerRight:outer.right,outerTop:outer.top } : null; }).filter(Boolean));
      assert.ok(createFields.length >= 8 && createFields.every(item => item.left >= item.outerLeft - 1 && item.right <= item.outerRight + 1 && item.top > item.outerTop), 'Tender create controls remain inside labelled fields');
      await bounded(page, 'create-1440-light');
      await page.getByRole('button', { name: 'Добавить тендер', exact: true }).click();
      await page.locator('.tender-table .cell-title').filter({ hasText: 'QA — временный тендер' }).waitFor();
      const localStorageDump = await page.evaluate(() => JSON.stringify(Object.entries(localStorage)));
      assert.ok(!localStorageDump.includes('QA — временный тендер') && !localStorageDump.includes('QA Test Customer') && !localStorageDump.includes('13579'));
      const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Выгрузить Excel', exact: true }).click();
      const download = await downloadPromise; assert.equal(download.suggestedFilename(), 'OPERIS_тендеры.xlsx');
      const path = `${output}/tenders-export.xlsx`; await download.saveAs(path);
      const book = XLSX.read(await readFile(path)); const exported = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]]);
      assert.ok(exported.some(row => row['Название'] === 'QA — временный тендер' && row['Цена в ₽'] === 13579));
      await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.getByText('QA — временный тендер', { exact: true }).count(), 0);
      await dock(page, '.sales-table-wrap', 'Горизонтальная прокрутка тендеров');
      await page.getByRole('group', { name: 'Вид тендеров', exact: true }).getByRole('button', { name: 'Доска', exact: true }).click(); await page.locator('.tender-board').waitFor();
      assert.equal(await page.locator('.tender-board').evaluate(el => el.scrollLeft), 0, 'Board starts with its first stage after table preview');
      assert.equal(await page.locator('.tender-board [draggable="true"],.tender-card-stage-select').count(), 0, 'Demo board offers no live stage mutations');
      const boardGeometry = await page.locator('.tender-board > .sales-board-column').evaluateAll(columns => columns.map(column => ({ width: column.getBoundingClientRect().width, minHeight: getComputedStyle(column).minHeight })));
      assert.ok(boardGeometry.length > 0 && boardGeometry.every(item => Math.abs(item.width - 228) <= 1 && Number.parseFloat(item.minHeight) >= 360), `Tender board follows Requests geometry ${JSON.stringify(boardGeometry)}`);
      const boardLink = page.locator('.tender-board a.cell-title').first(); assert.ok((await boardLink.getAttribute('href')).startsWith('/tenders/'));
      const all = await page.locator('.tender-board > .sales-board-column').count();
      await page.getByLabel('Скрыть пустые колонки', { exact: true }).check();
      assert.ok(await page.locator('.tender-board > .sales-board-column').count() < all); assert.equal(await page.locator('.sales-board-empty').count(), 0);
      await bounded(page, 'occupied-board-1440-light');
      await page.getByLabel('Скрыть пустые колонки', { exact: true }).uncheck(); await dock(page, '.tender-board', 'Горизонтальная прокрутка доски тендеров');
    } finally { await context.close(); }
  });
  await scenario('tender create sections and entity tabs have clean text flow', async () => {
    for (const width of [1440, 390]) {
      const context = await contextFor(width, 'light'); const page = await context.newPage();
      try {
        await goto(page, '/tenders/new');
        const createTabs = [
          ['Быстрое заполнение', 'quick'],
          ['Закупка', 'purchase'],
          ['Условия и привязка', 'conditions'],
        ];
        for (const [label, key] of createTabs) {
          await page.locator('.request-v2-nav').getByRole('button', { name: new RegExp(label) }).click();
          await page.locator('.tender-create-workspace .request-v2-section').waitFor();
          await assertCleanTextFlow(page, '.tender-create-workspace', `create-${key}-${width}`);
          await bounded(page, `create-${key}-${width}-light`);
        }

        await goto(page);
        const href = await page.locator('.tender-table tbody a.cell-title').first().getAttribute('href');
        assert.ok(href?.startsWith('/tenders/'));
        for (const tab of ['overview','analysis','documents','calculations','approvals','submission','history']) {
          await goto(page, `${href}?tab=${tab}`);
          await page.locator('.tender-entity').waitFor();
          await assertCleanTextFlow(page, '.tender-entity', `entity-${tab}-${width}`);
          await bounded(page, `entity-${tab}-${width}-light`);
        }
      } finally { await context.close(); }
    }
  });

  for (const storageMode of ['malformed', 'blocked']) await scenario(`${storageMode} view preference storage`, async () => {
    const context = await contextFor();
    await context.addInitScript(({ mode, prefix }) => {
      if (mode === 'blocked') { const get = Storage.prototype.getItem, set = Storage.prototype.setItem; Storage.prototype.getItem = function(key) { if (key.startsWith(prefix)) throw new Error('QA blocked storage'); return get.call(this, key); }; Storage.prototype.setItem = function(key, value) { if (key.startsWith(prefix)) throw new Error('QA blocked storage'); return set.call(this, key, value); }; }
      else { const get = Storage.prototype.getItem; Storage.prototype.getItem = function(key) { return key.startsWith(prefix) ? '{broken' : get.call(this, key); }; }
    }, { mode: storageMode, prefix });
    try { const page = await context.newPage(); await goto(page); await geometry(page); await page.getByLabel('Фильтр по этапу').selectOption('new'); assert.equal(await viewChoice(page).inputValue(), 'custom'); await page.locator('.tender-table').waitFor(); }
    finally { await context.close(); }
  });
  for (const width of [1440, 1024, 768, 390]) for (const theme of ['light', 'dark']) await scenario(`responsive ${width} ${theme}: table, board, analytics and drawers`, async () => {
    const context = await contextFor(width, theme); const page = await context.newPage();
    try {
      await goto(page); await geometry(page); await bounded(page, `table-${width}-${theme}`);
      const activeCount = await page.locator('.tender-table tbody tr').count();
      await viewChoice(page).selectOption('completed');
      const completedCount = await page.locator('.tender-table tbody tr').count();
      await viewChoice(page).selectOption('active');
      observations[`${width}-${theme}`] = { activeCount, completedCount };
      assert.equal(await page.locator('.tender-kpi-overview').count(), 0);
      await page.getByRole('button', { name: /^Просмотр:/ }).first().click(); await drawer(page, width); await bounded(page, `preview-${width}-${theme}`); await page.keyboard.press('Escape');
      await page.getByRole('link', { name: 'Добавить тендер', exact: true }).click(); await page.locator('.tender-create-workspace').waitFor(); await bounded(page, `create-${width}-${theme}`);
      await goto(page);
      await page.getByRole('group', { name: 'Вид тендеров', exact: true }).getByRole('button', { name: 'Доска', exact: true }).click(); await page.locator('.tender-board').waitFor();
      assert.equal(await page.locator('.tender-board').evaluate(el => el.scrollLeft), 0, 'Board begins at first stage');
      await page.locator('.tender-board').evaluate(el => { el.scrollLeft = 0; }); await bounded(page, `board-${width}-${theme}`);
      await page.getByRole('group', { name: 'Вид тендеров', exact: true }).getByRole('button', { name: 'Аналитика', exact: true }).click(); await page.locator('.request-funnel-readable-row').first().waitFor(); await bounded(page, `analytics-${width}-${theme}`);
      assert.equal(await page.locator('.tender-kpi-overview').count(), 1);
      const activeMetric = page.locator('.request-kpi-card').filter({ has: page.getByText('Активные тендеры', { exact: true }) });
      assert.equal(Number(await activeMetric.locator('strong').textContent()), activeCount, 'Operational analytics and registry share the same demo scope');
      const interior = await page.locator('.tender-kpi-overview,.tender-analytics-screen .request-auto-compare,.tender-funnel-readable').evaluateAll(elements => elements.map(el => { const box = el.getBoundingClientRect(); return { cls: el.className, left: box.left, right: box.right, width: box.width, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }; }));
      assert.ok(interior.every(item => item.right <= width + 1), `Analytics panels stay in viewport ${JSON.stringify(interior)}`);
      assert.ok(interior.every(item => item.scrollWidth <= item.clientWidth + 1), `Analytics panels do not clip content ${JSON.stringify(interior)}`);
      const help = page.locator('.tender-analytics-help'); assert.equal(await help.getAttribute('open'), null); await help.locator('summary').focus(); await help.locator('summary').press('Enter'); assert.equal(await help.evaluate(el => el.open), true); await help.locator('summary').press('Enter');
      await page.getByRole('group', { name: 'Единица анализа', exact: true }).getByRole('button', { name: 'Численность', exact: true }).click();
      assert.ok((await page.locator('.tender-funnel-polygon strong').allTextContents()).every(text => text === '—'), 'Missing demo headcount remains unknown');
      const details = page.locator('.request-stage-details'); assert.equal(await details.getAttribute('open'), null); await details.locator('summary').click();
      assert.equal(await details.locator('tbody tr').count(), await page.locator('.request-funnel-readable-row').count()); await bounded(page, `analytics-details-${width}-${theme}`);
      await details.locator('summary').click();
    } finally { await context.close(); }
  });
  await scenario('no uncaught JavaScript or business-write requests', async () => { assert.deepEqual(errors, []); assert.deepEqual(writes, []); });
} finally {
  await browser.close(); await writeFile(`${output}/results.json`, JSON.stringify({ baseURL, results, errors, writes, observations }, null, 2));
}
console.log(JSON.stringify({ passed: results.filter(row => row.status === 'passed').length, failed: results.filter(row => row.status === 'failed').length, screenshots: output }));
if (results.some(row => row.status === 'failed')) process.exitCode = 1;
