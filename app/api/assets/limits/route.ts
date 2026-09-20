import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const schema=z.object({locationId:z.string().uuid(),itemId:z.string().uuid(),variant:z.string().max(80).default(""),minQuantity:z.number().min(0)});
export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"assets.manage");if(actor.demo)return NextResponse.json({ok:true});
    const body=schema.parse(await request.json());
    await withTenant(actor.organizationId,actor.userId,async sql=>sql`
      INSERT INTO inventory_stock_limits(organization_id,location_id,item_id,variant,min_quantity,updated_by_user_id)
      VALUES(${actor.organizationId}::uuid,${body.locationId}::uuid,${body.itemId}::uuid,${body.variant},${body.minQuantity},${actor.userId}::uuid)
      ON CONFLICT(location_id,item_id,variant) DO UPDATE SET min_quantity=EXCLUDED.min_quantity,updated_by_user_id=EXCLUDED.updated_by_user_id,updated_at=now()
    `);
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте минимальный остаток",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось сохранить минимум"},{status:500});
  }
}
