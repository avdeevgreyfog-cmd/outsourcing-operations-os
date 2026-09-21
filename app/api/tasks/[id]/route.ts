import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({status:z.enum(["open","in_progress","done","cancelled"])});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"task.edit");
    if(actor.demo)return NextResponse.json({error:"Демо-режим доступен только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [task]=await tx<Array<{id:string;organizationId:string;ownerUserId:string|null;createdByUserId:string;status:string}>>`
        SELECT id,organization_id "organizationId",assignee_user_id "ownerUserId",created_by_user_id "createdByUserId",status
        FROM tasks WHERE id=${id}::uuid FOR UPDATE
      `;
      if(!task||!canReadRow(actor.access,"task.edit",task,actor))throw new AccessDeniedError("task.edit");
      if(task.status==="cancelled"&&body.status!=="cancelled")throw new Error("Отменённую задачу нельзя вернуть в работу");
      await tx`UPDATE tasks SET status=${body.status},completed_at=${body.status==="done"?new Date().toISOString():null}::timestamptz,updated_at=now() WHERE id=${task.id}::uuid`;
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'task',${task.id}::uuid,'status_changed',
          ${"Статус задачи: "+task.status+" → "+body.status},${tx.json({from:task.status,to:body.status})})
      `;
      return {id:task.id,status:body.status};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректный статус",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось обновить задачу"},{status:500});
  }
}
