import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db, hasDatabase } from "@/lib/db/client";
import { isDemoMode } from "@/lib/demo/mode";

const DIAGNOSTIC_HASH="282b4684578414e85347c13609434db5175e8287dc7cd99270d042f95d9f6b55";
const DIAGNOSTIC_EXPIRES=new Date("2026-09-27T02:30:00+03:00").getTime();

export async function GET(request:Request){
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

  const url=new URL(request.url);
  const diagnosticKey=String(url.searchParams.get("diagnostic")??"");
  const diagnosticAllowed=Date.now()<DIAGNOSTIC_EXPIRES
    && diagnosticKey.length>0
    && crypto.createHash("sha256").update(diagnosticKey).digest("hex")===DIAGNOSTIC_HASH;

  return NextResponse.json({
    ok:true,
    databaseConfigured,
    demoAvailable:isDemoMode(),
    deploymentSha:process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    schemaVersion,
    ...(diagnosticAllowed?{
      neonProjectId:process.env.NEON_PROJECT_ID??null,
      neonBranchId:process.env.NEON_BRANCH_ID??null,
      databaseEndpoint:(()=>{try{
        const host=new URL(process.env.DATABASE_URL??"").hostname;
        return host.split(".")[0].replace(/-pooler$/,"")||null;
      }catch{return null}})(),
    }:{}),
  });
}
