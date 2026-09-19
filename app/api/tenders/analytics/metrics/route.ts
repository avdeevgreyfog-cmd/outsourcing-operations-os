import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { isTenderAnalyticsMetricKey, type TenderAnalyticsMetricKey } from "@/lib/tenders/analytics-metric-registry";
import { saveTenderAnalyticsMetricPreferences } from "@/lib/tenders/analytics-metrics";

const schema=z.object({
  items:z.array(z.object({
    key:z.string().refine(isTenderAnalyticsMetricKey,"Неизвестная метрика"),
    label:z.string().trim().min(1).max(120),
    visible:z.boolean(),
    position:z.number().int().min(0).max(10000),
    targetValue:z.number().finite().nullable(),
  })).min(1).max(60),
});

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    const body=schema.parse(await request.json());
    const items=body.items.map(item=>({...item,key:item.key as TenderAnalyticsMetricKey}));
    const result=await saveTenderAnalyticsMetricPreferences(actor,items);
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте настройки показателей",issues:error.issues},{status:400});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
