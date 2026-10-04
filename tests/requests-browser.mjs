import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

// Run against an isolated server with DEMO_MODE=true. This test never writes to a database.
const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3000';
const output = 'artifacts/requests-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const errors = [];
async function contextFor(width = 1440, theme = 'light') {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, colorScheme: theme });
  await context.addCookies([
    { name: 'oo_workspace_mode', value: 'demo', url: baseURL },
    { name: 'oo_demo_role', value: 'director', url: baseURL },
    { name: 'oo_theme', value: theme, url: baseURL },
  ]);
  return context;
}
function observe(page) { page.on('pageerror', error => errors.push(error.message)); }
async function goto(page, path) {
  const response = await page.goto(`${baseURL}${path}`, { waitUntil: 'networkidle' });
  assert.equal(response?.status(), 200, path);
  assert.equal(await page.locator('[data-nextjs-dialog]').count(), 0);
}
async function bounded(page, name) {
  const sizes = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth }));
  assert.ok(sizes.actual <= sizes.width + 1, `${name}: document overflow ${JSON.stringify(sizes)}`);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
async function tableLayout(page) {
  return page.locator('.sales-request-table').evaluate(table => ({
    headers: Array.from(table.querySelectorAll('thead th')).map(cell => cell.textContent.trim()),
    widths: Array.from(table.querySelectorAll('col')).map(col => col.style.width),
    pinned: Array.from(table.querySelectorAll('thead th.registry-pinned-cell')).map(cell => ({ label: cell.textContent.trim(), left: cell.style.left })),
  }));
}
async function checkScrollDock(page, targetSelector, label) {
  // A short viewport exposes the dock while the table/board's own bottom is below it.
  await page.setViewportSize({ width: 1024, height: 300 });
  await page.locator(targetSelector).evaluate(target => scrollTo(0, target.getBoundingClientRect().top + scrollY - 15));
  const dock = page.getByRole('region', { name: label, exact: true });
  await dock.waitFor({ state: 'visible' });
  await page.locator(targetSelector).evaluate(target => { target.scrollLeft = 120; });
  await page.waitForFunction(({ targetSelector, label }) => {
    const target = document.querySelector(targetSelector), dock = document.querySelector(`[aria-label="${label}"]`);
    return target && dock && target.scrollLeft > 0 && Math.abs(target.scrollLeft - dock.scrollLeft) <= 1;
  }, { targetSelector, label });
  await dock.focus(); await dock.press('End');
  await page.waitForFunction(({ targetSelector, label }) => {
    const target = document.querySelector(targetSelector), dock = document.querySelector(`[aria-label="${label}"]`);
    return target && dock && target.scrollLeft > 120 && Math.abs(target.scrollLeft - (target.scrollWidth - target.clientWidth)) <= 1 && Math.abs(target.scrollLeft - dock.scrollLeft) <= 1;
  }, { targetSelector, label });
  await dock.press('Home');
  await page.waitForFunction(targetSelector => document.querySelector(targetSelector)?.scrollLeft === 0, targetSelector);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => scrollTo(0, 0));
}
try {
  const context = await contextFor();
  const page = await context.newPage(); observe(page);
  await goto(page, '/requests');
  await page.getByRole('button', { name: 'Таблица', exact: true }).waitFor();
  assert.equal(await page.locator('.request-kpi-overview').count(), 0, 'KPIs only belong to analytics');
  const geometry = await page.locator('.sales-request-table').evaluate(table => ({ header: table.querySelector('thead tr').getBoundingClientRect().height, rows: Array.from(table.querySelectorAll('tbody tr')).map(row => row.getBoundingClientRect().height), cells: Array.from(table.querySelectorAll('.requests-cell-content')).map(cell => cell.getBoundingClientRect().height) }));
  assert.ok(Math.abs(geometry.header - 42) <= 1, `Shared header height: ${geometry.header}`);
  assert.ok(geometry.rows.every(height => Math.abs(height - 60) <= 1), `Shared row heights: ${geometry.rows}`);
  assert.ok(geometry.cells.every(height => height <= 36.5), 'Summary cells stay within two lines');
  const stage = page.getByLabel('Фильтр по этапу');
  await stage.selectOption('agreed');
  assert.equal(await page.getByLabel('Сохранённый вид заявок').inputValue(), 'custom');
  assert.equal(await stage.inputValue(), 'agreed');
  await page.getByLabel('Сохранённый вид заявок').selectOption('active');
  await page.getByRole('button', { name: 'Колонки', exact: true }).click();
  const originalTitles = await page.locator('.sales-request-table tbody .cell-title').allTextContents();
  await page.getByRole('checkbox', { name: 'Источник', exact: true }).check();
  for (const label of ['Адрес объекта', 'Специальности', 'Заказчик']) await page.getByRole('checkbox', { name: label, exact: true }).check();
  const needWidth = page.locator('.registry-column-width').getByRole('spinbutton', { name: 'Ширина: Потребность', exact: true });
  await needWidth.focus();
  await needWidth.press('ControlOrMeta+A');
  await needWidth.pressSequentially('340');
  assert.equal(await needWidth.inputValue(), '340', 'Typing a width does not clamp intermediate digits');
  await needWidth.press('Enter');
  await page.getByRole('button', { name: 'Закрепить: Потребность', exact: true }).click();
  await page.getByRole('button', { name: 'Выше: Источник', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Источник', exact: true }).press('Escape');
  assert.equal(await page.locator('#requests-registry-options').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Колонки', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByRole('columnheader', { name: 'Источник', exact: true }).waitFor();
  for (const label of ['Адрес объекта', 'Специальности', 'Заказчик']) await page.getByRole('columnheader', { name: label, exact: true }).waitFor();
  assert.deepEqual(await page.locator('.sales-request-table tbody .cell-title').allTextContents(), originalTitles, 'Changing visible columns preserves the request records');
  const savedLayout = await tableLayout(page);
  assert.equal(savedLayout.widths[savedLayout.headers.indexOf('Потребность')], '340px');
  assert.ok(savedLayout.pinned.some(cell => cell.label === 'Потребность' && cell.left === '270px'));
  assert.equal(savedLayout.headers.indexOf('Источник'), savedLayout.headers.indexOf('КП') - 1, 'Column order changes visibly');
  await page.getByRole('button', { name: 'Группировка', exact: true }).click();
  await page.getByRole('combobox', { name: 'Первый уровень', exact: true }).selectOption('stage');
  await page.getByRole('combobox', { name: 'Второй уровень', exact: true }).selectOption('owner');
  await page.getByRole('combobox', { name: 'Второй уровень', exact: true }).press('Escape');
  const indentation = await page.locator('.requests-group-row button').evaluateAll(buttons => [...new Set(buttons.map(button => button.style.paddingLeft))]);
  assert.deepEqual(indentation.sort(), ['14px', '36px'], 'Two distinct grouping levels are rendered');
  const group = page.locator('.requests-group-row button').first();
  await group.click(); assert.equal(await group.getAttribute('aria-expanded'), 'false');
  await group.click(); assert.equal(await group.getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: 'Сохранить представление', exact: true }).click();
  await page.getByPlaceholder('Например, КП у заказчика').fill('QA: этапы и источник');
  await page.getByRole('button', { name: 'Сохранить вид', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.getByLabel('Сохранённый вид заявок').locator('option:checked').textContent(), 'QA: этапы и источник');
  await page.getByRole('columnheader', { name: 'Источник', exact: true }).waitFor();
  assert.deepEqual(await tableLayout(page), savedLayout, 'Column order, width and pinning survive reload');
  await page.getByRole('button', { name: 'Группировка', exact: true }).click();
  assert.equal(await page.getByRole('combobox', { name: 'Первый уровень', exact: true }).inputValue(), 'stage');
  assert.equal(await page.getByRole('combobox', { name: 'Второй уровень', exact: true }).inputValue(), 'owner');
  await page.getByRole('combobox', { name: 'Второй уровень', exact: true }).press('Escape');
  await checkScrollDock(page, '.sales-table-wrap', 'Прокрутка таблицы заявок');
  await page.getByRole('button', { name: 'Доска', exact: true }).click();
  await page.locator('.requests-board').waitFor();
  await checkScrollDock(page, '.requests-board', 'Прокрутка доски заявок');
  const before = await page.locator('.sales-board-column').count();
  await page.getByLabel('Скрыть пустые этапы').check();
  assert.ok(await page.locator('.sales-board-column').count() < before, 'Empty stages are hidden');
  await bounded(page, 'board-occupied-1440-light');
  await page.getByLabel('Вид заявок', { exact: true }).getByRole('button', { name: 'Аналитика', exact: true }).click();
  await page.locator('.request-funnel-readable-row').first().waitFor();
  assert.ok(await page.locator('.request-kpi-overview').count());
  await page.getByRole('heading', { name: 'Поступление заявок', exact: true }).waitFor();
  const charts = await page.locator('.request-trend-chart').evaluateAll(elements => elements.map(element => element.getBoundingClientRect().top));
  assert.ok(Math.abs(charts[0] - charts[1]) <= 1, 'Desktop chart axes align despite different header controls');
  const outcomes = page.locator('.request-trend-card').filter({ has: page.getByRole('heading', { name: 'Коммерческий результат', exact: true }) });
  const outcomeModes = outcomes.getByRole('group', { name: 'Показатель коммерческого результата', exact: true });
  await outcomeModes.getByRole('button', { name: 'Согласовано', exact: true }).click();
  assert.equal(await outcomeModes.getByRole('button', { name: 'Согласовано', exact: true }).getAttribute('aria-pressed'), 'true');
  await outcomes.getByText(/События в периоде, включая ранее созданные заявки/).waitFor();
  await outcomeModes.getByRole('button', { name: 'Конверсия новых', exact: true }).click();
  assert.equal(await outcomeModes.getByRole('button', { name: 'Конверсия новых', exact: true }).getAttribute('aria-pressed'), 'true');
  await outcomes.getByText(/Накопительная конверсия новых заявок периода/).waitFor();
  await outcomes.getByText(/Единица: % от новых заявок/).waitFor();
  await outcomeModes.getByRole('button', { name: 'Первое КП', exact: true }).click();
  assert.equal(await outcomeModes.getByRole('button', { name: 'Первое КП', exact: true }).getAttribute('aria-pressed'), 'true');
  const details = page.locator('details.request-stage-details');
  assert.equal(await details.getAttribute('open'), null, 'Stage detail table is collapsed initially');
  await details.locator('summary').click();
  assert.equal(await details.evaluate(element => element.open), true);
  assert.equal(await details.locator('tbody tr').count(), await page.locator('.request-funnel-readable-row').count(), 'Details expose each funnel stage');
  await details.getByRole('button', { name: 'Экспорт', exact: true }).waitFor();
  await details.locator('summary').click();
  assert.equal(await details.evaluate(element => element.open), false);
  await page.locator('.request-funnel-readable-row').first().click();
  await page.locator('.sales-results').filter({ hasText: 'Выборка из аналитики' }).waitFor();
  await page.getByLabel('Сохранённый вид заявок').selectOption('active');
  await page.getByRole('button', { name: 'Форма для заказчика', exact: true }).click();
  await page.getByText(/В демо внешняя ссылка/).waitFor();
  await goto(page, '/requests/new');
  await page.getByRole('heading', { name: 'Быстрое заполнение', exact: true }).waitFor();
  await page.getByLabel('Название заявки', { exact: true }).fill('QA — персонал на склад');
  await page.getByLabel('Компания / рабочее название', { exact: true }).fill('ООО Проверка');
  await page.getByLabel('Контактное лицо', { exact: true }).fill('Ирина');
  await page.getByLabel('Телефон', { exact: true }).fill('+7 999 000 00 00');
  await page.getByLabel('Адрес объекта', { exact: true }).fill('Москва, Проверочная улица, 12');
  await page.getByLabel('Специальность', { exact: true }).fill('Комплектовщик');
  await page.getByLabel('Количество', { exact: true }).fill('12');
  await page.getByLabel('Плановый старт', { exact: true }).fill('2026-10-15');
  await page.getByLabel('Заметки разговора').fill('Обсудить развозку и ночные смены');
  await page.getByRole('button', { name: /Заказчик и объект/ }).click();
  assert.equal(await page.getByLabel('Название заявки', { exact: true }).inputValue(), 'QA — персонал на склад');
  await page.getByRole('button', { name: /Быстрое заполнение/ }).click();
  assert.equal(await page.getByLabel('Количество', { exact: true }).inputValue(), '12');
  await page.getByRole('button', { name: 'Сохранить черновик', exact: true }).click();
  await page.waitForURL(/\/requests\?demo=/);
  await page.getByRole('link', { name: 'QA — персонал на склад', exact: true }).waitFor();
  const createdRow = page.locator('.sales-request-table tbody tr').filter({ has: page.getByRole('link', { name: 'QA — персонал на склад', exact: true }) });
  assert.equal(await createdRow.locator('.requests-cell-location').textContent(), 'Москва, Проверочная улица, 12');
  assert.equal(await createdRow.locator('.requests-cell-roles').textContent(), 'Комплектовщик · 12');
  assert.equal(await createdRow.locator('.requests-cell-client').count(), 1, 'Optional client column remains available after creating a draft');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('link', { name: 'QA — персонал на склад', exact: true }).click();
  await page.getByLabel('Количество', { exact: true }).waitFor();
  assert.equal(await page.getByLabel('Количество', { exact: true }).inputValue(), '12');
  assert.equal(await page.getByLabel('Телефон', { exact: true }).inputValue(), '+7 999 000 00 00');
  await context.close();

  // Optional isolated fixture for the public component. Intercept submission locally;
  // never point this option at a customer's active intake link.
  if (process.env.PUBLIC_INTAKE_QA_PATH) {
    for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
      const c = await contextFor(width, theme); const p = await c.newPage(); observe(p);
      let submitted;
      await p.route('**/api/public/request-intake/qa-fixture', async route => {
        submitted = route.request().postDataJSON();
        await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 'qa-reference', reference: 'qa-reference' }) });
      });
      await goto(p, process.env.PUBLIC_INTAKE_QA_PATH);
      await p.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
      await p.getByLabel('Компания *', { exact: true }).fill('ООО Проверка');
      await p.getByLabel('Имя / ФИО *', { exact: true }).fill('Ирина');
      await bounded(p, `public-company-${width}-${theme}`);
      await p.getByRole('button', { name: 'Далее', exact: true }).click();
      await p.getByLabel('Специальность', { exact: true }).fill('Комплектовщик');
      await p.getByLabel('Количество', { exact: true }).fill('12');
      await bounded(p, `public-need-${width}-${theme}`);
      await p.getByRole('button', { name: 'Далее', exact: true }).click();
      await p.getByLabel('График', { exact: false }).selectOption('custom');
      await p.getByLabel('Укажите график').fill('Смены по согласованию');
      await bounded(p, `public-conditions-${width}-${theme}`);
      await p.getByRole('button', { name: 'Далее', exact: true }).click();
      await p.getByRole('button', { name: 'Отправить заявку', exact: true }).click();
      await p.locator('.public-intake-card').getByRole('alert').waitFor();
      assert.equal(submitted, undefined, 'Contact validation prevents submission');
      await p.getByLabel('Эл. почта', { exact: true }).fill('irina@example.test');
      await p.getByRole('button', { name: /Проверка$/, exact: false }).click();
      await bounded(p, `public-review-${width}-${theme}`);
      await p.getByRole('button', { name: 'Отправить заявку', exact: true }).click();
      await p.getByText('Заявка отправлена', { exact: true }).waitFor();
      assert.equal(submitted.roles[0].count, 12);
      assert.equal(submitted.schedule.pattern, 'Смены по согласованию');
      assert.equal(submitted.intake.contact.email, 'irina@example.test');
      await p.getByText('qa-reference', { exact: true }).waitFor();
      await c.close();
    }
  }

  for (const width of [1440, 1024, 768, 390]) for (const theme of ['light', 'dark']) {
    const c = await contextFor(width, theme); const p = await c.newPage(); observe(p);
    for (const [path, name] of [['/requests', 'table'], ['/requests?view=board', 'board'], ['/requests?view=analytics', 'analytics'], ['/requests/new', 'form']]) {
      await goto(p, path);
      if (name === 'analytics') await p.locator('.request-funnel-readable-row').first().waitFor();
      await bounded(p, `${name}-${width}-${theme}`);
      if(name==='table'){
        await p.getByRole('button',{name:'Колонки',exact:true}).click();
        await p.getByRole('checkbox',{name:'Адрес объекта',exact:true}).check();
        if(width===390) assert.ok(await p.locator('.registry-column-setting').first().evaluate(row=>row.querySelector('.registry-column-width').getBoundingClientRect().top>=row.querySelector('.registry-column-name').getBoundingClientRect().bottom),'On mobile, width controls have their own row below the full label');
        await bounded(p, `column-settings-${width}-${theme}`);
        await p.getByRole('button',{name:'Закрыть настройки представления',exact:true}).click();
      }
    }
    await c.close();
  }
  assert.deepEqual(errors, [], 'No uncaught browser exceptions');
  if (process.env.PUBLIC_INTAKE_QA_PATH) console.log('Public intake QA passed: all four steps, contact validation, custom schedule and confirmation; 16 responsive light/dark captures with intercepted submission.');
  console.log('Requests browser QA passed: persisted column order/width/pinning, optional fields, two-level groups, table/board scroll docks, event/conversion charts, collapsed stage details, saved views, stage filters, analytics drilldown and demo draft persistence; 40 responsive light/dark captures.');
} finally { await browser.close(); }
