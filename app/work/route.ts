import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ACCESS_PREVIEW_COOKIE, DEMO_COOKIE, SESSION_COOKIE, WORKSPACE_MODE_COOKIE } from "@/lib/auth/server";

function clearDemoState(response:NextResponse){
  response.cookies.set(WORKSPACE_MODE_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  response.cookies.set(DEMO_COOKIE,"",{httpOnly:false,sameSite:"lax",path:"/",maxAge:0});
  response.cookies.set(ACCESS_PREVIEW_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  return response;
}

export async function GET(request:Request){
  const store=await cookies();
  const hasSession=Boolean(store.get(SESSION_COOKIE)?.value);
  const target=new URL(hasSession?"/":"/login",request.url);
  if(!hasSession) target.searchParams.set("force","work");
  return clearDemoState(NextResponse.redirect(target));
}
