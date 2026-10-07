const base=process.env.CI_SMOKE_BASE_URL??"http://127.0.0.1:3100";
const password=process.env.CI_SMOKE_PASSWORD;
if(!password)throw new Error("CI_SMOKE_PASSWORD is required");

const client="b2000000-0000-4000-8000-000000000901";
const requestId="bc000000-0000-4000-8000-000000000901";
const tender="be000000-0000-4000-8000-000000000901";
const region="b1000000-0000-4000-8000-000000000901";

const login=await fetch(base+"/api/session/login",{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({organization:"sergey-work",email:"avdeevgreyfog@gmail.com",password}),
});
if(!login.ok)throw new Error("Commercial editability login failed: "+login.status+" "+await login.text());
const cookies=typeof login.headers.getSetCookie==="function"?login.headers.getSetCookie():[login.headers.get("set-cookie")??""];
const sessionCookie=cookies.map(value=>value.split(";")[0]).find(value=>value.startsWith("oo_session="));
if(!sessionCookie)throw new Error("Login did not return a workspace session cookie");
const headers={cookie:sessionCookie,"content-type":"application/json"};

async function jsonRequest(path,method,body){
  const response=await fetch(base+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  const text=await response.text();
  let json={};try{json=text?JSON.parse(text):{};}catch{}
  if(!response.ok)throw new Error(method+" "+path+" failed: "+response.status+" "+text);
  return json;
}
async function page(path,markers){
  const response=await fetch(base+path,{headers:{cookie:sessionCookie},redirect:"follow"});
  const html=await response.text();
  if(response.status!==200)throw new Error(path+" returned "+response.status);
  for(const marker of markers)if(!html.includes(marker))throw new Error(path+" is missing marker: "+marker);
}

await jsonRequest(`/api/clients/${client}`,"PATCH",{
  name:"CI Заказчик обновлён",legalName:"ООО «CI Заказчик»",inn:"7700000901",notes:"CI проверка редактирования клиента",status:"active",
});
const createdContact=await jsonRequest(`/api/clients/${client}/contacts`,"POST",{
  fullName:"CI Контакт",position:"Менеджер",phone:"+7 900 000-09-01",email:"ci-contact@example.test",preferredChannel:"phone",
});
if(!createdContact.id)throw new Error("Client contact creation did not return id");
await jsonRequest(`/api/clients/${client}/contacts/${createdContact.id}`,"PATCH",{
  fullName:"CI Контакт обновлён",position:"Старший менеджер",phone:"+7 900 000-09-02",email:"ci-contact@example.test",telegram:"@ci_contact",preferredChannel:"telegram",
});
await page(`/clients/${client}`,["CI Заказчик обновлён","ООО «CI Заказчик»","7700000901","CI проверка редактирования клиента"]);
await page(`/clients/${client}?tab=contacts`,["CI Контакт обновлён","@ci_contact","Старший менеджер"]);

await jsonRequest(`/api/requests/${requestId}`,"PATCH",{
  action:"update",title:"CI Заявка обновлена",location:"CI новый адрес",comments:"CI проверка редактирования заявки",
});
await page(`/requests/${requestId}`,["CI Заявка обновлена","CI новый адрес"]);
await page(`/requests/${requestId}/edit`,["Редактирование","Сохранить изменения"]);

await jsonRequest(`/api/tenders/${tender}`,"PATCH",{
  action:"core",title:"CI Тендер обновлён",customerName:"CI Заказчик обновлён",clientId:client,platform:"CI ЭТП",procedureNumber:"CI-001",
  sourceUrl:null,sourceName:"CI smoke",publicationDate:null,submissionDeadline:null,initialPrice:100000,billingUnit:"hour",priority:"normal",potential:"medium",
  regionId:region,legalEntityId:null,nextActionText:"Проверить изменения",nextActionAt:null,
});
await jsonRequest(`/api/tenders/${tender}/comments`,"POST",{body:"CI комментарий редактирования тендера"});
await page(`/tenders/${tender}`,["CI Тендер обновлён","Проверить изменения","CI комментарий редактирования тендера"]);

console.log("Commercial editability smoke passed");
