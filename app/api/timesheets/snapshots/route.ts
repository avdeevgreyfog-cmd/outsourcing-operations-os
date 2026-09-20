import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({objectId:z.string().uuid(),periodStart:z.string().date(),periodEnd:z.string().date(),viewType:z.enum(["client","internal"])});
export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"time.timesheet.submit");if(actor.demo)return NextResponse.json({ok:true});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [object]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid
      `;
      if(!object||!canReadRow(actor.access,"time.timesheet.submit",object,actor))throw new AccessDeniedError("time.timesheet.submit");
      const [total]=await tx<Array<{hours:number|string}>>`
        SELECT COALESCE(sum(fact_hours),0)::numeric hours FROM time_entries
        WHERE object_id=${body.objectId}::uuid AND work_date BETWEEN ${body.periodStart}::date AND ${body.periodEnd}::date
      `;
      const [snapshot]=await tx<Array<{id:string}>>`
        INSERT INTO timesheet_snapshots(organization_id,object_id,view_type,period_type,period_start,period_end,status,snapshot_json,submitted_by_user_id,submitted_at)
        VALUES(${actor.organizationId}::uuid,${body.objectId}::uuid,${body.viewType},'month',${body.periodStart}::date,${body.periodEnd}::date,'submitted',
          ${tx.json({hours:Number(total?.hours??0),generatedAt:new Date().toISOString(),viewType:body.viewType})},${actor.userId}::uuid,now())
        RETURNING id
      `;
      return snapshot;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте период табеля",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось зафиксировать табель"},{status:500});
  }
}
