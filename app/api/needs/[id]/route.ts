import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { hasCapability } from "@/lib/core/access.mjs";

const conditionSchema = z.object({
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
});

const patchSchema = z.object({
  title: z.string().trim().min(2).max(240).optional(),
  countRequired: z.number().int().min(1).max(10000).optional(),
  deadline: z.string().date().nullable().optional(),
  priority: z.enum(["low","normal","high","critical"]).optional(),
  status: z.enum(["open","in_progress","filled","paused","cancelled"]).optional(),
  conditions: conditionSchema.partial().optional(),
  recruiters: z.array(z.object({
    userId: z.string().uuid(),
    targetCount: z.number().int().min(1).max(10000),
  })).max(50).optional(),
  quantityReason: z.string().trim().max(1000).nullable().optional(),
  documentTypeIds: z.array(z.string().uuid()).max(50).optional(),
  documentRequirements: z.array(z.object({
    documentTypeId:z.string().uuid(),
    provider:z.enum(["candidate","company","client"]),
    requiredByStage:z.enum(["documents","preparation","first_shift","retention_7","retention_30","none"]).default("first_shift"),
    blocksProgress:z.boolean().default(false),
  })).max(50).optional(),
});

type EditableNeed = {
  id: string;
  organizationId: string;
  title: string;
  regionId: string | null;
  ownerUserId: string | null;
  managerUserId: string | null;
  countRequired: number;
  deadline: string | null;
  priority: string;
  status: string;
  conditions: Record<string, unknown>;
  assigneeUserIds: string[];
};

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await getCurrentActor();
    if (!actor) return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.need.edit");
    if (actor.demo) return NextResponse.json({error:"Изменения демо-потребности сохраняются в браузере"},{status:409});
    const { id } = await params;
    const body = patchSchema.parse(await request.json());

    const result = await withTenant(actor.organizationId, actor.userId, async sql => sql.begin(async tx => {
      const [current] = await tx<EditableNeed[]>`
        SELECT n.id,n.organization_id "organizationId",COALESCE(n.title,s.name) title,n.region_id "regionId",
          n.owner_user_id "ownerUserId",n.manager_user_id "managerUserId",n.count_required "countRequired",
          n.deadline::text deadline,n.priority,n.status,n.conditions_snapshot conditions,
          ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na
                WHERE na.need_id=n.id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL) "assigneeUserIds"
        FROM needs n JOIN specialties s ON s.id=n.specialty_id
        WHERE n.id=${id}::uuid
      `;
      if (!current) return null;
      if (!canReadRow(actor.access,"operations.need.edit",current,actor)) throw new AccessDeniedError("operations.need.edit");

      const countRequired = body.countRequired ?? current.countRequired;
      const nextConditions = {...current.conditions,...(body.conditions ?? {})};
      const deadline = body.deadline === undefined ? current.deadline : body.deadline;
      const recruiters = body.recruiters;
      const countChanged = countRequired !== current.countRequired;

      if (recruiters) {
        const totalTarget = recruiters.reduce((sum,item)=>sum+item.targetCount,0);
        if (totalTarget > countRequired) throw new Error("План по рекрутерам не может быть больше общей потребности");
        const ids = [...new Set(recruiters.map(item=>item.userId))];
        if (ids.length !== recruiters.length) throw new Error("Один рекрутер указан несколько раз");
        if (ids.length) {
          const valid = await tx<Array<{id:string}>>`
            SELECT DISTINCT m.user_id id
            FROM organization_memberships m
            JOIN role_templates rt ON rt.id=m.role_template_id
            WHERE m.organization_id=${actor.organizationId}::uuid AND m.status='active'
              AND m.user_id=ANY(${ids}::uuid[])
              AND (
                rt.code IN ('recruiter','recruiting_manager')
                OR EXISTS (
                  SELECT 1 FROM permission_grants pg
                  WHERE pg.role_template_id=rt.id
                    AND pg.capability IN ('recruiting.candidate.edit','recruiting.candidate.create')
                    AND pg.effect='allow'
                )
                OR (m.user_id=${actor.userId}::uuid AND ${hasCapability(actor.access,"recruiting.candidate.edit")})
              )
          `;
          if (valid.length !== ids.length) throw new Error("Один из назначенных сотрудников не имеет доступа к подбору");
        }
      }

      await tx`
        UPDATE needs SET
          title=${body.title ?? current.title},
          count_required=${countRequired},
          deadline=${deadline}::date,
          priority=${body.priority ?? current.priority},
          status=CASE
            WHEN ${body.status ?? null}::text IS NOT NULL THEN ${body.status ?? null}
            WHEN ${countChanged} AND ${countRequired}>count_filled AND status='filled' THEN 'in_progress'
            ELSE status
          END,
          closed_at=CASE WHEN ${countChanged} AND ${countRequired}>count_filled THEN NULL ELSE closed_at END,
          conditions_snapshot=${sql.json(nextConditions)}
        WHERE id=${id}::uuid
      `;

      if(countChanged){
        const reason=body.quantityReason?.trim() || (countRequired>current.countRequired?"Расширение потребности":"Сокращение потребности");
        await tx`
          INSERT INTO need_quantity_changes(organization_id,need_id,old_count,new_count,delta,reason,changed_by_user_id)
          VALUES(${actor.organizationId}::uuid,${id}::uuid,${current.countRequired},${countRequired},${countRequired-current.countRequired},${reason},${actor.userId}::uuid)
        `;
        if(!recruiters){
          const activeAssignments=await tx<Array<{id:string}>>`
            SELECT id FROM need_assignments WHERE need_id=${id}::uuid AND unassigned_at IS NULL AND recruiter_user_id IS NOT NULL
          `;
          if(activeAssignments.length===1){
            await tx`UPDATE need_assignments SET target_count=${countRequired} WHERE id=${activeAssignments[0].id}::uuid`;
          }
        }
      }

      if(body.documentRequirements!==undefined||body.documentTypeIds!==undefined){
        const requestedDocs=body.documentRequirements??(body.documentTypeIds??[]).map(documentTypeId=>({documentTypeId,provider:"candidate" as const,requiredByStage:"documents" as const,blocksProgress:true}));
        const ids=[...new Set(requestedDocs.map(item=>item.documentTypeId))];
        if(ids.length!==requestedDocs.length)throw new Error("Документ указан несколько раз");
        if(ids.length){
          const valid=await tx<Array<{id:string}>>`
            SELECT id FROM recruiting_document_types WHERE id=ANY(${ids}::uuid[]) AND active
          `;
          if(valid.length!==ids.length)throw new Error("Один из типов документов недоступен");
        }
        await tx`DELETE FROM need_document_requirements WHERE need_id=${id}::uuid`;
        for(const requirement of requestedDocs){
          await tx`
            INSERT INTO need_document_requirements(organization_id,need_id,document_type_id,required,provider,required_by_stage,blocks_progress)
            VALUES(${actor.organizationId}::uuid,${id}::uuid,${requirement.documentTypeId}::uuid,true,${requirement.provider},${requirement.requiredByStage},${requirement.blocksProgress})
          `;
        }
      }

      if (recruiters) {
        await tx`UPDATE need_assignments SET unassigned_at=now() WHERE need_id=${id}::uuid AND unassigned_at IS NULL`;
        for (const item of recruiters) {
          await tx`
            INSERT INTO need_assignments(organization_id,need_id,recruiter_user_id,target_count,assigned_by_user_id)
            VALUES(${actor.organizationId}::uuid,${id}::uuid,${item.userId}::uuid,${item.targetCount},${actor.userId}::uuid)
          `;
        }
        await tx`UPDATE needs SET owner_user_id=${recruiters[0]?.userId ?? null}::uuid WHERE id=${id}::uuid`;
      }

      const changed = Object.keys(body).filter(key=>body[key as keyof typeof body] !== undefined && !["quantityReason"].includes(key));
      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'need',${id}::uuid,'updated',
          ${`Обновлена потребность: ${body.title ?? current.title}`},${sql.json({changed})})
      `;
      return {id};
    }));

    if (!result) return NextResponse.json({error:"Потребность не найдена"},{status:404});
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({error:"Проверьте данные потребности",issues:error.issues},{status:400});
    if (error instanceof AccessDeniedError) return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
