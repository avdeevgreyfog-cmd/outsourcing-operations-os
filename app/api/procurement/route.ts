import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  objectId:z.string().uuid().nullable().optional(),
  requestType:z.enum(["purchase","payment","compensation","service"]),
  title:z.string().trim().min(2).max(240),
  description:z.string().trim().max(2000).nullable().optional(),
  itemId:z.string().uuid().nullable().optional(),
  locationId:z.string().uuid().nullable().optional(),
  quantity:z.number().positive().nullable().optional(),
  unit:z.string().trim().max(40).nullable().optional(),
  amount:z.number().min(0).nullable().optional(),
  vendor:z.string().trim().max(240).nullable().optional(),
  neededBy:z.string().date().nullable().optional(),
});
export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"procurement.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      if(body.objectId){
        const [object]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
          SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
            ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
          FROM objects o WHERE o.id=${body.objectId}::uuid
        `;
        if(!object||!canReadRow(actor.access,"procurement.manage",object,actor))throw new AccessDeniedError("procurement.manage");
      }
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO supply_requests(organization_id,object_id,request_type,title,description,item_id,location_id,quantity,unit,amount,vendor,needed_by,status,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.objectId??null}::uuid,${body.requestType},${body.title},${body.description??null},${body.itemId??null}::uuid,${body.locationId??null}::uuid,${body.quantity??null},${body.unit??null},${body.amount??null},${body.vendor??null},${body.neededBy??null}::date,'submitted',${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'supply_request',${row.id}::uuid,'submitted',${"Создана заявка на обеспечение: "+body.title},${tx.json({objectId:body.objectId??null,requestType:body.requestType,itemId:body.itemId??null,quantity:body.quantity??null})})
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте заявку",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать заявку"},{status:500});
  }
}
