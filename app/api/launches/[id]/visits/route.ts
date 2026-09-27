import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { defaultPrimarySiteVisitChecklist } from "@/lib/operations/launch-management";

const schema=z.object({
  scheduledDate:z.string().date(),
  visitType:z.enum(["primary","launch_control","audit","other"]).default("primary"),
});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.edit");
    if(actor.demo)return NextResponse.json({error:"В демо выезды изменяются только локально"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string;clientId:string;assigneeUserIds:string[]}>>`
        SELECT l.organization_id "organizationId",l.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",o.client_company_id "clientId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM launches l JOIN objects o ON o.id=l.object_id WHERE l.id=${id}::uuid
      `;
      if(!scope||!canReadRow(actor.access,"operations.object.edit",scope,actor))throw new AccessDeniedError("operations.object.edit");
      const checklist=body.visitType==="primary"?defaultPrimarySiteVisitChecklist():[];
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO launch_site_visits(organization_id,launch_id,visit_type,scheduled_date,owner_user_id,status,checklist_json,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.visitType},${body.scheduledDate}::date,${scope.ownerUserId}::uuid,'planned',${tx.json(checklist)},${actor.userId}::uuid)
        RETURNING id
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры выезда",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать выезд"},{status:500});
  }
}
