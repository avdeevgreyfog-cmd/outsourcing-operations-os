import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  siteId:z.string().uuid(),
  contractId:z.string().uuid().nullable().optional(),
  name:z.string().trim().min(2).max(300),
  category:z.enum(["contract","additional_agreement","act","invoice","rules","other"]).default("other"),
  documentNumber:z.string().trim().max(160).nullable().optional(),
  documentDate:z.string().date().nullable().optional(),
  sourceUrl:z.string().url().max(2000).nullable().optional(),
  validFrom:z.string().date().nullable().optional(),
  expiresAt:z.string().date().nullable().optional(),
  notes:z.string().trim().max(3000).nullable().optional(),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.housing.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [site]=await tx<Array<{organizationId:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT hs.organization_id "organizationId",hs.primary_object_id "objectId",COALESCE(hs.responsible_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=hs.primary_object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || CASE WHEN hs.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[hs.responsible_user_id::text] END "assigneeUserIds"
        FROM housing_sites hs LEFT JOIN objects o ON o.id=hs.primary_object_id WHERE hs.id=${body.siteId}::uuid
      `;
      if(!site||!canReadRow(actor.access,"supply.housing.manage",{...site,objectId:site.objectId??undefined,ownerUserId:site.ownerUserId??undefined,regionId:site.regionId??undefined},actor))throw new AccessDeniedError("supply.housing.manage");
      if(body.contractId){
        const [contract]=await tx<Array<{id:string}>>`SELECT id FROM housing_contracts WHERE id=${body.contractId}::uuid AND site_id=${body.siteId}::uuid`;
        if(!contract)throw new Error("Договор не относится к выбранному жилью");
      }
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO housing_documents(organization_id,site_id,contract_id,name,category,document_number,document_date,source_url,valid_from,expires_at,notes,created_by_user_id,updated_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.siteId}::uuid,${body.contractId??null}::uuid,${body.name},${body.category},${body.documentNumber??null},${body.documentDate??null}::date,${body.sourceUrl??null},${body.validFrom??null}::date,${body.expiresAt??null}::date,${body.notes??null},${actor.userId}::uuid,${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_document',${row.id}::uuid,'created',${"Добавлен документ жилья: "+body.name},${tx.json({siteId:body.siteId,contractId:body.contractId??null,category:body.category})})
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте документ",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить документ"},{status:500});
  }
}
