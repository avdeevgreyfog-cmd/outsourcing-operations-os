import { NextResponse } from "next/server";
import type { Sql } from "postgres";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const contact=z.object({
  id:z.string().uuid().optional(),
  kind:z.enum(["phone","telegram","whatsapp","max","email","other"]),
  value:z.string().trim().min(1).max(240),
  label:z.string().trim().max(120).nullable().optional(),
  isPrimary:z.boolean().default(false),
  isPreferred:z.boolean().default(false),
});
const schema=z.object({contacts:z.array(contact).max(20)});

function normalized(kind:string,value:string){
  const trimmed=value.trim();
  if(kind==="phone"||kind==="whatsapp"||(kind==="max"&&trimmed.startsWith("+")))return trimmed.replace(/\D/g,"");
  if(kind==="email")return trimmed.toLowerCase();
  if(kind==="telegram"||kind==="max")return trimmed.replace(/^@/,"").toLowerCase();
  return trimmed.toLowerCase();
}

async function getScope(tx:Sql,id:string){
  const [scope]=await tx<Array<{id:string;organizationId:string;ownerUserId:string|null;regionId:string|null;objectId:string|null;clientId:string|null;assigneeUserIds:string[]}>>\`
    SELECT c.id,c.organization_id "organizationId",COALESCE(ca.owner_user_id,c.current_recruiter_user_id) "ownerUserId",COALESCE(n.region_id,o.region_id) "regionId",ca.object_id "objectId",o.client_company_id "clientId",
      ARRAY_REMOVE(ARRAY[c.current_recruiter_user_id::text,c.original_recruiter_user_id::text,ca.owner_user_id::text,ca.manager_user_id::text],NULL)
        || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
        || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
    FROM candidates c
    LEFT JOIN LATERAL (SELECT x.* FROM candidate_applications x WHERE x.candidate_id=c.id ORDER BY x.updated_at DESC LIMIT 1) ca ON true
    LEFT JOIN needs n ON n.id=ca.need_id LEFT JOIN objects o ON o.id=ca.object_id
    WHERE c.id=\${id}::uuid ORDER BY ca.updated_at DESC NULLS LAST LIMIT 1
  \`;
  return scope;
}

export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"recruiting.candidate.edit");
    if(actor.demo)return NextResponse.json({error:"В GitHub Demo контакты сохраняются локально"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const preferred=body.contacts.filter(item=>item.isPreferred);
    if(preferred.length>1)return NextResponse.json({error:"Предпочтительным может быть только один контакт"},{status:400});
    const primaryKinds=new Set<string>();
    for(const item of body.contacts.filter(item=>item.isPrimary)){
      if(primaryKinds.has(item.kind))return NextResponse.json({error:"Для одного типа контакта может быть только один основной"},{status:400});
      primaryKinds.add(item.kind);
    }
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const scope=await getScope(tx,id);
      if(!scope||!canReadRow(actor.access,"recruiting.candidate.edit",scope,actor))throw new AccessDeniedError("recruiting.candidate.edit");
      await tx\`DELETE FROM candidate_contacts WHERE candidate_id=\${id}::uuid\`;
      for(const item of body.contacts){
        await tx\`
          INSERT INTO candidate_contacts(organization_id,candidate_id,kind,value,label,is_primary,is_preferred,normalized_value,created_by_user_id)
          VALUES(\${actor.organizationId}::uuid,\${id}::uuid,\${item.kind},\${item.value},\${item.label??null},\${item.isPrimary},\${item.isPreferred},\${normalized(item.kind,item.value)},\${actor.userId}::uuid)
        \`;
      }
      const phone=body.contacts.find(item=>item.kind==="phone"&&item.isPrimary)??body.contacts.find(item=>item.kind==="phone");
      const email=body.contacts.find(item=>item.kind==="email"&&item.isPrimary)??body.contacts.find(item=>item.kind==="email");
      const telegram=body.contacts.find(item=>item.kind==="telegram"&&item.isPrimary)??body.contacts.find(item=>item.kind==="telegram");
      const whatsapp=body.contacts.find(item=>item.kind==="whatsapp"&&item.isPrimary)??body.contacts.find(item=>item.kind==="whatsapp");
      const preferredContact=body.contacts.find(item=>item.isPreferred);
      await tx\`
        UPDATE candidates SET phone=\${phone?.value??null},email=\${email?.value??null},telegram=\${telegram?.value??null},whatsapp=\${whatsapp?.value??null},
          preferred_channel=\${preferredContact?.kind??null},updated_at=now()
        WHERE id=\${id}::uuid
      \`;
      await tx\`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(\${actor.organizationId}::uuid,\${actor.userId}::uuid,'candidate',\${id}::uuid,'contacts_updated','Обновлены контакты кандидата',
          \${sql.json({count:body.contacts.length,preferred:preferredContact?.kind??null})})
      \`;
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте контакты",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить контакты"},{status:500});
  }
}
