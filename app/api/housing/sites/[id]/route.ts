import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  name:z.string().trim().min(2).max(180),
  siteType:z.enum(["dormitory","hostel","apartment","hotel","company_housing","other"]),
  address:z.string().trim().max(500).nullable().optional(),
  partnerId:z.string().uuid().nullable().optional(),
  vendor:z.string().trim().max(240).nullable().optional(),
  objectIds:z.array(z.string().uuid()).min(1).max(50),
  contactName:z.string().trim().max(180).nullable().optional(),
  contactPhone:z.string().trim().max(80).nullable().optional(),
  checkInRules:z.string().trim().max(1000).nullable().optional(),
  checkOutRules:z.string().trim().max(1000).nullable().optional(),
  notes:z.string().trim().max(2000).nullable().optional(),
});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.housing.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const objectIds=[...new Set(body.objectIds)];
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [site]=await tx<Array<{id:string;organizationId:string;responsibleUserId:string|null;primaryObjectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT hs.id,hs.organization_id "organizationId",hs.responsible_user_id "responsibleUserId",hs.primary_object_id "primaryObjectId",
          COALESCE(hs.responsible_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=hs.primary_object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
          || CASE WHEN hs.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[hs.responsible_user_id::text] END "assigneeUserIds"
        FROM housing_sites hs LEFT JOIN objects o ON o.id=hs.primary_object_id WHERE hs.id=${id}::uuid FOR UPDATE OF hs
      `;
      if(!site||!canReadRow(actor.access,"supply.housing.manage",{organizationId:site.organizationId,objectId:site.primaryObjectId??undefined,ownerUserId:site.ownerUserId??undefined,regionId:site.regionId??undefined,assigneeUserIds:site.assigneeUserIds},actor))throw new AccessDeniedError("supply.housing.manage");

      const objects=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=ANY(${objectIds}::uuid[])
      `;
      if(objects.length!==objectIds.length)throw new Error("Один из выбранных объектов не найден");
      for(const object of objects){
        if(!canReadRow(actor.access,"supply.housing.manage",{organizationId:actor.organizationId,objectId:object.id,ownerUserId:object.ownerUserId,regionId:object.regionId,assigneeUserIds:object.assigneeUserIds},actor))throw new AccessDeniedError("supply.housing.manage");
      }
      const primary=objects[0];
      await tx`
        UPDATE housing_sites SET name=${body.name},site_type=${body.siteType},address_text=${body.address??null},partner_id=${body.partnerId??null}::uuid,
          vendor=${body.vendor??null},primary_object_id=${primary.id}::uuid,responsible_user_id=COALESCE(responsible_user_id,${primary.ownerUserId??actor.userId}::uuid),
          contact_name=${body.contactName??null},contact_phone=${body.contactPhone??null},check_in_rules=${body.checkInRules??null},
          check_out_rules=${body.checkOutRules??null},notes=${body.notes??null},updated_at=now()
        WHERE id=${id}::uuid
      `;
      await tx`UPDATE housing_site_objects SET active=false,updated_at=now() WHERE site_id=${id}::uuid AND object_id<>ALL(${objectIds}::uuid[])`;
      for(const objectId of objectIds){
        await tx`
          INSERT INTO housing_site_objects(organization_id,site_id,object_id,relation_type,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${id}::uuid,${objectId}::uuid,${objectId===primary.id?"primary":"service"},${actor.userId}::uuid)
          ON CONFLICT(site_id,object_id) DO UPDATE SET active=true,relation_type=EXCLUDED.relation_type,updated_at=now()
        `;
      }
      await tx`UPDATE housing_site_objects SET relation_type=CASE WHEN object_id=${primary.id}::uuid THEN 'primary' ELSE 'service' END,updated_at=now() WHERE site_id=${id}::uuid AND active`;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_site',${id}::uuid,'updated','Обновлены данные жилья',${tx.json({siteId:id,objectIds})})
      `;
      return {id};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные жилья",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось обновить жильё"},{status:500});
  }
}
