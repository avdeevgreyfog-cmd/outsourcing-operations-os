import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({absenceType:z.enum(["intershift","vacation","sick","personal","other"]),status:z.enum(["tentative","confirmed"]).default("tentative"),plannedFrom:z.string().date(),plannedTo:z.string().date().nullable().optional(),flexibleReturn:z.boolean().default(false),note:z.string().trim().max(1000).nullable().optional()});
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.edit");if(actor.demo)return NextResponse.json({error:"Демо-режим"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [worker]=await tx<Array<{id:string;objectId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT w.id,a.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM worker_profiles w
        LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id AND x.effective_to IS NULL ORDER BY x.effective_from DESC LIMIT 1) a ON true
        LEFT JOIN objects o ON o.id=a.object_id WHERE w.id=${id}::uuid
      `;
      if(!worker||!canReadRow(actor.access,"worker.edit",{organizationId:actor.organizationId,objectId:worker.objectId??undefined,ownerUserId:worker.ownerUserId??undefined,regionId:worker.regionId??undefined,assigneeUserIds:worker.assigneeUserIds},actor))throw new AccessDeniedError("worker.edit");
      const [row]=await tx<Array<{id:string}>>`
        INSERT INTO worker_absence_plans(organization_id,worker_id,object_id,absence_type,status,planned_from,planned_to,flexible_return,note,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${id}::uuid,${worker.objectId??null}::uuid,${body.absenceType},${body.status},${body.plannedFrom}::date,${body.plannedTo??null}::date,${body.flexibleReturn},${body.note??null},${actor.userId}::uuid)
        RETURNING id
      `;
      return row;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте отсутствие",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить отсутствие"},{status:500});
  }
}
