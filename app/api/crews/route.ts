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
}).superRefine((body,context)=>{
  if(body.leaderMode==="dedicated"&&body.leaderWorkerId&&body.memberIds.includes(body.leaderWorkerId)){
    context.addIssue({code:"custom",path:["memberIds"],message:"Выделенный бригадир не может одновременно входить в состав бригады"});
  }
});

class CrewValidationError extends Error{}

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Требуется вход в систему"},{status:401});
    requireCapability(actor,"operations.crew.manage");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме бригада создаётся локально"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [object]=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid AND o.organization_id=${actor.organizationId}::uuid
      `;
      if(!object||!canReadRow(actor.access,"operations.crew.manage",{organizationId:actor.organizationId,objectId:object.id,ownerUserId:object.ownerUserId,regionId:object.regionId,assigneeUserIds:object.assigneeUserIds},actor))throw new AccessDeniedError("operations.crew.manage");
      if(body.specialtyId){
        const [specialty]=await tx<Array<{id:string}>>`
          SELECT id FROM specialties
          WHERE id=${body.specialtyId}::uuid AND organization_id=${actor.organizationId}::uuid AND active=true
        `;
        if(!specialty)throw new CrewValidationError("Выберите действующую специальность из этой организации");
      }

      const workerIds=[...new Set([
        ...body.memberIds,
        ...(body.leaderWorkerId?[body.leaderWorkerId]:[]),
      ])];
      if(workerIds.length){
        const assignments=await tx<Array<{workerId:string;organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
          SELECT DISTINCT w.id "workerId",a.organization_id "organizationId",a.object_id "objectId",
            o.owner_user_id "ownerUserId",o.region_id "regionId",
            ARRAY(SELECT oa.user_id::text FROM object_assignments oa
              WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
          FROM worker_profiles w
          JOIN worker_object_assignments a ON a.worker_id=w.id AND a.organization_id=w.organization_id
          JOIN objects o ON o.id=a.object_id AND o.organization_id=a.organization_id
          WHERE w.id=ANY(${workerIds}::uuid[])
            AND w.organization_id=${actor.organizationId}::uuid AND w.status='active'
            AND a.organization_id=${actor.organizationId}::uuid AND a.object_id=${body.objectId}::uuid
            AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
        `;
        const eligibleWorkerIds=new Set(assignments.filter(row=>canReadRow(actor.access,"operations.crew.manage",row,actor)).map(row=>row.workerId));
        if(workerIds.some(workerId=>!eligibleWorkerIds.has(workerId)))throw new CrewValidationError("Участники и бригадир должны быть активными сотрудниками с текущим назначением на этот объект");
      }

      const [crew]=await tx<Array<{id:string}>>`
        INSERT INTO object_crews(organization_id,object_id,specialty_id,name,leader_worker_id,leader_mode,bonus_amount,bonus_unit,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.objectId}::uuid,${body.specialtyId??null}::uuid,${body.name},${body.leaderWorkerId??null}::uuid,${body.leaderMode},${body.bonusAmount??null},${body.bonusUnit??null},${actor.userId}::uuid)
        RETURNING id
      `;
      const memberIds=[...new Set([
        ...body.memberIds,
        ...(body.leaderMode==="working_leader"&&body.leaderWorkerId?[body.leaderWorkerId]:[]),
      ])];
      for(const workerId of memberIds){
        await tx`
          INSERT INTO object_crew_members(organization_id,crew_id,worker_id,effective_from,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${crew.id}::uuid,${workerId}::uuid,current_date,${actor.userId}::uuid)
        `;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'crew',${crew.id}::uuid,'created',${`Создана бригада: ${body.name}`},${tx.json({objectId:body.objectId,leaderWorkerId:body.leaderWorkerId??null,members:memberIds.length})})
      `;
      return {id:crew.id};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError){
      const dedicatedConflict=error.issues.find(issue=>issue.message==="Выделенный бригадир не может одновременно входить в состав бригады");
      return NextResponse.json({error:dedicatedConflict?.message??"Проверьте данные бригады",issues:error.issues},{status:400});
    }
    if(error instanceof CrewValidationError)return NextResponse.json({error:error.message},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:"Не удалось создать бригаду"},{status:500});
  }
}
