import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  name:z.string().trim().min(2).max(120).optional(),
  targetDate:z.string().date().optional(),
  plannedCount:z.number().int().min(1).max(10000).optional(),
  specialtyId:z.string().uuid().nullable().optional(),
  note:z.string().trim().max(1000).nullable().optional(),
  status:z.enum(["planned","in_progress","completed","cancelled"]).optional(),
});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string;waveId:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.edit");
    if(actor.demo)return NextResponse.json({error:"В демо волны изменяются только локально"},{status:409});
    const {id,waveId}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [scope]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string;clientId:string;assigneeUserIds:string[]}>>`
        SELECT l.organization_id "organizationId",l.object_id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",o.client_company_id "clientId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM launch_staffing_waves w JOIN launches l ON l.id=w.launch_id JOIN objects o ON o.id=l.object_id
        WHERE w.id=${waveId}::uuid AND l.id=${id}::uuid
      `;
      if(!scope||!canReadRow(actor.access,"operations.object.edit",scope,actor))throw new AccessDeniedError("operations.object.edit");
      if(body.specialtyId){
        const [specialty]=await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE id=${body.specialtyId}::uuid`;
        if(!specialty)throw new Error("Специальность недоступна");
      }
      const [row]=await tx<Array<{id:string}>>`
        UPDATE launch_staffing_waves SET
          name=COALESCE(${body.name??null},name),
          target_date=COALESCE(${body.targetDate??null}::date,target_date),
          planned_count=COALESCE(${body.plannedCount??null}::int,planned_count),
          specialty_id=CASE WHEN ${body.specialtyId===undefined} THEN specialty_id ELSE ${body.specialtyId??null}::uuid END,
          note=CASE WHEN ${body.note===undefined} THEN note ELSE ${body.note??null} END,
          status=COALESCE(${body.status??null},status),
          updated_at=now()
        WHERE id=${waveId}::uuid AND launch_id=${id}::uuid
        RETURNING id
      `;
      return row;
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте параметры волны",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось обновить волну"},{status:500});
  }
}
