import assert from "node:assert/strict";
import {mkdir} from "node:fs/promises";
import {chromium} from "playwright";

const baseURL=process.env.BASE_URL??"http://127.0.0.1:3100";
const output=process.env.COMMERCIAL_EDIT_QA_OUTPUT??"artifacts/commercial-editability";
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true});
const errors=[];
const writes=[];

async function contextFor(width=1440,theme="light"){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme});
  context.setDefaultTimeout(12000);
  await context.addCookies([
    {name:"oo_workspace_mode",value:"demo",url:baseURL},
    {name:"oo_demo_role",value:"director",url:baseURL},
    {name:"oo_theme",value:theme,url:baseURL},
  ]);
  await context.route("**/api/{clients,requests,tenders}/**",async route=>{
    if(["POST","PATCH","PUT","DELETE"].includes(route.request().method())){
      writes.push(route.request().method()+" "+route.request().url());
      await route.abort();
    }else await route.continue();
  });
  context.on("page",page=>page.on("pageerror",error=>errors.push(error.message)));
  return context;
}
async function goto(page,path){
  const response=await page.goto(baseURL+path,{waitUntil:"networkidle"});
  assert.equal(response?.status(),200,path);
  assert.equal(await page.locator("[data-nextjs-dialog]").count(),0,path+" rendered Next.js error");
}
async function screenshot(page,name){
  const size=await page.evaluate(()=>({inner:innerWidth,scroll:document.documentElement.scrollWidth}));
  assert.ok(size.scroll<=size.inner+1,name+" document overflow "+JSON.stringify(size));
  await page.screenshot({path:`${output}/${name}.png`,fullPage:true});
}

try{
  for(const [width,theme] of [[1440,"light"],[390,"dark"]]){
    const context=await contextFor(width,theme);
    const page=await context.newPage();
    try{
      await goto(page,"/clients");
      await page.getByRole("button",{name:"Добавить клиента",exact:true}).click();
      let dialog=page.getByRole("dialog");
      await dialog.getByLabel("Рабочее название *",{exact:true}).fill("QA Клиент");
      await dialog.getByRole("button",{name:"Создать клиента",exact:true}).click();
      dialog=page.getByRole("dialog");
      await dialog.getByRole("heading",{name:"QA Клиент",exact:true}).waitFor();
      await dialog.getByRole("button",{name:"Редактировать",exact:true}).click();
      dialog=page.getByRole("dialog");
      await dialog.locator('input[name="name"]').fill("QA Клиент изменён");
      await dialog.locator('input[name="contactName"]').fill("QA Контакт");
      await dialog.locator('input[name="contactPhone"]').fill("+7 999 111-22-33");
      await screenshot(page,`client-edit-${width}-${theme}`);
      await dialog.getByRole("button",{name:"Сохранить изменения",exact:true}).click();
      dialog=page.getByRole("dialog");
      await dialog.getByRole("heading",{name:"QA Клиент изменён",exact:true}).waitFor();
      await dialog.getByText("+7 999 111-22-33",{exact:true}).waitFor();
      await page.keyboard.press("Escape");
      await page.locator(".operis-client-name").filter({hasText:"QA Клиент изменён"}).waitFor();
    }finally{await context.close();}
  }

  for(const [width,theme] of [[1440,"light"],[390,"dark"]]){
    const context=await contextFor(width,theme);
    const page=await context.newPage();
    try{
      await goto(page,"/tenders/new");
      await page.getByLabel("Название тендера *",{exact:true}).fill("QA Тендер");
      await page.getByLabel("Заказчик по закупке",{exact:true}).fill("ООО QA");
      await page.getByRole("button",{name:"Добавить тендер",exact:true}).click();
      await page.waitForURL(/\/tenders$/);
      await page.getByRole("button",{name:"Просмотр: QA Тендер",exact:true}).click();
      let dialog=page.getByRole("dialog");
      await dialog.getByRole("button",{name:"Редактировать",exact:true}).click();
      dialog=page.getByRole("dialog");
      await dialog.locator('input[name="title"]').fill("QA Тендер изменён");
      await dialog.locator('select[name="stage"]').selectOption("analysis");
      await dialog.locator('input[name="nextActionText"]').fill("Проверить документацию");
      await screenshot(page,`tender-edit-${width}-${theme}`);
      await dialog.getByRole("button",{name:"Сохранить изменения",exact:true}).click();
      dialog=page.getByRole("dialog");
      await dialog.getByRole("heading",{name:"QA Тендер изменён",exact:true}).waitFor();
      await dialog.getByText("Проверить документацию",{exact:true}).waitFor();
      await page.keyboard.press("Escape");
      await page.getByRole("button",{name:"Просмотр: QA Тендер изменён",exact:true}).waitFor();
    }finally{await context.close();}
  }

  {
    const context=await contextFor(1440,"light");
    const page=await context.newPage();
    try{
      await goto(page,"/requests/new");
      await page.getByLabel("Название заявки",{exact:true}).fill("QA Заявка");
      await page.getByLabel("Компания / рабочее название",{exact:true}).fill("ООО QA");
      await page.getByLabel("Адрес объекта",{exact:true}).fill("Москва, Проверочная улица, 12");
      await page.getByLabel("Специальность",{exact:true}).fill("Комплектовщик");
      await page.getByLabel("Количество",{exact:true}).fill("12");
      await page.getByRole("button",{name:"Сохранить черновик",exact:true}).click();
      await page.waitForURL(/\/requests\?demo=/);
      await page.getByRole("button",{name:"QA Заявка",exact:true}).waitFor();
      await page.reload({waitUntil:"networkidle"});
      await page.getByRole("button",{name:"QA Заявка",exact:true}).click();
      await page.getByRole("dialog").getByRole("link",{name:"Редактировать",exact:true}).click();
      await page.getByLabel("Количество",{exact:true}).waitFor();
      await page.getByLabel("Название заявки",{exact:true}).fill("QA Заявка изменена");
      await page.getByLabel("Количество",{exact:true}).fill("14");
      await screenshot(page,"request-edit-1440-light");
      await page.getByRole("button",{name:"Сохранить изменения",exact:true}).click();
      await page.waitForURL(/\/requests\?demo=/);
      await page.getByRole("button",{name:"QA Заявка изменена",exact:true}).waitFor();
      const row=page.locator(".sales-request-table tbody tr").filter({has:page.getByRole("button",{name:"QA Заявка изменена",exact:true})});
      await row.getByText("Комплектовщик · 14",{exact:true}).waitFor();
    }finally{await context.close();}
  }

  assert.deepEqual(writes,[],"Demo editability must not send business writes");
  assert.deepEqual(errors,[],"No uncaught browser errors");
  console.log("Commercial editability browser QA passed");
}finally{
  await browser.close();
}
