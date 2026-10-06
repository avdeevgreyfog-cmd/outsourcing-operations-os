import { NextResponse } from "next/server";
import { db, hasDatabase } from "@/lib/db/client";
import { isDemoMode } from "@/lib/demo/mode";

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
    databaseConfigured,
    demoAvailable:isDemoMode(),
    deploymentSha:process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    schemaVersion,
  });
}
