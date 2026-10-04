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
try {
  const context = await contextFor();
  const page = await context.newPage(); observe(page);
  await goto(page, '/requests');
  await page.getByRole('button', { name: 'Таблица', exact: true }).waitFor();
  assert.equal(await page.locator('.request-kpi-overview').count(), 0, 'KPIs only belong to analytics');
  const stage = page.getByLabel('Фильтр по этапу');
  await stage.selectOption('agreed');
  assert.equal(await page.getByLabel('Сохранённый вид заявок').inputValue(), 'custom');
  assert.equal(await stage.inputValue(), 'agreed');
  await page.getByLabel('Сохранённый вид заявок').selectOption('active');
  await page.getByRole('button', { name: 'Колонки', exact: true }).click();
  await page.getByLabel('Источник', { exact: true }).check();
  await page.getByLabel('Источник', { exact: true }).press('Escape');
  assert.equal(await page.locator('#requests-registry-options').count(), 0);
  assert.equal(await page.getByRole('button', { name: 'Колонки', exact: true }).evaluate(el => el === document.activeElement), true);
  await page.getByRole('columnheader', { name: 'Источник', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Группировка', exact: true }).click();
  await page.getByLabel('Группировать по').selectOption('stage');
  await page.getByLabel('Группировать по').press('Escape');
  const group = page.locator('.requests-group-row button').first();
  await group.click(); assert.equal(await group.getAttribute('aria-expanded'), 'false');
  await group.click(); assert.equal(await group.getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: /^Виды/ }).click();
  await page.getByPlaceholder('Например, КП у заказчика').fill('QA: этапы и источник');
  await page.getByRole('button', { name: 'Сохранить вид', exact: true }).click();
  await page.reload({ waitUntil: 'networkidle' });
  assert.equal(await page.getByLabel('Сохранённый вид заявок').locator('option:checked').textContent(), 'QA: этапы и источник');
  await page.getByRole('columnheader', { name: 'Источник', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Доска', exact: true }).click();
  await page.locator('.requests-board').waitFor();
  const before = await page.locator('.sales-board-column').count();
  await page.getByLabel('Скрыть пустые этапы').check();
  assert.ok(await page.locator('.sales-board-column').count() < before, 'Empty stages are hidden');
  await bounded(page, 'board-occupied-1440-light');
  await page.getByLabel('Вид заявок', { exact: true }).getByRole('button', { name: 'Аналитика', exact: true }).click();
  await page.locator('.request-funnel-readable-row').first().waitFor();
  assert.ok(await page.locator('.request-kpi-overview').count());
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
    }
    await c.close();
  }
  assert.deepEqual(errors, [], 'No uncaught browser exceptions');
  if (process.env.PUBLIC_INTAKE_QA_PATH) console.log('Public intake QA passed: all four steps, contact validation, custom schedule and confirmation; 16 responsive light/dark captures with intercepted submission.');
  console.log('Requests browser QA passed: saved views, grouping, keyboard focus, stage filters, board, analytics drilldown, demo draft persistence; 32 responsive light/dark captures.');
} finally { await browser.close(); }
