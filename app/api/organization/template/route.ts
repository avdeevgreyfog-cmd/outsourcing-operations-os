import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { organizationTemplates } from "@/lib/core/organization.mjs";

const schema=z.object({template:z.enum(["recruiting","staffing","production"])});
export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"organization.unit.manage");if(actor.demo)return NextResponse.json({error:"В демонстрационном режиме изменения не сохраняются"},{status:409});
    const body=schema.parse(await request.json());const template=organizationTemplates[body.template];
    await withTenant(actor.organizationId,actor.userId,async sql=>{
      let [root]=await sql`SELECT id FROM organization_units WHERE kind='company' ORDER BY created_at LIMIT 1`;
      if(!root)[root]=await sql`INSERT INTO organization_units(organization_id,code,name,kind,sort_order) SELECT id,'company',name,'company',0 FROM organizations WHERE id=${actor.organizationId}::uuid RETURNING id`;
      for(let index=0;index<template.units.length;index++){const name=template.units[index];const code=body.template+"-"+String(index+1);await sql`INSERT INTO organization_units(organization_id,parent_id,code,name,kind,sort_order) VALUES(${actor.organizationId}::uuid,${root.id}::uuid,${code},${name},'department',${(index+1)*10}) ON CONFLICT (organization_id,code) DO NOTHING`}
    });
    return NextResponse.json({ok:true});
  }catch(error){if(error instanceof z.ZodError)return NextResponse.json({error:"Неизвестный шаблон"},{status:400});if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});console.error(error);return NextResponse.json({error:"Не удалось применить шаблон"},{status:500})}
}
