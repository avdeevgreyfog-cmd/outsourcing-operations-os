import { NextResponse } from "next/server";
import type { Sql } from "postgres";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import {assertEligibleObjectManagers,assertEligibleObjectRecruiters,objectEditVersion,ObjectSettingsConflict} from "@/lib/operations/object-manager-options";

const schema=z.object({
  expectedVersion:z.string().length(64),
  name:z.string().trim().min(2).max(240).optional(),
  legalEntityId:z.string().uuid().nullable().optional(),
  clientId:z.string().uuid().nullable().optional(),
  regionId:z.string().uuid().nullable().optional(),
  address:z.string().trim().max(500).nullable().optional(),
  targetStartDate:z.string().date().nullable().optional(),
  actualStartDate:z.string().date().nullable().optional(),
  actualEndDate:z.string().date().nullable().optional(),
  status:z.enum(["prelaunch","launch","active","paused","completed","archived"]).optional(),
  ownerUserId:z.string().uuid().optional(),
  additionalManagerUserIds:z.array(z.string().uuid()).max(20).optional(),
  recruitingMode:z.enum(["company_rules","object_team"]).optional(),
  recruiterUserIds:z.array(z.string().uuid()).max(50).optional(),
  keepPreviousManager:z.boolean().default(true),
  defaultTransitionDays:z.number().int().min(0).max(90).optional(),
  defaultDailyPaymentShifts:z.number().int().min(0).max(31).optional(),
  defaultScheduleWorkDays:z.number().int().min(1).max(31).nullable().optional(),
  defaultScheduleRestDays:z.number().int().min(0).max(31).nullable().optional(),
  defaultShiftKind:z.enum(["day","night","mixed"]).optional(),
  ppeTaskEnabled:z.boolean().optional(),
  ppeTaskDueDays:z.number().int().min(0).max(90).nullable().optional(),
}).superRefine((value,ctx)=>{
  const work=value.defaultScheduleWorkDays;const rest=value.defaultScheduleRestDays;
  if((work==null)!==(rest==null))ctx.addIssue({code:"custom",path:["defaultScheduleWorkDays"],message:"Рабочие и выходные дни графика задаются вместе"});
});

type ObjectScope={
  organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;clientId:string|null;createdByUserId:string;
  legalEntityId:string|null;recruitingMode:"company_rules"|"object_team";name:string;status:string;assigneeUserIds:string[];
  address:string|null;targetStartDate:string|null;actualStartDate:string|null;actualEndDate:string|null;updatedAt:string;
  defaultTransitionDays:number;defaultDailyPaymentShifts:number;defaultScheduleWorkDays:number|null;defaultScheduleRestDays:number|null;defaultShiftKind:"day"|"night"|"mixed";ppeTaskEnabled:boolean;ppeTaskDueDays:number|null;
};

async function getScope(tx:Sql,organizationId:string,id:string):Promise<ObjectScope|null>{
  const [row]=await tx<Array<ObjectScope>>`
    SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
      o.created_by_user_id "createdByUserId",o.client_company_id "clientId",o.legal_entity_id "legalEntityId",o.recruiting_routing_mode "recruitingMode",o.name,o.status,
      o.address_text address,o.target_start_date::text "targetStartDate",o.actual_start_date::text "actualStartDate",o.actual_end_date::text "actualEndDate",o.updated_at::text "updatedAt",
      o.default_transition_days "defaultTransitionDays",o.default_daily_payment_shifts "defaultDailyPaymentShifts",
      o.default_schedule_work_days "defaultScheduleWorkDays",o.default_schedule_rest_days "defaultScheduleRestDays",o.default_shift_kind "defaultShiftKind",
      o.ppe_task_enabled "ppeTaskEnabled",o.ppe_task_due_days "ppeTaskDueDays",
      ARRAY(SELECT oa.user_id::text FROM object_assignments oa
        WHERE oa.object_id=o.id AND oa.organization_id=o.organization_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
    FROM objects o WHERE o.organization_id=${organizationId}::uuid AND o.id=${id}::uuid FOR UPDATE OF o
  `;
  return row??null;
}

