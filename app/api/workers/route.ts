import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import {resolveObjectConditionInTransaction,conditionScheduleParts} from "@/lib/operations/object-conditions";

const schema=z.object({
  fullName:z.string().trim().min(1).max(240),
  phone:z.string().trim().max(60).nullable().optional(),
  email:z.string().email().nullable().optional(),
  city:z.string().trim().max(240).nullable().optional(),
  birthDate:z.string().date().nullable().optional(),
  clothingSize:z.string().trim().max(40).nullable().optional(),
  shoeSize:z.string().trim().max(40).nullable().optional(),
  heightCm:z.number().int().min(100).max(250).nullable().optional(),
  notes:z.string().trim().max(3000).nullable().optional(),
  objectId:z.string().uuid().nullable().optional(),
  specialtyId:z.string().uuid().nullable().optional(),
  startDate:z.string().date().nullable().optional(),
  dateUnknown:z.boolean().optional(),
  shiftKind:z.enum(["day","night","mixed"]).default("mixed"),
  relationType:z.enum(["employment","gph","npd","custom"]).nullable().optional(),
  specialtyName:z.string().trim().min(1).max(240).nullable().optional(),
  rate:z.number().positive().nullable().optional(),
  rateUnit:z.enum(["hour","shift","month"]).nullable().optional(),
  workMode:z.enum(["local","rotation"]).nullable().optional(),
  paidHoursPerShift:z.number().positive().max(24).nullable().optional(),
}).superRefine((value,ctx)=>{
  if(value.objectId&&(value.specialtyId||value.specialtyName)&&value.startDate&&value.rate&&value.rateUnit==="shift"&&!value.paidHoursPerShift)ctx.addIssue({code:"custom",path:["paidHoursPerShift"],message:"Для ставки за смену укажите оплачиваемые часы"});
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.edit");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме сотрудник добавляется локально"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const normalizedPhone=body.phone?.replace(/\D/g,"")??"";
      if(normalizedPhone){
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId+":worker-phone:"+normalizedPhone},0))`;
        const [existing]=await tx<Array<{id:string}>>`
          SELECT id FROM worker_profiles WHERE organization_id=${actor.organizationId}::uuid
          AND regexp_replace(COALESCE(phone,''),'\\D','','g')=${normalizedPhone} LIMIT 1
        `;
        if(existing)return {duplicate:true};
      }
      let specialtyId=body.specialtyId??null;
      if(specialtyId){
        const [specialty]=await tx`SELECT id FROM specialties WHERE id=${specialtyId}::uuid AND organization_id=${actor.organizationId}::uuid AND active`;
        if(!specialty)throw new AccessDeniedError("worker.edit");
      }else if(body.specialtyName){
        requireCapability(actor,"admin.permissions.manage");
        await tx`SELECT pg_advisory_xact_lock(hashtextextended(${actor.organizationId+":"+body.specialtyName.toLocaleLowerCase("ru")},0))`;
        const [existing]=await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE organization_id=${actor.organizationId}::uuid AND active AND lower(name)=lower(${body.specialtyName}) LIMIT 1`;
        if(existing)specialtyId=existing.id;
        else{const [created]=await tx<Array<{id:string}>>`INSERT INTO specialties(organization_id,code,name) VALUES(${actor.organizationId}::uuid,${"custom-"+randomUUID()},${body.specialtyName}) RETURNING id`;specialtyId=created.id;}
      }
      const assigned=Boolean(body.objectId&&specialtyId&&(body.startDate||body.dateUnknown));
      if(assigned&&!body.startDate&&body.rate)throw new Error("Для индивидуальной ставки укажите дату начала действия");
      if(!assigned&&!canReadRow(actor.access,"worker.edit",{organizationId:actor.organizationId,createdByUserId:actor.userId},actor))throw new AccessDeniedError("worker.edit");
      let object:null|{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}=null;
      if(body.objectId){
        [object]=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
          SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",
            ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
          FROM objects o WHERE o.id=${body.objectId??null}::uuid AND o.organization_id=${actor.organizationId}::uuid
        `;
        if(!object||!canReadRow(actor.access,"worker.edit",{organizationId:actor.organizationId,objectId:object.id,ownerUserId:object.ownerUserId,regionId:object.regionId,assigneeUserIds:object.assigneeUserIds},actor))throw new AccessDeniedError("worker.edit");
      }
      const [worker]=await tx<Array<{id:string}>>`
        INSERT INTO worker_profiles(organization_id,full_name,phone,email,city,birth_date,clothing_size,shoe_size,height_cm,notes,status,source,created_by_user_id,onboarding_metadata)
        VALUES(${actor.organizationId}::uuid,${body.fullName},${body.phone?.trim()||null},${body.email??null},${body.city??null},${body.birthDate??null}::date,
          ${body.clothingSize??null},${body.shoeSize??null},${body.heightCm??null},${body.notes??null},${assigned?"active":"requires_assignment"},'Ручное создание',${actor.userId}::uuid,${tx.json({objectId:body.objectId??null,specialtyId,shiftKind:body.shiftKind,startDate:body.startDate??null,relationType:body.relationType??null,rate:body.rate??null,rateUnit:body.rate?body.rateUnit:null,workMode:body.workMode??null,paidHoursPerShift:body.paidHoursPerShift??null})})
        RETURNING id
      `;
      if(body.startDate&&body.relationType)await tx`
        INSERT INTO employment_relations(organization_id,worker_id,relation_type,effective_from,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${worker.id}::uuid,${body.relationType},${body.startDate??null}::date,${actor.userId}::uuid)
      `;
      if(assigned){
        const condition=await resolveObjectConditionInTransaction(tx,actor.organizationId,{objectId:body.objectId!,specialtyId:specialtyId!,shiftKind:body.shiftKind,date:body.startDate??null});
        const schedule=conditionScheduleParts(condition);
        await tx`
          INSERT INTO worker_object_assignments(organization_id,worker_id,object_id,specialty_id,effective_from,manager_user_id,work_mode,paid_hours_per_shift,schedule_work_days,schedule_rest_days,schedule_shift_kind,schedule_anchor_date,source_condition_id,paid_hours_override,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${worker.id}::uuid,${body.objectId??null}::uuid,${specialtyId}::uuid,${body.startDate??null}::date,${object!.ownerUserId}::uuid,${body.workMode??null},${body.paidHoursPerShift??condition?.paidHours??null},${schedule.workDays},${schedule.restDays},${body.shiftKind},${body.startDate??condition?.effectiveFrom??null}::date,${condition?.id??null}::uuid,${body.paidHoursPerShift!=null},${actor.userId}::uuid)
        `;
      }
      if(body.startDate&&body.rate&&body.rateUnit&&assigned){
        await tx`
          INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${worker.id}::uuid,${specialtyId}::uuid,${body.objectId??null}::uuid,${body.rate},${body.rateUnit},'any',${body.startDate??null}::date,${actor.userId}::uuid)
        `;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${worker.id}::uuid,'created',${`Сотрудник добавлен вручную: ${body.fullName}`},${tx.json({objectId:body.objectId??null,specialtyId,startDate:body.startDate??null,workMode:body.workMode,paidHoursPerShift:body.paidHoursPerShift??null})})
      `;
      return {duplicate:false,workerId:worker.id};
    }));
    if(result.duplicate)return NextResponse.json({error:"Сотрудник с таким телефоном уже существует. Проверьте реестр сотрудников."},{status:409});
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные сотрудника",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать сотрудника"},{status:500});
  }
}
