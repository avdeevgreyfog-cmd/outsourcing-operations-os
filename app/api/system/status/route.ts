import { NextResponse } from "next/server";
import { db, hasDatabase } from "@/lib/db/client";
import { isDemoMode } from "@/lib/demo/mode";

const PERSONAL_ORG_ID="00000000-0000-4000-8000-000000000002";
const PERSONAL_USER_ID="10000000-0000-4000-8000-000000000101";

export async function GET(){
  const databaseConfigured=hasDatabase();
  let schemaVersion:string|null=null;
  let personalWorkspaceReady=false;
  let personalAccountPasswordSet=false;

  if(databaseConfigured){
    try{
      const sql=db();
      const [migration]=await sql<Array<{filename:string}>>`
        SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1
      `;
      schemaVersion=migration?.filename??null;
      const [workspace]=await sql<Array<{ready:boolean;passwordSet:boolean}>>`
        SELECT
          EXISTS(
            SELECT 1
            FROM organizations o
            JOIN organization_memberships m ON m.organization_id=o.id AND m.status='active'
            JOIN app_users u ON u.id=m.user_id AND u.is_active=true
            WHERE o.id=${PERSONAL_ORG_ID}::uuid
              AND u.id=${PERSONAL_USER_ID}::uuid
          ) ready,
          EXISTS(
            SELECT 1
            FROM organizations o
            JOIN organization_memberships m ON m.organization_id=o.id AND m.status='active'
            JOIN app_users u ON u.id=m.user_id AND u.is_active=true
            WHERE o.id=${PERSONAL_ORG_ID}::uuid
              AND u.id=${PERSONAL_USER_ID}::uuid
              AND u.password_hash IS NOT NULL
          ) "passwordSet"
      `;
      personalWorkspaceReady=Boolean(workspace?.ready);
      personalAccountPasswordSet=Boolean(workspace?.passwordSet);
    }catch(error){
      console.error("system status database diagnostics failed",error);
    }
  }

  return NextResponse.json({
    ok:true,
    databaseConfigured,
    demoAvailable:isDemoMode(),
    deploymentSha:process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    schemaVersion,
    personalWorkspaceReady,
    personalAccountPasswordSet,
  });
}
