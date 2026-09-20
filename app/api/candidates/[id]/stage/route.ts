import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { requireCapability,AccessDeniedError } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";
import { canReadRow } from "@/lib/core/access.mjs";

import { normalizeRecruitingStage, recruitingStageLabels } from "@/lib/recruiting/model";
import { validateStageChange, type WorkflowDetails } from "@/lib/recruiting/workflow";

class WorkflowError extends Error {}
const schema=z.object({
  applicationId:z.string().uuid().optional(),
  stage:z.enum(["new","contact","interview","manager_review","approved","preparation","ready","started","rejected","no_show","reserve"]),
  expectedStage:z.string().optional(),
  expectedUpdatedAt:z.string().optional(),
  plannedStartDate:z.iso.date().nullable().optional(),
  actualStartAt:z.string().datetime().nullable().optional(),
  workflow:z.object({nextActionText:z.string().trim().max(1000).optional(),plannedShift:z.string().trim().max(240).optional(),confirmed:z.boolean().optional(),readiness:z.boolean().optional(),reviewRecipient:z.string().trim().max(240).optional(),reviewDueAt:z.string().datetime().optional(),reserveReason:z.string().trim().max(500).optional(),lastContact:z.string().trim().max(3000).optional()}).optional(),
  reasonCode:z.string().trim().max(80).optional(),
  reason:z.string().trim().max(1000).optional(),
  nextActionAt:z.string().datetime().nullable().optional(),
  responsibleUserId:z.string().uuid().nullable().optional(),
}).superRefine((value,ctx)=>{
  if(["rejected","no_show"].includes(value.stage)&&!value.reasonCode?.trim())ctx.addIssue({code:"custom",path:["reasonCode"],message:"Выберите причину"});
});

