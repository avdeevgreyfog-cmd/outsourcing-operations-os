import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({name:z.string().trim().min(2).max(180),kind:z.enum(["office","manager","object","housing","vehicle","other"]),objectId:z.string().uuid().nullable().optional(),description:z.string().trim().max(1000).nullable().optional()});
export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"assets.manage");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      let object:null|{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}=null;
      if(body.objectId){
        [object]=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
          SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",
            ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
          FROM objects o WHERE o.id=${body.objectId}::uuid
        `;
        if(!object||!canReadRow(actor.access,"assets.manage",{organizationId:actor.organizationId,objectId:object.id,ownerUserId:object.ownerUserId,regionId:object.regionId,assigneeUserIds:object.assigneeUserIds},actor))throw new AccessDeniedError("assets.manage");
      }
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO storage_locations(organization_id,name,kind,object_id,responsible_user_id,description,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.name},${body.kind},${body.objectId??null}::uuid,${body.kind==="manager"?actor.userId:object?.ownerUserId??actor.userId}::uuid,${body.description??null},${actor.userId}::uuid)
        RETURNING id
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте место хранения",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось создать место хранения"},{status:500});
  }
}
