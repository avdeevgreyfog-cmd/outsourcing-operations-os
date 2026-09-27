const base=process.env.CI_SMOKE_BASE_URL??"http://127.0.0.1:3100";
const password=process.env.CI_SMOKE_PASSWORD;
if(!password)throw new Error("CI_SMOKE_PASSWORD is required");

const login=await fetch(base+"/api/session/login",{
  method:"POST",
  headers:{"content-type":"application/json"},
  body:JSON.stringify({
    organization:"sergey-work",
    email:"avdeevgreyfog@gmail.com",
    password,
  }),
});
if(!login.ok)throw new Error("Real workspace login failed: "+login.status+" "+await login.text());

const cookies=typeof login.headers.getSetCookie==="function"
  ?login.headers.getSetCookie()
  :[login.headers.get("set-cookie")??""];
const sessionCookie=cookies
  .map(value=>value.split(";")[0])
  .find(value=>value.startsWith("oo_session="));
if(!sessionCookie)throw new Error("Login did not return a workspace session cookie");

const response=await fetch(base+"/objects/b3000000-0000-4000-8000-000000000901",{
  headers:{cookie:sessionCookie},
  redirect:"follow",
});
const html=await response.text();
if(response.status!==200)throw new Error("Real tenant object route returned "+response.status);
if(!html.includes("CI Рабочий объект"))throw new Error("Real tenant object identity is missing from rendered HTML");
for(const marker of ["Не удалось загрузить интерфейс","Не удалось открыть карточку объекта"]){
  if(html.includes(marker))throw new Error("Real tenant object route rendered an error boundary: "+marker);
}
console.log("Real tenant object render passed:",response.status);
