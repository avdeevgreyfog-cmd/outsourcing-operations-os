import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const schema=z.object({decision:z.enum(["approve","reject"]),comment:z.string().trim().max(2000).optional()});

export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    requireCapability(actor,"approval.decide");
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const {id}=await params;const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [approval]=await tx<Array<{id:string;subjectType:"calculation_scenario"|"proposal";subjectId:string;status:string;approverUserId:string|null}>>`
        SELECT ai.id,ai.subject_type "subjectType",ai.subject_id "subjectId",ai.status,aps.approver_user_id "approverUserId"
        FROM approval_instances ai JOIN approval_steps aps ON aps.approval_id=ai.id AND aps.step_order=1 WHERE ai.id=${id}::uuid FOR UPDATE
      `;
      if(!approval)throw new Error("Согласование не найдено");
      if(approval.status!=="pending")throw new Error("Согласование уже завершено");
      const allOrg=actor.access.allOrg||actor.access.scopes["approval.decide"]?.some(scope=>scope.type==="all_org");
      if(!allOrg&&approval.approverUserId!==actor.userId)throw new AccessDeniedError("approval.decide");
      const nextStatus=body.decision==="approve"?"approved":"rejected";
      await tx`UPDATE approval_steps SET status=${nextStatus},decided_by_user_id=${actor.userId}::uuid,decision_comment=${body.comment??null},decided_at=now() WHERE approval_id=${id}::uuid AND step_order=1`;
      await tx`UPDATE approval_instances SET status=${nextStatus},completed_at=now() WHERE id=${id}::uuid`;

      let requestId:string|null=null;
      if(approval.subjectType==="calculation_scenario"){
        const [subject]=await tx<Array<{requestId:string;requestRoleId:string;calculationId:string}>>`
          SELECT c.request_id "requestId",cs.request_role_id "requestRoleId",cs.calculation_id "calculationId"
          FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id WHERE cs.id=${approval.subjectId}::uuid
        `;
        if(!subject)throw new Error("Сценарий расчёта не найден");requestId=subject.requestId;
        if(body.decision==="approve"){
          await tx`UPDATE calculation_scenarios SET status='superseded' WHERE request_role_id=${subject.requestRoleId}::uuid AND status='accepted' AND id<>${approval.subjectId}::uuid`;
          await tx`UPDATE calculation_scenarios SET status='accepted',accepted_by_user_id=${actor.userId}::uuid,accepted_at=now() WHERE id=${approval.subjectId}::uuid`;
          const [remaining]=await tx<Array<{count:number}>>`
            SELECT count(*)::int count FROM request_roles rr WHERE rr.request_id=${subject.requestId}::uuid
              AND NOT EXISTS(SELECT 1 FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id WHERE c.request_id=rr.request_id AND cs.request_role_id=rr.id AND cs.status='accepted')
          `;
          if((remaining?.count??0)===0){
            await tx`UPDATE calculations SET status='approved',approved_by_user_id=${actor.userId}::uuid,approved_at=now(),updated_at=now() WHERE id=${subject.calculationId}::uuid`;
            await tx`UPDATE requests SET status='proposal_ready',updated_at=now() WHERE id=${subject.requestId}::uuid`;
          }else{
            await tx`UPDATE requests SET status='calculation',updated_at=now() WHERE id=${subject.requestId}::uuid`;
          }
        }else{
          await tx`UPDATE calculation_scenarios SET status='rejected' WHERE id=${approval.subjectId}::uuid`;
          await tx`UPDATE calculations SET status='draft',updated_at=now() WHERE id=${subject.calculationId}::uuid`;
          await tx`UPDATE requests SET status='calculation',updated_at=now() WHERE id=${subject.requestId}::uuid`;
        }
      }else{
        const [subject]=await tx<Array<{requestId:string}>>`SELECT request_id "requestId" FROM proposals WHERE id=${approval.subjectId}::uuid`;
        if(!subject)throw new Error("КП не найдено");requestId=subject.requestId;
        if(body.decision==="approve"){
          await tx`UPDATE proposals SET status='approved',approved_by_user_id=${actor.userId}::uuid,approved_at=now() WHERE id=${approval.subjectId}::uuid`;
          await tx`UPDATE requests SET status='proposal',updated_at=now() WHERE id=${subject.requestId}::uuid`;
        }else{
          await tx`UPDATE proposals SET status='rejected_internal' WHERE id=${approval.subjectId}::uuid`;
          await tx`UPDATE requests SET status='proposal_ready',updated_at=now() WHERE id=${subject.requestId}::uuid`;
        }
      }
      return {id:approval.id,status:nextStatus,requestId};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректное решение",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Это согласование назначено другому пользователю"},{status:403});
    console.error(error);
    return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
