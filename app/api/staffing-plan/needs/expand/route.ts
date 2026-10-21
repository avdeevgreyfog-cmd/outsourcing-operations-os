import {NextResponse} from "next/server";
import {z} from "zod";
import {getCurrentActor} from "@/lib/auth/server";
import {AccessDeniedError,requireCapability} from "@/lib/access/server";
import {canReadRow} from "@/lib/core/access.mjs";
import {withTenant} from "@/lib/db/client";
import {requireObjectScope} from "@/lib/operations/object-conditions";

const schema=z.object({
  objectId:z.string().uuid(),
  targetId:z.string().uuid(),
  needId:z.string().uuid(),
  increment:z.number().int().min(1).max(10000),
  reason:z.string().trim().min(2).max(1000),
  deadline:z.string().date().nullable().optional(),
  priority:z.enum(["low","normal","high","critical"]).optional(),
  ownerUserId:z.string().uuid().nullable().optional(),
});

type NeedForEdit={
  id:string;organizationId:string;objectId:string;regionId:string|null;
  ownerUserId:string|null;managerUserId:string|null;createdByUserId:string|null;
  assigneeUserIds:string[];countRequired:number;countFilled:number;status:string;
};
export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"operations.need.edit");
    if(actor.demo)return NextResponse.json({error:"Изменение потребности недоступно в демо-режиме"},{status:409});
    const body=schema.parse(await request.json());
    await requireObjectScope(actor,body.objectId,"operations.need.edit");
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      // Lock the plan first, as /api/needs does, so two increments cannot spend the same deficit.
      const [target]=await tx<Array<{id:string;plannedCount:number;specialtyId:string;shiftKind:string}>>`
        SELECT id,planned_count "plannedCount",specialty_id "specialtyId",shift_kind "shiftKind"
        FROM staffing_plan_targets
        WHERE organization_id=${actor.organizationId}::uuid AND id=${body.targetId}::uuid
          AND object_id=${body.objectId}::uuid AND status='active'
          AND(effective_from IS NULL OR effective_from<=current_date)
          AND(effective_to IS NULL OR effective_to>=current_date)
        FOR UPDATE`;
      if(!target)throw new Error("Действующая строка плана не найдена");
      const [need]=await tx<NeedForEdit[]>`
        SELECT n.id,n.organization_id "organizationId",n.object_id "objectId",
          n.region_id "regionId",n.owner_user_id "ownerUserId",n.manager_user_id "managerUserId",
          n.created_by_user_id "createdByUserId",n.count_required "countRequired",
          n.count_filled "countFilled",n.status,
          ARRAY(SELECT a.recruiter_user_id::text FROM need_assignments a
            WHERE a.need_id=n.id AND a.unassigned_at IS NULL AND a.recruiter_user_id IS NOT NULL) "assigneeUserIds"
        FROM needs n
        WHERE n.id=${body.needId}::uuid AND n.organization_id=${actor.organizationId}::uuid
          AND n.staffing_plan_target_id=${target.id}::uuid
          AND n.object_id=${body.objectId}::uuid AND n.specialty_id=${target.specialtyId}::uuid
          AND n.shift_kind=${target.shiftKind}
        FOR UPDATE OF n`;
      if(!need||!canReadRow(actor.access,"operations.need.edit",need,actor))throw new AccessDeniedError("operations.need.edit");
      if(!["open","in_progress"].includes(need.status))throw new Error("Приостановленную или закрытую потребность сначала проверьте в реестре потребностей");
      const [staff]=await tx<Array<{working:number}>>`
        SELECT count(DISTINCT a.worker_id)::int working
        FROM worker_object_assignments a JOIN worker_profiles w
          ON w.id=a.worker_id AND w.organization_id=a.organization_id AND w.status='active'
        WHERE a.organization_id=${actor.organizationId}::uuid AND a.object_id=${body.objectId}::uuid
          AND a.specialty_id=${target.specialtyId}::uuid
          AND(a.effective_from IS NULL OR a.effective_from<=current_date)
          AND(a.effective_to IS NULL OR a.effective_to>=current_date)
          AND(${target.shiftKind}='mixed' OR a.schedule_shift_kind=${target.shiftKind}`;
      const [coverage]=await tx<Array<{pending:number}>>`
        SELECT COALESCE(sum(GREATEST(n.count_required-n.count_filled,0)),0)::int pending
        FROM needs n
        WHERE n.organization_id=${actor.organizationId}::uuid
          AND n.staffing_plan_target_id=${target.id}::uuid
          AND n.status IN('open','in_progress')`;
      const deficit=Math.max(target.plannedCount-staff.working,0);
      const unrequested=Math.max(deficit-coverage.pending,0);
      if(body.increment>unrequested)throw new Error(`Можно добавить не более ${unrequested} человек: остальные уже находятся в подборе или закрывают дефицит. Сначала скорректируйте план.`);
      const next=need.countRequired+body.increment;
      if(next>10000)throw new Error("Количество в потребности не может превышать 10000");
      if(body.ownerUserId){
        const [member]=await tx`SELECT user_id FROM organization_memberships WHERE organization_id=${actor.organizationId}::uuid AND user_id=${body.ownerUserId}::uuid AND status='active'`;
        if(!member)throw new Error("Ответственный не состоит в организации");
      }
      await tx`UPDATE needs SET count_required=${next},
        priority=COALESCE(${body.priority??null},priority),
        deadline=CASE WHEN ${body.deadline!==undefined} THEN ${body.deadline??null}::date ELSE deadline END,
        owner_user_id=CASE WHEN ${body.ownerUserId!==undefined} THEN ${body.ownerUserId??null}::uuid ELSE owner_user_id END
        WHERE id=${need.id}::uuid AND organization_id=${actor.organizationId}::uuid`;
      await tx`INSERT INTO need_quantity_changes(organization_id,need_id,old_count,new_count,delta,reason,changed_by_user_id)
        VALUES(${actor.organizationId}::uuid,${need.id}::uuid,${need.countRequired},${next},${body.increment},${body.reason},${actor.userId}::uuid)`;
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'need',${need.id}::uuid,'updated',
          'Увеличена потребность из плана комплектации',
          ${tx.json({oldCount:need.countRequired,newCount:next,delta:body.increment,targetId:target.id,reason:body.reason,priority:body.priority,deadline:body.deadline,ownerUserId:body.ownerUserId})})`;
      return {id:need.id,countRequired:next,remainingUnrequested:unrequested-body.increment};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:error.issues[0]?.message??"Проверьте поля"},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    return NextResponse.json({error:error instanceof Error?error.message:"Ошибка изменения потребности"},{status:409});
  }
}
