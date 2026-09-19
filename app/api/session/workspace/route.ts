import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db, hasDatabase, withTenant } from "@/lib/db/client";
import { ACCESS_PREVIEW_COOKIE, hashSessionToken, SESSION_COOKIE, WORKSPACE_MODE_COOKIE } from "@/lib/auth/server";
import { isDemoMode } from "@/lib/demo/mode";

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request:Request){
  const body=await request.json().catch(()=>({}));
  const workspace=String(body.workspace??"").trim();
  const response=NextResponse.json({ok:true});

  if(workspace==="demo"){
    if(!isDemoMode()) return NextResponse.json({error:"Демонстрационная организация недоступна"},{status:404});
    response.cookies.set(WORKSPACE_MODE_COOKIE,"demo",{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*24*30});
    response.cookies.set(ACCESS_PREVIEW_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
    return response;
  }

  if(!hasDatabase()||!uuidPattern.test(workspace)) return NextResponse.json({error:"Рабочая организация недоступна"},{status:400});
  const store=await cookies();
  const raw=store.get(SESSION_COOKIE)?.value;
  if(!raw) return NextResponse.json({error:"Требуется вход в рабочую систему"},{status:401});

  const tokenHash=hashSessionToken(raw);
  const sql=db();
  const [session]=await sql<{user_id:string}[]>`
    SELECT user_id FROM sessions
    WHERE token_hash=${tokenHash} AND expires_at>now()
    LIMIT 1
  `;
  if(!session) return NextResponse.json({error:"Сессия истекла"},{status:401});

  const allowed=await withTenant(workspace,session.user_id,async(tx)=>{
    const [membership]=await tx<{id:string}[]>`
      SELECT id FROM organization_memberships
      WHERE organization_id=${workspace}::uuid
        AND user_id=${session.user_id}::uuid
        AND status='active'
      LIMIT 1
    `;
    return Boolean(membership);
  });
  if(!allowed) return NextResponse.json({error:"Нет доступа к организации"},{status:403});

  await sql`
    UPDATE sessions
    SET organization_id=${workspace}::uuid,last_seen_at=now()
    WHERE token_hash=${tokenHash}
  `;
  response.cookies.set(WORKSPACE_MODE_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  response.cookies.set(ACCESS_PREVIEW_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  return response;
}
