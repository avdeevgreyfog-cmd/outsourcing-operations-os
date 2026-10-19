import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

class CandidateInputError extends Error {}
const schema = z.object({
  fullName: z.string().trim().min(2).max(240),
  phone: z.string().trim().min(5).max(60).nullable().optional(),
  email: z.string().email().nullable().optional(),
  preferredChannel: z.enum(["phone","whatsapp","telegram","max","email","other"]).nullable().optional(),
  telegram: z.string().trim().max(120).nullable().optional(),
  whatsapp: z.string().trim().max(120).nullable().optional(),
  city: z.string().trim().max(240).nullable().optional(),
  source: z.string().trim().max(240).nullable().optional(),
  sourceChannel: z.string().trim().max(240).nullable().optional(),
  sourceCampaign: z.string().trim().max(500).nullable().optional(),
  sourceReference: z.string().trim().max(500).nullable().optional(),
  notes: z.string().trim().max(3000).nullable().optional(),
  contacts: z.array(z.object({
    channel:z.enum(["phone","email","telegram","whatsapp","max","other"]),
    value:z.string().trim().min(1).max(240),
    label:z.string().trim().max(120).nullable().optional(),
    isPreferred:z.boolean().optional(),
  })).max(20).optional(),
  preferredObjectId:z.string().uuid().nullable().optional(),
  preferredSpecialtyId:z.string().uuid().nullable().optional(),
  needId: z.string().uuid().nullable().optional(),
  ownerUserId: z.string().uuid().nullable().optional(),
  originalRecruiterUserId: z.string().uuid().nullable().optional(),
  nextActionAt: z.string().datetime().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"recruiting.candidate.create");
    if (actor.demo) return NextResponse.json({error:"В демо-режиме кандидат сохраняется локально в браузере"},{status:409});
    const body = schema.parse(await request.json());


    const result = await withTenant(actor.organizationId, actor.userId, async sql => sql.begin(async tx => {
      const [need] = await tx<Array<{id:string;organizationId:string;objectId:string|null;regionId:string|null;clientId:string|null;ownerUserId:string|null;managerUserId:string|null;specialtyId:string;conditions:Record<string,unknown>;assigneeUserIds:string[]}>>`
        SELECT n.id,n.organization_id "organizationId",n.object_id "objectId",COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
          n.owner_user_id "ownerUserId",n.manager_user_id "managerUserId",n.specialty_id "specialtyId",n.conditions_snapshot conditions,
          ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=n.id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
            || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=n.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
        FROM needs n LEFT JOIN objects o ON o.id=n.object_id AND o.organization_id=n.organization_id WHERE n.organization_id=${actor.organizationId}::uuid AND n.id=${body.needId??null}::uuid AND n.status IN ('open','in_progress')
      `;
      if (body.needId && !need) throw new CandidateInputError("Потребность не найдена или уже закрыта");
      if (need && !canReadRow(actor.access,"recruiting.candidate.create",need,actor)) throw new AccessDeniedError("recruiting.candidate.create");

      if(body.preferredObjectId){const [object]=await tx<Array<{id:string;objectId:string;organizationId:string;ownerUserId:string|null;createdByUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`SELECT id,id "objectId",organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",region_id "regionId",ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=objects.id AND oa.effective_to IS NULL) "assigneeUserIds" FROM objects WHERE organization_id=${actor.organizationId}::uuid AND id=${body.preferredObjectId}::uuid`;
        if(!object||!canReadRow(actor.access,"operations.object.read",object,actor))throw new AccessDeniedError("operations.object.read");}
      if(body.preferredSpecialtyId){const [specialty]=await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE organization_id=${actor.organizationId}::uuid AND id=${body.preferredSpecialtyId}::uuid AND active`;if(!specialty)throw new CandidateInputError("Специальность недоступна");}
      if(need&&((body.preferredObjectId&&body.preferredObjectId!==need.objectId)||(body.preferredSpecialtyId&&body.preferredSpecialtyId!==need.specialtyId)))throw new CandidateInputError("Выбранные объект или специальность не совпадают с потребностью");
      const attributionIds=[...new Set([body.ownerUserId,body.originalRecruiterUserId].filter((value):value is string=>Boolean(value)))];
      if(attributionIds.length){
        const members=await tx<Array<{id:string}>>`
          SELECT user_id id FROM organization_memberships
          WHERE organization_id=${actor.organizationId}::uuid AND status='active' AND user_id=ANY(${attributionIds}::uuid[])
        `;
        if(members.length!==attributionIds.length)throw new CandidateInputError("Ответственный или первичный рекрутер не является активным сотрудником организации");
      }

      const contactValues=[
        ...(body.phone?[{channel:"phone",value:body.phone}]:[]),
        ...(body.email?[{channel:"email",value:body.email}]:[]),
        ...(body.telegram?[{channel:"telegram",value:body.telegram}]:[]),
        ...(body.whatsapp?[{channel:"whatsapp",value:body.whatsapp}]:[]),
        ...(body.contacts??[]).map(item=>({channel:item.channel,value:item.value})),
      ];
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId+":candidate:create"},0))`;
      const [existing] = await tx<Array<{id:string;organizationId:string;ownerUserId:string|null;createdByUserId:string|null}>>`
        SELECT DISTINCT c.id,c.organization_id "organizationId",c.current_recruiter_user_id "ownerUserId",c.created_by_user_id "createdByUserId" FROM candidates c
        LEFT JOIN candidate_contact_methods cm ON cm.candidate_id=c.id AND cm.active
        WHERE c.organization_id=${actor.organizationId}::uuid AND ((${body.phone??null}::text IS NOT NULL AND regexp_replace(COALESCE(c.phone,''),'\\D','','g')=regexp_replace(${body.phone??''},'\\D','','g'))
           OR (${body.email??null}::text IS NOT NULL AND lower(COALESCE(c.email,''))=lower(${body.email??''}))
           OR EXISTS (
             SELECT 1 FROM jsonb_to_recordset(${tx.json(contactValues)}::jsonb) AS x(channel text,value text)
             WHERE cm.channel=x.channel AND (
               (x.channel IN ('phone','whatsapp','max') AND regexp_replace(cm.value,'\\D','','g')=regexp_replace(x.value,'\\D','','g'))
               OR (x.channel NOT IN ('phone','whatsapp','max') AND lower(cm.value)=lower(x.value))
             )
           )
           OR (lower(trim(c.full_name))=lower(trim(${body.fullName})) AND ${!body.phone&&!body.email}::boolean)
        ) ORDER BY c.id LIMIT 1
      `;
      if(existing&&!canReadRow(actor.access,"recruiting.candidate.create",existing,actor))throw new AccessDeniedError("recruiting.candidate.create");
      let candidateId = existing?.id;
      if (!candidateId) {
        const [candidate] = await tx<Array<{id:string}>>`
          INSERT INTO candidates(organization_id,full_name,phone,email,preferred_channel,telegram,whatsapp,city,source,source_channel,source_campaign,source_reference,notes,original_recruiter_user_id,current_recruiter_user_id,created_by_user_id,status,preferred_object_id,preferred_specialty_id)
          VALUES(${actor.organizationId}::uuid,${body.fullName},${body.phone??null},${body.email??null},${body.preferredChannel??null},${body.telegram??null},${body.whatsapp??null},${body.city??null},${body.source??'Ручной ввод'},${body.sourceChannel??null},${body.sourceCampaign??null},${body.sourceReference??null},${body.notes??null},${body.originalRecruiterUserId??null}::uuid,${body.ownerUserId??null}::uuid,${actor.userId}::uuid,${body.needId?'active':'candidate'},${body.preferredObjectId??need?.objectId??null}::uuid,${body.preferredSpecialtyId??need?.specialtyId??null}::uuid)
          RETURNING id
        `;
        candidateId = candidate.id;
      } else {
        await tx`
          UPDATE candidates SET
            full_name=CASE WHEN full_name='Без имени' AND ${body.fullName}<>'Без имени' THEN ${body.fullName} ELSE full_name END,
            city=COALESCE(city,${body.city??null}),
            original_recruiter_user_id=COALESCE(original_recruiter_user_id,${body.originalRecruiterUserId??null}::uuid),
            current_recruiter_user_id=COALESCE(${body.ownerUserId??null}::uuid,current_recruiter_user_id),
            updated_at=now()
          WHERE id=${candidateId}::uuid
        `;
      }

      const contacts=[
        ...(body.phone?[{channel:"phone",value:body.phone,label:"Основной телефон",isPreferred:(body.preferredChannel??"phone")==="phone"}]:[]),
        ...(body.email?[{channel:"email",value:body.email,label:null,isPreferred:body.preferredChannel==="email"}]:[]),
        ...(body.telegram?[{channel:"telegram",value:body.telegram,label:null,isPreferred:body.preferredChannel==="telegram"}]:[]),
        ...(body.whatsapp?[{channel:"whatsapp",value:body.whatsapp,label:null,isPreferred:body.preferredChannel==="whatsapp"}]:[]),
        ...(body.contacts??[]),
      ].filter((item,index,array)=>array.findIndex(other=>other.channel===item.channel&&other.value.trim().toLocaleLowerCase()===item.value.trim().toLocaleLowerCase())===index);
      if(contacts.some(item=>item.isPreferred))await tx`UPDATE candidate_contact_methods SET is_preferred=false,updated_at=now() WHERE candidate_id=${candidateId}::uuid`;
      for(const contact of contacts){
        await tx`
          INSERT INTO candidate_contact_methods(organization_id,candidate_id,channel,value,label,is_preferred,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${candidateId}::uuid,${contact.channel},${contact.value},${contact.label??null},${contact.isPreferred??false},${actor.userId}::uuid)
          ON CONFLICT(candidate_id,channel,value) DO UPDATE SET label=COALESCE(EXCLUDED.label,candidate_contact_methods.label),is_preferred=EXCLUDED.is_preferred,active=true,updated_at=now()
        `;
      }
      if(!need){
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate',${candidateId}::uuid,'created','Кандидат сохранён в базе без потребности')`;
        return {candidateId,applicationId:null,duplicate:Boolean(existing)};
      }
      const [duplicate] = await tx<Array<{id:string}>>`SELECT id FROM candidate_applications WHERE candidate_id=${candidateId}::uuid AND need_id=${need.id}::uuid`;
      if (duplicate) return {candidateId,applicationId:duplicate.id,duplicate:true};
      const conditionSnapshot = JSON.parse(JSON.stringify(need.conditions ?? {}));
      const [application] = await tx<Array<{id:string}>>`
        INSERT INTO candidate_applications(organization_id,candidate_id,need_id,object_id,stage,next_action_at,owner_user_id,manager_user_id,conditions_snapshot,source_snapshot,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${candidateId}::uuid,${need.id}::uuid,${need.objectId}::uuid,'new',${body.nextActionAt??null}::timestamptz,${body.ownerUserId??null}::uuid,${need.managerUserId}::uuid,${sql.json(conditionSnapshot)},${sql.json({source:body.source??"Ручной ввод",channel:body.sourceChannel??null,campaign:body.sourceCampaign??null,reference:body.sourceReference??null})},${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`INSERT INTO candidate_stage_history(organization_id,application_id,from_stage,to_stage,reason,changed_by_user_id)
        VALUES(${actor.organizationId}::uuid,${application.id}::uuid,NULL,'new','Кандидат добавлен в потребность',${actor.userId}::uuid)`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate',${candidateId}::uuid,'application_created',${`Кандидат добавлен в подбор: ${body.fullName}`},${sql.json({applicationId:application.id,needId:body.needId})})`;
      return {candidateId,applicationId:application.id,duplicate:false};
    }));
    return NextResponse.json(result,{status:result.duplicate?200:201});
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({error:"Проверьте данные кандидата",issues:error.issues},{status:400});
    if(error instanceof CandidateInputError)return NextResponse.json({error:error.message},{status:400});
    if (error instanceof AccessDeniedError) return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
