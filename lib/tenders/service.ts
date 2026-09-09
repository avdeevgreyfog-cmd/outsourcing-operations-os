import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";

export type TenderRow={
  id:string;organizationId:string;title:string;customer:string;clientId:string|null;platform:string|null;procedureNumber:string|null;sourceUrl:string|null;sourceName:string|null;
  publicationDate:string|null;submissionDeadline:string|null;initialPrice:number|string|null;billingUnit:string;stage:string;decision:string;result:string|null;closeReason:string|null;
  priority:string;potential:string;analysisSummary:string|null;nextActionText:string|null;nextActionAt:string|null;owner:string|null;ownerUserId:string|null;createdByUserId:string;
  teamId:string|null;regionId:string|null;legalEntityId:string|null;submittedAt:string|null;finalBidValue:number|string|null;updatedAt:string;createdAt:string;
  roleCount:number;requirementCount:number;readyRequirementCount:number;calculationCount:number;blockerCount:number;
};
export type TenderRole={id:string;specialtyId:string|null;title:string;count:number|null;volume:number|string|null;billingUnit:string;targetClientRate:number|string|null;schedule:Record<string,unknown>;requirements:Record<string,unknown>;notes:string|null};
export type TenderAssignment={id:string;roleCode:string;userId:string;user:string};
export type TenderSourceDocument={id:string;name:string;documentType:string;sourceUrl:string|null;notes:string|null;createdAt:string;createdBy:string};
export type TenderRequirement={id:string;name:string;category:string;required:boolean;status:string;companyDocumentId:string|null;companyDocument:string|null;companyDocumentStatus:string|null;companyDocumentExpiresAt:string|null;ownerUserId:string|null;owner:string|null;dueAt:string|null;notes:string|null};
export type TenderComment={id:string;body:string;createdAt:string;createdBy:string;createdByUserId:string};
export type TenderApproval={id:string;processCode:string;status:string;requestedAt:string;completedAt:string|null;requestedBy:string;approver:string|null;decisionComment:string|null};
export type TenderCalculation={id:string;scenarioId:string;roleId:string;role:string;name:string;status:string;clientRate:number|string;clientRateGross:number|string|null;marginPct:number|string;billingUnit:string;model:string};
export type TenderDetail=TenderRow&{conditions:Record<string,unknown>;submissionChecklist:Array<{id:string;label:string;done:boolean}>;bidReference:string|null;submissionNote:string|null;submittedBy:string|null;roles:TenderRole[];assignments:TenderAssignment[];sourceDocuments:TenderSourceDocument[];requirements:TenderRequirement[];comments:TenderComment[];approvals:TenderApproval[];calculations:TenderCalculation[]};
export type TenderOptions={
  clients:Array<{id:string;name:string}>;regions:Array<{id:string;name:string}>;specialties:Array<{id:string;name:string}>;
  members:Array<{userId:string;membershipId:string;name:string;position:string|null}>;legalEntities:Array<{id:string;name:string}>;
  companyDocuments:Array<{id:string;name:string;status:string;expiresAt:string|null;legalEntityId:string|null}>;
};

