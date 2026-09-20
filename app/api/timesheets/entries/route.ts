import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({workerId:z.string().uuid(),objectId:z.string().uuid(),workDate:z.string().date(),value:z.union([z.string().max(20),z.number().min(0).max(24),z.null()]),nightHours:z.number().min(0).max(24).optional(),overtimeHours:z.number().min(0).max(24).optional(),reason:z.string().trim().max(500).nullable().optional()});
const codeMap:Record<string,string>={"В":"DAY_OFF","О":"VACATION","МВ":"INTERSHIFT","Б":"SICK","НВ":"NO_SHOW","Н":"ABSENCE"};

export async function PATCH(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"time.time_entry.edit");if(actor.demo)return NextResponse.json({ok:true});
    const body=schema.parse(await request.json());
    const raw=body.value==null?"":String(body.value).trim().toUpperCase();
    let timeCode="WORK",factHours=0;
    if(raw===""){
      timeCode="WORK";factHours=0;
    }else if(codeMap[raw]){
      timeCode=codeMap[raw];factHours=0;
    }else{
      const parsed=Number(raw.replace(",","."));
      if(!Number.isFinite(parsed)||parsed<0||parsed>24)return NextResponse.json({error:"Введите часы 0–24 или код: В, О, МВ, Б, НВ"},{status:400});
      factHours=parsed;
    }
    await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [object]=await tx<Array<{organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid
      `;
      if(!object||!canReadRow(actor.access,"time.time_entry.edit",object,actor))throw new AccessDeniedError("time.time_entry.edit");
      const [assignment]=await tx<Array<{id:string}>>`
        SELECT id FROM worker_object_assignments
        WHERE worker_id=${body.workerId}::uuid AND object_id=${body.objectId}::uuid
          AND effective_from<=${body.workDate}::date AND (effective_to IS NULL OR effective_to>=${body.workDate}::date)
        LIMIT 1
      `;
      if(!assignment)throw new Error("На эту дату сотрудник не назначен на объект");
      const [existing]=await tx<Array<{id:string}>>`
        SELECT id FROM time_entries
        WHERE worker_id=${body.workerId}::uuid AND object_id=${body.objectId}::uuid AND work_date=${body.workDate}::date
        ORDER BY (shift_id IS NULL) DESC,updated_at DESC LIMIT 1 FOR UPDATE
      `;
      if(existing){
        await tx`
          UPDATE time_entries SET time_code=${timeCode},fact_hours=${factHours},day_hours=${factHours},
            night_hours=${body.nightHours??0},overtime_hours=${body.overtimeHours??0},source='manual',
            correction_reason=${body.reason??"Ручная корректировка табеля"},corrected_by_user_id=${actor.userId}::uuid,updated_at=now()
          WHERE id=${existing.id}::uuid
        `;
      }else{
        await tx`
          INSERT INTO time_entries(organization_id,worker_id,object_id,work_date,planned,time_code,fact_hours,day_hours,night_hours,overtime_hours,source,correction_reason,corrected_by_user_id)
          VALUES(${actor.organizationId}::uuid,${body.workerId}::uuid,${body.objectId}::uuid,${body.workDate}::date,true,${timeCode},${factHours},${factHours},${body.nightHours??0},${body.overtimeHours??0},'manual',${body.reason??"Ручной ввод табеля"},${actor.userId}::uuid)
        `;
      }
    }));
    return NextResponse.json({ok:true});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте запись табеля",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось сохранить табель"},{status:500});
  }
}
