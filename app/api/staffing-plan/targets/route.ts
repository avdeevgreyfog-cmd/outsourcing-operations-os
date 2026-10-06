import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError } from "@/lib/access/server";
import { setStaffingPlanTarget } from "@/lib/operations/staffing-plan";

const schema=z.object({
  objectId:z.string().uuid(),
  specialtyId:z.string().uuid(),
  plannedCount:z.number().int().min(0).max(10000),
  shiftKind:z.enum(["day","night","mixed"]).default("mixed"),
  effectiveFrom:z.string().date(),
  note:z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    const body=schema.parse(await request.json());
    const result=await setStaffingPlanTarget(actor,body);
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры плана",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить план комплектации"},{status:500});
  }
}
