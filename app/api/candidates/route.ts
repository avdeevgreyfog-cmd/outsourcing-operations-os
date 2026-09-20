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
  preferredChannel: z.enum(["phone","whatsapp","telegram","email","other"]).nullable().optional(),
  telegram: z.string().trim().max(120).nullable().optional(),
  whatsapp: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(240).nullable().optional(),
  source: z.string().trim().max(240).nullable().optional(),
  sourceChannel: z.string().trim().max(240).nullable().optional(),
  sourceCampaign: z.string().trim().max(500).nullable().optional(),
  sourceReference: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
  needId: z.string().uuid(),
  nextActionAt: z.string().datetime().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"recruiting.candidate.create");
    if (actor.demo) return NextResponse.json({error:"В демо-режиме кандидат сохраняется локально в браузере"},{status:409});
    const body = schema.parse(await request.json());
    if (!body.phone && !body.email) return NextResponse.json({error:"Укажите телефон или email кандидата"},{status:400});

    const result = await withTenant(actor.organizationId, actor.userId, async sql => sql.begin(async tx => {
      const [need] = await tx<Array<{id:string;organizationId:string;objectId:string|null;regionId:string|null;clientId:string|null;ownerUserId:string|null;managerUserId:string|null;conditions:Record<string,unknown>;assigneeUserIds:string[]}>>`
        SELECT n.id,n.organization_id "organizationId",n.object_id "objectId",COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
          n.owner_user_id "ownerUserId",n.manager_user_id "managerUserId",n.conditions_snapshot conditions,
          ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=n.id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
            || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=n.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
        FROM needs n LEFT JOIN objects o ON o.id=n.object_id WHERE n.id=${body.needId}::uuid AND n.status IN ('open','in_progress')
      `;
      if (!need) throw new Error("Потребность не найдена или уже закрыта");
      if (!canReadRow(actor.access,"recruiting.candidate.create",need,actor)) throw new AccessDeniedError("recruiting.candidate.create");

      const [existing] = await tx<Array<{id:string}>>`
        SELECT id FROM candidates
        WHERE (${body.phone??null} IS NOT NULL AND regexp_replace(COALESCE(phone,''),'\\D','','g')=regexp_replace(${body.phone??''},'\\D','','g'))
           OR (${body.email??null} IS NOT NULL AND lower(COALESCE(email,''))=lower(${body.email??''}))
        ORDER BY created_at LIMIT 1
      `;
      let candidateId = existing?.id;
      if (!candidateId) {
        const [candidate] = await tx<Array<{id:string}>>`
          INSERT INTO candidates(organization_id,full_name,phone,email,preferred_channel,telegram,whatsapp,city,source,source_channel,source_campaign,source_reference,notes,original_recruiter_user_id,current_recruiter_user_id,created_by_user_id,status)
          VALUES(${actor.organizationId}::uuid,${body.fullName},${body.phone??null},${body.email??null},${body.preferredChannel??null},${body.telegram??null},${body.whatsapp??null},${body.city??null},${body.source??'Ручной ввод'},${body.sourceChannel??null},${body.sourceCampaign??null},${body.sourceReference??null},${body.notes??null},${actor.userId}::uuid,${actor.userId}::uuid,${actor.userId}::uuid,'active')
          RETURNING id
        `;
        candidateId = candidate.id;
      }
      const [duplicate] = await tx<Array<{id:string}>>`SELECT id FROM candidate_applications WHERE candidate_id=${candidateId}::uuid AND need_id=${body.needId}::uuid`;
      if (duplicate) return {candidateId,applicationId:duplicate.id,duplicate:true};
      const conditionSnapshot = JSON.parse(JSON.stringify(need.conditions ?? {}));
      const [application] = await tx<Array<{id:string}>>`
        INSERT INTO candidate_applications(organization_id,candidate_id,need_id,object_id,stage,next_action_at,owner_user_id,manager_user_id,responsible_user_id,conditions_snapshot,source_snapshot,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${candidateId}::uuid,${body.needId}::uuid,${need.objectId}::uuid,'new',${body.nextActionAt??null}::timestamptz,${need.ownerUserId??actor.userId}::uuid,${need.managerUserId}::uuid,${need.ownerUserId??actor.userId}::uuid,${sql.json(conditionSnapshot)},${sql.json({source:body.source??"Ручной ввод",channel:body.sourceChannel??null,campaign:body.sourceCampaign??null,reference:body.sourceReference??null})},${actor.userId}::uuid)
        RETURNING id
      `;
      const requiredDocuments=Array.isArray(conditionSnapshot.documents)
        ? conditionSnapshot.documents.filter((value:unknown):value is string=>typeof value==="string"&&value.trim().length>0)
        : [];
      for(const [index,documentName] of requiredDocuments.entries()){
        await tx`
          INSERT INTO candidate_application_documents(
            organization_id,application_id,document_name,status,required,sort_order,updated_by_user_id
          ) VALUES(
            ${actor.organizationId}::uuid,${application.id}::uuid,${documentName.trim()},'missing',true,${index*10},${actor.userId}::uuid
          )
          ON CONFLICT (application_id,document_name) DO NOTHING
        `;
      }
      await tx`INSERT INTO candidate_stage_history(organization_id,application_id,from_stage,to_stage,reason,changed_by_user_id)
        VALUES(${actor.organizationId}::uuid,${application.id}::uuid,NULL,'new','Кандидат добавлен в потребность',${actor.userId}::uuid)`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate',${candidateId}::uuid,'application_created',${`Кандидат добавлен в подбор: ${body.fullName}`},${sql.json({applicationId:application.id,needId:body.needId})})`;
      return {candidateId,applicationId:application.id,duplicate:false};
    }));
    return NextResponse.json(result,{status:result.duplicate?200:201});
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({error:"Проверьте данные кандидата",issues:error.issues},{status:400});
    if (error instanceof AccessDeniedError) return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
