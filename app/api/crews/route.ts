import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  objectId:z.string().uuid(),
  name:z.string().trim().min(2).max(160),
  specialtyId:z.string().uuid().nullable().optional(),
  leaderWorkerId:z.string().uuid().nullable().optional(),
  leaderMode:z.enum(["working_leader","dedicated"]).default("working_leader"),
  bonusAmount:z.number().min(0).nullable().optional(),
  bonusUnit:z.enum(["hour","shift","month","period"]).nullable().optional(),
  memberIds:z.array(z.string().uuid()).max(200).default([]),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.crew.manage");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме бригада создаётся локально"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [object]=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid
      `;
      if(!object||!canReadRow(actor.access,"operations.crew.manage",{organizationId:actor.organizationId,objectId:object.id,ownerUserId:object.ownerUserId,regionId:object.regionId,assigneeUserIds:object.assigneeUserIds},actor))throw new AccessDeniedError("operations.crew.manage");
      const [crew]=await tx<Array<{id:string}>>`
        INSERT INTO object_crews(organization_id,object_id,specialty_id,name,leader_worker_id,leader_mode,bonus_amount,bonus_unit,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.objectId}::uuid,${body.specialtyId??null}::uuid,${body.name},${body.leaderWorkerId??null}::uuid,${body.leaderMode},${body.bonusAmount??null},${body.bonusUnit??null},${actor.userId}::uuid)
        RETURNING id
      `;
      for(const workerId of [...new Set(body.memberIds)]){
        await tx`
          INSERT INTO object_crew_members(organization_id,crew_id,worker_id,effective_from,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${crew.id}::uuid,${workerId}::uuid,current_date,${actor.userId}::uuid)
        `;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'crew',${crew.id}::uuid,'created',${`Создана бригада: ${body.name}`},${tx.json({objectId:body.objectId,leaderWorkerId:body.leaderWorkerId??null,members:body.memberIds.length})})
      `;
      return {id:crew.id};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные бригады",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать бригаду"},{status:500});
  }
}
