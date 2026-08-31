import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentActor } from "@/lib/auth/server";
import { AccessDeniedError, requireCapability } from "@/lib/access/server";
import { withTenant } from "@/lib/db/client";

const stages = ["new","clarification","ready_for_calculation","calculation","approval","proposal_ready","proposal_sent","negotiation","accepted"] as const;
const closeReasons = ["irrelevant","client_declined","price","competitor","cancelled","postponed","no_feedback","staffing_impossible","terms","duplicate","other"] as const;
const schema = z.discriminatedUnion("action", [
  z.object({ action:z.literal("stage"), stage:z.enum(stages), nextAction:z.string().trim().max(500).optional(), nextActionAt:z.string().datetime().optional() }),
  z.object({ action:z.literal("close"), reason:z.enum(closeReasons), comment:z.string().trim().max(2000).optional() }),
  z.object({ action:z.literal("archive") }),
  z.object({ action:z.literal("restore"), stage:z.enum(stages) }),
  z.object({ action:z.literal("comment"), entityType:z.enum(["request","calculation_scenario","calculation_approval","proposal"]), entityId:z.string().uuid(), commentType:z.enum(["comment","call","client_clarification","decision","internal_note"]), body:z.string().trim().min(1).max(5000) }),
  z.object({ action:z.literal("approval_request"), scenarioId:z.string().uuid(), assignedToUserId:z.string().uuid().optional(), comment:z.string().trim().max(2000).optional() }),
  z.object({ action:z.literal("approval_decision"), approvalId:z.string().uuid(), decision:z.enum(["approved","rejected","revision_requested"]), comment:z.string().trim().max(2000).optional() }),
  z.object({ action:z.literal("proposal_create"), scenarioIds:z.array(z.string().uuid()).min(1).max(40), validUntil:z.string().date().optional(), terms:z.record(z.string(),z.json()).default({}) }),
  z.object({ action:z.literal("proposal_send"), proposalId:z.string().uuid() }),
  z.object({ action:z.literal("proposal_accept"), proposalId:z.string().uuid() }),
  z.object({ action:z.literal("duplicate") }),
  z.object({ action:z.literal("create_object"), name:z.string().trim().min(2).max(240), code:z.string().trim().min(2).max(60) }),
]);

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    const actor=await getCurrentActor();
    if(!actor)return NextResponse.json({error:"Unauthorized"},{status:401});
    if(actor.demo)return NextResponse.json({error:"Демо-данные доступны только для чтения"},{status:409});
    const {id}=await params;
    const body=schema.parse(await request.json());
    const result=await withTenant(actor.organizationId,actor.userId,async sql=>sql.begin(async tx=>{
      const [current]=await tx<Array<{id:string;stage:string;outcome:string;archivedAt:string|null;clientId:string|null;regionId:string|null;acceptedProposalId:string|null;selectedScenarioId:string|null;title:string;location:string|null;startDate:string|null}>>`
        SELECT id,stage,outcome,archived_at "archivedAt",client_company_id "clientId",region_id "regionId",accepted_proposal_id "acceptedProposalId",selected_scenario_id "selectedScenarioId",title,location_text location,expected_start_date "startDate" FROM requests WHERE id=${id}::uuid FOR UPDATE`;
      if(!current)throw new Error("REQUEST_NOT_FOUND");

      if(body.action==="stage"){
        requireCapability(actor,"sales.request.edit");
        if(current.archivedAt)throw new Error("REQUEST_ARCHIVED");
        await tx`UPDATE requests SET stage=${body.stage},status=${body.stage},next_action_text=${body.nextAction??null},next_action_at=${body.nextActionAt??null}::timestamptz,updated_at=now() WHERE id=${id}::uuid`;
        return {id,stage:body.stage};
      }
      if(body.action==="close"){
        requireCapability(actor,"sales.request.edit");
        await tx`UPDATE requests SET outcome='closed',close_reason=${body.reason},close_comment=${body.comment??null},closed_at=now(),closed_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${id}::uuid`;
        return {id,outcome:"closed"};
      }
      if(body.action==="archive"){
        requireCapability(actor,"sales.request.archive");
        await tx`UPDATE requests SET archived_at=now(),archived_by_user_id=${actor.userId}::uuid,updated_at=now() WHERE id=${id}::uuid`;
        return {id,archived:true};
      }
      if(body.action==="restore"){
        requireCapability(actor,"sales.request.archive");
        await tx`UPDATE requests SET archived_at=NULL,archived_by_user_id=NULL,outcome='open',closed_at=NULL,closed_by_user_id=NULL,stage=${body.stage},status=${body.stage},updated_at=now() WHERE id=${id}::uuid`;
        return {id,restored:true,stage:body.stage};
      }
      if(body.action==="comment"){
        requireCapability(actor,"sales.request.read");
        const related = body.entityType === "request"
          ? body.entityId === id
          : await isRelatedEntity(tx,id,body.entityType,body.entityId);
        if(!related)throw new Error("ENTITY_NOT_RELATED");
        const [row]=await tx<Array<{id:string}>>`INSERT INTO comments(organization_id,entity_type,entity_id,body,comment_type,visibility,created_by_user_id) VALUES (${actor.organizationId}::uuid,${body.entityType},${body.entityId}::uuid,${body.body},${body.commentType},'internal',${actor.userId}::uuid) RETURNING id`;
        return row;
      }
      if(body.action==="approval_request"){
        requireCapability(actor,"calculation.scenario.create");
        const related=await isRelatedEntity(tx,id,"calculation_scenario",body.scenarioId);if(!related)throw new Error("ENTITY_NOT_RELATED");
        const [row]=await tx<Array<{id:string}>>`INSERT INTO calculation_approvals(organization_id,request_id,scenario_id,status,requested_by_user_id,assigned_to_user_id,comment) VALUES (${actor.organizationId}::uuid,${id}::uuid,${body.scenarioId}::uuid,'pending',${actor.userId}::uuid,${body.assignedToUserId??null}::uuid,${body.comment??null}) RETURNING id`;
        await tx`UPDATE requests SET stage='approval',status='approval',updated_at=now() WHERE id=${id}::uuid`;
        return row;
      }
      if(body.action==="approval_decision"){
        requireCapability(actor,"calculation.approval.decide");
        const [approval]=await tx<Array<{scenarioId:string}>>`UPDATE calculation_approvals SET status=${body.decision},decided_by_user_id=${actor.userId}::uuid,decided_at=now(),comment=COALESCE(${body.comment??null},comment) WHERE id=${body.approvalId}::uuid AND request_id=${id}::uuid AND status='pending' RETURNING scenario_id "scenarioId"`;
        if(!approval)throw new Error("APPROVAL_NOT_FOUND");
        if(body.decision==="approved"){
          await tx`UPDATE calculation_scenarios SET status='accepted',accepted_by_user_id=${actor.userId}::uuid,accepted_at=now(),locked_at=now(),lock_reason='approved' WHERE id=${approval.scenarioId}::uuid`;
          await tx`UPDATE requests SET selected_scenario_id=${approval.scenarioId}::uuid,stage='proposal_ready',status='proposal_ready',updated_at=now() WHERE id=${id}::uuid`;
        }else if(body.decision==="revision_requested") await tx`UPDATE requests SET stage='calculation',status='calculation',updated_at=now() WHERE id=${id}::uuid`;
        return {id:body.approvalId,status:body.decision};
      }
      if(body.action==="proposal_create"){
        requireCapability(actor,"sales.proposal.create");
        const valid=await tx<Array<{id:string}>>`SELECT cs.id FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id WHERE c.request_id=${id}::uuid AND cs.id=ANY(${body.scenarioIds}::uuid[]) AND cs.status='accepted'`;
        if(valid.length!==body.scenarioIds.length)throw new Error("SCENARIO_NOT_APPROVED");
        const [{nextVersion}]=await tx<Array<{nextVersion:number}>>`SELECT COALESCE(max(version),0)::int+1 "nextVersion" FROM proposals WHERE request_id=${id}::uuid`;
        const [row]=await tx<Array<{id:string;version:number;proposalNumber:string}>>`
          INSERT INTO proposals(organization_id,request_id,version,status,scenario_ids,valid_until,client_snapshot,terms_snapshot,created_by_user_id,proposal_number)
          SELECT ${actor.organizationId}::uuid,${id}::uuid,${nextVersion},'prepared',${body.scenarioIds}::uuid[],${body.validUntil??null}::date,
            jsonb_build_object('client',c.name,'contactName',r.contact_name,'contactPhone',r.contact_phone,'contactEmail',r.contact_email),${tx.json(body.terms)},${actor.userId}::uuid,
            'КП-'||to_char(now(),'YYMM')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6))
          FROM requests r LEFT JOIN client_companies c ON c.id=r.client_company_id WHERE r.id=${id}::uuid RETURNING id,version,proposal_number "proposalNumber"`;
        await tx`UPDATE calculation_scenarios SET locked_at=COALESCE(locked_at,now()),lock_reason=COALESCE(lock_reason,'used_in_proposal') WHERE id=ANY(${body.scenarioIds}::uuid[])`;
        await tx`UPDATE requests SET stage='proposal_ready',status='proposal_ready',updated_at=now() WHERE id=${id}::uuid`;
        return row;
      }
      if(body.action==="proposal_send"){
        requireCapability(actor,"sales.proposal.send");
        const [row]=await tx<Array<{id:string}>>`UPDATE proposals SET status='sent',sent_at=now(),sent_by_user_id=${actor.userId}::uuid WHERE id=${body.proposalId}::uuid AND request_id=${id}::uuid RETURNING id`;
        if(!row)throw new Error("PROPOSAL_NOT_FOUND");
        await tx`UPDATE requests SET stage='proposal_sent',status='proposal_sent',updated_at=now() WHERE id=${id}::uuid`;
        return row;
      }
      if(body.action==="proposal_accept"){
        requireCapability(actor,"sales.proposal.accept");
        const [row]=await tx<Array<{id:string}>>`UPDATE proposals SET status='accepted',accepted_at=now() WHERE id=${body.proposalId}::uuid AND request_id=${id}::uuid RETURNING id`;
        if(!row)throw new Error("PROPOSAL_NOT_FOUND");
        await tx`UPDATE requests SET stage='accepted',status='accepted',outcome='accepted',accepted_proposal_id=${body.proposalId}::uuid,updated_at=now() WHERE id=${id}::uuid`;
        return row;
      }
      if(body.action==="duplicate"){
        requireCapability(actor,"sales.request.create");
        const [copy]=await tx<Array<{id:string;requestNumber:string}>>`
          INSERT INTO requests(organization_id,client_company_id,contact_id,lead_id,request_number,title,status,stage,outcome,location_text,region_id,expected_start_date,duration_text,schedule_json,lunch_paid,vat_mode,housing_rule,travel_rule,shuttle_rule,ppe_rule,medical_rule,citizenship_rule,tools_rule,comments,owner_user_id,created_by_user_id,assigned_team_id,source_kind,contact_name,contact_position,contact_phone,contact_email,customer_inn,site_name,city,transport_access,nearest_transport,logistics_comment,project_indefinite,commercial_limits_json,provision_json,staffing_requirements_json)
          SELECT organization_id,client_company_id,contact_id,NULL,'З-'||to_char(now(),'YYMM')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),title||' — копия','new','new','open',location_text,region_id,expected_start_date,duration_text,schedule_json,lunch_paid,vat_mode,housing_rule,travel_rule,shuttle_rule,ppe_rule,medical_rule,citizenship_rule,tools_rule,NULL,${actor.userId}::uuid,${actor.userId}::uuid,assigned_team_id,'duplicate',contact_name,contact_position,contact_phone,contact_email,customer_inn,site_name,city,transport_access,nearest_transport,logistics_comment,project_indefinite,commercial_limits_json,provision_json,staffing_requirements_json FROM requests WHERE id=${id}::uuid RETURNING id,request_number "requestNumber"`;
        await tx`INSERT INTO request_roles(organization_id,request_id,specialty_id,count_required,schedule_json,requirements_json,target_client_rate,qualification,experience_text,salary_target,salary_unit,schedule_type,starts_at,ends_at,presence_hours,paid_hours,lunch_minutes,lunch_paid,night_hours,overtime_rule)
          SELECT organization_id,${copy.id}::uuid,specialty_id,count_required,schedule_json,requirements_json,target_client_rate,qualification,experience_text,salary_target,salary_unit,schedule_type,starts_at,ends_at,presence_hours,paid_hours,lunch_minutes,lunch_paid,night_hours,overtime_rule FROM request_roles WHERE request_id=${id}::uuid`;
        return copy;
      }
      if(body.action==="create_object"){
        requireCapability(actor,"operations.object.edit");
        if(current.outcome!=="accepted"||!current.acceptedProposalId)throw new Error("REQUEST_NOT_ACCEPTED");
        if(!current.clientId||!current.regionId)throw new Error("OBJECT_SOURCE_INCOMPLETE");
        const [object]=await tx<Array<{id:string}>>`
          INSERT INTO objects(organization_id,client_company_id,source_request_id,name,code,status,region_id,address_text,target_start_date,owner_user_id,created_by_user_id,accepted_proposal_id,accepted_scenario_id,source_snapshot)
          VALUES (${actor.organizationId}::uuid,${current.clientId}::uuid,${id}::uuid,${body.name},${body.code},'launch',${current.regionId}::uuid,${current.location},${current.startDate}::date,${actor.userId}::uuid,${actor.userId}::uuid,${current.acceptedProposalId}::uuid,${current.selectedScenarioId}::uuid,
            jsonb_build_object('requestId',${id},'requestTitle',${current.title},'acceptedProposalId',${current.acceptedProposalId},'acceptedScenarioId',${current.selectedScenarioId})) RETURNING id`;
        await tx`INSERT INTO needs(organization_id,object_id,source_request_role_id,specialty_id,count_required,status,owner_user_id,created_by_user_id)
          SELECT organization_id,${object.id}::uuid,id,specialty_id,count_required,'open',${actor.userId}::uuid,${actor.userId}::uuid FROM request_roles WHERE request_id=${id}::uuid`;
        return object;
      }
      return {id};
    }));
    return NextResponse.json(result);
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Ошибка проверки данных",issues:error.issues},{status:400});
    if(error instanceof AccessDeniedError)return NextResponse.json({error:"Недостаточно прав"},{status:403});
    const message=error instanceof Error?error.message:"INTERNAL";
    const known:Record<string,string>={REQUEST_NOT_FOUND:"Заявка не найдена",REQUEST_ARCHIVED:"Сначала восстановите заявку из архива",ENTITY_NOT_RELATED:"Сущность не связана с заявкой",APPROVAL_NOT_FOUND:"Активное согласование не найдено",SCENARIO_NOT_APPROVED:"КП можно создать только из согласованного сценария",PROPOSAL_NOT_FOUND:"КП не найдено",REQUEST_NOT_ACCEPTED:"Объект создаётся только после принятия предложения",OBJECT_SOURCE_INCOMPLETE:"Для создания объекта укажите клиента и регион"};
    if(known[message])return NextResponse.json({error:known[message]},{status:409});
    console.error(error);return NextResponse.json({error:"Внутренняя ошибка"},{status:500});
  }
}

async function isRelatedEntity(tx:any,requestId:string,type:string,entityId:string){
  if(type==="calculation_scenario"){const rows=await tx`SELECT 1 FROM calculation_scenarios cs JOIN calculations c ON c.id=cs.calculation_id WHERE cs.id=${entityId}::uuid AND c.request_id=${requestId}::uuid`;return rows.length>0;}
  if(type==="calculation_approval"){const rows=await tx`SELECT 1 FROM calculation_approvals WHERE id=${entityId}::uuid AND request_id=${requestId}::uuid`;return rows.length>0;}
  if(type==="proposal"){const rows=await tx`SELECT 1 FROM proposals WHERE id=${entityId}::uuid AND request_id=${requestId}::uuid`;return rows.length>0;}
  return false;
}