async function syncAssignments(tx:Sql,organizationId:string,objectId:string,type:string,userIds:string[],actorId:string){
  const wanted=[...new Set(userIds)];
  await tx`
    UPDATE object_assignments
    SET effective_to=current_date-1
    WHERE organization_id=${organizationId}::uuid AND object_id=${objectId}::uuid
      AND responsibility_type=${type}
      AND effective_from<current_date
      AND (effective_to IS NULL OR effective_to>=current_date)
      AND NOT (user_id=ANY(${wanted}::uuid[]))
  `;
  await tx`
    DELETE FROM object_assignments
    WHERE organization_id=${organizationId}::uuid AND object_id=${objectId}::uuid
      AND responsibility_type=${type}
      AND effective_from=current_date
      AND (effective_to IS NULL OR effective_to>=current_date)
      AND NOT (user_id=ANY(${wanted}::uuid[]))
  `;
  for(const userId of wanted){
    const [active]=await tx<Array<{id:string}>>`
      SELECT id FROM object_assignments
      WHERE organization_id=${organizationId}::uuid AND object_id=${objectId}::uuid AND user_id=${userId}::uuid AND responsibility_type=${type}
        AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
      LIMIT 1
    `;
    if(!active)await tx`
      INSERT INTO object_assignments(organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id)
      VALUES(${organizationId}::uuid,${objectId}::uuid,${userId}::uuid,${type},current_date,${actorId}::uuid)
    `;
  }
}

