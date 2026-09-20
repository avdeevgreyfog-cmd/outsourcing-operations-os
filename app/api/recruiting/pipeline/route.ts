import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { getRecruitingPipeline } from "@/lib/recruiting/service";

const patchSchema=z.object({
  stages:z.array(z.object({
    stageCode:z.string().min(1).max(80),
    label:z.string().trim().min(1).max(120),
    sortOrder:z.number().int().min(0).max(10000),
    active:z.boolean(),
  })).min(1).max(30),
});

export async function GET(){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    return NextResponse.json({items:await getRecruitingPipeline(actor)});
  }catch(error){
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:"Не удалось загрузить этапы воронки"},{status:500});
  }
}

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.pipeline.configure");
    if(actor.demo)return NextResponse.json({error:"В демонстрационной организации настройки не сохраняются"},{status:409});
    const body=patchSchema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const codes=body.stages.map(item=>item.stageCode);
      const existing=await tx<Array<{stageCode:string}>>`
        SELECT stage_code "stageCode"
        FROM recruiting_pipeline_stage_settings
        WHERE stage_code=ANY(${codes}::text[])
      `;
      if(existing.length!==new Set(codes).size)throw new Error("UNKNOWN_STAGE");
      for(const stage of body.stages){
        await tx`
          UPDATE recruiting_pipeline_stage_settings
          SET label=${stage.label},sort_order=${stage.sortOrder},active=${stage.active},
              updated_by_user_id=${actor.userId}::uuid,updated_at=now()
          WHERE stage_code=${stage.stageCode}
        `;
      }
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте настройки этапов",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    if(error instanceof Error&&error.message==="UNKNOWN_STAGE")return NextResponse.json({error:"Один из этапов больше не существует"},{status:409});
    console.error(error);
    return NextResponse.json({error:"Не удалось сохранить воронку"},{status:500});
  }
}
