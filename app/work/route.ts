import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_PREVIEW_COOKIE, DEMO_COOKIE, SESSION_COOKIE, WORKSPACE_MODE_COOKIE } from "@/lib/auth/server";

export const dynamic="force-dynamic";

function clearDemoState(response:NextResponse){
  response.headers.set("Cache-Control","no-store, max-age=0, must-revalidate");
  response.headers.set("Pragma","no-cache");
  response.headers.set("Vary","Cookie");
  response.cookies.set(WORKSPACE_MODE_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  response.cookies.set(DEMO_COOKIE,"",{httpOnly:false,sameSite:"lax",path:"/",maxAge:0});
  response.cookies.set(ACCESS_PREVIEW_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  return response;
}

export async function GET(){
  const store=await cookies();
  const hasSession=Boolean(store.get(SESSION_COOKIE)?.value);
  const target=hasSession
    ? "/?_operis_reload="+Date.now()
    : "/login?force=work&_operis_reload="+Date.now();
  const safeTarget=JSON.stringify(target);
  const html="<!doctype html><html lang=\"ru\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><meta name=\"robots\" content=\"noindex\"><title>OPERIS</title></head><body style=\"font-family:system-ui,sans-serif;padding:40px\"><p>Открываем рабочую организацию…</p><script>window.location.replace("+safeTarget+");<\/script><noscript><a href=\""+target+"\">Продолжить</a></noscript></body></html>";
  const response=new NextResponse(html,{status:200,headers:{"Content-Type":"text/html; charset=utf-8"}});
  return clearDemoState(response);
}
