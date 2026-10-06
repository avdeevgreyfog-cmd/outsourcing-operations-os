import type { Actor } from "@/lib/access/types";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow, hasCapability } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

export type StaffingPlanTargetWrite={
  objectId:string;
  specialtyId:string;
  plannedCount:number;
  shiftKind:"day"|"night"|"mixed";
  effectiveFrom:string;
  note?:string|null;
};

type StaffingPlanScope={
  organizationId:string;
  objectId:string;
  ownerUserId:string|null;
  regionId:string|null;
  assigneeUserIds:string[];
};

function editCapability(actor:Actor){
  if(hasCapability(actor.access,"operations.staffing_plan.edit"))return "operations.staffing_plan.edit";
  requireCapability(actor,"operations.need.edit");
  return "operations.need.edit";
}

export async function setStaffingPlanTarget(actor:Actor,input:StaffingPlanTargetWrite){
  const capability=editCapability(actor);
  if(actor.demo)return {id:`demo-plan-${input.objectId}-${input.specialtyId}`,demo:true};
  return withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
    const [scope]=await tx<StaffingPlanScope[]>`
      SELECT o.organization_id "organizationId",o.id "objectId",o.owner_user_id "ownerUserId",o.region_id "regionId",
        ARRAY(SELECT oa.user_id::text FROM object_assignments oa
          WHERE oa.object_id=o.id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
      FROM objects o WHERE o.id=${input.objectId}::uuid
    `;
    if(!scope||!canReadRow(actor.access,capability,scope,actor))throw new AccessDeniedError(capability);

    const [specialty]=await tx<Array<{id:string}>>`
      SELECT id FROM specialties WHERE id=${input.specialtyId}::uuid AND active
    `;
    if(!specialty)throw new Error("Специальность недоступна");

    await tx`
      UPDATE staffing_plan_targets
      SET effective_to=(${input.effectiveFrom}::date-1),updated_by_user_id=${actor.userId}::uuid,updated_at=now()
      WHERE object_id=${input.objectId}::uuid
        AND specialty_id=${input.specialtyId}::uuid
        AND shift_kind=${input.shiftKind}
        AND effective_from<${input.effectiveFrom}::date
        AND (effective_to IS NULL OR effective_to>=${input.effectiveFrom}::date)
    `;

    const [created]=await tx<Array<{id:string}>>`
      INSERT INTO staffing_plan_targets(
        organization_id,object_id,specialty_id,shift_kind,planned_count,effective_from,
        source_kind,note,created_by_user_id,updated_by_user_id
      ) VALUES(
        ${actor.organizationId}::uuid,${input.objectId}::uuid,${input.specialtyId}::uuid,${input.shiftKind},
        ${input.plannedCount},${input.effectiveFrom}::date,'manual',${input.note??null},
        ${actor.userId}::uuid,${actor.userId}::uuid
      ) RETURNING id
    `;

    await tx`
      INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
      VALUES(
        ${actor.organizationId}::uuid,${actor.userId}::uuid,'object',${input.objectId}::uuid,
        'staffing_plan_updated','Обновлён план комплектации',
        ${tx.json({specialtyId:input.specialtyId,plannedCount:input.plannedCount,shiftKind:input.shiftKind,effectiveFrom:input.effectiveFrom})}
      )
    `;

    return {id:created.id,demo:false};
  }));
}
