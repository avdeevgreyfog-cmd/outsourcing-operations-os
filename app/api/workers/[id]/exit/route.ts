import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("plan"),effectiveDate:z.string().date(),reasonCode:z.enum(["employee_request","employer_decision","project_end","transfer_out","no_show","medical","other"]),reason:z.string().trim().max(1200).nullable().optional(),replacementRequired:z.boolean().default(true),returnToRecruiting:z.boolean().default(true)}),
  z.object({action:z.literal("complete"),effectiveDate:z.string().date(),reasonCode:z.enum(["employee_request","employer_decision","project_end","transfer_out","no_show","medical","other"]),reason:z.string().trim().max(1200).nullable().optional(),returnToRecruiting:z.boolean().default(true)}),
  z.object({action:z.literal("cancel"),exitId:z.string().uuid()}),
]);

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"worker.offboarding.manage");if(actor.demo)return NextResponse.json({error:"В демо-режиме завершение работы не сохраняется"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [worker]=await tx<Array<{id:string;fullName:string;phone:string|null;email:string|null;city:string|null;source:string|null;originCandidateId:string|null;originalRecruiterUserId:string|null;objectId:string|null;specialtyId:string|null;ownerUserId:string|null;regionId:string|null;assigneeUserIds:string[]}>>`
        SELECT w.id,w.full_name "fullName",w.phone,w.email,w.city,w.source,w.origin_candidate_id "originCandidateId",w.original_recruiter_user_id "originalRecruiterUserId",
          a.object_id "objectId",a.specialty_id "specialtyId",o.owner_user_id "ownerUserId",o.region_id "regionId",
          ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=a.object_id AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)) "assigneeUserIds"
        FROM worker_profiles w
        LEFT JOIN LATERAL (SELECT * FROM worker_object_assignments x WHERE x.worker_id=w.id AND x.effective_to IS NULL ORDER BY x.effective_from DESC LIMIT 1) a ON true
        LEFT JOIN objects o ON o.id=a.object_id
        WHERE w.id=${id}::uuid FOR UPDATE OF w
      `;
      if(!worker)throw new Error("Сотрудник не найден");
      const scope={organizationId:actor.organizationId,objectId:worker.objectId??undefined,ownerUserId:worker.ownerUserId??undefined,regionId:worker.regionId??undefined,assigneeUserIds:worker.assigneeUserIds};
      if(!canReadRow(actor.access,"worker.offboarding.manage",scope,actor))throw new AccessDeniedError("worker.offboarding.manage");
      if(body.action!=="cancel"){
        const [futureTransfer]=await tx<Array<{effectiveFrom:string;object:string}>>`
          SELECT a.effective_from::text "effectiveFrom",o.name object
          FROM worker_object_assignments a JOIN objects o ON o.id=a.object_id
          WHERE a.worker_id=${id}::uuid AND a.effective_from>current_date
          ORDER BY a.effective_from LIMIT 1
        `;
        if(futureTransfer)throw new Error(`У сотрудника уже запланирован перевод на ${futureTransfer.object} с ${futureTransfer.effectiveFrom}. Сначала измените или отмените перевод.`);
      }

      if(body.action==="cancel"){
        const [exit]=await tx<Array<{id:string}>>`SELECT id FROM worker_exit_processes WHERE id=${body.exitId}::uuid AND worker_id=${id}::uuid AND status='planned' FOR UPDATE`;
        if(!exit)throw new Error("План завершения работы не найден");
        const [exitMeta]=await tx<Array<{replacementNeedId:string|null}>>`SELECT replacement_need_id "replacementNeedId" FROM worker_exit_processes WHERE id=${exit.id}::uuid`;
        await tx`UPDATE worker_exit_processes SET status='cancelled',updated_at=now() WHERE id=${exit.id}::uuid`;
        if(exitMeta?.replacementNeedId)await tx`UPDATE needs SET status='cancelled',closed_at=now() WHERE id=${exitMeta.replacementNeedId}::uuid AND status NOT IN ('filled','archived')`;
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'exit_cancelled','План завершения работы отменён',${tx.json({exitId:exit.id})})`;
        return {status:"cancelled",exitId:exit.id};
      }

      if(body.action==="plan"){
        if(!worker.objectId||!worker.specialtyId)throw new Error("Для замены сотрудник должен быть назначен на объект и специальность");
        const [existing]=await tx<Array<{id:string;replacementNeedId:string|null}>>`SELECT id,replacement_need_id "replacementNeedId" FROM worker_exit_processes WHERE worker_id=${id}::uuid AND status='planned' FOR UPDATE`;
        let exitId:string;let replacementNeedId=existing?.replacementNeedId??null;
        if(existing){
          exitId=existing.id;
          await tx`UPDATE worker_exit_processes SET effective_date=${body.effectiveDate}::date,reason_code=${body.reasonCode},reason=${body.reason??null},replacement_required=${body.replacementRequired},return_to_recruiting=${body.returnToRecruiting},updated_at=now() WHERE id=${exitId}::uuid`;
        }else{
          const [row]=await tx<Array<{id:string}>>`
            INSERT INTO worker_exit_processes(organization_id,worker_id,object_id,effective_date,reason_code,reason,status,replacement_required,return_to_recruiting,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${id}::uuid,${worker.objectId}::uuid,${body.effectiveDate}::date,${body.reasonCode},${body.reason??null},'planned',${body.replacementRequired},${body.returnToRecruiting},${actor.userId}::uuid)
            RETURNING id
          `;exitId=row.id;
        }
        if(body.replacementRequired){
          if(!replacementNeedId){
            const [sourceNeed]=await tx<Array<{id:string;regionId:string|null;ownerUserId:string|null;managerUserId:string|null;conditions:Record<string,unknown>;priority:string}>>`
              SELECT n.id,n.region_id "regionId",n.owner_user_id "ownerUserId",n.manager_user_id "managerUserId",n.conditions_snapshot conditions,n.priority
              FROM needs n WHERE n.object_id=${worker.objectId}::uuid AND n.specialty_id=${worker.specialtyId}::uuid AND n.source_kind<>'replacement' AND n.status NOT IN ('cancelled','archived')
              ORDER BY n.created_at DESC LIMIT 1
            `;
            const [object]=await tx<Array<{regionId:string;recruitingMode:string}>>`SELECT region_id "regionId",recruiting_routing_mode "recruitingMode" FROM objects WHERE id=${worker.objectId}::uuid`;
            const regionId=sourceNeed?.regionId??object?.regionId;
            const [routed]=await tx<Array<{userId:string|null;teamId:string|null}>>`
              WITH object_recruiter AS (
                SELECT oa.user_id "userId",m.primary_team_id "teamId",1 priority FROM object_assignments oa
                JOIN organization_memberships m ON m.organization_id=oa.organization_id AND m.user_id=oa.user_id AND m.status='active'
                WHERE oa.object_id=${worker.objectId}::uuid AND oa.responsibility_type='recruiter' AND oa.effective_from<=current_date AND (oa.effective_to IS NULL OR oa.effective_to>=current_date)
                ORDER BY oa.created_at LIMIT 1
              ), responsibility AS (
                SELECT user_id "userId",NULL::uuid "teamId",2 priority FROM resolve_organization_responsibility('recruiting_need','owner','region',${regionId}::uuid,current_date) LIMIT 1
              )
              SELECT "userId","teamId" FROM (SELECT * FROM object_recruiter UNION ALL SELECT * FROM responsibility) x WHERE "userId" IS NOT NULL ORDER BY priority LIMIT 1
            `;
            const ownerId=sourceNeed?.ownerUserId??routed?.userId??actor.userId;
            const [need]=await tx<Array<{id:string}>>`
              INSERT INTO needs(organization_id,object_id,region_id,specialty_id,count_required,count_filled,deadline,status,owner_user_id,manager_user_id,created_by_user_id,source_kind,title,priority,conditions_snapshot,replacement_exit_id)
              SELECT ${actor.organizationId}::uuid,${worker.objectId}::uuid,${regionId}::uuid,${worker.specialtyId}::uuid,1,0,${body.effectiveDate}::date,'open',${ownerId}::uuid,${worker.ownerUserId}::uuid,${actor.userId}::uuid,'replacement',${"Замена: "+worker.fullName},${sourceNeed?.priority??"high"},${tx.json((sourceNeed?.conditions??{}) as never)},${exitId}::uuid
              RETURNING id
            `;replacementNeedId=need.id;
            if(sourceNeed){await tx`INSERT INTO need_assignments(organization_id,need_id,recruiter_user_id,team_id,target_count,assigned_by_user_id) SELECT organization_id,${need.id}::uuid,recruiter_user_id,team_id,1,${actor.userId}::uuid FROM need_assignments WHERE need_id=${sourceNeed.id}::uuid AND unassigned_at IS NULL ON CONFLICT DO NOTHING`;}
            else if(routed?.userId){await tx`INSERT INTO need_assignments(organization_id,need_id,recruiter_user_id,team_id,target_count,assigned_by_user_id) VALUES(${actor.organizationId}::uuid,${need.id}::uuid,${routed.userId}::uuid,${routed.teamId}::uuid,1,${actor.userId}::uuid)`;}
            await tx`UPDATE worker_exit_processes SET replacement_need_id=${need.id}::uuid WHERE id=${exitId}::uuid`;
            await tx`INSERT INTO need_quantity_changes(organization_id,need_id,old_count,new_count,delta,reason,changed_by_user_id) VALUES(${actor.organizationId}::uuid,${need.id}::uuid,NULL,1,1,${"Замена сотрудника: "+worker.fullName},${actor.userId}::uuid)`;
          }else{
            await tx`UPDATE needs SET deadline=${body.effectiveDate}::date,status=CASE WHEN status IN ('cancelled','archived') THEN 'open' ELSE status END,closed_at=NULL WHERE id=${replacementNeedId}::uuid`;
          }
        }else if(replacementNeedId){
          await tx`UPDATE needs SET status='cancelled',closed_at=now() WHERE id=${replacementNeedId}::uuid AND status NOT IN ('filled','archived')`;
        }
        await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
          VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'exit_planned',${"Запланировано завершение работы: "+body.effectiveDate},${tx.json({exitId,reasonCode:body.reasonCode,replacementRequired:body.replacementRequired,replacementNeedId})})`;
        return {status:"planned",exitId,replacementNeedId};
      }

      const [dateCheck]=await tx<Array<{future:boolean}>>`SELECT ${body.effectiveDate}::date>current_date future`;
      if(dateCheck?.future)throw new Error("Будущую дату сначала сохраните как план завершения работы");

      const outstanding=await tx<Array<{item:string;variant:string;quantity:number|string;unit:string}>>`
        SELECT i.name item,m.variant,
          sum(CASE WHEN m.movement_type='issue' THEN m.quantity
                   WHEN m.movement_type='return' THEN -m.quantity
                   WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity
                   ELSE 0 END)::numeric quantity,i.unit
        FROM inventory_movements m JOIN inventory_items i ON i.id=m.item_id
        WHERE m.worker_id=${id}::uuid AND i.returnable
        GROUP BY i.id,i.name,i.unit,m.variant
        HAVING sum(CASE WHEN m.movement_type='issue' THEN m.quantity
                        WHEN m.movement_type='return' THEN -m.quantity
                        WHEN m.movement_type='writeoff' AND m.from_location_id IS NULL THEN -m.quantity
                        ELSE 0 END)>0
      `;
      if(outstanding.length)throw new Error("Нельзя завершить работу: не закрыто имущество — "+outstanding.map(row=>row.item+(row.variant?" "+row.variant:"")+" × "+Number(row.quantity)+" "+row.unit).join(", "));

      const [planned]=await tx<Array<{id:string;returnToRecruiting:boolean}>>`SELECT id,return_to_recruiting "returnToRecruiting" FROM worker_exit_processes WHERE worker_id=${id}::uuid AND status='planned' FOR UPDATE`;
      let exitId:string;
      if(planned){
        exitId=planned.id;
        await tx`UPDATE worker_exit_processes SET effective_date=${body.effectiveDate}::date,reason_code=${body.reasonCode},reason=${body.reason??null},return_to_recruiting=${body.returnToRecruiting},status='completed',completed_by_user_id=${actor.userId}::uuid,completed_at=now(),updated_at=now() WHERE id=${exitId}::uuid`;
      }else{
        const [exit]=await tx<Array<{id:string}>>`
          INSERT INTO worker_exit_processes(organization_id,worker_id,object_id,effective_date,reason_code,reason,status,return_to_recruiting,created_by_user_id,completed_by_user_id,completed_at)
          VALUES(${actor.organizationId}::uuid,${id}::uuid,${worker.objectId??null}::uuid,${body.effectiveDate}::date,${body.reasonCode},${body.reason??null},'completed',${body.returnToRecruiting},${actor.userId}::uuid,${actor.userId}::uuid,now())
          RETURNING id
        `;exitId=exit.id;
      }

      await tx`UPDATE worker_object_assignments SET effective_to=${body.effectiveDate}::date WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from<=${body.effectiveDate}::date`;
      await tx`DELETE FROM worker_object_assignments WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from>${body.effectiveDate}::date`;
      await tx`UPDATE employment_relations SET effective_to=${body.effectiveDate}::date WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from<=${body.effectiveDate}::date`;
      await tx`DELETE FROM employment_relations WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from>${body.effectiveDate}::date`;
      await tx`UPDATE worker_rates SET effective_to=${body.effectiveDate}::date WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from<=${body.effectiveDate}::date`;
      await tx`DELETE FROM worker_rates WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from>${body.effectiveDate}::date`;
      await tx`UPDATE object_crew_members SET effective_to=${body.effectiveDate}::date WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from<=${body.effectiveDate}::date`;
      await tx`DELETE FROM object_crew_members WHERE worker_id=${id}::uuid AND effective_to IS NULL AND effective_from>${body.effectiveDate}::date`;

      await tx`
        UPDATE worker_absence_plans SET
          status=CASE WHEN planned_from>${body.effectiveDate}::date THEN 'cancelled' ELSE 'completed' END,
          actual_to=CASE WHEN planned_from<=${body.effectiveDate}::date THEN ${body.effectiveDate}::date ELSE actual_to END,
          updated_by_user_id=${actor.userId}::uuid,updated_at=now()
        WHERE worker_id=${id}::uuid AND status IN ('tentative','confirmed')
      `;
      await tx`
        UPDATE housing_stays SET
          check_out=CASE WHEN check_in<=${body.effectiveDate}::date THEN ${body.effectiveDate}::date ELSE check_out END,
          status=CASE WHEN check_in>${body.effectiveDate}::date THEN 'cancelled' ELSE 'completed' END,
          updated_at=now()
        WHERE worker_id=${id}::uuid AND status IN ('planned','active')
      `;

      const futureShiftIds=await tx<Array<{id:string}>>`
        SELECT DISTINCT sh.id FROM shifts sh JOIN shift_assignments sa ON sa.shift_id=sh.id
        WHERE sa.worker_id=${id}::uuid AND sh.shift_date>${body.effectiveDate}::date
      `;
      if(futureShiftIds.length){
        const ids=futureShiftIds.map(row=>row.id);
        await tx`UPDATE shift_assignments SET confirmation_status='cancelled' WHERE worker_id=${id}::uuid AND shift_id=ANY(${ids}::uuid[])`;
        await tx`
          UPDATE shifts sh SET
            assigned_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND NOT sa.is_reserve AND sa.confirmation_status<>'cancelled'),
            reserve_count=(SELECT count(*)::int FROM shift_assignments sa WHERE sa.shift_id=sh.id AND sa.is_reserve AND sa.confirmation_status<>'cancelled')
          WHERE sh.id=ANY(${ids}::uuid[])
        `;
      }

      await tx`UPDATE worker_profiles SET status='dismissed',updated_at=now() WHERE id=${id}::uuid`;

      let recruitingCandidateId=worker.originCandidateId;
      if(body.returnToRecruiting){
        const [routed]=worker.objectId?await tx<Array<{userId:string|null}>>`
          SELECT COALESCE(
            (SELECT na.recruiter_user_id FROM needs n JOIN need_assignments na ON na.need_id=n.id AND na.unassigned_at IS NULL
             WHERE n.object_id=${worker.objectId}::uuid AND (${worker.specialtyId}::uuid IS NULL OR n.specialty_id=${worker.specialtyId}::uuid)
             AND n.status NOT IN ('cancelled','archived') AND na.recruiter_user_id IS NOT NULL
             ORDER BY n.created_at DESC,na.assigned_at DESC LIMIT 1),
            ${worker.originalRecruiterUserId}::uuid
          ) "userId"
        `:[] as Array<{userId:string|null}>;
        const recruiterId=routed?.userId??worker.originalRecruiterUserId??null;
        if(recruitingCandidateId){
          await tx`
            UPDATE candidates SET status='available',current_recruiter_user_id=COALESCE(${recruiterId}::uuid,current_recruiter_user_id),
              updated_at=now() WHERE id=${recruitingCandidateId}::uuid
          `;
        }else{
          const [candidate]=await tx<Array<{id:string}>>`
            INSERT INTO candidates(organization_id,full_name,phone,email,city,source,original_recruiter_user_id,current_recruiter_user_id,created_by_user_id,status)
            VALUES(${actor.organizationId}::uuid,${worker.fullName},${worker.phone},${worker.email},${worker.city},
              'Повторный подбор / бывший сотрудник',${worker.originalRecruiterUserId}::uuid,${recruiterId}::uuid,${actor.userId}::uuid,'available')
            RETURNING id
          `;
          recruitingCandidateId=candidate.id;
          await tx`UPDATE worker_profiles SET origin_candidate_id=${candidate.id}::uuid WHERE id=${id}::uuid`;
          if(worker.phone)await tx`
            INSERT INTO candidate_contact_methods(organization_id,candidate_id,channel,value,is_preferred,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${candidate.id}::uuid,'phone',${worker.phone},true,${actor.userId}::uuid)
            ON CONFLICT(candidate_id,channel,value) DO NOTHING
          `;
          if(worker.email)await tx`
            INSERT INTO candidate_contact_methods(organization_id,candidate_id,channel,value,is_preferred,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${candidate.id}::uuid,'email',${worker.email},false,${actor.userId}::uuid)
            ON CONFLICT(candidate_id,channel,value) DO NOTHING
          `;
        }
        await tx`UPDATE worker_exit_processes SET recruiting_candidate_id=${recruitingCandidateId}::uuid,recruiting_handoff_at=now(),updated_at=now() WHERE id=${exitId}::uuid`;
      }else if(recruitingCandidateId){
        await tx`UPDATE candidates SET status='completed',updated_at=now() WHERE id=${recruitingCandidateId}::uuid`;
      }

      if(worker.objectId&&worker.specialtyId){
        await tx`
          UPDATE needs n SET
            count_filled=LEAST(n.count_required,(
              SELECT count(DISTINCT a.worker_id)::int FROM worker_object_assignments a JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
              WHERE a.object_id=n.object_id AND a.specialty_id=n.specialty_id
                AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
            )),
            status=CASE WHEN (
              SELECT count(DISTINCT a.worker_id)::int FROM worker_object_assignments a JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
              WHERE a.object_id=n.object_id AND a.specialty_id=n.specialty_id
                AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
            )>=n.count_required THEN 'filled' ELSE 'in_progress' END,
            closed_at=CASE WHEN (
              SELECT count(DISTINCT a.worker_id)::int FROM worker_object_assignments a JOIN worker_profiles w ON w.id=a.worker_id AND w.status='active'
              WHERE a.object_id=n.object_id AND a.specialty_id=n.specialty_id
                AND a.effective_from<=current_date AND (a.effective_to IS NULL OR a.effective_to>=current_date)
            )>=n.count_required THEN COALESCE(n.closed_at,now()) ELSE NULL END,
            updated_at=now()
          WHERE n.object_id=${worker.objectId}::uuid AND n.specialty_id=${worker.specialtyId}::uuid AND n.status NOT IN ('cancelled','archived')
        `;
      }

      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'worker',${id}::uuid,'offboarded',${"Работа сотрудника завершена: "+worker.fullName},${tx.json({exitId,effectiveDate:body.effectiveDate,reasonCode:body.reasonCode,objectId:worker.objectId})})`;
      return {status:"completed",exitId};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте данные завершения работы",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Не удалось завершить работу сотрудника"},{status:500});
  }
}