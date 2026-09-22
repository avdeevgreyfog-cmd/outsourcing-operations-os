import { NextResponse } from "next/server";
import type { Sql } from "postgres";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const roleSchema=z.enum(["operations","timesheet","security","warehouse_ppe","documents","finance","approval","contract_signer","closing_signer","other"]);
const contactSchema=z.object({
  contactId:z.string().uuid().nullable().optional(),
  fullName:z.string().trim().min(2).max(180).nullable().optional(),
  position:z.string().trim().max(180).nullable().optional(),
  phone:z.string().trim().max(80).nullable().optional(),
  email:z.string().trim().email().max(240).nullable().optional(),
  telegram:z.string().trim().max(120).nullable().optional(),
  whatsapp:z.string().trim().max(120).nullable().optional(),
  maxContact:z.string().trim().max(120).nullable().optional(),
  preferredChannel:z.enum(["phone","email","telegram","whatsapp","max","other"]).nullable().optional(),
  roles:z.array(roleSchema).min(1).max(10),
  note:z.string().trim().max(1200).nullable().optional(),
}).superRefine((value,ctx)=>{if(!value.contactId&&!value.fullName)ctx.addIssue({code:"custom",path:["fullName"],message:"Выберите контакт или укажите ФИО"});});
const deleteSchema=z.object({assignmentId:z.string().uuid()});

type Scope={organizationId:string;objectId:string;clientId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]};
async function scopeFor(tx:Sql,organizationId:string,objectId:string):Promise<Scope|null>{
  const [row]=await tx<Array<Scope>>`
    SELECT o.organization_id "organizationId",o.id "objectId",o.client_company_id "clientId",o.owner_user_id "ownerUserId",o.region_id "regionId",
      ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
    FROM objects o WHERE o.organization_id=${organizationId}::uuid AND o.id=${objectId}::uuid
  `;
  return row??null;
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.edit");
    if(actor.demo)return NextResponse.json({error:"Демо-режим доступен только для чтения"},{status:409});
    const {id}=await params;const body=contactSchema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const scope=await scopeFor(tx,actor.organizationId,id);
      if(!scope||!canReadRow(actor.access,"operations.object.edit",scope,actor))throw new AccessDeniedError("operations.object.edit");
      let contactId=body.contactId??null;
      if(contactId){
        const [contact]=await tx<Array<{id:string}>>`SELECT id FROM contacts WHERE id=${contactId}::uuid AND client_company_id=${scope.clientId}::uuid`;
        if(!contact)throw new Error("Контакт не принадлежит клиенту этого объекта");
        await tx`
          UPDATE contacts SET
            full_name=COALESCE(${body.fullName??null},full_name),
            position=COALESCE(${body.position??null},position),
            phone=COALESCE(${body.phone??null},phone),
            email=COALESCE(${body.email??null},email),
            telegram=COALESCE(${body.telegram??null},telegram),
            whatsapp=COALESCE(${body.whatsapp??null},whatsapp),
            max_contact=COALESCE(${body.maxContact??null},max_contact),
            communication_preference=COALESCE(${body.preferredChannel??null},communication_preference)
          WHERE id=${contactId}::uuid
        `;
      }else{
        const [contact]=await tx<Array<{id:string}>>`
          INSERT INTO contacts(organization_id,client_company_id,full_name,position,phone,email,telegram,whatsapp,max_contact,communication_preference,owner_user_id,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${scope.clientId}::uuid,${body.fullName!},${body.position??null},${body.phone??null},${body.email??null},${body.telegram??null},${body.whatsapp??null},${body.maxContact??null},${body.preferredChannel??null},${actor.userId}::uuid,${actor.userId}::uuid)
          RETURNING id
        `;
        contactId=contact.id;
      }
      const [assignment]=await tx<Array<{id:string}>>`
        INSERT INTO object_contact_assignments(organization_id,object_id,contact_id,roles,note,active,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${contactId}::uuid,${body.roles},${body.note??null},true,${actor.userId}::uuid)
        ON CONFLICT(object_id,contact_id) DO UPDATE SET roles=EXCLUDED.roles,note=EXCLUDED.note,active=true,updated_at=now()
        RETURNING id
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,'contact_updated','Обновлены контакты объекта',
          ${tx.json({contactId,roles:body.roles})})
      `;
      return {assignmentId:assignment.id,contactId};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные контакта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить контакт"},{status:500});
  }
}

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.edit");
    if(actor.demo)return NextResponse.json({error:"Демо-режим доступен только для чтения"},{status:409});
    const {id}=await params;const body=deleteSchema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const scope=await scopeFor(tx,actor.organizationId,id);
      if(!scope||!canReadRow(actor.access,"operations.object.edit",scope,actor))throw new AccessDeniedError("operations.object.edit");
      await tx`UPDATE object_contact_assignments SET active=false,updated_at=now() WHERE id=${body.assignmentId}::uuid AND object_id=${id}::uuid`;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,'contact_removed','Контакт отвязан от объекта',${tx.json({assignmentId:body.assignmentId})})
      `;
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте запрос",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось удалить контакт"},{status:500});
  }
}
