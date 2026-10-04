import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const base=process.env.BASE_URL??"http://127.0.0.1:3000";
const artifacts=process.env.QA_ARTIFACT_DIR??"/tmp/operis-worker-card-qa";
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:800}});
  await context.addCookies([{name:"oo_workspace_mode",value:"demo",url:base},{name:"oo_demo_role",value:"director",url:base}]);
  const page=await context.newPage();
  const errors=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto(`${base}/workers`,{waitUntil:"networkidle"});
  await page.locator(".operis-person").first().click();
  const href=await page.getByRole("link",{name:"Подробнее",exact:true}).getAttribute("href");
  await page.goto(base+href,{waitUntil:"networkidle"});
  const card=page.locator(".worker-entity-workspace");
  assert(await card.locator("h1").isVisible());
  assert.equal(await card.locator(".worker-entity-summary>div").count(),4);
  assert.equal(await card.locator(".status").evaluateAll(nodes=>nodes.some(node=>getComputedStyle(node).backgroundColor!=="rgba(0, 0, 0, 0)")),false);
  await card.getByRole("button",{name:"Редактировать профиль",exact:true}).click();
  const editor=page.getByRole("dialog");
  await editor.getByLabel("ФИО",{exact:true}).fill("Александр Ермаков — проверка");
  await editor.getByLabel("Телефон для звонков").fill("+7 900 111-22-33");
  await editor.getByRole("button",{name:"Добавить способ связи"}).click();
  await editor.getByLabel("Контакт 1",{exact:true}).fill("+7 901 555-66-77");
  await editor.getByRole("button",{name:"Применить в демо"}).click();
  assert.equal(await card.locator("h1").textContent(),"Александр Ермаков — проверка");
  assert(await card.locator(".worker-contact-list").getByText("+7 901 555-66-77",{exact:true}).isVisible());
  assert(await card.getByText("Демо: изменения действуют",{exact:false}).isVisible());

  assert(await card.getByRole("complementary",{name:"Профиль сотрудника"}).isVisible());
  assert.equal(await card.locator(".worker-card-nav>a").count(),6);
  await card.locator(".worker-card-nav").getByRole("link",{name:"Работа",exact:true}).click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get("tab")==="assignments");
  await card.locator(".worker-card-subnav").getByRole("link",{name:"График и отсутствия"}).waitFor({state:"visible"});
  assert.equal(await card.locator(".worker-profile").isVisible(),false);
  const contentWidth=(await card.locator(".worker-card-content").boundingBox()).width;
  const totalWidth=(await card.locator(".worker-card-layout").boundingBox()).width;
  assert(Math.abs(contentWidth-totalWidth)<2);
  assert(await card.locator(".worker-card-subnav").getByRole("link",{name:"График и отсутствия"}).isVisible());
  assert(await card.locator(".worker-card-nav").getByRole("link",{name:"Работа",exact:true}).evaluate(node=>node.getAttribute("aria-current")==="page"));
  await card.locator(".worker-card-nav").getByRole("link",{name:"Обзор",exact:true}).click();
  await page.waitForFunction(()=>new URL(location.href).searchParams.get("tab")==="overview");
  await card.locator(".worker-entity-summary").waitFor({state:"visible"});
  await page.screenshot({path:`${artifacts}/overview-1440.png`,fullPage:true});

  for (const [tab,button] of [["assignments","Настроить назначение"],["assignments","Перевести"],["schedule","Запланировать"],["employment","Завершение работы"]]) {
    await page.goto(`${base}${href}?tab=${tab}`,{waitUntil:"networkidle"});
    await card.getByRole("button",{name:button,exact:true}).click();
    const drawer=page.getByRole("dialog");
    assert.equal(Math.round((await drawer.boundingBox()).width),560);
    assert.equal(await drawer.locator("input[type=checkbox]").evaluateAll(nodes=>nodes.some(node=>node.getBoundingClientRect().width>20)),false);
    await page.screenshot({path:`${artifacts}/${tab}-${button.length}.png`});
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(),0);
  }

  await page.goto(`${base}${href}?tab=timesheets`,{waitUntil:"networkidle"});
  const timesheet=card.getByRole("region",{name:"Личный табель"});
  const firstMonth=await timesheet.getByLabel("Месяц личного табеля").inputValue();
  await timesheet.getByRole("button",{name:"Предыдущий месяц",exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.worker-timesheet-notice[role=status]'));
  const previous=await timesheet.getByLabel("Месяц личного табеля").inputValue();
  assert.notEqual(previous,firstMonth);
  assert((await timesheet.locator(".worker-month-grid tbody tr").count())>0);
  assert((await timesheet.getByRole("link",{name:"Табель объекта",exact:false}).first().getAttribute("href")).includes(`month=${previous}`));
  await page.screenshot({path:`${artifacts}/personal-timesheet.png`,fullPage:true});
  await page.goto(`${base}${href}?tab=employment`,{waitUntil:"networkidle"});
  const blocks=await card.locator(".workspace-grid").first().locator(".section").evaluateAll(nodes=>nodes.map(node=>({top:node.getBoundingClientRect().top,height:node.getBoundingClientRect().height})));
  assert(Math.abs(blocks[0].top-blocks[1].top)<1);
  assert(Math.abs(blocks[0].height-blocks[1].height)<1);
  await page.goto(`${base}${href}?tab=payments`,{waitUntil:"networkidle"});
  assert((await card.locator("tbody tr").count())>0);
  assert.equal(await card.getByText("planned",{exact:true}).count(),0);
  await page.goto(`${base}${href}?tab=documents`,{waitUntil:"networkidle"});
  assert(await card.getByText("Статус оформления задаётся",{exact:false}).isVisible());

  await context.addCookies([{name:"oo_demo_role",value:"recruiter",url:base}]);
  await page.goto(`${base}${href}?tab=payments`,{waitUntil:"networkidle"});
  assert.equal(await card.getByRole("link",{name:"Выплаты",exact:true}).count(),0);
  assert.equal(await card.getByText("Финансовая сводка",{exact:true}).count(),0);
  await page.goto(`${base}${href}?tab=assignments`,{waitUntil:"networkidle"});
  assert.equal(await card.getByRole("columnheader",{name:"Ставка день / ночь"}).count(),0);

  await context.addCookies([{name:"oo_demo_role",value:"director",url:base}]);
  for (const width of [1366,1920,768]) {
    await page.setViewportSize({width,height:900});
    await page.goto(base+href,{waitUntil:"networkidle"});
    assert(await card.locator("h1").isVisible());
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
    await page.screenshot({path:`${artifacts}/overview-${width}.png`,fullPage:true});
  }
  await page.evaluate(()=>document.documentElement.dataset.theme="dark");
  await page.screenshot({path:`${artifacts}/overview-dark.png`,fullPage:true});
  await page.goto(`${base}${href}?tab=assignments`,{waitUntil:"networkidle"});
  await page.evaluate(()=>document.documentElement.dataset.theme="dark");
  await card.getByRole("button",{name:"Перевести",exact:true}).click();
  assert.equal(await page.getByRole("dialog").evaluate(node=>getComputedStyle(node).colorScheme),"dark");
  await page.screenshot({path:`${artifacts}/drawer-dark.png`});
  await page.keyboard.press("Escape");
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:"passed",checks:["overview","four shared drawers","checkbox geometry","payment records","document status","recruiter finance restriction","1366/1440/1920/768 widths","dark render"],errors}));
} finally {
  await browser.close();
}
