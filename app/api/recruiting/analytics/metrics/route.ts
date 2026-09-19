import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError } from "@/lib/access/server";
import { isRecruitingMetricKey, saveRecruitingMetricPreferences, type RecruitingMetricKey } from "@/lib/recruiting/analytics-metrics";

const schema=z.object({
  items:z.array(z.object({
    key:z.string().refine(isRecruitingMetricKey,"Неизвестная метрика"),
    label:z.string().trim().min(1).max(120),
    visible:z.boolean(),
    position:z.number().int().min(0).max(10000),
    targetValue:z.number().finite().nullable(),
  })).min(1).max(50),
});

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    const body=schema.parse(await request.json());
    const items=body.items.map(item=>({...item,key:item.key as RecruitingMetricKey}));
    const result=await saveRecruitingMetricPreferences(actor,items);
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте настройки показателей",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
