import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema = z.object({
  fullName: z.string().trim().min(2).max(240),
  phone: z.string().trim().min(5).max(60).nullable().optional(),
  email: z.string().email().nullable().optional(),
  preferredChannel: z.enum(["phone","whatsapp","telegram","max","email","other"]).nullable().optional(),
  telegram: z.string().trim().max(120).nullable().optional(),
  whatsapp: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(240).nullable().optional(),
  birthDate: z.string().date().nullable().optional(),
  source: z.string().trim().max(240).nullable().optional(),
  sourceChannel: z.string().trim().max(240).nullable().optional(),
  sourceCampaign: z.string().trim().max(500).nullable().optional(),
  sourceReference: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
});

export async function PATCH(request: Request,{params}:{params:Promise<{id:string}>}) {
  try {
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"recruiting.candidate.edit");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме карточка сохраняется локально в браузере"},{status:409});
    const {id}=await params;
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{id:string;organizationId:string;ownerUserId:string|null;regionId:string|null;objectId:string|null;clientId:string|null;assigneeUserIds:string[]}>>`
        SELECT c.id,c.organization_id "organizationId",COALESCE(ca.owner_user_id,c.current_recruiter_user_id) "ownerUserId",
          COALESCE(n.region_id,o.region_id) "regionId",ca.object_id "objectId",o.client_company_id "clientId",
          ARRAY_REMOVE(ARRAY[c.current_recruiter_user_id::text,c.original_recruiter_user_id::text,ca.owner_user_id::text,ca.manager_user_id::text],NULL)
            || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
            || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
        FROM candidates c
        LEFT JOIN LATERAL (SELECT x.* FROM candidate_applications x WHERE x.candidate_id=c.id ORDER BY x.updated_at DESC LIMIT 1) ca ON true
        LEFT JOIN needs n ON n.id=ca.need_id LEFT JOIN objects o ON o.id=ca.object_id
        WHERE c.id=${id}::uuid
      `;
      if(!scope||!canReadRow(actor.access,"recruiting.candidate.edit",scope,actor))throw new AccessDeniedError("recruiting.candidate.edit");
      await tx`UPDATE candidates SET full_name=${body.fullName},phone=${body.phone??null},email=${body.email??null},preferred_channel=${body.preferredChannel??null},telegram=${body.telegram??null},whatsapp=${body.whatsapp??null},city=${body.city??null},birth_date=${body.birthDate??null}::date,source=${body.source??null},source_channel=${body.sourceChannel??null},source_campaign=${body.sourceCampaign??null},source_reference=${body.sourceReference??null},notes=${body.notes??null},updated_at=now() WHERE id=${id}::uuid`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata) VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate',${id}::uuid,'profile_updated','Обновлена карточка кандидата','{}'::jsonb)`;
      return {id};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные кандидата",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
