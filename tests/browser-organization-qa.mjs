import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
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
  await page.getByPlaceholder("Сотрудник, роль или подразделение").fill("Москва");
  await page.getByRole("button", { name: "Сбросить масштаб" }).click();
  await page.getByPlaceholder("Сотрудник, роль или подразделение").fill("");
  await page.locator(".org-person-card").first().click();
  await page.getByRole("dialog").waitFor();
});
await page.getByRole("button", { name: "Закрыть" }).click();

await check("/organization/staff", "organization-staff", async () => {
  await page.getByRole("heading", { name: "Сотрудники компании" }).waitFor();
  await page.getByPlaceholder("Имя, должность, роль или ответственность").fill("операции");
  const row = page.locator(".employee-table tbody tr").first();
  await row.press("Enter");
  await page.locator(".directory-detail").waitFor();
});

await check("/organization/positions", "organization-positions", async () => {
  await page.getByRole("heading", { name: "Должности и роли" }).waitFor();
  await page.getByText("Должность + роли + исключения", { exact: true }).waitFor();
});

await check("/organization/departments", "organization-departments", async () => {
  await page.getByRole("heading", { name: "Подразделения и регионы" }).waitFor();
  await page.getByRole("heading", { name: "Шаблоны структуры" }).waitFor();
});

await page.goto(`${baseURL}/organization/structure`, { waitUntil: "networkidle" });
await page.locator(".topbar .icon-button").first().click();
await page.waitForTimeout(150);
await page.screenshot({ path: `${output}/organization-structure-1440-dark.png`, fullPage: true });

const compact = await browser.newContext({ viewport: { width: 820, height: 900 }, colorScheme: "light" });
const compactPage = await compact.newPage();
await compactPage.goto(`${baseURL}/organization/staff`, { waitUntil: "networkidle" });
await compactPage.getByRole("heading", { name: "Сотрудники компании" }).waitFor();
await compactPage.screenshot({ path: `${output}/organization-staff-820-light.png`, fullPage: true });

await compact.close();
await context.close();
await browser.close();
if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
console.log("Organization Core browser QA passed: 4 routes, interactions, dark theme, compact viewport, no console errors.");
