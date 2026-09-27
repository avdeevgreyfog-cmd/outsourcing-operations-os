import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  title:z.string().trim().min(2).max(240),
  category:z.string().trim().min(1).max(40).default("other"),
  startDate:z.string().date(),
  endDate:z.string().date(),
  milestone:z.boolean().default(false),
  blocksLaunch:z.boolean().default(false),
});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.edit");
    if(actor.demo)return NextResponse.json({error:"В демо задачи меняются только локально"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    if(body.endDate<body.startDate)return NextResponse.json({error:"Дата окончания раньше даты начала"},{status:400});
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string;clientId:string;assigneeUserIds:string[]}>>`
        SELECT l.organization_id "organizationId",l.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",o.client_company_id "clientId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM launches l JOIN objects o ON o.id=l.object_id WHERE l.id=${id}::uuid
      `;
      if(!scope||!canReadRow(actor.access,"operations.object.edit",scope,actor))throw new AccessDeniedError("operations.object.edit");
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO launch_tasks(organization_id,launch_id,title,owner_user_id,start_date,end_date,baseline_start,baseline_end,progress_pct,status,risk_level,is_milestone,is_critical,category,task_kind,blocks_launch,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.title},${scope.ownerUserId}::uuid,${body.startDate}::date,${body.endDate}::date,${body.startDate}::date,${body.endDate}::date,0,'planned','normal',${body.milestone},${body.blocksLaunch},${body.category},${body.milestone?"milestone":"task"},${body.blocksLaunch},${actor.userId}::uuid)
        RETURNING id
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте задачу",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать задачу"},{status:500});
  }
}