async function responsibilitySnapshot(tx:Sql,organizationId:string,objectId:string){
  return tx<Array<{userId:string;name:string;role:string}>>`
    SELECT o.owner_user_id "userId",u.display_name name,'primary_manager' role
    FROM objects o JOIN app_users u ON u.id=o.owner_user_id
    WHERE o.organization_id=${organizationId}::uuid AND o.id=${objectId}::uuid
    UNION ALL
    SELECT a.user_id "userId",u.display_name name,a.responsibility_type role
    FROM object_assignments a JOIN app_users u ON u.id=a.user_id
    WHERE a.organization_id=${organizationId}::uuid AND a.object_id=${objectId}::uuid
      AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
      AND a.responsibility_type IN ('additional_manager','recruiter')
  `;
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.edit");
    if(actor.demo)return NextResponse.json({error:"Изменения демо-объекта отображаются локально"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    if(body.ownerUserId!==undefined||body.additionalManagerUserIds!==undefined||body.recruitingMode!==undefined||body.recruiterUserIds!==undefined||body.legalEntityId!==undefined||body.clientId!==undefined||body.regionId!==undefined)requireCapability(actor,"operations.object.assign");
    const result=await withTenant(actor.organizationId,actor.userId,async tx=>{
      const current=await getScope(tx,actor.organizationId,id);
      if(!current||!canReadRow(actor.access,"operations.object.edit",current,actor))throw new AccessDeniedError("operations.object.edit");
      if(body.expectedVersion!==objectEditVersion(current.updatedAt))throw new ObjectSettingsConflict("Настройки объекта изменились после открытия формы. Ваш ввод сохранён. Загрузите актуальные данные и повторите правку.");
      const assignmentChange=body.ownerUserId!==undefined||body.additionalManagerUserIds!==undefined||body.recruitingMode!==undefined||body.recruiterUserIds!==undefined||body.legalEntityId!==undefined||body.clientId!==undefined||body.regionId!==undefined;
      if(assignmentChange&&!canReadRow(actor.access,"operations.object.assign",current,actor))throw new AccessDeniedError("operations.object.assign");

      const responsibilitiesBefore=assignmentChange?await responsibilitySnapshot(tx,actor.organizationId,id):null;

      if(body.clientId){
        const [client]=await tx<Array<{id:string;organizationId:string;ownerUserId:string|null;createdByUserId:string|null;regionId:string|null;teamId:string|null}>>`SELECT id,organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",region_id "regionId",assigned_team_id "teamId" FROM client_companies WHERE id=${body.clientId}::uuid AND organization_id=${actor.organizationId}::uuid AND status<>'archived'`;
        if(!client||!canReadRow(actor.access,"sales.client.read",{...client,clientId:client.id},actor))throw new AccessDeniedError("sales.client.read");
      }
      if(body.regionId){
        const [region]=await tx`SELECT id FROM regions WHERE id=${body.regionId}::uuid AND organization_id=${actor.organizationId}::uuid`;
        if(!region)throw new ObjectSettingsConflict("Регион недоступен");
      }
      if(body.legalEntityId){
        const [legalEntity]=await tx<Array<{id:string}>>`SELECT id FROM legal_entities WHERE id=${body.legalEntityId}::uuid AND organization_id=${actor.organizationId}::uuid AND active`;
        if(!legalEntity)throw new Error("Юридическое лицо недоступно");
      }

      if(body.status!==undefined&&body.status!==current.status){
        const [launch]=await tx<Array<{phase:string}>>`
          SELECT phase FROM launches WHERE object_id=${id}::uuid AND organization_id=${actor.organizationId}::uuid ORDER BY created_at DESC LIMIT 1
        `;
        if(launch&&(["prelaunch","launch"].includes(current.status)||["prelaunch","launch"].includes(body.status))){
          throw new Error("Статусы подготовки и запуска управляются из плана запуска объекта");
        }
      }
      const nextStatus=body.status??current.status;
      const nextActualStart=body.actualStartDate===undefined?current.actualStartDate:body.actualStartDate;
      const nextActualEnd=body.actualEndDate===undefined?current.actualEndDate:body.actualEndDate;

      if(nextActualStart&&nextActualEnd&&nextActualEnd<nextActualStart)throw new Error("Дата завершения не может быть раньше даты начала работы");

      const nextOwner=body.ownerUserId??current.ownerUserId;

      const ownerChanged=nextOwner!==current.ownerUserId;
      const syncAdditional=body.additionalManagerUserIds!==undefined||ownerChanged;
      const requestedAdditional:string[]=body.additionalManagerUserIds??(syncAdditional?(await tx<Array<{userId:string}>>`
        SELECT user_id "userId" FROM object_assignments WHERE object_id=${id}::uuid AND organization_id=${actor.organizationId}::uuid
          AND responsibility_type='additional_manager' AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
      `).map(row=>row.userId):[]);
      const nextAdditional=[...new Set(requestedAdditional.filter(userId=>userId!==nextOwner))];
      if(ownerChanged&&body.keepPreviousManager&&current.ownerUserId&&!nextAdditional.includes(current.ownerUserId))nextAdditional.push(current.ownerUserId);
      const requestedManagers=[...(body.ownerUserId!==undefined?[body.ownerUserId]:[]),...(body.additionalManagerUserIds??[])];
      if(requestedManagers.length)await assertEligibleObjectManagers(tx,actor.organizationId,requestedManagers);

      const syncRecruiters=body.recruitingMode!==undefined||body.recruiterUserIds!==undefined;
      const nextRecruitingMode=body.recruitingMode??current.recruitingMode;
      const requestedRecruiters:string[]=body.recruiterUserIds??(syncRecruiters&&nextRecruitingMode==='object_team'?(await tx<Array<{userId:string}>>`
        SELECT user_id "userId" FROM object_assignments WHERE object_id=${id}::uuid AND organization_id=${actor.organizationId}::uuid
          AND responsibility_type='recruiter' AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
      `).map(row=>row.userId):[]);
      const nextRecruiters=nextRecruitingMode==='object_team'?[...new Set(requestedRecruiters)]:[];
      if(syncRecruiters&&nextRecruitingMode==='object_team'&&!nextRecruiters.length)throw new ObjectSettingsConflict('Для закреплённой команды подбора выберите хотя бы одного сотрудника');
      if(syncRecruiters&&nextRecruiters.length)await assertEligibleObjectRecruiters(tx,actor.organizationId,nextRecruiters);

      let [updated]=await tx<Array<{updatedAt:string}>>`
        UPDATE objects SET
          name=COALESCE(${body.name??null},name),
          legal_entity_id=CASE WHEN ${body.legalEntityId===undefined} THEN legal_entity_id ELSE ${body.legalEntityId??null}::uuid END,
          client_company_id=CASE WHEN ${body.clientId===undefined} THEN client_company_id ELSE ${body.clientId??null}::uuid END,
          region_id=CASE WHEN ${body.regionId===undefined} THEN region_id ELSE ${body.regionId??null}::uuid END,
          address_text=CASE WHEN ${body.address===undefined} THEN address_text ELSE ${body.address??null} END,
          target_start_date=CASE WHEN ${body.targetStartDate===undefined} THEN target_start_date ELSE ${body.targetStartDate??null}::date END,
          actual_start_date=CASE WHEN ${body.actualStartDate===undefined} THEN actual_start_date ELSE ${body.actualStartDate??null}::date END,
          actual_end_date=CASE WHEN ${body.actualEndDate===undefined} THEN actual_end_date ELSE ${body.actualEndDate??null}::date END,
          status=${nextStatus},
          recruiting_routing_mode=${nextRecruitingMode},
          default_transition_days=COALESCE(${body.defaultTransitionDays??null}::int,default_transition_days),
          default_daily_payment_shifts=COALESCE(${body.defaultDailyPaymentShifts??null}::int,default_daily_payment_shifts),
          default_schedule_work_days=CASE WHEN ${body.defaultScheduleWorkDays===undefined} THEN default_schedule_work_days ELSE ${body.defaultScheduleWorkDays??null}::int END,
          default_schedule_rest_days=CASE WHEN ${body.defaultScheduleRestDays===undefined} THEN default_schedule_rest_days ELSE ${body.defaultScheduleRestDays??null}::int END,
          default_shift_kind=COALESCE(${body.defaultShiftKind??null},default_shift_kind),
          ppe_task_enabled=COALESCE(${body.ppeTaskEnabled??null}::boolean,ppe_task_enabled),
          ppe_task_due_days=CASE WHEN ${body.ppeTaskDueDays===undefined} THEN ppe_task_due_days ELSE ${body.ppeTaskDueDays??null}::int END,
          updated_at=clock_timestamp()
        WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid
        RETURNING updated_at::text "updatedAt"
      `;

      if(ownerChanged){
        [updated]=await tx<Array<{updatedAt:string}>>`UPDATE objects SET owner_user_id=${nextOwner}::uuid,updated_at=clock_timestamp()
          WHERE id=${id}::uuid AND organization_id=${actor.organizationId}::uuid RETURNING updated_at::text "updatedAt"`;
      }
      if(syncAdditional)await syncAssignments(tx,actor.organizationId,id,"additional_manager",nextAdditional,actor.userId);
      if(syncRecruiters)await syncAssignments(tx,actor.organizationId,id,"recruiter",nextRecruiters,actor.userId);

      const responsibilitiesAfter=assignmentChange?await responsibilitySnapshot(tx,actor.organizationId,id):null;
      const statusChanged=nextStatus!==current.status;
      const before={clientId:current.clientId,regionId:current.regionId,name:current.name,address:current.address,targetStartDate:current.targetStartDate,
        legalEntityId:current.legalEntityId,ownerUserId:current.ownerUserId,status:current.status,
        actualStartDate:current.actualStartDate,actualEndDate:current.actualEndDate,recruitingMode:current.recruitingMode,
        defaultTransitionDays:current.defaultTransitionDays,defaultDailyPaymentShifts:current.defaultDailyPaymentShifts,
        defaultScheduleWorkDays:current.defaultScheduleWorkDays,defaultScheduleRestDays:current.defaultScheduleRestDays,
        defaultShiftKind:current.defaultShiftKind,ppeTaskEnabled:current.ppeTaskEnabled,ppeTaskDueDays:current.ppeTaskDueDays};
      const changes={
        before,clientId:body.clientId===undefined?current.clientId:body.clientId,regionId:body.regionId===undefined?current.regionId:body.regionId,
        ...(assignmentChange?{responsibilitiesBefore,responsibilitiesAfter}:{}),
        name:body.name??current.name,address:body.address===undefined?current.address:body.address,
        targetStartDate:body.targetStartDate===undefined?current.targetStartDate:body.targetStartDate,
        ownerChanged,statusChanged,previousStatus:current.status,
        previousOwnerUserId:current.ownerUserId,
        ownerUserId:nextOwner,
        ...(syncAdditional?{additionalManagerUserIds:nextAdditional}:{}),
        recruitingMode:nextRecruitingMode,
        ...(syncRecruiters?{recruiterUserIds:nextRecruiters}:{}),
        legalEntityId:body.legalEntityId??current.legalEntityId,
        status:nextStatus,actualStartDate:nextActualStart,actualEndDate:nextActualEnd,
        defaultTransitionDays:body.defaultTransitionDays??current.defaultTransitionDays,
        defaultDailyPaymentShifts:body.defaultDailyPaymentShifts??current.defaultDailyPaymentShifts,
        defaultScheduleWorkDays:body.defaultScheduleWorkDays===undefined?current.defaultScheduleWorkDays:body.defaultScheduleWorkDays,
        defaultScheduleRestDays:body.defaultScheduleRestDays===undefined?current.defaultScheduleRestDays:body.defaultScheduleRestDays,
        defaultShiftKind:body.defaultShiftKind??current.defaultShiftKind,
        ppeTaskEnabled:body.ppeTaskEnabled??current.ppeTaskEnabled,
        ppeTaskDueDays:body.ppeTaskDueDays===undefined?current.ppeTaskDueDays:body.ppeTaskDueDays,
      };
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(
          ${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,
          ${ownerChanged?"manager_handover":statusChanged?"status_changed":"settings_updated"},
          ${ownerChanged?"Изменён основной менеджер объекта":statusChanged?"Изменён статус объекта":"Обновлены настройки объекта"},
          ${tx.json(changes)}
        )
      `;
      return {id,changes,updatedAt:updated.updatedAt,version:objectEditVersion(updated.updatedAt)};
    });
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте настройки объекта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    if(error instanceof ObjectSettingsConflict)return NextResponse.json({error:error.message},{status:409});
    console.error(error);return NextResponse.json({error:"Не удалось обновить объект. Введённые значения сохранены в форме"},{status:500});
  }
}