import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const schema=z.object({name:z.string().trim().min(2).max(180),code:z.string().trim().max(80).nullable().optional(),category:z.enum(["workwear","ppe","tool","equipment","consumable","other"]),unit:z.string().trim().min(1).max(30).default("шт"),returnable:z.boolean().default(true),tracksVariant:z.boolean().default(false)});
export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"assets.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>{
      const [row]=await sql<Array<{id:string}>>`
        INSERT INTO inventory_items(organization_id,code,name,category,unit,returnable,tracks_variant,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.code??null},${body.name},${body.category},${body.unit},${body.returnable},${body.tracksVariant},${actor.userId}::uuid)
        RETURNING id
      `;return row;
    });
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте номенклатуру",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось создать позицию"},{status:500});
  }
}