const DEMO_ORG="00000000-0000-4000-8000-000000000001";const SALES_TEAM="20000000-0000-4000-8000-000000000001";const MOW="30000000-0000-4000-8000-000000000001";
const demoRows:TenderRow[]=[
  {id:"a1000000-0000-4000-8000-000000000001",organizationId:DEMO_ORG,title:"Предоставление персонала для мероприятий",customer:"ГБУ «Городские проекты»",clientId:null,platform:"РТС-тендер",procedureNumber:"326000147",sourceUrl:"https://example.com/tender/147",sourceName:"Список аналитика",publicationDate:"2026-09-06",submissionDeadline:"2026-09-14T10:00:00+03:00",initialPrice:8400000,billingUnit:"hour",stage:"analysis",decision:"undecided",result:null,closeReason:null,priority:"high",potential:"high",analysisSummary:"Нужно проверить гарантированный объём часов и минимальное количество персонала на мероприятие.",nextActionText:"Изучить проект договора и объём мероприятий",nextActionAt:"2026-09-10T16:00:00+03:00",owner:"Илья Морозов",ownerUserId:"10000000-0000-4000-8000-000000000002",createdByUserId:"10000000-0000-4000-8000-000000000002",teamId:SALES_TEAM,regionId:MOW,legalEntityId:null,submittedAt:null,finalBidValue:null,updatedAt:"2026-09-09T09:20:00+03:00",createdAt:"2026-09-07T12:10:00+03:00",roleCount:2,requirementCount:4,readyRequirementCount:2,calculationCount:0,blockerCount:2},
  {id:"a1000000-0000-4000-8000-000000000002",organizationId:DEMO_ORG,title:"Комплектовщики распределительного центра",customer:"АО «Логистик Групп»",clientId:null,platform:"B2B-Center",procedureNumber:"B2B-88412",sourceUrl:"https://example.com/tender/88412",sourceName:"Ручной ввод",publicationDate:"2026-09-05",submissionDeadline:"2026-09-11T09:00:00+03:00",initialPrice:12600000,billingUnit:"hour",stage:"calculation",decision:"participate",result:null,closeReason:null,priority:"high",potential:"high",analysisSummary:"Объём понятен, условия подходят. Проверяем минимально допустимую ставку.",nextActionText:"Завершить расчёт по комплектовщикам",nextActionAt:"2026-09-09T17:00:00+03:00",owner:"Илья Морозов",ownerUserId:"10000000-0000-4000-8000-000000000002",createdByUserId:"10000000-0000-4000-8000-000000000002",teamId:SALES_TEAM,regionId:MOW,legalEntityId:null,submittedAt:null,finalBidValue:null,updatedAt:"2026-09-09T10:20:00+03:00",createdAt:"2026-09-06T10:00:00+03:00",roleCount:1,requirementCount:6,readyRequirementCount:5,calculationCount:2,blockerCount:1},
  {id:"a1000000-0000-4000-8000-000000000003",organizationId:DEMO_ORG,title:"Операторы контакт-центра",customer:"ООО «Сервис Плюс»",clientId:null,platform:"Сбер А",procedureNumber:"SBER-19042",sourceUrl:"https://example.com/tender/19042",sourceName:"Импорт",publicationDate:"2026-09-02",submissionDeadline:"2026-09-20T18:00:00+03:00",initialPrice:16000000,billingUnit:"worker_month",stage:"preparation",decision:"participate",result:null,closeReason:null,priority:"normal",potential:"medium",analysisSummary:"Экономика предварительно согласована. Собираем пакет документов участника.",nextActionText:"Получить свежую справку ФНС",nextActionAt:"2026-09-12T12:00:00+03:00",owner:"Илья Морозов",ownerUserId:"10000000-0000-4000-8000-000000000002",createdByUserId:"10000000-0000-4000-8000-000000000002",teamId:SALES_TEAM,regionId:MOW,legalEntityId:null,submittedAt:null,finalBidValue:null,updatedAt:"2026-09-08T16:40:00+03:00",createdAt:"2026-09-04T11:00:00+03:00",roleCount:1,requirementCount:5,readyRequirementCount:4,calculationCount:1,blockerCount:1},
  {id:"a1000000-0000-4000-8000-000000000004",organizationId:DEMO_ORG,title:"Разнорабочие на производственную площадку",customer:"АО «Промстрой»",clientId:null,platform:"ЕИС",procedureNumber:"0173100000026000101",sourceUrl:"https://example.com/tender/101",sourceName:"Список аналитика",publicationDate:"2026-08-18",submissionDeadline:"2026-08-28T12:00:00+03:00",initialPrice:5400000,billingUnit:"shift",stage:"completed",decision:"no_bid",result:"no_bid",closeReason:"Не прошли по экономике после учёта проживания и проезда",priority:"normal",potential:"low",analysisSummary:"После расчёта ставка не помещается в бюджет закупки.",nextActionText:null,nextActionAt:null,owner:"Илья Морозов",ownerUserId:"10000000-0000-4000-8000-000000000002",createdByUserId:"10000000-0000-4000-8000-000000000002",teamId:SALES_TEAM,regionId:MOW,legalEntityId:null,submittedAt:null,finalBidValue:null,updatedAt:"2026-08-25T16:00:00+03:00",createdAt:"2026-08-19T09:00:00+03:00",roleCount:1,requirementCount:3,readyRequirementCount:2,calculationCount:1,blockerCount:0},
];

