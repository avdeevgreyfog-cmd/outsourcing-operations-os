import { NextResponse } from "next/server";
import { getCurrentActor } from "@/lib/auth/server";
import { db } from "@/lib/db/client";

export async function POST(request:Request){
  const actor=await getCurrentActor({ignorePreview:true});
  if(!actor||actor.demo) return NextResponse.json({error:"Требуется рабочий аккаунт"},{status:401});

  const body=await request.json().catch(()=>({}));
  const currentPassword=String(body.currentPassword??"");
  const newPassword=String(body.newPassword??"");

  if(newPassword.length<12) return NextResponse.json({error:"Новый пароль должен содержать минимум 12 символов"},{status:400});
  if(newPassword.length>128) return NextResponse.json({error:"Пароль слишком длинный"},{status:400});

  const sql=db();
  const [row]=await sql<{password_ok:boolean}[]>`
    SELECT password_hash IS NOT NULL AND password_hash=crypt(${currentPassword},password_hash) password_ok
    FROM app_users
    WHERE id=${actor.userId}::uuid AND is_active=true
  `;
  if(!row?.password_ok) return NextResponse.json({error:"Текущий пароль указан неверно"},{status:400});

  await sql`
    UPDATE app_users
    SET password_hash=crypt(${newPassword},gen_salt('bf',12)),updated_at=now()
    WHERE id=${actor.userId}::uuid
  `;
  return NextResponse.json({ok:true});
}
