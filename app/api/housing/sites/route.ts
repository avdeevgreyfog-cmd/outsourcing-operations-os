import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  name:z.string().trim().min(2).max(180),
  siteType:z.enum(["dormitory","hostel","apartment","hotel","company_housing","other"]).default("dormitory"),
  address:z.string().trim().max(500).nullable().optional(),
  vendor:z.string().trim().max(240).nullable().optional(),
  partnerId:z.string().uuid().nullable().optional(),
  objectId:z.string().uuid().nullable().optional(),
  objectIds:z.array(z.string().uuid()).max(50).optional(),
  contactName:z.string().trim().max(180).nullable().optional(),
  contactPhone:z.string().trim().max(80).nullable().optional(),
  checkInRules:z.string().trim().max(1000).nullable().optional(),
  checkOutRules:z.string().trim().max(1000).nullable().optional(),
  notes:z.string().trim().max(2000).nullable().optional(),
  rateModel:z.enum(["bed_day","room_day","room_month","site_period"]),
  rateAmount:z.number().min(0),
  unitName:z.string().trim().min(1).max(120).default("Комната 1"),
  capacity:z.number().int().min(1).max(1000),
}).superRefine((value,ctx)=>{
  const ids=[...(value.objectIds??[]),...(value.objectId?[value.objectId]:[])];
  if(!ids.length)ctx.addIssue({code:z.ZodIssueCode.custom,path:["objectIds"],message:"Укажите хотя бы один объект"});
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.housing.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const body=schema.parse(await request.json());
    const objectIds=[...new Set([...(body.objectIds??[]),...(body.objectId?[body.objectId]:[])])];
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const objects=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=ANY(${objectIds}::uuid[])
      `;
      if(objects.length!==objectIds.length)throw new Error("Один из выбранных объектов не найден");
      for(const object of objects){
        if(!canReadRow(actor.access,"supply.housing.manage",{organizationId:actor.organizationId,objectId:object.id,ownerUserId:object.ownerUserId,regionId:object.regionId,assigneeUserIds:object.assigneeUserIds},actor))throw new AccessDeniedError("supply.housing.manage");
      }
      const primary=objects.find(row=>row.id===objectIds[0])??objects[0];
      const [site]=await tx<Array<{id:string}>>`
        INSERT INTO housing_sites(organization_id,name,site_type,address_text,vendor,partner_id,primary_object_id,responsible_user_id,contact_name,contact_phone,check_in_rules,check_out_rules,notes,rate_model,rate_amount,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.name},${body.siteType},${body.address??null},${body.vendor??null},${body.partnerId??null}::uuid,${primary.id}::uuid,${primary.ownerUserId??actor.userId}::uuid,${body.contactName??null},${body.contactPhone??null},${body.checkInRules??null},${body.checkOutRules??null},${body.notes??null},${body.rateModel},${body.rateAmount},${actor.userId}::uuid)
        RETURNING id
      `;
      for(const objectId of objectIds){
        await tx`
          INSERT INTO housing_site_objects(organization_id,site_id,object_id,relation_type,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${site.id}::uuid,${objectId}::uuid,${objectId===primary.id?"primary":"service"},${actor.userId}::uuid)
          ON CONFLICT(site_id,object_id) DO UPDATE SET active=true,relation_type=EXCLUDED.relation_type,updated_at=now()
        `;
      }
      const [unit]=await tx<Array<{id:string}>>`
        INSERT INTO housing_units(organization_id,site_id,name,unit_type,capacity)
        VALUES(${actor.organizationId}::uuid,${site.id}::uuid,${body.unitName},'room',${body.capacity})
        RETURNING id
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_site',${site.id}::uuid,'created',${"Добавлено жильё: "+body.name},${tx.json({siteId:site.id,objectIds,unitId:unit.id})})
      `;
      return site;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные жилья",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать жильё"},{status:500});
  }
}
