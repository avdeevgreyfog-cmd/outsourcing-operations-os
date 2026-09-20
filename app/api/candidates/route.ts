import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const contactSchema=z.object({
  kind:z.enum(["phone","telegram","whatsapp","max","email","other"]),
  value:z.string().trim().min(1).max(240),
  label:z.string().trim().max(120).nullable().optional(),
  isPrimary:z.boolean().default(false),
  isPreferred:z.boolean().default(false),
});

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
  contacts:z.array(contactSchema).max(20).optional(),
  needId: z.string().uuid().nullable().optional(),
  allowNameDuplicate:z.boolean().default(false),
});

function normalized(kind:string,value:string){
  const trimmed=value.trim();
  if(kind==="phone"||kind==="whatsapp"||(kind==="max"&&trimmed.startsWith("+")))return trimmed.replace(/\D/g,"");
  if(kind==="email")return trimmed.toLowerCase();
  if(kind==="telegram"||kind==="max")return trimmed.replace(/^@/,"").toLowerCase();
  return trimmed.toLowerCase();
}

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"recruiting.candidate.create");
    if (actor.demo) return NextResponse.json({error:"В демо-режиме кандидат сохраняется локально в браузере"},{status:409});
    const body = schema.parse(await request.json());

    const legacyContacts=[
      body.phone?{kind:"phone" as const,value:body.phone,label:"Основной телефон",isPrimary:true,isPreferred:body.preferredChannel==="phone"}:null,
      body.email?{kind:"email" as const,value:body.email,label:"Email",isPrimary:true,isPreferred:body.preferredChannel==="email"}:null,
      body.telegram?{kind:"telegram" as const,value:body.telegram,label:"Telegram",isPrimary:true,isPreferred:body.preferredChannel==="telegram"}:null,
      body.whatsapp?{kind:"whatsapp" as const,value:body.whatsapp,label:"WhatsApp",isPrimary:true,isPreferred:body.preferredChannel==="whatsapp"}:null,
    ].filter(Boolean) as Array<z.infer<typeof contactSchema>>;
    const contacts=body.contacts?.length?body.contacts:legacyContacts;
    if(!contacts.length)return NextResponse.json({error:"Укажите хотя бы один контакт кандидата"},{status:400});
    if(contacts.filter(item=>item.isPreferred).length>1)return NextResponse.json({error:"Предпочтительным может быть только один контакт"},{status:400});

    const result = await withTenant(actor.organizationId, actor.userId, async sql => sql.begin(async tx => {
      let need:null|{id:string;objectId:string|null;regionId:string|null;clientId:string|null;ownerUserId:string|null;managerUserId:string|null;conditions:Record<string,unknown>;assigneeUserIds:string[]}=null;
      if(body.needId){
        const [found] = await tx<Array<{id:string;objectId:string|null;regionId:string|null;clientId:string|null;ownerUserId:string|null;managerUserId:string|null;conditions:Record<string,unknown>;assigneeUserIds:string[]}>>\`
          SELECT n.id,n.object_id "objectId",COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",
            n.owner_user_id "ownerUserId",n.manager_user_id "managerUserId",n.conditions_snapshot conditions,
            ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=n.id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
              || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=n.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
          FROM needs n LEFT JOIN objects o ON o.id=n.object_id WHERE n.id=\${body.needId}::uuid AND n.status IN ('open','in_progress')
        \`;
        if (!found) throw new Error("Потребность не найдена или уже закрыта");
        if (!canReadRow(actor.access,"recruiting.candidate.create",found,actor)) throw new AccessDeniedError("recruiting.candidate.create");
        need=found;
      }

      let existing:null|{id:string;fullName:string}=null;
      for(const item of contacts){
        const norm=normalized(item.kind,item.value);
        const [match]=await tx<Array<{id:string;fullName:string}>>\`
          SELECT c.id,c.full_name "fullName"
          FROM candidates c
          WHERE c.organization_id=\${actor.organizationId}::uuid
            AND (
              (\${item.kind}='phone' AND regexp_replace(COALESCE(c.phone,''),'\\D','','g')=\${norm})
              OR (\${item.kind}='email' AND lower(COALESCE(c.email,''))=\${norm})
              OR EXISTS(SELECT 1 FROM candidate_contacts cc WHERE cc.candidate_id=c.id AND cc.kind=\${item.kind} AND cc.normalized_value=\${norm})
            )
          ORDER BY c.updated_at DESC LIMIT 1
        \`;
        if(match){existing=match;break;}
      }
      if(!existing&&!body.allowNameDuplicate){
        const [nameMatch]=await tx<Array<{id:string;fullName:string}>>\`
          SELECT id,full_name "fullName" FROM candidates
          WHERE organization_id=\${actor.organizationId}::uuid AND lower(btrim(full_name))=lower(btrim(\${body.fullName}))
          ORDER BY updated_at DESC LIMIT 1
        \`;
        if(nameMatch)return {possibleDuplicate:true,match:nameMatch,candidateId:null,applicationId:null,duplicate:false};
      }

      let candidateId = existing?.id??null;
      if (!candidateId) {
        const phone=contacts.find(item=>item.kind==="phone"&&item.isPrimary)??contacts.find(item=>item.kind==="phone");
        const email=contacts.find(item=>item.kind==="email"&&item.isPrimary)??contacts.find(item=>item.kind==="email");
        const telegram=contacts.find(item=>item.kind==="telegram"&&item.isPrimary)??contacts.find(item=>item.kind==="telegram");
        const whatsapp=contacts.find(item=>item.kind==="whatsapp"&&item.isPrimary)??contacts.find(item=>item.kind==="whatsapp");
        const preferred=contacts.find(item=>item.isPreferred);
        const [candidate] = await tx<Array<{id:string}>>\`
          INSERT INTO candidates(organization_id,full_name,phone,email,preferred_channel,telegram,whatsapp,city,source,source_channel,source_campaign,source_reference,notes,original_recruiter_user_id,current_recruiter_user_id,created_by_user_id,status)
          VALUES(\${actor.organizationId}::uuid,\${body.fullName},\${phone?.value??null},\${email?.value??null},\${preferred?.kind??body.preferredChannel??null},\${telegram?.value??null},\${whatsapp?.value??null},\${body.city??null},\${body.source??'Ручной ввод'},\${body.sourceChannel??null},\${body.sourceCampaign??null},\${body.sourceReference??null},\${body.notes??null},\${actor.userId}::uuid,\${actor.userId}::uuid,\${actor.userId}::uuid,'active')
          RETURNING id
        \`;
        candidateId = candidate.id;
      }
      for(const item of contacts){
        await tx\`
          INSERT INTO candidate_contacts(organization_id,candidate_id,kind,value,label,is_primary,is_preferred,normalized_value,created_by_user_id)
          VALUES(\${actor.organizationId}::uuid,\${candidateId}::uuid,\${item.kind},\${item.value},\${item.label??null},\${item.isPrimary},\${item.isPreferred},\${normalized(item.kind,item.value)},\${actor.userId}::uuid)
          ON CONFLICT(candidate_id,kind,value) DO UPDATE SET
            label=COALESCE(EXCLUDED.label,candidate_contacts.label),
            is_primary=EXCLUDED.is_primary OR candidate_contacts.is_primary,
            is_preferred=EXCLUDED.is_preferred OR candidate_contacts.is_preferred,
            normalized_value=EXCLUDED.normalized_value,updated_at=now()
        \`;
      }

      if(!need)return {candidateId,applicationId:null,duplicate:Boolean(existing),possibleDuplicate:false};

      const [duplicate] = await tx<Array<{id:string}>>\`SELECT id FROM candidate_applications WHERE candidate_id=\${candidateId}::uuid AND need_id=\${need.id}::uuid\`;
      if (duplicate) return {candidateId,applicationId:duplicate.id,duplicate:true,possibleDuplicate:false};

      const conditionSnapshot = JSON.parse(JSON.stringify(need.conditions ?? {}));
      const [application] = await tx<Array<{id:string}>>\`
        INSERT INTO candidate_applications(organization_id,candidate_id,need_id,object_id,stage,next_action_at,owner_user_id,manager_user_id,conditions_snapshot,source_snapshot,created_by_user_id)
        VALUES(\${actor.organizationId}::uuid,\${candidateId}::uuid,\${need.id}::uuid,\${need.objectId}::uuid,'new',NULL,\${need.ownerUserId??actor.userId}::uuid,\${need.managerUserId}::uuid,\${sql.json(conditionSnapshot)},\${sql.json({source:body.source??"Ручной ввод",channel:body.sourceChannel??null,campaign:body.sourceCampaign??null,reference:body.sourceReference??null})},\${actor.userId}::uuid)
        RETURNING id
      \`;
      await tx\`INSERT INTO candidate_stage_history(organization_id,application_id,from_stage,to_stage,reason,changed_by_user_id)
        VALUES(\${actor.organizationId}::uuid,\${application.id}::uuid,NULL,'new','Кандидат добавлен в потребность',\${actor.userId}::uuid)\`;
      await tx\`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(\${actor.organizationId}::uuid,\${actor.userId}::uuid,'candidate',\${candidateId}::uuid,'application_created',\${\`Кандидат добавлен в подбор: \${body.fullName}\`},\${sql.json({applicationId:application.id,needId:need.id})})\`;
      return {candidateId,applicationId:application.id,duplicate:Boolean(existing),possibleDuplicate:false};
    }));
    if(result.possibleDuplicate)return NextResponse.json(result,{status:409});
    return NextResponse.json(result,{status:result.duplicate?200:201});
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({error:"Проверьте данные кандидата",issues:error.issues},{status:400});
    if (error instanceof AccessDeniedError) return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
