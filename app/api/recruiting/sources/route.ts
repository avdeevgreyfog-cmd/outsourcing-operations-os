import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const kind=z.enum(["job_site","social","referral","partner","database","offline","internal","other"]);
const createSchema=z.object({name:z.string().trim().min(2).max(120),kind:kind.default("other")});
const patchSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(2).max(120).optional(),kind:kind.optional(),active:z.boolean().optional()});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.sources.manage");
    if(actor.demo)return NextResponse.json({error:"В демонстрационном режиме справочник не сохраняется"},{status:409});
    const body=createSchema.parse(await request.json());
    const code="custom_"+randomUUID().replaceAll("-","").slice(0,12);
    const [item]=await withTenant(actor.organizationId,actor.userId,sql=>sql<Array<{id:string;code:string;name:string;kind:string;active:boolean}>>`
      INSERT INTO recruiting_candidate_sources(organization_id,code,name,kind,created_by_user_id,sort_order)
      VALUES(${actor.organizationId}::uuid,${code},${body.name},${body.kind},${actor.userId}::uuid,500)
      RETURNING id,code,name,kind,active
    `);
    return NextResponse.json(item,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте источник",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось добавить источник"},{status:500});
  }
}

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.sources.manage");
    if(actor.demo)return NextResponse.json({error:"В демонстрационном режиме справочник не сохраняется"},{status:409});
    const body=patchSchema.parse(await request.json());
    const [item]=await withTenant(actor.organizationId,actor.userId,sql=>sql<Array<{id:string;code:string;name:string;kind:string;active:boolean}>>`
      UPDATE recruiting_candidate_sources SET
        name=COALESCE(${body.name??null},name),
        kind=COALESCE(${body.kind??null},kind),
        active=COALESCE(${body.active??null},active),
        updated_at=now()
      WHERE id=${body.id}::uuid
      RETURNING id,code,name,kind,active
    `);
    if(!item)return NextResponse.json({error:"Источник не найден"},{status:404});
    return NextResponse.json(item);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте источник",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось изменить источник"},{status:500});
  }
}
