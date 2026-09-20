import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const stageCode=z.enum(["new","interview","documents","preparation","first_shift","retention_7","retention_30"]);
const patchSchema=z.object({
  stages:z.array(z.object({
    code:stageCode,
    label:z.string().trim().min(1).max(80),
    sortOrder:z.number().int().min(0).max(999),
    active:z.boolean(),
  })).length(7),
});

export async function GET(){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.candidate.read");
    if(actor.demo)return NextResponse.json({items:[]});
    const items=await withTenant(actor.organizationId,actor.userId,sql=>sql<Array<{code:string;label:string;sortOrder:number;active:boolean;systemType:string}>>`
      SELECT code,label,sort_order "sortOrder",active,system_type "systemType"
      FROM recruiting_funnel_stages
      ORDER BY sort_order,created_at
    `);
    return NextResponse.json({items});
  }catch(error){
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось загрузить настройки воронки"},{status:500});
  }
}

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.pipeline.configure");
    if(actor.demo)return NextResponse.json({error:"В демонстрационном режиме настройки не сохраняются"},{status:409});
    const body=patchSchema.parse(await request.json());
    const uniqueCodes=new Set(body.stages.map(item=>item.code));
    if(uniqueCodes.size!==7)return NextResponse.json({error:"Набор этапов неполный"},{status:400});
    if(!body.stages.find(item=>item.code==="new")?.active)return NextResponse.json({error:"Этап входящего контакта нельзя отключить"},{status:400});
    if(!body.stages.find(item=>item.code==="first_shift")?.active)return NextResponse.json({error:"Этап первого выхода нельзя отключить"},{status:400});
    await withTenant(actor.organizationId,actor.userId,sql=>sql.begin(async tx=>{
      for(const item of body.stages){
        await tx`
          UPDATE recruiting_funnel_stages
          SET label=${item.label},sort_order=${item.sortOrder},active=${item.active},updated_at=now()
          WHERE organization_id=${actor.organizationId}::uuid AND code=${item.code}
        `;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'recruiting_funnel',${actor.organizationId}::uuid,'configured','Обновлена настройка воронки подбора',${sql.json({stages:body.stages})})
      `;
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте названия и порядок этапов",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось сохранить настройку воронки"},{status:500});
  }
}
