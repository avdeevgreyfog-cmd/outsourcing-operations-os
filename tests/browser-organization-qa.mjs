import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { spawn } from "node:child_process";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
let server;
if (process.env.START_SERVER === "1") {
  server = spawn("./node_modules/.bin/next", ["start", "-H", "127.0.0.1", "-p", "3000"], { stdio: "inherit", env: { ...process.env, DEMO_MODE: "true" } });
  for (let attempt = 0; attempt < 40; attempt++) {
    try { const response = await fetch(baseURL); if (response.ok || response.status < 500) break; }
    catch { await new Promise((resolve) => setTimeout(resolve, 250)); }
  }
  process.on("exit", () => server?.kill("SIGTERM"));
}
const output = "artifacts/screenshots";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
const page = await context.newPage();
const errors = [];
page.on("console", (message) => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

async function check(path, name, assertion) {
  const response = await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`${path} returned ${response?.status()}`);
  if (await page.locator("[data-nextjs-dialog]").count()) throw new Error(`${path} has Next.js error overlay`);
  if (!(await page.locator("body").innerText()).trim()) throw new Error(`${path} rendered a blank page`);
  await assertion();
  await page.screenshot({ path: `${output}/${name}-1440-light.png`, fullPage: true });
}

await check("/organization/structure", "organization-structure", async () => {
  await page.getByRole("heading", { name: "Оргструктура" }).waitFor();
  const layoutToggle = page.getByRole("button", { name: "Компактно" });
  if (await layoutToggle.getAttribute("aria-pressed") !== "true") throw new Error("Compact org layout is not active by default");
  await layoutToggle.click();
  if (!page.url().includes("layout=wide")) throw new Error("Org layout state was not persisted in URL");
  await page.getByRole("button", { name: "Широко" }).click();
  await page.getByPlaceholder("Подразделение, сотрудник или роль").fill("Москва");
  await page.getByRole("button", { name: "Вместить структуру в экран" }).click();
  await page.getByPlaceholder("Подразделение, сотрудник или роль").fill("");
  await page.getByRole("tab", { name: "Штат и назначения" }).click();
  await page.locator(".org-position-card").first().waitFor();
  await page.screenshot({ path: `${output}/organization-structure-positions-1440-light.png`, fullPage: true });
  await page.getByRole("tab", { name: "Подразделения" }).click();
  await page.locator(".org-node-title").first().click();
  await page.locator(".org-detail-drawer").waitFor();
});
await page.getByRole("button", { name: "Закрыть панель" }).click();

await check("/organization/staff", "organization-staff", async () => {
  await page.getByRole("heading", { name: "Сотрудники компании" }).waitFor();
  await page.getByPlaceholder("ФИО, позиция, email или руководитель").fill("Анна");
  const row = page.locator(".employee-table tbody tr").first();
  await row.press("Enter");
  await page.locator(".employee-drawer").waitFor();
});

await check("/organization/positions", "organization-positions", async () => {
  await page.getByRole("heading", { name: "Должности и обязанности" }).waitFor();
  await page.getByRole("tab", { name: /Штатные позиции/ }).click();
  await page.getByText("Менеджер объекта · Москва 2", { exact: true }).first().click();
  await page.getByText("Позиция свободна", { exact: false }).waitFor();
  await page.getByRole("tab", { name: /Ответственность/ }).click();
  await page.getByText("Передача заявки", { exact: true }).waitFor();
});

await check("/organization/departments", "organization-departments", async () => {
  await page.getByRole("heading", { name: "Подразделения и регионы" }).waitFor();
  await page.getByRole("heading", { name: "Изменения структуры" }).waitFor();
  await page.getByRole("heading", { name: "Контроль структуры" }).waitFor();
  await page.getByRole("heading", { name: "Шаблоны структуры" }).waitFor();
});

await page.goto(`${baseURL}/organization/structure`, { waitUntil: "networkidle" });
await page.locator(".topbar .icon-button").first().click();
await page.waitForTimeout(150);
await page.screenshot({ path: `${output}/organization-structure-1440-dark.png`, fullPage: true });

for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
  await page.setViewportSize(viewport);
  await page.goto(`${baseURL}/organization/structure`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Оргструктура" }).waitFor();
  await page.screenshot({ path: `${output}/organization-structure-${viewport.width}-light.png`, fullPage: true });
}

const compact = await browser.newContext({ viewport: { width: 820, height: 900 }, colorScheme: "light" });
const compactPage = await compact.newPage();
await compactPage.goto(`${baseURL}/organization/staff`, { waitUntil: "networkidle" });
await compactPage.getByRole("heading", { name: "Сотрудники компании" }).waitFor();
await compactPage.screenshot({ path: `${output}/organization-staff-820-light.png`, fullPage: true });

await compact.close();
await context.close();
await browser.close();
server?.kill("SIGTERM");
if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
console.log("Organization Core browser QA passed: 4 routes, interactions, dark theme, compact viewport, no console errors.");
