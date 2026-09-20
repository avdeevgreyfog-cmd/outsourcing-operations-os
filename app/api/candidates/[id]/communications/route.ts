import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  applicationId:z.string().uuid().nullable().optional(),
  channel:z.enum(["phone","whatsapp","telegram","max","email","meeting","note","other"]),
  direction:z.enum(["inbound","outbound","internal"]).default("internal"),
  summary:z.string().trim().min(2).max(3000),
  happenedAt:z.string().datetime().nullable().optional(),
});

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"recruiting.candidate.edit");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме коммуникация сохраняется локально в браузере"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{organizationId:string;ownerUserId:string|null;regionId:string|null;objectId:string|null;clientId:string|null;assigneeUserIds:string[]}>>`
        SELECT c.organization_id "organizationId",ca.owner_user_id "ownerUserId",COALESCE(n.region_id,o.region_id) "regionId",ca.object_id "objectId",o.client_company_id "clientId",
          ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
            || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
        FROM candidates c
        LEFT JOIN LATERAL(SELECT ca.* FROM candidate_applications ca WHERE ca.candidate_id=c.id ORDER BY ca.updated_at DESC LIMIT 1) ca ON true
        LEFT JOIN needs n ON n.id=ca.need_id LEFT JOIN objects o ON o.id=ca.object_id
        WHERE c.id=${id}::uuid LIMIT 1
      `;
      if(!scope||(!actor.access.allOrg&&!canReadRow(actor.access,"recruiting.candidate.edit",scope,actor)))throw new AccessDeniedError("recruiting.candidate.edit");
      if(body.applicationId){const [application]=await tx<Array<{id:string}>>`SELECT id FROM candidate_applications WHERE id=${body.applicationId}::uuid AND candidate_id=${id}::uuid`;if(!application)throw new Error("Заявка кандидата не найдена");}
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO candidate_communications(organization_id,candidate_id,application_id,channel,direction,summary,happened_at,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${body.applicationId??null}::uuid,${body.channel},${body.direction},${body.summary},COALESCE(${body.happenedAt??null}::timestamptz,now()),${actor.userId}::uuid)
        RETURNING id
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте запись коммуникации",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
