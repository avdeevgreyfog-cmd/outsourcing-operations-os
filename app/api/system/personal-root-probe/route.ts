import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";

export const dynamic="force-dynamic";
export const revalidate=0;

const ORG="00000000-0000-4000-8000-000000000002";
const USER="10000000-0000-4000-8000-000000000101";

export async function GET(request:Request){
  const raw=crypto.randomBytes(32).toString("base64url");
  const tokenHash=crypto.createHash("sha256").update(raw).digest("hex");
  const sql=db();
  await sql`
    INSERT INTO sessions(organization_id,user_id,token_hash,expires_at)
    VALUES(${ORG}::uuid,${USER}::uuid,${tokenHash},now()+interval '3 minutes')
  `;
  try{
    const origin=new URL(request.url).origin;
    const cookie=`oo_session=${raw}`;
    const root=await fetch(new URL("/",origin),{
      headers:{cookie,"user-agent":"OPERIS-root-probe","accept":"text/html"},
      redirect:"manual",
      cache:"no-store",
    });
    const body=await root.text();
    const work=await fetch(new URL("/work",origin),{
      headers:{cookie,"user-agent":"OPERIS-root-probe"},
      redirect:"manual",
      cache:"no-store",
    });
    return NextResponse.json({
      ok:true,
      root:{
        status:root.status,
        contentType:root.headers.get("content-type"),
        location:root.headers.get("location"),
        bodyLength:body.length,
        hasCouldntLoad:body.includes("This page couldn"),
        hasOperis:body.includes("OPERIS"),
        hasServerError:body.includes("Internal Server Error")||body.includes("Application error"),
        snippet:body.slice(0,1500),
      },
      work:{
        status:work.status,
        location:work.headers.get("location"),
        setCookie:work.headers.get("set-cookie")?.replace(/=[^;]+/g,"=<redacted>")??null,
      },
    });
  }catch(error){
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:String(error)},{status:500});
  }finally{
    await sql`DELETE FROM sessions WHERE token_hash=${tokenHash}`;
  }
}
