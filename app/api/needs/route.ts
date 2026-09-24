import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const schema = z.object({
  title: z.string().trim().min(2).max(240),
  specialtyId: z.string().uuid(),
  objectId: z.string().uuid().nullable().optional(),
  regionId: z.string().uuid().nullable().optional(),
  countRequired: z.number().int().min(1).max(10000),
  deadline: z.string().date().nullable().optional(),
  sourceKind: z.enum(["object","manual","replacement","reserve","other"]).default("manual"),
  priority: z.enum(["low","normal","high","critical"]).default("normal"),
  documentTypeIds: z.array(z.string().uuid()).max(50).optional(),
  documentRequirements: z.array(z.object({
    documentTypeId:z.string().uuid(),
    provider:z.enum(["candidate","company","client"]),
    requiredByStage:z.enum(["documents","preparation","first_shift","retention_7","retention_30","none"]).default("first_shift"),
    blocksProgress:z.boolean().default(false),
  })).max(50).optional(),
  conditions: z.object({
    location: z.string().trim().max(500).nullable().optional(),
    schedule: z.string().trim().max(1000).nullable().optional(),
    workerPay: z.string().trim().max(500).nullable().optional(),
    shift: z.string().trim().max(500).nullable().optional(),
    housing: z.string().trim().max(1000).nullable().optional(),
    travel: z.string().trim().max(1000).nullable().optional(),
    shuttle: z.string().trim().max(1000).nullable().optional(),
    meals: z.string().trim().max(1000).nullable().optional(),
    ppe: z.string().trim().max(1000).nullable().optional(),
    medical: z.string().trim().max(1000).nullable().optional(),
    citizenship: z.string().trim().max(1000).nullable().optional(),
    housingProvided: z.boolean().nullable().optional(),
    travelProvided: z.boolean().nullable().optional(),
    shuttleProvided: z.boolean().nullable().optional(),
    mealsProvided: z.boolean().nullable().optional(),
    ppeProvided: z.boolean().nullable().optional(),
    medicalProvided: z.boolean().nullable().optional(),
    tools: z.string().trim().max(1000).nullable().optional(),
    toolsProvided: z.boolean().nullable().optional(),
    dailyAllowanceProvided: z.boolean().nullable().optional(),
    dailyAllowanceAmount: z.string().trim().max(500).nullable().optional(),
    requirements: z.string().trim().max(3000).nullable().optional(),
    comment: z.string().trim().max(3000).nullable().optional(),
  }).default({}),
});

