import { NextResponse } from "next/server";
import { ACCESS_PREVIEW_COOKIE, DEMO_COOKIE, SESSION_COOKIE, WORKSPACE_MODE_COOKIE } from "@/lib/auth/server";

export async function POST(request:Request){
  const response=NextResponse.redirect(new URL("/login",request.url));
  for(const name of [SESSION_COOKIE,ACCESS_PREVIEW_COOKIE,DEMO_COOKIE,WORKSPACE_MODE_COOKIE]){
    response.cookies.set(name,"",{httpOnly:name!==DEMO_COOKIE,sameSite:"lax",path:"/",maxAge:0});
  }
  return response;
}