export async function listTenders(actor:Actor):Promise<TenderRow[]>{
  requireCapability(actor,"sales.tender.read");
  if(actor.demo)return demoRows.filter(row=>canReadRow(actor.access,"sales.tender.read",row,actor));
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const rows=await sql<TenderRow[]>`
      SELECT t.id,t.organization_id "organizationId",t.title,COALESCE(c.name,t.customer_name,'Заказчик не указан') customer,t.client_company_id "clientId",
        t.platform,t.procedure_number "procedureNumber",t.source_url "sourceUrl",t.source_name "sourceName",t.publication_date::text "publicationDate",
        t.submission_deadline::text "submissionDeadline",t.initial_price "initialPrice",t.billing_unit "billingUnit",t.stage,t.decision,t.result,t.close_reason "closeReason",
        t.priority,t.potential,t.analysis_summary "analysisSummary",t.next_action_text "nextActionText",t.next_action_at::text "nextActionAt",
        u.display_name owner,t.owner_user_id "ownerUserId",t.created_by_user_id "createdByUserId",t.assigned_team_id "teamId",t.region_id "regionId",t.legal_entity_id "legalEntityId",
        t.submitted_at::text "submittedAt",t.final_bid_value "finalBidValue",t.updated_at::text "updatedAt",t.created_at::text "createdAt",
        (SELECT count(*)::int FROM tender_roles tr WHERE tr.tender_id=t.id) "roleCount",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required) "requirementCount",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required AND dr.status IN ('available','ready','not_required')) "readyRequirementCount",
        (SELECT count(*)::int FROM calculation_scenarios cs JOIN calculations calc ON calc.id=cs.calculation_id WHERE calc.tender_id=t.id) "calculationCount",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required AND dr.status IN ('prepare','update_needed','requested')) "blockerCount"
      FROM tenders t LEFT JOIN client_companies c ON c.id=t.client_company_id LEFT JOIN app_users u ON u.id=t.owner_user_id
      WHERE t.archived_at IS NULL ORDER BY t.stage='completed',t.submission_deadline NULLS LAST,t.created_at DESC
    `;
    return rows.filter(row=>canReadRow(actor.access,"sales.tender.read",row,actor));
  });
}

function demoDetail(row:TenderRow):TenderDetail{
  return {...row,conditions:{schedule:"По заявкам заказчика",region:"Москва",housing:"Уточняется",vatMode:"with_vat"},submissionChecklist:[{id:"price",label:"Финальная цена согласована",done:false},{id:"company",label:"Карточка организации",done:true},{id:"signature",label:"Подписать итоговый комплект",done:false}],bidReference:null,submissionNote:null,submittedBy:null,
    roles:[{id:"a2000000-0000-4000-8000-000000000001",specialtyId:null,title:"Грузчик",count:20,volume:3600,billingUnit:"hour",targetClientRate:null,schedule:{},requirements:{},notes:null},{id:"a2000000-0000-4000-8000-000000000002",specialtyId:null,title:"Разнорабочий",count:15,volume:2700,billingUnit:"hour",targetClientRate:null,schedule:{},requirements:{},notes:null}].slice(0,Math.max(1,row.roleCount)),
    assignments:[{id:"a3000000-0000-4000-8000-000000000001",roleCode:"owner",userId:"10000000-0000-4000-8000-000000000002",user:"Илья Морозов"},{id:"a3000000-0000-4000-8000-000000000002",roleCode:"calculator",userId:"10000000-0000-4000-8000-000000000006",user:"Елена Котова"}],
    sourceDocuments:[{id:"a4000000-0000-4000-8000-000000000001",name:"Техническое задание.pdf",documentType:"technical_spec",sourceUrl:null,notes:null,createdAt:"07.09.2026 12:20",createdBy:"Илья Морозов"},{id:"a4000000-0000-4000-8000-000000000002",name:"Проект договора.docx",documentType:"contract",sourceUrl:null,notes:null,createdAt:"07.09.2026 12:21",createdBy:"Илья Морозов"}],
    requirements:[{id:"a5000000-0000-4000-8000-000000000001",name:"Устав",category:"corporate",required:true,status:"available",companyDocumentId:null,companyDocument:"Устав ООО «Оперис Персонал»",companyDocumentStatus:"active",companyDocumentExpiresAt:null,ownerUserId:null,owner:null,dueAt:null,notes:null},{id:"a5000000-0000-4000-8000-000000000002",name:"Справка об отсутствии задолженности",category:"tax",required:true,status:"prepare",companyDocumentId:null,companyDocument:null,companyDocumentStatus:null,companyDocumentExpiresAt:null,ownerUserId:"10000000-0000-4000-8000-000000000002",owner:"Илья Морозов",dueAt:"2026-09-12T12:00:00+03:00",notes:"Нужна свежая справка"}],
    comments:[{id:"a6000000-0000-4000-8000-000000000001",body:"В документации не нашёл гарантированный объём. Нужно запросить разъяснение.",createdAt:"09.09.2026 09:25",createdBy:"Илья Морозов",createdByUserId:"10000000-0000-4000-8000-000000000002"}],approvals:[],calculations:[]};
}

