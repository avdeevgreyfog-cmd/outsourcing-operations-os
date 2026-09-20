import { NextResponse } from "next/server";
import type { Sql } from "postgres";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { canReadRow } from "@/lib/core/access.mjs";
import { normalizeRecruitingStage, recruitingStageLabels } from "@/lib/recruiting/model";
import { validateStageChange, type WorkflowDetails } from "@/lib/recruiting/workflow";

class WorkflowError extends Error {}

const workflowSchema=z.object({
  actionCode:z.string().trim().max(80).optional(),
  outcomeCode:z.string().trim().max(80).optional(),
  additionalComment:z.string().trim().max(3000).optional(),
  nextActionText:z.string().trim().max(1000).optional(),
  plannedShift:z.string().trim().max(240).optional(),
  confirmed:z.boolean().optional(),
  readiness:z.boolean().optional(),
  reserveReason:z.string().trim().max(500).optional(),
  lastContact:z.string().trim().max(3000).optional(),
  contactAttempts:z.number().int().min(0).max(100).optional(),
  managerInterviewState:z.enum(["not_required","pending","completed"]).optional(),
  managerInterviewUserId:z.string().uuid().optional(),
  travelState:z.enum(["not_required","self","company","ticket_required","ticket_bought"]).optional(),
  travelNote:z.string().trim().max(1000).optional(),
  arrivalAt:z.string().datetime().optional(),
  ticketDueAt:z.string().datetime().optional(),
  ticketAssigneeUserId:z.string().uuid().optional(),
  housingState:z.enum(["not_required","needs_booking","booked"]).optional(),
  housingDueAt:z.string().datetime().optional(),
  housingAssigneeUserId:z.string().uuid().optional(),
  firstShiftOutcome:z.enum(["pending","worked","no_show","not_admitted"]).optional(),
  documentsReceived:z.number().int().min(0).max(100).optional(),
  documentsRequired:z.number().int().min(0).max(100).optional(),
  missingDocuments:z.array(z.string().trim().max(160)).max(50).optional(),
});

const schema=z.object({
  applicationId:z.string().uuid().optional(),
  stage:z.enum(["new","interview","documents","clearance","preparation","first_shift","retention_7","retention_30","rejected","no_show","reserve"]),
  expectedStage:z.string().optional(),
  expectedUpdatedAt:z.string().optional(),
  plannedStartDate:z.iso.date().nullable().optional(),
  plannedArrivalAt:z.string().datetime().nullable().optional(),
  actualStartAt:z.string().datetime().nullable().optional(),
  workflow:workflowSchema.optional(),
  reasonCode:z.string().trim().max(80).optional(),
  reason:z.string().trim().max(1000).optional(),
  nextActionAt:z.string().datetime().nullable().optional(),
  ownerUserId:z.string().uuid().nullable().optional(),
}).superRefine((value,ctx)=>{
  if(["rejected","no_show"].includes(value.stage)&&!value.reasonCode?.trim())ctx.addIssue({code:"custom",path:["reasonCode"],message:"Выберите причину"});
});

type ScopeRow={
  id:string;candidateId:string;needId:string;organizationId:string;ownerUserId:string|null;managerUserId:string|null;objectId:string|null;
  workflow:WorkflowDetails;plannedStartDate:string|null;plannedArrivalAt:string|null;actualStartAt:string|null;updatedAt:string;
  clientId:string|null;regionId:string|null;assigneeUserIds:string[];stage:string;specialtyId:string;objectOwnerId:string|null;sourceRequestRoleId:string|null;
  fullName:string;
};

async function ensureActiveAssignee(tx:Sql,organizationId:string,userId:string|null|undefined){
  if(!userId)return;
  const [row]=await tx<Array<{id:string}>>`
    SELECT user_id id FROM organization_memberships
    WHERE organization_id=${organizationId}::uuid AND user_id=${userId}::uuid AND status='active'
  `;
  if(!row)throw new Error("Выбранный ответственный не является активным сотрудником организации");
}

