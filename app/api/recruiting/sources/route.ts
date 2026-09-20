import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  name:z.string().trim().min(2).max(160),
  kind:z.enum(["job_board","messenger","social","referral","partner","offline","internal","other"]).default("other"),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.sources.configure");
    if(actor.demo)return NextResponse.json({error:"В демонстрационной организации справочник не сохраняется"},{status:409});
    const body=schema.parse(await request.json());
    const item=await withTenant(actor.organizationId,actor.userId,async sql=>{
      const [row]=await sql<Array<{id:string;name:string;kind:string}>>`
        INSERT INTO candidate_source_catalog(organization_id,name,kind,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.name},${body.kind},${actor.userId}::uuid)
        ON CONFLICT (organization_id,name)
        DO UPDATE SET active=true,kind=EXCLUDED.kind,updated_at=now()
        RETURNING id,name,kind
      `;
      return row;
    });
    return NextResponse.json(item,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте источник",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:"Не удалось сохранить источник"},{status:500});
  }
}