export async function getTender(actor:Actor,id:string):Promise<TenderDetail|null>{
  const summary=(await listTenders(actor)).find(row=>row.id===id);if(!summary)return null;
  if(actor.demo)return demoDetail(summary);
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [base]=await sql<Array<{conditions:Record<string,unknown>;submissionChecklist:Array<{id:string;label:string;done:boolean}>;bidReference:string|null;submissionNote:string|null;submittedBy:string|null}>>`
      SELECT conditions_json conditions,submission_checklist "submissionChecklist",bid_reference "bidReference",submission_note "submissionNote",su.display_name "submittedBy"
      FROM tenders t LEFT JOIN app_users su ON su.id=t.submitted_by_user_id WHERE t.id=${id}::uuid
    `;
    if(!base)return null;
    const [roles,assignments,sourceDocuments,requirements,comments,approvals,calculations]=await Promise.all([
      sql<TenderRole[]>`SELECT id,specialty_id "specialtyId",title,count_required count,volume,billing_unit "billingUnit",target_client_rate "targetClientRate",schedule_json schedule,requirements_json requirements,notes FROM tender_roles WHERE tender_id=${id}::uuid ORDER BY created_at`,
      sql<TenderAssignment[]>`SELECT ta.id,ta.role_code "roleCode",ta.user_id "userId",u.display_name "user" FROM tender_assignments ta JOIN app_users u ON u.id=ta.user_id WHERE ta.tender_id=${id}::uuid ORDER BY ta.role_code,u.display_name`,
      sql<TenderSourceDocument[]>`SELECT d.id,d.name,d.document_type "documentType",d.source_url "sourceUrl",d.notes,to_char(d.created_at,'DD.MM.YYYY HH24:MI') "createdAt",u.display_name "createdBy" FROM tender_source_documents d JOIN app_users u ON u.id=d.created_by_user_id WHERE d.tender_id=${id}::uuid ORDER BY d.created_at DESC`,
      sql<TenderRequirement[]>`SELECT dr.id,dr.name,dr.category,dr.required,dr.status,dr.company_document_id "companyDocumentId",cd.name "companyDocument",cd.status "companyDocumentStatus",cd.expires_at::text "companyDocumentExpiresAt",dr.owner_user_id "ownerUserId",u.display_name owner,dr.due_at::text "dueAt",dr.notes FROM tender_document_requirements dr LEFT JOIN company_documents cd ON cd.id=dr.company_document_id LEFT JOIN app_users u ON u.id=dr.owner_user_id WHERE dr.tender_id=${id}::uuid ORDER BY dr.required DESC,dr.created_at`,
      sql<TenderComment[]>`SELECT c.id,c.body,to_char(c.created_at,'DD.MM.YYYY HH24:MI') "createdAt",u.display_name "createdBy",c.created_by_user_id "createdByUserId" FROM comments c JOIN app_users u ON u.id=c.created_by_user_id WHERE c.entity_type='tender' AND c.entity_id=${id}::uuid ORDER BY c.created_at DESC`,
      sql<TenderApproval[]>`SELECT ai.id,ai.process_code "processCode",ai.status,to_char(ai.submitted_at,'DD.MM.YYYY HH24:MI') "requestedAt",ai.completed_at::text "completedAt",rq.display_name "requestedBy",ap.display_name approver,st.decision_comment "decisionComment" FROM approval_instances ai JOIN app_users rq ON rq.id=ai.requested_by_user_id LEFT JOIN approval_steps st ON st.approval_id=ai.id AND st.step_order=1 LEFT JOIN app_users ap ON ap.id=st.approver_user_id WHERE ai.subject_type='tender' AND ai.subject_id=${id}::uuid ORDER BY ai.submitted_at DESC`,
      sql<TenderCalculation[]>`SELECT calc.id,cs.id "scenarioId",tr.id "roleId",tr.title role,cs.name,cs.status,COALESCE((cs.result_snapshot->>'clientRateNet')::numeric,(cs.result_snapshot->>'clientRateHourly')::numeric,0) "clientRate",(cs.result_snapshot->>'clientRateGross')::numeric "clientRateGross",COALESCE((cs.result_snapshot->>'marginPct')::numeric,0) "marginPct",COALESCE(cs.result_snapshot->>'billingUnit','hour') "billingUnit",cm.name model FROM calculations calc JOIN calculation_scenarios cs ON cs.calculation_id=calc.id JOIN tender_roles tr ON tr.id=cs.tender_role_id JOIN calculation_models cm ON cm.id=cs.model_id WHERE calc.tender_id=${id}::uuid ORDER BY cs.created_at DESC`,
    ]);
    return {...summary,...base,roles,assignments,sourceDocuments,requirements,comments,approvals,calculations};
  });
}

