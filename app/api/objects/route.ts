import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  name:z.string().trim().min(2).max(240),
  code:z.string().trim().min(2).max(40).regex(/^[A-Za-z0-9_-]+$/).nullable().optional(),
  clientId:z.string().uuid(),
  legalEntityId:z.string().uuid(),
  regionId:z.string().uuid(),
  address:z.string().trim().max(500).nullable().optional(),
  targetStartDate:z.string().date().nullable().optional(),
  ownerUserId:z.string().uuid(),
  additionalManagerUserIds:z.array(z.string().uuid()).max(20).default([]),
  recruitingMode:z.enum(["company_rules","object_team"]).default("company_rules"),
  recruiterUserIds:z.array(z.string().uuid()).max(50).default([]),
  status:z.enum(["prelaunch","launch","active"]).default("active"),
}).superRefine((value,ctx)=>{
  if(value.additionalManagerUserIds.includes(value.ownerUserId))ctx.addIssue({code:"custom",path:["additionalManagerUserIds"],message:"Основной менеджер не должен дублироваться в дополнительных"});
  if(value.recruitingMode==="object_team"&&value.recruiterUserIds.length===0)ctx.addIssue({code:"custom",path:["recruiterUserIds"],message:"Для закреплённой команды выберите хотя бы одного сотрудника подбора"});
});

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.create");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме объект добавляется локально"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [[client],[legalEntity],[region]]=await Promise.all([
        tx<Array<{id:string}>>`SELECT id FROM client_companies WHERE id=${body.clientId}::uuid AND status<>'archived'`,
        tx<Array<{id:string}>>`SELECT id FROM legal_entities WHERE id=${body.legalEntityId}::uuid AND active`,
        tx<Array<{id:string}>>`SELECT id FROM regions WHERE id=${body.regionId}::uuid`,
      ]);
      if(!client)throw new Error("Клиент не найден");
      if(!legalEntity)throw new Error("Юридическое лицо недоступно");
      if(!region)throw new Error("Регион не найден");

      const managerIds=[...new Set([body.ownerUserId,...body.additionalManagerUserIds])];
      const validManagers=await tx<Array<{id:string}>>`
        SELECT DISTINCT m.user_id id
        FROM organization_memberships m
        LEFT JOIN role_templates rt ON rt.id=m.role_template_id
        WHERE m.status='active' AND m.user_id=ANY(${managerIds}::uuid[])
          AND (
            rt.code IN ('director','object_manager','regional_manager','operations_head')
            OR EXISTS (
              SELECT 1 FROM permission_grants pg
              WHERE pg.role_template_id=m.role_template_id AND pg.capability='operations.object.edit' AND pg.effect='allow'
            )
            OR EXISTS (
              SELECT 1 FROM position_assignments pa
              JOIN staff_positions sp ON sp.id=pa.staff_position_id
              JOIN position_permission_grants ppg ON ppg.position_id=sp.job_profile_id
              WHERE pa.membership_id=m.id AND pa.status<>'ended'
                AND pa.effective_from<=current_date AND (pa.effective_to IS NULL OR pa.effective_to>=current_date)
                AND ppg.capability='operations.object.edit' AND ppg.effect='allow'
            )
          )
      `;
      if(validManagers.length!==managerIds.length)throw new Error("Один из выбранных менеджеров не имеет права работать с объектами");
      if(body.recruiterUserIds.length){
        const validRecruiters=await tx<Array<{id:string}>>`
          SELECT DISTINCT m.user_id id
          FROM organization_memberships m
          LEFT JOIN role_templates rt ON rt.id=m.role_template_id
          WHERE m.status='active' AND m.user_id=ANY(${body.recruiterUserIds}::uuid[])
            AND (
              rt.code IN ('recruiter','recruiting_manager','recruitment_head')
              OR EXISTS (
                SELECT 1 FROM permission_grants pg
                WHERE pg.role_template_id=m.role_template_id
                  AND pg.capability IN ('recruiting.candidate.create','recruiting.candidate.edit','recruiting.candidate.assign')
                  AND pg.effect='allow'
              )
            )
        `;
        if(validRecruiters.length!==new Set(body.recruiterUserIds).size)throw new Error("Один из выбранных сотрудников не имеет доступа к подбору");
      }

      const generatedCode=body.code??`OBJ-${crypto.randomUUID().replaceAll("-","").slice(0,8).toUpperCase()}`;
      const [object]=await tx<Array<{id:string;name:string;code:string}>>`
        INSERT INTO objects(
          organization_id,client_company_id,legal_entity_id,name,code,status,region_id,address_text,target_start_date,
          owner_user_id,recruiting_routing_mode,created_by_user_id
        )
        VALUES(
          ${actor.organizationId}::uuid,${body.clientId}::uuid,${body.legalEntityId}::uuid,${body.name},${generatedCode},${body.status},
          ${body.regionId}::uuid,${body.address??null},${body.targetStartDate??null}::date,${body.ownerUserId}::uuid,${body.recruitingMode},${actor.userId}::uuid
        )
        RETURNING id,name,code
      `;
      await tx`
        INSERT INTO object_assignments(organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id)
        VALUES(${actor.organizationId}::uuid,${object.id}::uuid,${body.ownerUserId}::uuid,'object_manager',current_date,${actor.userId}::uuid)
      `;
      for(const userId of body.additionalManagerUserIds){
        await tx`
          INSERT INTO object_assignments(organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id)
          VALUES(${actor.organizationId}::uuid,${object.id}::uuid,${userId}::uuid,'additional_manager',current_date,${actor.userId}::uuid)
        `;
      }
      if(body.recruitingMode==="object_team"){
        for(const userId of body.recruiterUserIds){
          await tx`
            INSERT INTO object_assignments(organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id)
            VALUES(${actor.organizationId}::uuid,${object.id}::uuid,${userId}::uuid,'recruiter',current_date,${actor.userId}::uuid)
          `;
        }
      }
      if(body.status!=="active"){
        const [launch]=await tx<Array<{id:string;targetDate:string}>>`
          INSERT INTO launches(organization_id,object_id,target_date,forecast_date,progress_pct,risk_level,checklist_json,phase,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${object.id}::uuid,COALESCE(${body.targetStartDate??null}::date,current_date+14),COALESCE(${body.targetStartDate??null}::date,current_date+14),0,'normal','[]'::jsonb,'preparation',${actor.userId}::uuid)
          RETURNING id,target_date::text "targetDate"
        `;
        await tx`
          INSERT INTO launch_tasks(organization_id,launch_id,title,owner_user_id,start_date,end_date,baseline_start,baseline_end,progress_pct,status,risk_level,is_milestone,is_critical,created_by_user_id)
          VALUES
            (${actor.organizationId}::uuid,${launch.id}::uuid,'Передача объекта в запуск',${body.ownerUserId}::uuid,current_date,current_date,current_date,current_date,0,'planned','normal',false,true,${actor.userId}::uuid),
            (${actor.organizationId}::uuid,${launch.id}::uuid,'Создать потребности и план комплектации',${body.ownerUserId}::uuid,current_date,GREATEST(current_date,${launch.targetDate}::date-2),current_date,GREATEST(current_date,${launch.targetDate}::date-2),0,'planned','watch',false,true,${actor.userId}::uuid),
            (${actor.organizationId}::uuid,${launch.id}::uuid,'Логистика и обеспечение',${body.ownerUserId}::uuid,current_date,GREATEST(current_date,${launch.targetDate}::date-1),current_date,GREATEST(current_date,${launch.targetDate}::date-1),0,'planned','normal',false,false,${actor.userId}::uuid),
            (${actor.organizationId}::uuid,${launch.id}::uuid,'Готовность к первому выходу',${body.ownerUserId}::uuid,GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-1),GREATEST(current_date,${launch.targetDate}::date-1),0,'planned','normal',true,true,${actor.userId}::uuid),
            (${actor.organizationId}::uuid,${launch.id}::uuid,'Старт объекта',${body.ownerUserId}::uuid,${launch.targetDate}::date,${launch.targetDate}::date,${launch.targetDate}::date,${launch.targetDate}::date,0,'planned','normal',true,true,${actor.userId}::uuid)
        `;
      }
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(
          ${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${object.id}::uuid,'created_manual',
          ${`Объект добавлен вручную: ${body.name}`},
          ${tx.json({clientId:body.clientId,legalEntityId:body.legalEntityId,regionId:body.regionId,ownerUserId:body.ownerUserId,recruitingMode:body.recruitingMode})}
        )
      `;
      return object;
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные объекта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось создать объект"},{status:500});
  }
}
