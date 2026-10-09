import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db, hasDatabase } from "@/lib/db/client";
import { isDemoMode } from "@/lib/demo/mode";

function databaseIdentity(){
  const raw=process.env.DATABASE_URL;
  if(!raw)return null;
  try{
    const url=new URL(raw);
    const identity=`${url.hostname.toLowerCase()}:${url.port||"default"}${url.pathname}`;
    return crypto.createHash("sha256").update(identity).digest("hex").slice(0,16);
  }catch{
    return crypto.createHash("sha256").update(raw.replace(/\/\/[^@]+@/,"//")).digest("hex").slice(0,16);
  }
}

export async function GET(){
  const databaseConfigured=hasDatabase();
  let schemaVersion:string|null=null;

  if(databaseConfigured){
    try{
      const [row]=await db()<Array<{filename:string}>>`
        SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1
      `;
      schemaVersion=row?.filename??null;
    }catch(error){
      console.error("Unable to read schema version",error);
    }
  }

  return NextResponse.json({
    ok:true,
    environment:process.env.APP_ENVIRONMENT ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
    databaseConfigured,
    databaseIdentity:databaseIdentity(),
    demoAvailable:isDemoMode(),
    deploymentSha:process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    schemaVersion,
  });
}