export async function POST(request: Request) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.need.create");
    if (actor.demo) return NextResponse.json({error:"В демо-режиме потребность сохраняется локально в браузере"},{status:409});
    const body = schema.parse(await request.json());
    if (!body.objectId && !body.regionId) return NextResponse.json({error:"Укажите объект или регион потребности"},{status:400});

    const result = await withTenant(actor.organizationId, actor.userId, async sql => sql.begin(async tx => {
      let regionId = body.regionId ?? null;
      let objectOwnerId: string | null = null;
      let recruitingMode:"company_rules"|"object_team"="company_rules";
      let objectRecruiters:Array<{userId:string;teamId:string|null}>=[];
      if (body.objectId) {
        const [object] = await tx<Array<{regionId:string;ownerUserId:string|null;recruitingMode:"company_rules"|"object_team"}>>`
          SELECT region_id "regionId",owner_user_id "ownerUserId",recruiting_routing_mode "recruitingMode"
          FROM objects WHERE id=${body.objectId}::uuid
        `;
        if (!object) throw new Error("Объект не найден");
        if (regionId && regionId !== object.regionId) throw new Error("Регион потребности не совпадает с регионом объекта");
        regionId = object.regionId;
        objectOwnerId = object.ownerUserId;
        recruitingMode=object.recruitingMode;
        if(recruitingMode==="object_team"){
          objectRecruiters=await tx<Array<{userId:string;teamId:string|null}>>`
            SELECT oa.user_id "userId",m.primary_team_id "teamId"
            FROM object_assignments oa
            JOIN organization_memberships m ON m.organization_id=oa.organization_id AND m.user_id=oa.user_id AND m.status='active'
            WHERE oa.object_id=${body.objectId}::uuid AND oa.responsibility_type='recruiter'
              AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)
            ORDER BY oa.created_at
          `;
        }
      }
      if (!regionId) throw new Error("Регион потребности не определён");
      if (!actor.access.allOrg && !actor.regionIds.includes(regionId)) throw new AccessDeniedError("operations.need.create");
      const [specialty] = await tx<Array<{id:string}>>`SELECT id FROM specialties WHERE id=${body.specialtyId}::uuid AND active`;
      if (!specialty) throw new Error("Специальность не найдена");

      const [routed] = await tx<Array<{userId:string;teamId:string|null}>>`
        WITH responsibility AS (
          SELECT user_id "userId",NULL::uuid "teamId",1 priority
          FROM resolve_organization_responsibility('recruiting_need','owner','region',${regionId}::uuid,current_date)
          LIMIT 1
        ), recruiter AS (
          SELECT m.user_id "userId",m.primary_team_id "teamId",2 priority
          FROM organization_memberships m
          JOIN role_templates rt ON rt.id=m.role_template_id AND rt.code='recruiter'
          LEFT JOIN membership_regions mr ON mr.membership_id=m.id AND mr.region_id=${regionId}::uuid
          WHERE m.organization_id=${actor.organizationId}::uuid AND m.status='active'
          ORDER BY (mr.region_id IS NOT NULL) DESC,m.created_at
          LIMIT 1
        )
        SELECT "userId","teamId" FROM (SELECT * FROM responsibility UNION ALL SELECT * FROM recruiter) x
        WHERE "userId" IS NOT NULL ORDER BY priority LIMIT 1
      `;
      const routeOwnerId=routed?.userId??actor.userId;
      const useObjectTeam=recruitingMode==="object_team"&&objectRecruiters.length>0;

      const [need] = await tx<Array<{id:string}>>`
        INSERT INTO needs(organization_id,object_id,region_id,specialty_id,count_required,count_filled,deadline,status,owner_user_id,manager_user_id,created_by_user_id,source_kind,title,priority,conditions_snapshot)
        VALUES(${actor.organizationId}::uuid,${body.objectId??null}::uuid,${regionId}::uuid,${body.specialtyId}::uuid,${body.countRequired},0,${body.deadline??null}::date,'open',${routeOwnerId}::uuid,${objectOwnerId}::uuid,${actor.userId}::uuid,${body.sourceKind},${body.title},${body.priority},${sql.json(body.conditions)})
        RETURNING id
      `;
      if(useObjectTeam){
        for(const recruiter of objectRecruiters){
          await tx`
            INSERT INTO need_assignments(organization_id,need_id,recruiter_user_id,team_id,target_count,assigned_by_user_id)
            VALUES(${actor.organizationId}::uuid,${need.id}::uuid,${recruiter.userId}::uuid,${recruiter.teamId}::uuid,0,${actor.userId}::uuid)
          `;
        }
      }
      const requestedDocs=body.documentRequirements?.length
        ? body.documentRequirements
        : (body.documentTypeIds??[]).map(documentTypeId=>({documentTypeId,provider:"candidate" as const,requiredByStage:"documents" as const,blocksProgress:true}));
      if(requestedDocs.length){
        const ids=[...new Set(requestedDocs.map(item=>item.documentTypeId))];
        if(ids.length!==requestedDocs.length)throw new Error("Документ указан несколько раз");
        const valid=await tx<Array<{id:string;defaultProvider:"candidate"|"company"|"client"}>>`
          SELECT id,default_provider "defaultProvider" FROM recruiting_document_types WHERE id=ANY(${ids}::uuid[]) AND active
        `;
        if(valid.length!==ids.length)throw new Error("Один из типов документов недоступен");
        for(const requirement of requestedDocs){
          await tx`
            INSERT INTO need_document_requirements(organization_id,need_id,document_type_id,required,provider,required_by_stage,blocks_progress)
            VALUES(${actor.organizationId}::uuid,${need.id}::uuid,${requirement.documentTypeId}::uuid,true,${requirement.provider},${requirement.requiredByStage},${requirement.blocksProgress})
          `;
        }
      }
      await tx`
        INSERT INTO need_quantity_changes(organization_id,need_id,old_count,new_count,delta,reason,changed_by_user_id)
        VALUES(${actor.organizationId}::uuid,${need.id}::uuid,NULL,${body.countRequired},${body.countRequired},'Исходный объём потребности',${actor.userId}::uuid)
      `;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'need',${need.id}::uuid,'created',${`Создана потребность: ${body.title}`},${sql.json({sourceKind:body.sourceKind,countRequired:body.countRequired,objectId:body.objectId??null,regionId,recruitingMode,useObjectTeam,assignedRecruiters:objectRecruiters.map(item=>item.userId)})})`;
      return {id:need.id};
    }));
    return NextResponse.json(result,{status:201});
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({error:"Проверьте данные потребности",issues:error.issues},{status:400});
    if (error instanceof AccessDeniedError) return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
