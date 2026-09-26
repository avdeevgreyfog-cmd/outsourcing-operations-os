import { NextResponse } from "next/server";
import { ACCESS_PREVIEW_COOKIE, DEMO_COOKIE, WORKSPACE_MODE_COOKIE } from "@/lib/auth/server";
import { isDemoMode } from "@/lib/demo/mode";

export async function GET(request:Request){
  if(!isDemoMode()) return NextResponse.redirect(new URL("/login",request.url));

  const response=NextResponse.redirect(new URL("/",request.url));
  response.cookies.set(WORKSPACE_MODE_COOKIE,"demo",{
    httpOnly:true,
    secure:process.env.NODE_ENV==="production",
    sameSite:"lax",
    path:"/",
    maxAge:60*60*24*30,
  });
  response.cookies.set(DEMO_COOKIE,"director",{
    httpOnly:false,
    secure:process.env.NODE_ENV==="production",
    sameSite:"lax",
    path:"/",
    maxAge:60*60*24*30,
  });
  response.cookies.set(ACCESS_PREVIEW_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  return response;
}