export async function getTenderOptions(actor:Actor):Promise<TenderOptions>{
  if(actor.demo)return {clients:[],regions:[{id:MOW,name:"Москва и МО"}],specialties:[{id:"60000000-0000-4000-8000-000000000001",name:"Комплектовщик"},{id:"60000000-0000-4000-8000-000000000002",name:"Грузчик"}],members:[{userId:"10000000-0000-4000-8000-000000000002",membershipId:"50000000-0000-4000-8000-000000000002",name:"Илья Морозов",position:"Менеджер по продажам"},{userId:"10000000-0000-4000-8000-000000000006",membershipId:"50000000-0000-4000-8000-000000000006",name:"Елена Котова",position:"Экономист"}],legalEntities:[{id:"31000000-0000-4000-8000-000000000001",name:"ООО «Оперис Персонал»"}],companyDocuments:[{id:"b1000000-0000-4000-8000-000000000001",name:"Устав ООО «Оперис Персонал»",status:"active",expiresAt:null,legalEntityId:"31000000-0000-4000-8000-000000000001"}]};
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const [clients,regions,specialties,members,legalEntities,companyDocuments]=await Promise.all([
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM client_companies WHERE status<>'archived' ORDER BY name`,
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM regions ORDER BY name`,
      sql<Array<{id:string;name:string}>>`SELECT id,name FROM specialties WHERE active ORDER BY name`,
      sql<Array<{userId:string;membershipId:string;name:string;position:string|null}>>`SELECT m.user_id "userId",m.id "membershipId",u.display_name name,p.name position FROM organization_memberships m JOIN app_users u ON u.id=m.user_id LEFT JOIN positions p ON p.id=m.position_id WHERE m.status='active' ORDER BY u.display_name`,
      sql<Array<{id:string;name:string}>>`SELECT id,COALESCE(short_name,name) name FROM legal_entities ORDER BY is_primary DESC,name`,
      sql<Array<{id:string;name:string;status:string;expiresAt:string|null;legalEntityId:string|null}>>`SELECT id,name,status,expires_at::text "expiresAt",legal_entity_id "legalEntityId" FROM company_documents WHERE status<>'archived' ORDER BY name`,
    ]);return {clients,regions,specialties,members,legalEntities,companyDocuments};
  });
}
