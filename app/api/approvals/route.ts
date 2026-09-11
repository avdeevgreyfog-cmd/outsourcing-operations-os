import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

const schema=z.object({
  subjectType:z.enum(["calculation_scenario","proposal","contract","tender"]),
  subjectId:z.string().uuid(),
  processCode:z.enum(["tender_participation","tender_bid","tender_submission"]).optional(),
});
type SubjectContext={sourceType:"request"|"tender";sourceId:string;regionId:string|null;organizationId:string;ownerUserId:string|null;createdByUserId:string;teamId:string|null;clientId:string|null;status:string};

export async function POST(request:Request){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    if(actor.demo)return NextResponse.json({error:"Демонстрационные данные доступны только для чтения"},{status:409});
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      let context:SubjectContext|undefined;let processCode="";let stepCode="";let capability="";
      if(body.subjectType==="calculation_scenario"){
        capability="calculation.scenario.edit";processCode="commercial_calculation";stepCode="calculation_approval";requireCapability(actor,capability);
        const [row]=await tx<Array<SubjectContext>>`
          SELECT CASE WHEN c.tender_id IS NOT NULL THEN 'tender' ELSE 'request' END "sourceType",COALESCE(c.tender_id,c.request_id) "sourceId",
            COALESCE(t.region_id,r.region_id) "regionId",COALESCE(t.organization_id,r.organization_id) "organizationId",COALESCE(t.owner_user_id,r.owner_user_id) "ownerUserId",
            COALESCE(t.created_by_user_id,r.created_by_user_id) "createdByUserId",COALESCE(t.assigned_team_id,r.assigned_team_id) "teamId",COALESCE(t.client_company_id,r.client_company_id) "clientId",cs.status
          FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id LEFT JOIN requests r ON r.id=c.request_id LEFT JOIN tenders t ON t.id=c.tender_id WHERE cs.id=${body.subjectId}::uuid
        `;context=row;
        if(!context)throw new Error("Сценарий расчёта не найден");
        if(!canReadRow(actor.access,capability,context,actor))throw new AccessDeniedError(capability);
        if(!["draft","rejected"].includes(context.status))throw new Error("На согласование можно отправить только черновик или отклонённый сценарий");
      }else if(body.subjectType==="proposal"){
        capability="sales.proposal.submit";processCode="commercial_proposal";stepCode="proposal_approval";requireCapability(actor,capability);
        const [row]=await tx<Array<SubjectContext>>`
          SELECT 'request' "sourceType",r.id "sourceId",r.region_id "regionId",r.organization_id "organizationId",r.owner_user_id "ownerUserId",r.created_by_user_id "createdByUserId",r.assigned_team_id "teamId",r.client_company_id "clientId",p.status
          FROM proposals p JOIN requests r ON r.id=p.request_id WHERE p.id=${body.subjectId}::uuid
        `;context=row;
        if(!context)throw new Error("Коммерческое предложение не найдено");
        if(!canReadRow(actor.access,capability,context,actor))throw new AccessDeniedError(capability);
        if(context.status!=="draft")throw new Error("На внутреннее согласование можно отправить только черновик КП");
      }else if(body.subjectType==="contract"){
        capability="contract.submit";processCode="commercial_contract";stepCode="contract_approval";requireCapability(actor,capability);
        const [row]=await tx<Array<SubjectContext>>`
          SELECT 'request' "sourceType",r.id "sourceId",r.region_id "regionId",r.organization_id "organizationId",COALESCE(c.owner_user_id,r.owner_user_id) "ownerUserId",
            c.created_by_user_id "createdByUserId",r.assigned_team_id "teamId",r.client_company_id "clientId",c.status
          FROM contracts c JOIN requests r ON r.id=c.request_id WHERE c.id=${body.subjectId}::uuid
        `;context=row;
        if(!context)throw new Error("Договор не найден");
        if(!canReadRow(actor.access,capability,context,actor))throw new AccessDeniedError(capability);
        if(!["draft","negotiation","rejected"].includes(context.status))throw new Error("На согласование можно отправить только черновик или договор после переговоров");
      }else{
        capability="sales.tender.edit";requireCapability(actor,capability);processCode=body.processCode??"tender_participation";stepCode=processCode==="tender_bid"?"bid_approval":processCode==="tender_submission"?"submission_approval":"participation_approval";
        const [row]=await tx<Array<SubjectContext>>`
          SELECT 'tender' "sourceType",id "sourceId",region_id "regionId",organization_id "organizationId",owner_user_id "ownerUserId",created_by_user_id "createdByUserId",assigned_team_id "teamId",client_company_id "clientId",stage status
          FROM tenders WHERE id=${body.subjectId}::uuid AND archived_at IS NULL
        `;context=row;
        if(!context)throw new Error("Тендер не найден");
        if(!canReadRow(actor.access,capability,context,actor))throw new AccessDeniedError(capability);
        if(context.status==="completed")throw new Error("Завершённый тендер нельзя отправить на согласование");
      }
      const [pending]=await tx<Array<{id:string}>>`SELECT id FROM approval_instances WHERE subject_type=${body.subjectType} AND subject_id=${body.subjectId}::uuid AND status='pending'`;
      if(pending)throw new Error("По этому предмету уже есть активное согласование");

      const [approver]=await tx<Array<{membershipId:string;userId:string}>>`
        WITH direct_rule AS (
          SELECT membership_id "membershipId",user_id "userId",1 priority FROM resolve_organization_responsibility(${processCode},${stepCode},${context.regionId?"region":"all_org"},${context.regionId}::uuid,current_date)
        ), manager AS (
          SELECT m.id "membershipId",m.user_id "userId",2 priority FROM organization_memberships m
          WHERE m.id=resolve_employee_manager(${actor.membershipId}::uuid,current_date)
            AND (EXISTS(SELECT 1 FROM permission_grants pg WHERE pg.role_template_id=m.role_template_id AND pg.capability='approval.decide' AND pg.effect='allow') OR EXISTS(SELECT 1 FROM user_permission_overrides upo WHERE upo.membership_id=m.id AND upo.capability='approval.decide' AND upo.effect='allow' AND (upo.effective_from IS NULL OR upo.effective_from<=current_date) AND (upo.effective_to IS NULL OR upo.effective_to>=current_date)))
            AND NOT EXISTS(SELECT 1 FROM user_permission_overrides upo WHERE upo.membership_id=m.id AND upo.capability='approval.decide' AND upo.effect='deny' AND (upo.effective_from IS NULL OR upo.effective_from<=current_date) AND (upo.effective_to IS NULL OR upo.effective_to>=current_date))
        ), fallback AS (
          SELECT m.id "membershipId",m.user_id "userId",3 priority FROM organization_memberships m JOIN role_templates rt ON rt.id=m.role_template_id JOIN permission_grants pg ON pg.role_template_id=rt.id AND pg.capability='approval.decide' AND pg.effect='allow'
          WHERE m.status='active' AND m.user_id<>${actor.userId}::uuid AND NOT EXISTS(SELECT 1 FROM user_permission_overrides upo WHERE upo.membership_id=m.id AND upo.capability='approval.decide' AND upo.effect='deny' AND (upo.effective_from IS NULL OR upo.effective_from<=current_date) AND (upo.effective_to IS NULL OR upo.effective_to>=current_date)) ORDER BY rt.code='director' DESC,m.created_at LIMIT 1
        ), self_fallback AS (
          SELECT ${actor.membershipId}::uuid "membershipId",${actor.userId}::uuid "userId",4 priority WHERE ${actor.access.capabilities.includes("approval.decide")&&!actor.access.denies.includes("approval.decide")}
        ) SELECT "membershipId","userId" FROM (SELECT * FROM direct_rule UNION ALL SELECT * FROM manager UNION ALL SELECT * FROM fallback UNION ALL SELECT * FROM self_fallback) x WHERE "userId" IS NOT NULL ORDER BY priority LIMIT 1
      `;
      if(!approver)throw new Error("Не удалось определить согласующего. Настройте правило ответственности или пользователя с правом согласования");
      const [approval]=await tx<Array<{id:string}>>`
        INSERT INTO approval_instances(organization_id,subject_type,subject_id,process_code,status,requested_by_user_id,metadata)
        VALUES(${actor.organizationId}::uuid,${body.subjectType},${body.subjectId}::uuid,${processCode},'pending',${actor.userId}::uuid,${sql.json({sourceType:context.sourceType,sourceId:context.sourceId,regionId:context.regionId})}) RETURNING id
      `;
      await tx`INSERT INTO approval_steps(organization_id,approval_id,step_order,step_code,status,approver_membership_id,approver_user_id) VALUES(${actor.organizationId}::uuid,${approval.id}::uuid,1,${stepCode},'pending',${approver.membershipId}::uuid,${approver.userId}::uuid)`;
      if(body.subjectType==="calculation_scenario"){
        await tx`UPDATE calculation_scenarios SET status='review' WHERE id=${body.subjectId}::uuid`;
        await tx`UPDATE calculations SET status='review',updated_at=now() WHERE id=(SELECT calculation_id FROM calculation_scenarios WHERE id=${body.subjectId}::uuid)`;
        if(context.sourceType==="request")await tx`UPDATE requests SET status='calculation_review',updated_at=now() WHERE id=${context.sourceId}::uuid`;
        else await tx`UPDATE tenders SET stage='approval',updated_at=now() WHERE id=${context.sourceId}::uuid`;
      }else if(body.subjectType==="proposal"){
        await tx`UPDATE proposals SET status='internal_review',submitted_at=now() WHERE id=${body.subjectId}::uuid`;
        await tx`UPDATE requests SET status='proposal_review',updated_at=now() WHERE id=${context.sourceId}::uuid`;
      }else if(body.subjectType==="contract"){
        await tx`UPDATE contracts SET status='internal_review',updated_at=now() WHERE id=${body.subjectId}::uuid`;
      }else{
        await tx`UPDATE tenders SET stage='approval',updated_at=now() WHERE id=${body.subjectId}::uuid`;
      }
      return {id:approval.id,approverUserId:approver.userId,status:"pending"};
    }));
    return NextResponse.json(result,{status:201});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Некорректный предмет согласования",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    console.error(error);return NextResponse.json({error:error instanceof Error?error.message:"Internal error"},{status:500});
  }
}
