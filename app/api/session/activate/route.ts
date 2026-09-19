import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db, hasDatabase } from "@/lib/db/client";
import { ACCESS_PREVIEW_COOKIE, hashSessionToken, SESSION_COOKIE, WORKSPACE_MODE_COOKIE } from "@/lib/auth/server";

export async function POST(request:Request){
  if(!hasDatabase()) return NextResponse.json({error:"База данных не настроена"},{status:503});
  const body=await request.json().catch(()=>({}));
  const token=String(body.token??"");
  const password=String(body.password??"");

  if(token.length<32) return NextResponse.json({error:"Некорректная ссылка активации"},{status:400});
  if(password.length<12) return NextResponse.json({error:"Пароль должен содержать минимум 12 символов"},{status:400});
  if(password.length>128) return NextResponse.json({error:"Пароль слишком длинный"},{status:400});

  const tokenHash=crypto.createHash("sha256").update(token).digest("hex");
  const rawSession=crypto.randomBytes(32).toString("base64url");
  const sessionHash=hashSessionToken(rawSession);
  const sql=db();

  const result=await sql.begin(async(tx)=>{
    const [row]=await tx<{token_id:string;user_id:string;organization_id:string}[]>`
      SELECT t.id token_id,t.user_id,m.organization_id
      FROM account_activation_tokens t
      JOIN app_users u ON u.id=t.user_id AND u.is_active=true
      JOIN organization_memberships m ON m.user_id=u.id AND m.status='active'
      WHERE t.token_hash=${tokenHash}
        AND t.used_at IS NULL
        AND t.expires_at>now()
      ORDER BY m.created_at ASC
      LIMIT 1
      FOR UPDATE OF t
    `;
    if(!row) return null;

    await tx`
      UPDATE app_users
      SET password_hash=crypt(${password},gen_salt('bf',12)),updated_at=now()
      WHERE id=${row.user_id}::uuid
    `;
    await tx`
      UPDATE account_activation_tokens
      SET used_at=now()
      WHERE id=${row.token_id}::uuid
    `;
    await tx`
      DELETE FROM sessions
      WHERE user_id=${row.user_id}::uuid
    `;
    await tx`
      INSERT INTO sessions(organization_id,user_id,token_hash,expires_at)
      VALUES(${row.organization_id}::uuid,${row.user_id}::uuid,${sessionHash},now()+interval '12 hours')
    `;
    return row;
  });

  if(!result) return NextResponse.json({error:"Ссылка активации недействительна или истекла"},{status:400});

  const response=NextResponse.json({ok:true});
  response.cookies.set(SESSION_COOKIE,rawSession,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge:60*60*12});
  response.cookies.set(WORKSPACE_MODE_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  response.cookies.set(ACCESS_PREVIEW_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
  return response;
}
