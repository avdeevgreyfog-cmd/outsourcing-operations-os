import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  fullName:z.string().trim().min(2).max(240),
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
  startDate:z.string().date(),
  relationType:z.enum(["employment","gph","npd","custom"]).default("employment"),
  rate:z.number().positive().nullable().optional(),
  rateUnit:z.enum(["hour","shift","month"]).default("hour"),
}).refine(value=>(!value.objectId&&!value.specialtyId)||(Boolean(value.objectId)&&Boolean(value.specialtyId)),{message:"Объект и специальность указываются вместе"});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.edit");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме сотрудник добавляется локально"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      let object:null|{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}=null;
      if(body.objectId){
        [object]=await tx<Array<{id:string;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
          SELECT o.id,o.owner_user_id "ownerUserId",o.region_id "regionId",
            ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
          FROM objects o WHERE o.id=${body.objectId}::uuid
        `;
        if(!object||!canReadRow(actor.access,"worker.edit",{organizationId:actor.organizationId,objectId:object.id,ownerUserId:object.ownerUserId,regionId:object.regionId,assigneeUserIds:object.assigneeUserIds},actor))throw new AccessDeniedError("worker.edit");
      }
      if(body.phone){
        const [existing]=await tx<Array<{id:string;fullName:string}>>`
          SELECT id,full_name "fullName" FROM worker_profiles
          WHERE regexp_replace(COALESCE(phone,''),'\\D','','g')=regexp_replace(${body.phone},'\\D','','g')
          LIMIT 1
        `;
        if(existing)return {duplicate:true,workerId:existing.id,fullName:existing.fullName};
      }
      const [worker]=await tx<Array<{id:string}>>`
        INSERT INTO worker_profiles(organization_id,full_name,phone,email,city,birth_date,clothing_size,shoe_size,height_cm,notes,status,source,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${body.fullName},${body.phone??null},${body.email??null},${body.city??null},${body.birthDate??null}::date,
          ${body.clothingSize??null},${body.shoeSize??null},${body.heightCm??null},${body.notes??null},'active','Ручное создание',${actor.userId}::uuid)
        RETURNING id
      `;
      await tx`
        INSERT INTO employment_relations(organization_id,worker_id,relation_type,effective_from,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${worker.id}::uuid,${body.relationType},${body.startDate}::date,${actor.userId}::uuid)
      `;
      if(body.objectId&&body.specialtyId){
        await tx`
          INSERT INTO worker_object_assignments(organization_id,worker_id,object_id,specialty_id,effective_from,manager_user_id,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${worker.id}::uuid,${body.objectId}::uuid,${body.specialtyId}::uuid,${body.startDate}::date,${object?.ownerUserId??actor.userId}::uuid,${actor.userId}::uuid)
        `;
      }
      if(body.rate&&body.objectId&&body.specialtyId){
        await tx`
          INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${worker.id}::uuid,${body.specialtyId}::uuid,${body.objectId}::uuid,${body.rate},${body.rateUnit},'any',${body.startDate}::date,${actor.userId}::uuid)
        `;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${worker.id}::uuid,'created',${`Сотрудник добавлен вручную: ${body.fullName}`},${tx.json({objectId:body.objectId??null,specialtyId:body.specialtyId??null,startDate:body.startDate})})
      `;
      return {duplicate:false,workerId:worker.id};
    }));
    if(result.duplicate)return NextResponse.json({error:`Сотрудник уже существует: ${result.fullName}`,workerId:result.workerId},{status:409});
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные сотрудника",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать сотрудника"},{status:500});
  }
}