type ScopeRow={
  id:string;candidateId:string;needId:string;organizationId:string;ownerUserId:string|null;managerUserId:string|null;responsibleUserId:string|null;objectId:string|null;
  workflow:WorkflowDetails;plannedStartDate:string|null;updatedAt:string;
  clientId:string|null;regionId:string|null;assigneeUserIds:string[];stage:string;specialtyId:string;objectOwnerId:string|null;sourceRequestRoleId:string|null;
};

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"recruiting.candidate.edit");
    if(actor.demo)return NextResponse.json({error:"В демо-режиме этап сохраняется локально в браузере"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    if(body.stage==="started")requireCapability(actor,"recruiting.candidate.convert");
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [current]=await tx<Array<ScopeRow>>`
        SELECT ca.id,ca.candidate_id "candidateId",ca.need_id "needId",ca.organization_id "organizationId",ca.owner_user_id "ownerUserId",
          ca.manager_user_id "managerUserId",ca.responsible_user_id "responsibleUserId",ca.object_id "objectId",o.client_company_id "clientId",COALESCE(n.region_id,o.region_id) "regionId",
          ARRAY[ca.owner_user_id::text,ca.manager_user_id::text,ca.responsible_user_id::text]
            || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
            || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds",
          ca.stage,ca.workflow_details workflow,ca.planned_start_date::text "plannedStartDate",ca.updated_at::text "updatedAt",n.specialty_id "specialtyId",o.owner_user_id "objectOwnerId",n.source_request_role_id "sourceRequestRoleId"
        FROM candidate_applications ca JOIN needs n ON n.id=ca.need_id LEFT JOIN objects o ON o.id=ca.object_id
        WHERE (ca.id=COALESCE(${body.applicationId??null}::uuid,${id}::uuid)
           OR (${body.applicationId??null}::uuid IS NULL AND ca.candidate_id=${id}::uuid)) AND ca.candidate_id=${id}::uuid
        ORDER BY ca.updated_at DESC LIMIT 1 FOR UPDATE OF ca
      `;
      if(!current||!canReadRow(actor.access,"recruiting.candidate.edit",current,actor))throw new AccessDeniedError("recruiting.candidate.edit");
      if((body.expectedStage && normalizeRecruitingStage(current.stage)!==body.expectedStage) || (body.expectedUpdatedAt && Date.parse(current.updatedAt)!==Date.parse(body.expectedUpdatedAt))) return {conflict:true};
      const message=validateStageChange({...current,stage:normalizeRecruitingStage(current.stage)},body);
      if(message) throw new WorkflowError(message);
      const workflow={...current.workflow,...body.workflow};
      const changed=normalizeRecruitingStage(current.stage)!==body.stage;
      if(body.responsibleUserId!==undefined&&body.responsibleUserId!==current.responsibleUserId){
        if(body.responsibleUserId){
          const [membership]=await tx<Array<{id:string}>>`SELECT id FROM organization_memberships WHERE organization_id=${actor.organizationId}::uuid AND user_id=${body.responsibleUserId}::uuid AND status='active' LIMIT 1`;
          if(!membership)throw new Error("Ответственный сотрудник не найден в организации");
        }
        await tx`INSERT INTO candidate_application_assignment_history(organization_id,application_id,from_user_id,to_user_id,reason,changed_by_user_id)
          VALUES(${actor.organizationId}::uuid,${current.id}::uuid,${current.responsibleUserId}::uuid,${body.responsibleUserId??null}::uuid,${body.reason??null},${actor.userId}::uuid)`;
      }
      if(body.workflow?.lastContact?.trim() && body.workflow.lastContact!==current.workflow?.lastContact){
        await tx`INSERT INTO candidate_communications(organization_id,candidate_id,application_id,channel,direction,summary,happened_at,created_by_user_id)
        VALUES(${actor.organizationId}::uuid,${current.candidateId}::uuid,${current.id}::uuid,'note','internal',${body.workflow.lastContact},now(),${actor.userId}::uuid)`;
      }
      if(["rejected","no_show"].includes(body.stage)){
        const [exitReason]=await tx<Array<{code:string}>>`
          SELECT code FROM candidate_exit_reasons
          WHERE code=${body.reasonCode??null} AND active AND kind IN (${body.stage},'both')
          LIMIT 1
        `;
        if(!exitReason)throw new Error("Выбранная причина недоступна для этого этапа");
      }
      const actualStart=body.stage==="started" && changed?sql`${body.actualStartAt??null}::timestamptz`:sql`actual_start_at`;
      const nextAction=body.nextActionAt===undefined?sql`next_action_at`:sql`${body.nextActionAt??null}::timestamptz`;
      await tx`UPDATE candidate_applications SET workflow_details=${sql.json(workflow)},responsible_user_id=CASE WHEN ${body.responsibleUserId!==undefined} THEN ${body.responsibleUserId??null}::uuid ELSE responsible_user_id END,planned_start_date=${body.plannedStartDate === undefined?current.plannedStartDate:body.plannedStartDate}::date,stage=${body.stage},next_action_at=${nextAction},rejection_reason=${["rejected","no_show"].includes(body.stage)?body.reason??null:null},rejection_reason_code=${["rejected","no_show"].includes(body.stage)?body.reasonCode??null:null},actual_start_at=${actualStart},manager_decision_at=CASE WHEN ${body.stage} IN ('approved','rejected') THEN now() ELSE manager_decision_at END,updated_at=now() WHERE id=${current.id}::uuid`;
      if(changed) await tx`INSERT INTO candidate_stage_history(organization_id,application_id,from_stage,to_stage,reason,reason_code,changed_by_user_id) VALUES (${actor.organizationId}::uuid,${current.id}::uuid,${current.stage},${body.stage},${body.reason??null},${body.reasonCode??null},${actor.userId}::uuid)`;

      let workerId:string|null=null;
      if(body.stage==="started" && changed){
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
        const [assignment]=await tx<Array<{id:string}>>`SELECT id FROM worker_object_assignments WHERE worker_id=${workerId}::uuid AND object_id=${current.objectId}::uuid AND effective_to IS NULL`;
        if(!assignment){
          await tx`
            INSERT INTO worker_object_assignments(organization_id,worker_id,object_id,specialty_id,effective_from,manager_user_id,created_by_user_id)
            VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${current.objectId}::uuid,${current.specialtyId}::uuid,${body.actualStartAt??null}::timestamptz::date,${current.managerUserId??current.objectOwnerId}::uuid,${actor.userId}::uuid)
          `;
        }
        const [activeRate]=await tx<Array<{id:string}>>`SELECT id FROM worker_rates WHERE worker_id=${workerId}::uuid AND object_id=${current.objectId}::uuid AND specialty_id=${current.specialtyId}::uuid AND effective_to IS NULL LIMIT 1`;
        if(!activeRate&&current.sourceRequestRoleId){
          const [rate]=await tx<Array<{amount:number|null}>>`
            SELECT COALESCE(NULLIF(cs.inputs_snapshot->>'workerNetHourly','')::numeric,NULLIF(cs.inputs_snapshot->>'workerNet','')::numeric,NULLIF(cs.result_snapshot->>'workerNetHourly','')::numeric,NULLIF(cs.result_snapshot->>'workerNet','')::numeric) amount
            FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id
            WHERE cs.request_role_id=${current.sourceRequestRoleId}::uuid AND cs.status='accepted'
            ORDER BY cs.accepted_at DESC NULLS LAST,cs.created_at DESC LIMIT 1
          `;
          if(rate?.amount!=null&&Number(rate.amount)>0){
            await tx`INSERT INTO worker_rates(organization_id,worker_id,specialty_id,object_id,amount,unit,day_night,effective_from,created_by_user_id)
              VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${current.specialtyId}::uuid,${current.objectId}::uuid,${rate.amount},'hour','any',${body.actualStartAt??null}::timestamptz::date,${actor.userId}::uuid)`;
          }
        }
        await tx`UPDATE candidates SET status='worker',updated_at=now() WHERE id=${current.candidateId}::uuid`;
        await tx`
          UPDATE needs SET count_filled=LEAST(count_required,(
            SELECT count(DISTINCT wa.worker_id)::int FROM worker_object_assignments wa JOIN worker_profiles wp ON wp.id=wa.worker_id AND wp.status='active' WHERE wa.object_id=${current.objectId}::uuid AND wa.specialty_id=${current.specialtyId}::uuid AND wa.effective_from<=current_date AND (wa.effective_to IS NULL OR wa.effective_to>=current_date)
          )),status=CASE WHEN (
            SELECT count(DISTINCT wa.worker_id)::int FROM worker_object_assignments wa JOIN worker_profiles wp ON wp.id=wa.worker_id AND wp.status='active' WHERE wa.object_id=${current.objectId}::uuid AND wa.specialty_id=${current.specialtyId}::uuid AND wa.effective_from<=current_date AND (wa.effective_to IS NULL OR wa.effective_to>=current_date)
          )>=count_required THEN 'filled' ELSE 'in_progress' END,
          closed_at=CASE WHEN (
            SELECT count(DISTINCT wa.worker_id)::int FROM worker_object_assignments wa JOIN worker_profiles wp ON wp.id=wa.worker_id AND wp.status='active' WHERE wa.object_id=${current.objectId}::uuid AND wa.specialty_id=${current.specialtyId}::uuid AND wa.effective_from<=current_date AND (wa.effective_to IS NULL OR wa.effective_to>=current_date)
          )>=count_required THEN COALESCE(closed_at,now()) ELSE NULL END
          WHERE id=${current.needId}::uuid
        `;
      } else if(changed) {
        await tx`UPDATE needs SET status=CASE WHEN status='open' THEN 'in_progress' ELSE status END WHERE id=${current.needId}::uuid`;
      }
      await tx`INSERT INTO activity_events(organization_id,actor_user_id,entity_type,entity_id,verb,summary,metadata)
        VALUES(${actor.organizationId}::uuid,${actor.userId}::uuid,'candidate',${current.candidateId}::uuid,'stage_changed',${changed?`Этап кандидата: ${recruitingStageLabels[normalizeRecruitingStage(current.stage)]} → ${recruitingStageLabels[body.stage]}`:"Обновлены рабочие действия по кандидату"},${sql.json({applicationId:current.id,needId:current.needId,workerId,reasonCode:body.reasonCode??null,reason:body.reason??null})})`;
      return {candidateId:current.candidateId,applicationId:current.id,stage:body.stage,workerId};
    }));
    if("conflict" in result) return NextResponse.json({error:"Заявка уже изменена. Обновите страницу перед сохранением."},{status:409});
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof WorkflowError)return NextResponse.json({error:error.message},{status:422});
    if(error instanceof z.ZodError)return NextResponse.json({error:"Проверьте этап и причину выбытия",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
