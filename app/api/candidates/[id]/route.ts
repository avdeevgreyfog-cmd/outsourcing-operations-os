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
  contacts:z.array(z.object({
    id:z.string().uuid().optional(),
    channel:z.enum(["phone","email","telegram","whatsapp","max","other"]),
    value:z.string().trim().min(1).max(240),
    label:z.string().trim().max(120).nullable().optional(),
    isPreferred:z.boolean().optional(),
    active:z.boolean().optional(),
  })).max(20).optional(),
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
        SELECT c.id,c.organization_id "organizationId",ca.owner_user_id "ownerUserId",COALESCE(n.region_id,o.region_id) "regionId",ca.object_id "objectId",o.client_company_id "clientId",
          ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
            || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
        FROM candidates c JOIN candidate_applications ca ON ca.candidate_id=c.id JOIN needs n ON n.id=ca.need_id LEFT JOIN objects o ON o.id=ca.object_id
        WHERE c.id=${id}::uuid ORDER BY ca.updated_at DESC LIMIT 1
      `;
      if(!scope||!canReadRow(actor.access,"recruiting.candidate.edit",scope,actor))throw new AccessDeniedError("recruiting.candidate.edit");
      await tx`UPDATE candidates SET full_name=${body.fullName},phone=${body.phone??null},email=${body.email??null},preferred_channel=${body.preferredChannel??null},telegram=${body.telegram??null},whatsapp=${body.whatsapp??null},city=${body.city??null},birth_date=${body.birthDate??null}::date,source=${body.source??null},source_channel=${body.sourceChannel??null},source_campaign=${body.sourceCampaign??null},source_reference=${body.sourceReference??null},notes=${body.notes??null},updated_at=now() WHERE id=${id}::uuid`;
      if(body.contacts){
        const activeIds=body.contacts.flatMap(item=>item.id?[item.id]:[]);
        if(activeIds.length)await tx`UPDATE candidate_contact_methods SET active=false,is_preferred=false,updated_at=now() WHERE candidate_id=${id}::uuid AND id<>ALL(${activeIds}::uuid[])`;
        else await tx`UPDATE candidate_contact_methods SET active=false,is_preferred=false,updated_at=now() WHERE candidate_id=${id}::uuid`;
        if(body.contacts.some(item=>item.isPreferred))await tx`UPDATE candidate_contact_methods SET is_preferred=false,updated_at=now() WHERE candidate_id=${id}::uuid`;
        for(const contact of body.contacts){
          if(contact.id){
            await tx`UPDATE candidate_contact_methods SET channel=${contact.channel},value=${contact.value},label=${contact.label??null},is_preferred=${contact.isPreferred??false},active=${contact.active!==false},updated_at=now() WHERE id=${contact.id}::uuid AND candidate_id=${id}::uuid`;
          }else{
            await tx`
              INSERT INTO candidate_contact_methods(organization_id,candidate_id,channel,value,label,is_preferred,active,created_by_user_id)
              VALUES(${actor.organizationId}::uuid,${id}::uuid,${contact.channel},${contact.value},${contact.label??null},${contact.isPreferred??false},${contact.active!==false},${actor.userId}::uuid)
              ON CONFLICT(candidate_id,channel,value) DO UPDATE SET label=EXCLUDED.label,is_preferred=EXCLUDED.is_preferred,active=EXCLUDED.active,updated_at=now()
            `;
          }
        }
      }
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
