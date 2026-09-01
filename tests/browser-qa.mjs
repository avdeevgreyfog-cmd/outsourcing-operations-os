import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const baseURL = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const output = "artifacts/screenshots";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
const page = await context.newPage();
const errors = [];
page.on("console", message => { if (message.type() === "error") errors.push(`console: ${message.text()}`); });
page.on("pageerror", error => errors.push(`page: ${error.message}`));

async function check(path, name, assertion) {
  const response = await page.goto(`${baseURL}${path}`, { waitUntil: "networkidle" });
  if (!response?.ok()) throw new Error(`${path} returned ${response?.status()}`);
  if (await page.locator("[data-nextjs-dialog]").count()) throw new Error(`${path} has Next.js error overlay`);
  await assertion?.();
  await page.screenshot({ path: `${output}/${name}-1440-light.png`, fullPage: true });
}

await check("/", "command-center", async () => {
  await page.getByRole("heading", { name: /Что требует внимания|Региональный контур|Операционный день/ }).waitFor();
  await page.keyboard.press("Control+K");
  await page.getByPlaceholder("Клиент, объект, сотрудник или раздел").fill("табели");
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
});
await check("/objects/80000000-0000-4000-8000-000000000001?tab=needs", "object-workspace", async () => {
  await page.getByRole("navigation", { name: "Разделы карточки" }).waitFor();
  await page.getByRole("heading", { name: "Потребности объекта" }).waitFor();
});
await check("/recruiting", "recruiting", async () => {
  await page.locator(".kanban-card").first().click();
  await page.locator(".drawer").waitFor();
});
await page.keyboard.press("Escape");
await check("/workers/88000000-0000-4000-8000-000000000001", "worker-profile", async () => {
  await page.getByRole("navigation", { name: "Разделы карточки" }).waitFor();
});
await check("/shifts", "scheduler", async () => {
  await page.getByRole("button", { name: "День", exact: true }).click();
  await page.locator(".cell-link").first().click();
  await page.locator(".drawer").waitFor();
});
await page.locator(".drawer-close").click();
await check("/timesheets", "timesheet", async () => {
  await page.getByRole("button", { name: "Весь месяц" }).click();
  await page.getByRole("button", { name: "Внутренний" }).click();
  await page.locator(".timesheet").waitFor();
});
await check("/calculations", "calculator", async () => {
  await page.getByRole("button", { name: "НПД / самозанятый" }).click();
  await page.getByText("NPD compliance", { exact: true }).waitFor();
});
await check("/admin/access", "permissions", async () => {
  await page.locator(".access-users button").nth(1).click();
  await page.getByLabel("Индивидуальное правило").selectOption("deny");
});
await check("/launches", "gantt", async () => {
  await page.locator(".gantt-task-name").nth(1).click();
  await page.locator(".drawer").waitFor();
});
await page.keyboard.press("Escape");
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
  await page.locator(".employee-table tbody tr").first().press("Enter");
  await page.locator(".directory-detail").waitFor();
});
await check("/organization/positions", "organization-positions", async () => {
  await page.getByRole("heading", { name: "Должности и роли" }).waitFor();
  await page.getByText("Наследование", { exact: true }).waitFor();
});
await check("/organization/departments", "organization-departments", async () => {
  await page.getByRole("heading", { name: "Подразделения и регионы" }).waitFor();
  await page.getByRole("heading", { name: "Шаблоны структуры" }).waitFor();
});

await page.goto(`${baseURL}/objects/80000000-0000-4000-8000-000000000001`, { waitUntil: "networkidle" });
await page.locator(".topbar .icon-button").first().click();
await page.waitForTimeout(150);
await page.screenshot({ path: `${output}/object-workspace-1440-dark.png`, fullPage: true });

const wide = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: "light" });
const widePage = await wide.newPage();
await widePage.goto(`${baseURL}/analytics?view=comparison`, { waitUntil: "networkidle" });
await widePage.screenshot({ path: `${output}/analytics-comparison-1920-light.png`, fullPage: true });
await wide.close();
await context.close();
await browser.close();
if (errors.length) throw new Error(`Browser errors:\n${errors.join("\n")}`);
console.log("Browser QA passed: 13 light routes, Organization Core interactions, representative dark theme, 1920 comparison view.");