async function syncPreparationTask(
  tx:Sql,
  actor:{organizationId:string;userId:string},
  current:ScopeRow,
  kind:"ticket"|"housing",
  enabled:boolean,
  assigneeUserId:string|undefined,
  dueAt:string|undefined,
  done:boolean,
){
  const [existing]=await tx<Array<{id:string}>>`
    SELECT id FROM tasks
    WHERE organization_id=${actor.organizationId}::uuid
      AND entity_type='candidate_application' AND entity_id=${current.id}::uuid
      AND checklist_json->>'kind'=${kind}
      AND status<>'cancelled'
    ORDER BY created_at DESC LIMIT 1
  `;
  if(!enabled){
    if(existing)await tx`UPDATE tasks SET status='cancelled',updated_at=now() WHERE id=${existing.id}::uuid AND status<>'done'`;
    return;
  }
  if(!assigneeUserId||!dueAt)throw new WorkflowError(kind==="ticket"?"Укажите ответственного и дедлайн покупки билета":"Укажите ответственного и дедлайн бронирования жилья");
  await ensureActiveAssignee(tx,actor.organizationId,assigneeUserId);
  const title=kind==="ticket"?`Купить билет: ${current.fullName}`:`Подтвердить размещение: ${current.fullName}`;
  const status=done?"done":"open";
  if(existing){
    await tx`UPDATE tasks SET title=${title},status=${status},priority='high',assignee_user_id=${assigneeUserId}::uuid,due_at=${dueAt}::timestamptz,updated_at=now() WHERE id=${existing.id}::uuid`;
  }else{
    await tx`
      INSERT INTO tasks(organization_id,title,status,priority,assignee_user_id,due_at,entity_type,entity_id,checklist_json,created_by_user_id)
      VALUES(${actor.organizationId}::uuid,${title},${status},'high',${assigneeUserId}::uuid,${dueAt}::timestamptz,'candidate_application',${current.id}::uuid,
        ${tx.json({kind,candidateId:current.candidateId,needId:current.needId})},${actor.userId}::uuid)
    `;
  }
}

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"recruiting.candidate.edit");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме этап сохраняется локально в браузере"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [current]=await tx<Array<ScopeRow>>`
        SELECT ca.id,ca.candidate_id "candidateId",ca.need_id "needId",ca.organization_id "organizationId",ca.owner_user_id "ownerUserId",
          ca.manager_user_id "managerUserId",ca.object_id "objectId",o.client_company_id "clientId",COALESCE(n.region_id,o.region_id) "regionId",
          ARRAY[ca.owner_user_id::text,ca.manager_user_id::text]
            || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
            || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds",
          ca.stage,ca.workflow_details workflow,ca.planned_start_date::text "plannedStartDate",ca.planned_arrival_at::text "plannedArrivalAt",
          ca.actual_start_at::text "actualStartAt",ca.updated_at::text "updatedAt",n.specialty_id "specialtyId",o.owner_user_id "objectOwnerId",
          n.source_request_role_id "sourceRequestRoleId",c.full_name "fullName"
        FROM candidate_applications ca
        JOIN candidates c ON c.id=ca.candidate_id
        JOIN needs n ON n.id=ca.need_id LEFT JOIN objects o ON o.id=ca.object_id
        WHERE (ca.id=COALESCE(${body.applicationId??null}::uuid,${id}::uuid)
           OR (${body.applicationId??null}::uuid IS NULL AND ca.candidate_id=${id}::uuid)) AND ca.candidate_id=${id}::uuid
        ORDER BY ca.updated_at DESC LIMIT 1 FOR UPDATE OF ca
      `;
      if(!current||!canReadRow(actor.access,"recruiting.candidate.edit",current,actor))throw new AccessDeniedError("recruiting.candidate.edit");
      if((body.expectedStage && normalizeRecruitingStage(current.stage)!==body.expectedStage) || (body.expectedUpdatedAt && Date.parse(current.updatedAt)!==Date.parse(body.expectedUpdatedAt))) return {conflict:true};
      const workflow={...current.workflow,...body.workflow};
      const normalizedCurrent=normalizeRecruitingStage(current.stage);
      const changed=normalizedCurrent!==body.stage;
      const actualStartValue=body.actualStartAt===undefined?current.actualStartAt:body.actualStartAt;
      const plannedArrivalValue=body.plannedArrivalAt===undefined?current.plannedArrivalAt:body.plannedArrivalAt;
      const message=validateStageChange({...current,stage:normalizedCurrent,workflow:current.workflow}, {...body,workflow,plannedArrivalAt:plannedArrivalValue,actualStartAt:actualStartValue});
      if(message)throw new WorkflowError(message);

      if(body.ownerUserId!==undefined&&body.ownerUserId!==null)await ensureActiveAssignee(tx,actor.organizationId,body.ownerUserId);
      if(workflow.managerInterviewUserId)await ensureActiveAssignee(tx,actor.organizationId,workflow.managerInterviewUserId);

      if(body.workflow?.additionalComment?.trim() && body.workflow.additionalComment!==current.workflow?.additionalComment){
        await tx`
          INSERT INTO candidate_communications(organization_id,candidate_id,application_id,channel,direction,summary,happened_at,created_by_user_id)
          VALUES(${actor.organizationId}::uuid,${current.candidateId}::uuid,${current.id}::uuid,'note','internal',${body.workflow.additionalComment},now(),${actor.userId}::uuid)
        `;
      }

      if(["rejected","no_show"].includes(body.stage)){
        const [exitReason]=await tx<Array<{code:string}>>`
          SELECT code FROM candidate_exit_reasons WHERE code=${body.reasonCode??null} AND active AND kind IN (${body.stage},'both') LIMIT 1
        `;
        if(!exitReason)throw new Error("Выбранная причина недоступна для этого этапа");
      }

      const milestone=body.stage==="first_shift"?"first_shift":body.stage==="retention_7"?"day7":body.stage==="retention_30"?"day30":null;
      const leavingEmploymentDocuments=normalizedCurrent==="documents"&&body.stage!=="documents"&&!["rejected","no_show","reserve"].includes(body.stage);
      if(leavingEmploymentDocuments||milestone){
        const milestones=leavingEmploymentDocuments?["employment"]:(milestone==="first_shift"?["employment","first_shift"]:milestone==="day7"?["employment","first_shift","day7"]:["employment","first_shift","day7","day30"]);
        const pending=await tx<Array<{name:string}>>`
          SELECT dt.name
          FROM need_document_requirements ndr
          JOIN recruiting_document_types dt ON dt.id=ndr.document_type_id
          LEFT JOIN candidate_documents cd ON cd.candidate_id=${current.candidateId}::uuid AND cd.document_type_id=dt.id
          LEFT JOIN candidate_application_documents cad ON cad.application_id=${current.id}::uuid AND cad.document_type_id=dt.id
          WHERE ndr.need_id=${current.needId}::uuid AND ndr.required AND ndr.required_by=ANY(${milestones}::text[])
            AND (
              (dt.group_type='employment' AND COALESCE(cd.status,'missing') NOT IN ('received','verified','not_required'))
              OR
              (dt.group_type='clearance' AND COALESCE(cad.status,CASE WHEN ndr.provider='candidate' THEN 'missing' ELSE 'to_prepare' END) NOT IN ('received','verified','ready','not_required'))
            )
          ORDER BY dt.sort_order,dt.name
        `;
        if(pending.length)throw new WorkflowError("Не закрыты обязательные документы: "+pending.map(item=>item.name).join(", "));
      }

      const nextAction=body.nextActionAt===undefined?sql`next_action_at`:sql`${body.nextActionAt??null}::timestamptz`;
      const ownerUserId=body.ownerUserId===undefined?sql`owner_user_id`:sql`${body.ownerUserId??null}::uuid`;
      await tx`
        UPDATE candidate_applications SET
          owner_user_id=${ownerUserId},
          workflow_details=${sql.json(workflow)},
          planned_start_date=${body.plannedStartDate===undefined?current.plannedStartDate:body.plannedStartDate}::date,
          planned_arrival_at=${plannedArrivalValue}::timestamptz,
          stage=${body.stage},
          next_action_at=${nextAction},
          rejection_reason=${["rejected","no_show"].includes(body.stage)?body.reason??null:null},
          rejection_reason_code=${["rejected","no_show"].includes(body.stage)?body.reasonCode??null:null},
          actual_start_at=${actualStartValue}::timestamptz,
          manager_decision_at=CASE WHEN ${body.stage}='rejected' THEN now() ELSE manager_decision_at END,
          updated_at=now()
        WHERE id=${current.id}::uuid
      `;

      if(changed)await tx`
        INSERT INTO candidate_stage_history(organization_id,application_id,from_stage,to_stage,reason,reason_code,changed_by_user_id)
        VALUES(${actor.organizationId}::uuid,${current.id}::uuid,${current.stage},${body.stage},${body.reason??null},${body.reasonCode??null},${actor.userId}::uuid)
      `;

      if(workflow.actionCode){
        await tx`
          INSERT INTO candidate_action_events(organization_id,application_id,stage,action_code,outcome_code,comment,next_action_at,performed_by_user_id,metadata)
          VALUES(${actor.organizationId}::uuid,${current.id}::uuid,${normalizedCurrent},${workflow.actionCode},${workflow.outcomeCode??null},
            ${workflow.additionalComment??null},${body.nextActionAt??null}::timestamptz,${actor.userId}::uuid,
            ${sql.json({toStage:body.stage,ownerUserId:body.ownerUserId??current.ownerUserId})})
        `;
      }

      if(body.stage==="preparation"||normalizedCurrent==="preparation"){
        await syncPreparationTask(tx,actor,current,"ticket",
          workflow.travelState==="ticket_required"||workflow.travelState==="ticket_bought",
          workflow.ticketAssigneeUserId,workflow.ticketDueAt,workflow.travelState==="ticket_bought");
        await syncPreparationTask(tx,actor,current,"housing",
          workflow.housingState==="needs_booking"||workflow.housingState==="booked",
          workflow.housingAssigneeUserId,workflow.housingDueAt,workflow.housingState==="booked");
      }

      let workerId:string|null=null;
      const confirmingFirstShift=workflow.firstShiftOutcome==="worked" && actualStartValue && !current.actualStartAt;
      if(confirmingFirstShift){
        requireCapability(actor,"recruiting.candidate.convert");
        if(!current.objectId)throw new Error("Перед фактическим выходом назначьте кандидату объект");
        const [candidate]=await tx<Array<{fullName:string;phone:string|null;source:string|null;originalRecruiterUserId:string|null}>>`
          SELECT full_name "fullName",phone,source,original_recruiter_user_id "originalRecruiterUserId" FROM candidates WHERE id=${current.candidateId}::uuid FOR UPDATE
        `;
        if(!candidate)throw new Error("Кандидат не найден");
        const [existingWorker]=await tx<Array<{id:string}>>`SELECT id FROM worker_profiles WHERE origin_candidate_id=${current.candidateId}::uuid FOR UPDATE`;
        if(existingWorker)workerId=existingWorker.id;
        else{
          const [worker]=await tx<Array<{id:string}>>`
            INSERT INTO worker_profiles(organization_id,origin_candidate_id,full_name,phone,status,source,original_recruiter_user_id,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${current.candidateId}::uuid,${candidate.fullName},${candidate.phone},'active',${candidate.source},${candidate.originalRecruiterUserId}::uuid,${actor.userId}::uuid)
            RETURNING id
          `;
          workerId=worker.id;
        }
        const [assignment]=await tx<Array<{id:string}>>`
          SELECT id FROM worker_object_assignments WHERE worker_id=${workerId}::uuid AND object_id=${current.objectId}::uuid AND effective_to IS NULL
        `;
        if(!assignment){
          await tx`
            INSERT INTO worker_object_assignments(organization_id,worker_id,object_id,specialty_id,effective_from,manager_user_id,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${current.objectId}::uuid,${current.specialtyId}::uuid,${actualStartValue}::timestamptz::date,${current.managerUserId??current.objectOwnerId}::uuid,${actor.userId}::uuid)
          `;
        }
        const [activeRate]=await tx<Array<{id:string}>>`
          SELECT id FROM worker_rates
          WHERE worker_id=${workerId}::uuid AND object_id=${current.objectId}::uuid AND specialty_id=${current.specialtyId}::uuid AND effective_to IS NULL
          LIMIT 1
        `;
        if(!activeRate&&current.sourceRequestRoleId){
          const [rate]=await tx<Array<{amount:number|null}>>`
            SELECT COALESCE(
              NULLIF(cs.inputs_snapshot->>'workerNetHourly','')::numeric,
              NULLIF(cs.inputs_snapshot->>'workerNet','')::numeric,
              NULLIF(cs.result_snapshot->>'workerNetHourly','')::numeric,
              NULLIF(cs.result_snapshot->>'workerNet','')::numeric
            ) amount
            FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id
            WHERE cs.request_role_id=${current.sourceRequestRoleId}::uuid AND cs.status='accepted'
            ORDER BY cs.accepted_at DESC NULLS LAST,cs.created_at DESC LIMIT 1
          `;
          if(rate?.amount!=null&&Number(rate.amount)>0){
            await tx`
              INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id)
              VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${current.specialtyId}::uuid,${current.objectId}::uuid,${rate.amount},'hour','any',${actualStartValue}::timestamptz::date,${actor.userId}::uuid)
            `;
          }
        }
        await tx`UPDATE candidates SET status='worker',updated_at=now() WHERE id=${current.candidateId}::uuid`;
        await tx`
          UPDATE needs SET count_filled=LEAST(count_required,(
            SELECT count(DISTINCT wa.worker_id)::int FROM worker_object_assignments wa JOIN worker_profiles wp ON wp.id=wa.worker_id AND wp.status='active'
            WHERE wa.object_id=${current.objectId}::uuid AND wa.specialty_id=${current.specialtyId}::uuid AND wa.effective_from<=current_date AND (wa.effective_to IS NULL OR wa.effective_to>=current_date)
          )),status=CASE WHEN (
            SELECT count(DISTINCT wa.worker_id)::int FROM worker_object_assignments wa JOIN worker_profiles wp ON wp.id=wa.worker_id AND wp.status='active'
            WHERE wa.object_id=${current.objectId}::uuid AND wa.specialty_id=${current.specialtyId}::uuid AND wa.effective_from<=current_date AND (wa.effective_to IS NULL OR wa.effective_to>=current_date)
          )>=count_required THEN 'filled' ELSE 'in_progress' END,
          closed_at=CASE WHEN (
            SELECT count(DISTINCT wa.worker_id)::int FROM worker_object_assignments wa JOIN worker_profiles wp ON wp.id=wa.worker_id AND wp.status='active'
            WHERE wa.object_id=${current.objectId}::uuid AND wa.specialty_id=${current.specialtyId}::uuid AND wa.effective_from<=current_date AND (wa.effective_to IS NULL OR wa.effective_to>=current_date)
          )>=count_required THEN COALESCE(closed_at,now()) ELSE NULL END
          WHERE id=${current.needId}::uuid
        `;
      }else if(changed){
        await tx`UPDATE needs SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END WHERE id=${current.needId}::uuid`;
      }

      await tx`
        INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate',${current.candidateId}::uuid,'stage_changed',
          ${changed?`Этап кандидата: ${recruitingStageLabels[normalizedCurrent]} → ${recruitingStageLabels[body.stage]}`:"Обновлены рабочие действия по кандидату"},
          ${sql.json({applicationId:current.id,needId:current.needId,workerId,actionCode:workflow.actionCode??null,outcomeCode:workflow.outcomeCode??null,reasonCode:body.reasonCode??null,ownerUserId:body.ownerUserId??current.ownerUserId})})
      `;
      return {candidateId:current.candidateId,applicationId:current.id,stage:body.stage,workerId};
    }));
    if("conflict" in result)return NextResponse.json({error:"Заявка уже изменена. Обновите страницу перед сохранением."},{status:409});
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof WorkflowError)return NextResponse.json({error:error.message},{status:422});
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте действие и обязательные поля",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
