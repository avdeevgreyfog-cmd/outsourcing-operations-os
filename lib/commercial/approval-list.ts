import type {Actor} from "@/lib/access/types";
import {requireCapability} from "@/lib/access/server";
import {withTenant} from "@/lib/db/client";

export type ApprovalListRow={
  id:string;subjectType:"calculation_scenario"|"proposal"|"tender";subjectId:string;subject:string;processCode:string;status:string;
  requestedBy:string;approver:string|null;approverUserId:string|null;requestedAt:string;decidedAt:string|null;decisionComment:string|null;
  requestId:string|null;tenderId:string|null;sourceType:"request"|"tender"|null;sourceId:string|null;
};

export async function listAllApprovals(actor:Actor):Promise<ApprovalListRow[]>{
  requireCapability(actor,"approval.read");
  if(actor.demo)return [];
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const allOrg=actor.access.allOrg||actor.access.scopes["approval.read"]?.some(scope=>scope.type==="all_org");
    return sql<ApprovalListRow[]>`
      SELECT ai.id,ai.subject_type "subjectType",ai.subject_id "subjectId",
        CASE ai.subject_type
          WHEN 'calculation_scenario' THEN 'Расчёт · '||COALESCE(tcalc.title,rcalc.title,'—')||' · '||COALESCE(tr.title,s.name,'—')
          WHEN 'proposal' THEN 'КП · '||COALESCE(rp.title,'—')||' · №'||COALESCE(p.version::text,'—')
          WHEN 'tender' THEN 'Тендер · '||COALESCE(td.title,'—')
        END subject,
        ai.process_code "processCode",ai.status,requester.display_name "requestedBy",approver.display_name approver,aps.approver_user_id "approverUserId",
        to_char(ai.submitted_at,'DD.MM.YYYY HH24:MI') "requestedAt",to_char(aps.decided_at,'DD.MM.YYYY HH24:MI') "decidedAt",aps.decision_comment "decisionComment",
        COALESCE(cc.request_id,p.request_id) "requestId",COALESCE(cc.tender_id,CASE WHEN ai.subject_type='tender' THEN ai.subject_id END) "tenderId",
        CASE WHEN COALESCE(cc.tender_id,CASE WHEN ai.subject_type='tender' THEN ai.subject_id END) IS NOT NULL THEN 'tender' WHEN COALESCE(cc.request_id,p.request_id) IS NOT NULL THEN 'request' ELSE NULL END "sourceType",
        COALESCE(cc.tender_id,CASE WHEN ai.subject_type='tender' THEN ai.subject_id END,cc.request_id,p.request_id) "sourceId"
      FROM approval_instances ai JOIN approval_steps aps ON aps.approval_id=ai.id AND aps.step_order=1
      JOIN app_users requester ON requester.id=ai.requested_by_user_id LEFT JOIN app_users approver ON approver.id=aps.approver_user_id
      LEFT JOIN calculation_scenarios cs ON ai.subject_type='calculation_scenario' AND cs.id=ai.subject_id
      LEFT JOIN calculations cc ON cc.id=cs.calculation_id LEFT JOIN requests rcalc ON rcalc.id=cc.request_id LEFT JOIN tenders tcalc ON tcalc.id=cc.tender_id
      LEFT JOIN request_roles rr ON rr.id=cs.request_role_id LEFT JOIN specialties s ON s.id=rr.specialty_id LEFT JOIN tender_roles tr ON tr.id=cs.tender_role_id
      LEFT JOIN proposals p ON ai.subject_type='proposal' AND p.id=ai.subject_id LEFT JOIN requests rp ON rp.id=p.request_id
      LEFT JOIN tenders td ON ai.subject_type='tender' AND td.id=ai.subject_id
      WHERE ${allOrg} OR ai.requested_by_user_id=${actor.userId}::uuid OR aps.approver_user_id=${actor.userId}::uuid
      ORDER BY ai.status='pending' DESC,ai.submitted_at DESC
    `;
  });
}
