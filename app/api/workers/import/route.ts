import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const rowSchema=z.object({
  fullName:z.string().trim().min(2).max(240),
  phone:z.string().trim().max(60).nullable().optional(),
  email:z.string().email().nullable().optional(),
  city:z.string().trim().max(240).nullable().optional(),
  birthDate:z.string().date().nullable().optional(),
  specialtyName:z.string().trim().max(240).nullable().optional(),
  startDate:z.string().date().nullable().optional(),
  relationType:z.enum(["employment","gph","npd","custom"]).nullable().optional(),
  rate:z.number().positive().nullable().optional(),
  rateUnit:z.enum(["hour","shift","month"]).nullable().optional(),
  workMode:z.enum(["local","rotation"]).nullable().optional(),
  paidHoursPerShift:z.number().positive().max(24).nullable().optional(),
});
const schema=z.object({
  rows:z.array(rowSchema).min(1).max(1000),
  objectId:z.string().uuid(),
  specialtyId:z.string().uuid().nullable().optional(),
  startDate:z.string().date(),
  relationType:z.enum(["employment","gph","npd","custom"]).default("employment"),
  workMode:z.enum(["local","rotation"]).default("local"),
  paidHoursPerShift:z.number().positive().max(24).nullable().optional(),
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.edit");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме импорт выполняется локально"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [object]=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM objects o WHERE o.id=${body.objectId}::uuid
      `;
      if(!object||!canReadRow(actor.access,"worker.edit",{organizationId:actor.organizationId,objectId:object.id,ownerUserId:object.ownerUserId,regionId:object.regionId,assigneeUserIds:object.assigneeUserIds},actor))throw new AccessDeniedError("worker.edit");
      if(!object.ownerUserId)throw new Error("У объекта не назначен менеджер. Сначала назначьте менеджера объекта.");
      let created=0,reused=0,assigned=0;
      const issues:Array<{row:number;message:string;workerId?:string}>=[];
      for(let index=0;index<body.rows.length;index++){
        const row=body.rows[index];
        let specialtyId=body.specialtyId??null;
        if(row.specialtyName){
          const [specialty]=await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE lower(name)=lower(${row.specialtyName}) AND active LIMIT 1`;
          if(!specialty){issues.push({row:index+2,message:`Не найдена специальность: ${row.specialtyName}`});continue;}
          specialtyId=specialty.id;
        }
        if(!specialtyId){issues.push({row:index+2,message:"Не указана специальность"});continue;}
        let workerId:string|null=null;
        if(row.phone){
          const [existing]=await tx<Array<{id:string}>>`
            SELECT id FROM worker_profiles WHERE regexp_replace(COALESCE(phone,''),'\\D','','g')=regexp_replace(${row.phone},'\\D','','g') LIMIT 1
          `;
          workerId=existing?.id??null;
        }
        if(workerId){
          reused++;
          const [otherAssignment]=await tx<Array<{id:string;objectId:string}>>`
            SELECT id,object_id "objectId" FROM worker_object_assignments
            WHERE worker_id=${workerId}::uuid AND effective_to IS NULL ORDER BY effective_from DESC LIMIT 1
          `;
          if(otherAssignment&&otherAssignment.objectId!==body.objectId){
            issues.push({row:index+2,workerId,message:"Сотрудник уже назначен на другой объект. Используйте перевод."});continue;
          }
          await tx`
            UPDATE worker_profiles SET
              full_name=COALESCE(NULLIF(${row.fullName},''),full_name),
              email=COALESCE(email,${row.email??null}),city=COALESCE(city,${row.city??null}),birth_date=COALESCE(birth_date,${row.birthDate??null}::date),
              updated_at=now()
            WHERE id=${workerId}::uuid
          `;
        }else{
          const [worker]=await tx<Array<{id:string}>>`
            INSERT INTO worker_profiles(organization_id,full_name,phone,email,city,birth_date,status,source,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${row.fullName},${row.phone??null},${row.email??null},${row.city??null},${row.birthDate??null}::date,'active','Импорт сотрудников',${actor.userId}::uuid)
            RETURNING id
          `;
          workerId=worker.id;created++;
        }
        const startDate=row.startDate??body.startDate;
        const relationType=row.relationType??body.relationType;
        const [relation]=await tx<Array<{id:string}>>`SELECT id FROM employment_relations WHERE worker_id=${workerId}::uuid AND effective_to IS NULL LIMIT 1`;
        if(!relation)await tx`
          INSERT INTO employment_relations(organization_id,worker_id,relation_type,effective_from,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${relationType},${startDate}::date,${actor.userId}::uuid)
        `;
        const [assignment]=await tx<Array<{id:string}>>`
          SELECT id FROM worker_object_assignments WHERE worker_id=${workerId}::uuid AND object_id=${body.objectId}::uuid AND effective_to IS NULL LIMIT 1
        `;
        const workMode=row.workMode??body.workMode;
        const paidHoursPerShift=row.paidHoursPerShift??body.paidHoursPerShift??null;
        if(!assignment){
          await tx`
            INSERT INTO worker_object_assignments(organization_id,worker_id,object_id,specialty_id,effective_from,manager_user_id,work_mode,paid_hours_per_shift,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${body.objectId}::uuid,${specialtyId}::uuid,${startDate}::date,${object.ownerUserId}::uuid,${workMode},${paidHoursPerShift},${actor.userId}::uuid)
          `;assigned++;
        }else if(row.workMode||row.paidHoursPerShift!=null){
          await tx`
            UPDATE worker_object_assignments
            SET work_mode=${workMode},paid_hours_per_shift=COALESCE(${paidHoursPerShift},paid_hours_per_shift)
            WHERE id=${assignment.id}::uuid
          `;
        }
        if(row.rate){
          const [rate]=await tx<Array<{id:string}>>`
            SELECT id FROM worker_rates WHERE worker_id=${workerId}::uuid AND object_id=${body.objectId}::uuid AND specialty_id=${specialtyId}::uuid AND effective_to IS NULL LIMIT 1
          `;
          if(!rate)await tx`
            INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${specialtyId}::uuid,${body.objectId}::uuid,${row.rate},${row.rateUnit??"hour"},'any',${startDate}::date,${actor.userId}::uuid)
          `;
        }
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker_import','bulk_import',${`Импорт сотрудников: ${body.rows.length} строк`},${tx.json({objectId:body.objectId,created,reused,assigned,issues:issues.length})})
      `;
      return {total:body.rows.length,created,reused,assigned,issues};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте строки импорта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось импортировать сотрудников"},{status:500});
  }
}
