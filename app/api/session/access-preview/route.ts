import { NextResponse } from "next/server";
import { getCurrentActor, ACCESS_PREVIEW_COOKIE } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request:Request){
  const actor=await getCurrentActor({ignorePreview:true});
  if(!actor||actor.demo) return NextResponse.json({error:"Требуется рабочий аккаунт"},{status:401});
  if(!hasCapability(actor.access,"admin.permissions.manage")&&!hasCapability(actor.access,"organization.access.manage")){
    return NextResponse.json({error:"Недостаточно прав для режима проверки"},{status:403});
  }

  const body=await request.json().catch(()=>({}));
  const roleTemplateId=body.roleTemplateId==null?"":String(body.roleTemplateId);
  const response=NextResponse.json({ok:true});

  if(!roleTemplateId){
    response.cookies.set(ACCESS_PREVIEW_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
    return response;
  }
  if(!uuidPattern.test(roleTemplateId)) return NextResponse.json({error:"Некорректная роль"},{status:400});

  const exists=await withTenant(actor.organizationId,actor.userId,async(tx)=>{
    const [role]=await tx<{id:string}[]>`
      SELECT id FROM role_templates
      WHERE id=${roleTemplateId}::uuid AND organization_id=${actor.organizationId}::uuid
      LIMIT 1
    `;
    return Boolean(role);
  });
  if(!exists) return NextResponse.json({error:"Роль не найдена"},{status:404});

  response.cookies.set(ACCESS_PREVIEW_COOKIE,roleTemplateId,{
    httpOnly:true,
    secure:process.env.NODE_ENV==="production",
    sameSite:"lax",
    path:"/",
    maxAge:60*60*4,
  });
  return response;
}
