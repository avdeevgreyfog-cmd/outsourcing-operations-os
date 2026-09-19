import { NextResponse } from "next/server";
import { getCurrentActor, ACCESS_PREVIEW_COOKIE } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import type { AccessPreviewTargetType } from "@/lib/access/types";

const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const targetPattern=/^(role_template|position|process_role):([0-9a-f-]{36})$/i;

export async function POST(request:Request){
  const actor=await getCurrentActor({ignorePreview:true});
  if(!actor||actor.demo) return NextResponse.json({error:"Требуется рабочий аккаунт"},{status:401});
  if(!hasCapability(actor.access,"admin.permissions.manage")&&!hasCapability(actor.access,"organization.access.manage")){
    return NextResponse.json({error:"Недостаточно прав для режима проверки"},{status:403});
  }

  const body=await request.json().catch(()=>({}));
  const target=body.target==null?"":String(body.target);
  const response=NextResponse.json({ok:true});

  if(!target){
    response.cookies.set(ACCESS_PREVIEW_COOKIE,"",{httpOnly:true,sameSite:"lax",path:"/",maxAge:0});
    return response;
  }

  const match=targetPattern.exec(target);
  if(!match||!uuidPattern.test(match[2])) return NextResponse.json({error:"Некорректная роль или должность"},{status:400});
  const targetType=match[1] as AccessPreviewTargetType;
  const targetId=match[2];

  const exists=await withTenant(actor.organizationId,actor.userId,async(tx)=>{
    if(targetType==="role_template"){
      const [item]=await tx<{id:string}[]>`SELECT id FROM role_templates WHERE id=${targetId}::uuid AND organization_id=${actor.organizationId}::uuid LIMIT 1`;
      return Boolean(item);
    }
    if(targetType==="position"){
      const [item]=await tx<{id:string}[]>`SELECT id FROM positions WHERE id=${targetId}::uuid AND organization_id=${actor.organizationId}::uuid AND active=true LIMIT 1`;
      return Boolean(item);
    }
    const [item]=await tx<{id:string}[]>`SELECT id FROM process_roles WHERE id=${targetId}::uuid AND organization_id=${actor.organizationId}::uuid AND active=true LIMIT 1`;
    return Boolean(item);
  });
  if(!exists) return NextResponse.json({error:"Роль или должность не найдена"},{status:404});

  response.cookies.set(ACCESS_PREVIEW_COOKIE,`${targetType}:${targetId}`,{
    httpOnly:true,
    secure:process.env.NODE_ENV==="production",
    sameSite:"lax",
    path:"/",
    maxAge:60*60*4,
  });
  return response;
}
