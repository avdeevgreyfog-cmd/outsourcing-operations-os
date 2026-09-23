import { NextResponse } from "next/server";
import { hasDatabase } from "@/lib/db/client";
import { isDemoMode } from "@/lib/demo/mode";

export async function GET(){
  return NextResponse.json({
    ok:true,
    databaseConfigured:hasDatabase(),
    demoAvailable:isDemoMode(),
    deploymentSha:process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  });
}
