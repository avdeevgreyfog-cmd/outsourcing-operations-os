import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  name:z.string().trim().min(2).max(180),
  address:z.string().trim().max(500).nullable().optional(),
  vendor:z.string().trim().max(240).nullable().optional(),
  objectId:z.string().uuid(),
  rateModel:z.enum(["bed_day","room_day","room_month","site_period"]),
  rateAmount:z.number().min(0),
  unitName:z.string().trim().min(1).max(120).default("Комната 1"),
  capacity:z.number().int().min(1).max(1000),
});
export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"supply.housing.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [object]=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid
      `;
      if(!object||!canReadRow(actor.access,"supply.housing.manage",{organizationId:actor.organizationId,objectId:object.id,ownerUserId:object.ownerUserId,regionId:object.regionId,assigneeUserIds:object.assigneeUserIds},actor))throw new AccessDeniedError("supply.housing.manage");
      const [site]=await tx<Array<{id:string}>>`
        INSERT INTO housing_sites(organization_id,name,address_text,vendor,primary_object_id,responsible_user_id,rate_model,rate_amount,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.name},${body.address??null},${body.vendor??null},${body.objectId}::uuid,${object.ownerUserId??actor.userId}::uuid,${body.rateModel},${body.rateAmount},${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`
        INSERT INTO housing_units(organization_id,site_id,name,capacity)
        VALUES(${actor.organizationId}::uuid,${site.id}::uuid,${body.unitName},${body.capacity})
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
