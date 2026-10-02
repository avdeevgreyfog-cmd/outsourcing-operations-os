import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  siteId:z.string().uuid(),
  name:z.string().trim().min(1).max(120),
  unitType:z.enum(["room","block","floor","other"]).default("room"),
  capacity:z.number().int().min(1).max(1000),
  notes:z.string().trim().max(1000).nullable().optional(),
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
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO housing_units(organization_id,site_id,name,unit_type,capacity,notes)
        VALUES(${actor.organizationId}::uuid,${body.siteId}::uuid,${body.name},${body.unitType},${body.capacity},${body.notes??null})
        RETURNING id
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'housing_site',${body.siteId}::uuid,'unit_created',${"Добавлено место проживания: "+body.name},${tx.json({siteId:body.siteId,unitId:row.id,capacity:body.capacity})})
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте комнату или блок",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось добавить место"},{status:500});
  }
}
