import { NextResponse } from "next/server";
import type { Sql } from "postgres";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  name:z.string().trim().min(2).max(240).optional(),
  legalEntityId:z.string().uuid().optional(),
  address:z.string().trim().max(500).nullable().optional(),
  targetStartDate:z.string().date().nullable().optional(),
  status:z.enum(["prelaunch","launch","active","paused","completed","archived"]).optional(),
  ownerUserId:z.string().uuid().optional(),
  additionalManagerUserIds:z.array(z.string().uuid()).max(20).optional(),
  recruitingMode:z.enum(["company_rules","object_team"]).optional(),
  recruiterUserIds:z.array(z.string().uuid()).max(50).optional(),
  keepPreviousManager:z.boolean().default(true),
});

type ObjectScope={
  organizationId:string;objectId:string;ownerUserId:string|null;regionId:string|null;clientId:string;
  legalEntityId:string|null;recruitingMode:"company_rules"|"object_team";name:string;status:string;assigneeUserIds:string[];
};

async function getScope(tx:Sql,organizationId:string,id:string):Promise<ObjectScope|null>{
  const [row]=await tx<Array<ObjectScope>>`
    SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
      o.client_company_id "clientId",o.legal_entity_id "legalEntityId",o.recruiting_routing_mode "recruitingMode",o.name,o.status,
      ARRAY(SELECT oa.user_id::text FROM object_assignments oa
        WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
    FROM objects o WHERE o.organization_id=${organizationId}::uuid AND o.id=${id}::uuid
  `;
  return row??null;
}

async function syncAssignments(tx:Sql,organizationId:string,objectId:string,type:string,userIds:string[],actorId:string){
  const wanted=[...new Set(userIds)];
  await tx`
    UPDATE object_assignments
    SET effective_to=current_date-1
    WHERE object_id=${objectId}::uuid
      AND responsibility_type=${type}
      AND effective_from<current_date
      AND (effective_to IS NULL OR effective_to>=current_date)
      AND NOT (user_id=ANY(${wanted}::uuid[]))
  `;
  await tx`
    DELETE FROM object_assignments
    WHERE object_id=${objectId}::uuid
      AND responsibility_type=${type}
      AND effective_from=current_date
      AND (effective_to IS NULL OR effective_to>=current_date)
      AND NOT (user_id=ANY(${wanted}::uuid[]))
  `;
  for(const userId of wanted){
    const [active]=await tx<Array<{id:string}>>`
      SELECT id FROM object_assignments
      WHERE object_id=${objectId}::uuid AND user_id=${userId}::uuid AND responsibility_type=${type}
        AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
      LIMIT 1
    `;
    if(!active)await tx`
      INSERT INTO object_assignments(organization_id,object_id,user_id,responsibility_type,effective_from,assigned_by_user_id)
      VALUES(${organizationId}::uuid,${objectId}::uuid,${userId}::uuid,${type},current_date,${actorId}::uuid)
    `;
  }
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.object.edit");
    if(actor.demo)return NextResponse.json({error:"Изменения демо-объекта отображаются локально"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    if(body.ownerUserId!==undefined||body.additionalManagerUserIds!==undefined||body.recruitingMode!==undefined||body.recruiterUserIds!==undefined||body.legalEntityId!==undefined)requireCapability(actor,"operations.object.assign");
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const current=await getScope(tx,actor.organizationId,id);
      if(!current||!canReadRow(actor.access,"operations.object.edit",current,actor))throw new AccessDeniedError("operations.object.edit");

      if(body.legalEntityId){
        const [legalEntity]=await tx<Array<{id:string}>>`SELECT id FROM legal_entities WHERE id=${body.legalEntityId}::uuid AND active`;
        if(!legalEntity)throw new Error("Юридическое лицо недоступно");
      }

      const nextOwner=body.ownerUserId??current.ownerUserId;
      if(!nextOwner)throw new Error("У объекта должен быть основной менеджер");
      const requestedAdditional:string[]=body.additionalManagerUserIds!==undefined
        ?body.additionalManagerUserIds
        :(await tx<Array<{userId:string}>>`
          SELECT user_id "userId" FROM object_assignments
          WHERE object_id=${id}::uuid AND responsibility_type='additional_manager'
            AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
        `).map(row=>row.userId);
      const nextAdditional=[...new Set(requestedAdditional.filter(userId=>userId!==nextOwner))];
      const ownerChanged=nextOwner!==current.ownerUserId;
      if(ownerChanged&&body.keepPreviousManager&&current.ownerUserId&&!nextAdditional.includes(current.ownerUserId))nextAdditional.push(current.ownerUserId);

      const requestedRecruiters:string[]=body.recruiterUserIds!==undefined
        ?body.recruiterUserIds
        :(await tx<Array<{userId:string}>>`
          SELECT user_id "userId" FROM object_assignments
          WHERE object_id=${id}::uuid AND responsibility_type='recruiter'
            AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>=current_date)
        `).map(row=>row.userId);
      const nextRecruitingMode=body.recruitingMode??current.recruitingMode;
      const nextRecruiters=nextRecruitingMode==="object_team"?[...new Set(requestedRecruiters)]:[];
      if(nextRecruitingMode==="object_team"&&!nextRecruiters.length)throw new Error("Для закреплённой команды подбора выберите хотя бы одного сотрудника");

      const managerIds=[...new Set([nextOwner,...nextAdditional])];
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
      if(nextRecruiters.length){
        const validRecruiters=await tx<Array<{id:string}>>`
          SELECT DISTINCT m.user_id id
          FROM organization_memberships m
          LEFT JOIN role_templates rt ON rt.id=m.role_template_id
          WHERE m.status='active' AND m.user_id=ANY(${nextRecruiters}::uuid[])
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
        if(validRecruiters.length!==new Set(nextRecruiters).size)throw new Error("Один из выбранных сотрудников не имеет доступа к подбору");
      }

      await tx`
        UPDATE objects SET
          name=COALESCE(${body.name??null},name),
          legal_entity_id=COALESCE(${body.legalEntityId??null}::uuid,legal_entity_id),
          address_text=CASE WHEN ${body.address===undefined} THEN address_text ELSE ${body.address??null} END,
          target_start_date=CASE WHEN ${body.targetStartDate===undefined} THEN target_start_date ELSE ${body.targetStartDate??null}::date END,
          status=COALESCE(${body.status??null},status),
          recruiting_routing_mode=${nextRecruitingMode},
          owner_user_id=${nextOwner}::uuid,
          updated_at=now()
        WHERE id=${id}::uuid
      `;

      await syncAssignments(tx,actor.organizationId,id,"additional_manager",nextAdditional,actor.userId);
      await syncAssignments(tx,actor.organizationId,id,"recruiter",nextRecruiters,actor.userId);

      const changes={
        ownerChanged,
        previousOwnerUserId:current.ownerUserId,
        ownerUserId:nextOwner,
        additionalManagerUserIds:nextAdditional,
        recruitingMode:nextRecruitingMode,
        recruiterUserIds:nextRecruiters,
        legalEntityId:body.legalEntityId??current.legalEntityId,
        status:body.status??current.status,
      };
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(
          ${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${id}::uuid,
          ${ownerChanged?"manager_handover":"settings_updated"},
          ${ownerChanged?"Изменён основной менеджер объекта":"Обновлены настройки объекта"},
          ${tx.json(changes)}
        )
      `;
      return {id,changes};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте настройки объекта",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось обновить объект"},{status:500});
  }
}
