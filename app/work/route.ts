import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db, hasDatabase } from "@/lib/db/client";
import { ACCESS_PREVIEW_COOKIE, hashSessionToken, SESSION_COOKIE, WORKSPACE_MODE_COOKIE } from "@/lib/auth/server";

const PERSONAL_WORKSPACE_SLUG="sergey-work";

function clearWorkspaceMode(response:NextResponse){
  response.cookies.set(WORKSPACE_MODE_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  response.cookies.set(ACCESS_PREVIEW_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  return response;
}

export async function GET(request:Request){
  const loginUrl=new URL("/login",request.url);
  loginUrl.searchParams.set("force","work");

  if(!hasDatabase()) return clearWorkspaceMode(NextResponse.redirect(loginUrl));

  const store=await cookies();
  const raw=store.get(SESSION_COOKIE)?.value;
  if(!raw) return clearWorkspaceMode(NextResponse.redirect(loginUrl));

  const tokenHash=hashSessionToken(raw);
  const sql=db();
  const [workspace]=await sql<{user_id:string;organization_id:string}[]>`
    SELECT s.user_id,o.id organization_id
    FROM sessions s
    JOIN organization_memberships m ON m.user_id=s.user_id AND m.status='active'
    JOIN organizations o ON o.id=m.organization_id
    WHERE s.token_hash=${tokenHash}
      AND s.expires_at>now()
      AND o.slug=${PERSONAL_WORKSPACE_SLUG}
    LIMIT 1
  `;

  if(!workspace) return clearWorkspaceMode(NextResponse.redirect(loginUrl));

  await sql`
    UPDATE sessions
    SET organization_id=${workspace.organization_id}::uuid,last_seen_at=now()
    WHERE token_hash=${tokenHash}
  `;

  return clearWorkspaceMode(NextResponse.redirect(new URL("/",request.url)));
}
