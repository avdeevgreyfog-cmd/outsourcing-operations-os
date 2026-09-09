import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { normalizeTemplateConfig, updateProposalTemplate } from "@/lib/commercial/proposal-template";

const configSchema=z.object({
  documentTitle:z.string().trim().min(2).max(240),
  intro:z.string().trim().max(2500),
  priceDisplay:z.enum(["both","gross_only","net_only"]),
  showIncluded:z.boolean(),showClientProvides:z.boolean(),showTerms:z.boolean(),showManager:z.boolean(),showCta:z.boolean(),
  cta:z.string().trim().max(1000),accent:z.string().regex(/^#[0-9A-Fa-f]{6}$/),
});
const schema=z.object({config:configSchema.optional(),isDefault:z.boolean().optional(),status:z.enum(["active","archived"]).optional()}).refine(value=>Object.keys(value).length>0,"Нет изменений");

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"admin.modules.manage");if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await updateProposalTemplate(actor,id,{...body,config:body.config?normalizeTemplateConfig(body.config):undefined});
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректные настройки шаблона",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить шаблон"},{status:500});
  }
}
