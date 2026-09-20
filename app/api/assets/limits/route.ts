import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { canReadRow } from "@/lib/core/access.mjs";

const schema=z.object({locationId:z.string().uuid(),itemId:z.string().uuid(),variant:z.string().max(80).default(""),minQuantity:z.number().min(0)});
export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"assets.manage");if(actor.demo)return NextResponse.json({ok:true});
    const body=schema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>{
      const [location]=await sql<Array<{organizationId:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT l.organization_id "organizationId",l.object_id "objectId",COALESCE(l.responsible_user_id,o.owner_user_id) "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=l.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date))
            || CASE WHEN l.responsible_user_id IS NULL THEN ARRAY[]::text[] ELSE ARRAY[l.responsible_user_id::text] END "assigneeUserIds"
        FROM storage_locations l LEFT JOIN objects o ON o.id=l.object_id WHERE l.id=${body.locationId}::uuid AND l.active
      `;
      if(!location||!canReadRow(actor.access,"assets.manage",{...location,objectId:location.objectId??undefined,ownerUserId:location.ownerUserId??undefined,regionId:location.regionId??undefined},actor))throw new AccessDeniedError("assets.manage");
      await sql`
      INSERT INTO inventory_stock_limits(organization_id,location_id,item_id,variant,min_quantity,updated_by_user_id)
      VALUES(${actor.organizationId}::uuid,${body.locationId}::uuid,${body.itemId}::uuid,${body.variant},${body.minQuantity},${actor.userId}::uuid)
      ON CONFLICT(location_id,item_id,variant) DO UPDATE SET min_quantity=EXCLUDED.min_quantity,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
      `;
    });
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте минимальный остаток",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось сохранить минимум"},{status:500});
  }
}
