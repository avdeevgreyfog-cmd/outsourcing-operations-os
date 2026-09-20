import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const group=z.enum(["employment","clearance"]);
const provider=z.enum(["candidate","company","client"]);
const createSchema=z.object({
  name:z.string().trim().min(2).max(160),
  groupType:group,
  defaultProvider:provider.default("candidate"),
  defaultRequired:z.boolean().default(false),
});
const patchSchema=z.object({
  id:z.string().uuid(),
  name:z.string().trim().min(2).max(160).optional(),
  groupType:group.optional(),
  defaultProvider:provider.optional(),
  defaultRequired:z.boolean().optional(),
  active:z.boolean().optional(),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.documents.manage");
    if(actor.demo)return NextResponse.json({error:"В GitHub Demo базовый набор сохраняется только локально в интерфейсе"},{status:409});
    const body=createSchema.parse(await request.json());
    const code="custom_"+randomUUID().replaceAll("-","").slice(0,12);
    const [item]=await withTenant(actor.organizationId,actor.userId,sql=>sql<Array<{id:string;code:string;name:string;groupType:string;defaultProvider:string;defaultRequired:boolean;active:boolean}>>`
      INSERT INTO recruiting_document_types(organization_id,code,name,group_type,default_provider,default_required,sort_order)
      VALUES(${actor.organizationId}::uuid,${code},${body.name},${body.groupType},${body.defaultProvider},${body.defaultRequired},500)
      RETURNING id,code,name,group_type "groupType",default_provider "defaultProvider",default_required "defaultRequired",active
    `);
    return NextResponse.json(item,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры документа",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось добавить документ"},{status:500});
  }
}

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.documents.manage");
    if(actor.demo)return NextResponse.json({error:"В GitHub Demo базовый набор сохраняется только локально в интерфейсе"},{status:409});
    const body=patchSchema.parse(await request.json());
    const [item]=await withTenant(actor.organizationId,actor.userId,sql=>sql<Array<{id:string;code:string;name:string;groupType:string;defaultProvider:string;defaultRequired:boolean;active:boolean}>>`
      UPDATE recruiting_document_types SET
        name=COALESCE(${body.name??null},name),
        group_type=COALESCE(${body.groupType??null},group_type),
        default_provider=COALESCE(${body.defaultProvider??null},default_provider),
        default_required=COALESCE(${body.defaultRequired??null},default_required),
        active=COALESCE(${body.active??null},active),
        updated_at=now()
      WHERE id=${body.id}::uuid
      RETURNING id,code,name,group_type "groupType",default_provider "defaultProvider",default_required "defaultRequired",active
    `);
    if(!item)return NextResponse.json({error:"Документ не найден"},{status:404});
    return NextResponse.json(item);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры документа",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось изменить документ"},{status:500});
  }
}
