import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { tenderDeadlineState } from "./model";
import { listTenders, type TenderRow } from "./service";
import { userTenderSamples } from "./demo-user-samples";
import { calculateTenderPeriod } from "./analytics-calculation.mjs";

export type TenderAnalyticsUnit="tenders"|"value"|"headcount";
export type TenderAnalyticsFilters={
  from:string;to:string;compareFrom:string;compareTo:string;
  platform:string|null;customer:string|null;ownerId:string|null;regionId:string|null;source:string|null;specialtyId:string|null;
  decision:string|null;result:string|null;priority:string|null;deadline:string|null;
};
export type TenderAnalyticsStage={
  code:string;label:string;tenders:number;value:number;headcount:number;
  shareTenders:number|null;shareValue:number|null;shareHeadcount:number|null;
  conversionTenders:number|null;conversionValue:number|null;conversionHeadcount:number|null;
  notAdvancedTenders:number;notAdvancedValue:number;notAdvancedHeadcount:number;
  notAdvancedRate:number|null;notAdvancedValueRate:number|null;notAdvancedHeadcountRate:number|null;
  pendingTenders?:number;lostTenders?:number;tenderIds?:string[];
  avgHours:number|null;
};
export type TenderAnalyticsMetrics={
  activeTenders:number;participating:number;deadline3d:number;submittedActive:number;awaitingResult:number;attention:number;
  newTenders:number;incomingValue:number;incomingHeadcount:number;
  submittedTenders:number;submittedValue:number;submittedHeadcount:number;
  wonTenders:number;wonValue:number;wonHeadcount:number;
  winRateTenders:number|null;winRateValue:number|null;winRateHeadcount:number|null;
  avgDecisionHours:number|null;avgCycleDays:number|null;avgSubmissionLeadHours:number|null;
  blockerTenders:number;unassigned:number;noBidCount:number;lostCount:number;
};
export type TenderAnalyticsDaily={
  date:string;label:string;
  newTenders:number;newValue:number;newHeadcount:number;
  participateTenders:number;participateValue:number;participateHeadcount:number;
  submittedTenders:number;submittedValue:number;submittedHeadcount:number;
  wonTenders:number;wonValue:number;wonHeadcount:number;
  lostTenders:number;lostValue:number;lostHeadcount:number;
  winRateTenders:number|null;winRateValue:number|null;winRateHeadcount:number|null;
};
export type TenderAnalyticsBreakdownRow={
  key:string;label:string;tenders:number;value:number;headcount:number;
  submitted:number;submittedValue:number;submittedHeadcount:number;
  won:number;wonValue:number;wonHeadcount:number;
  resolved:number;resolvedValue:number;resolvedHeadcount:number;
  winRateTenders:number|null;winRateValue:number|null;winRateHeadcount:number|null;
};
export type TenderAnalyticsReasonRow={code:string;label:string;tenders:number;value:number;headcount:number};
export type TenderDeadlineRiskRow={key:"today"|"3d"|"7d";label:string;tenders:number;notReady:number};
export type TenderDocumentAnalytics={
  required:number;ready:number;blockers:number;tendersWithBlockers:number;readinessPct:number|null;
  topCategories:Array<{category:string;count:number}>;
};
export type TenderAnalyticsData={
  filters:TenderAnalyticsFilters;stages:TenderAnalyticsStage[];metrics:TenderAnalyticsMetrics;comparison:TenderAnalyticsMetrics;
  daily:TenderAnalyticsDaily[];comparisonDaily:TenderAnalyticsDaily[];
  breakdowns:{platforms:TenderAnalyticsBreakdownRow[];customers:TenderAnalyticsBreakdownRow[];owners:TenderAnalyticsBreakdownRow[]};
  noBidReasons:TenderAnalyticsReasonRow[];lossReasons:TenderAnalyticsReasonRow[];
  deadlineRisk:TenderDeadlineRiskRow[];documents:TenderDocumentAnalytics;
  history?:{demo:boolean;cohortWithoutHistory:number;headcountAvailable:boolean;budgetAvailable?:boolean;uncertainHistoryCount?:number};
};

export type AnalyticsTender={
  id:string;organizationId:string;clientId:string|null;customer:string;platform:string|null;sourceName:string|null;
  ownerUserId:string|null;owner:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;priority:string;
  rawStage:string;decision:string;result:string|null;noBidReasonCode:string|null;resultReasonCode:string|null;
  initialPrice:number|null;headcount:number|null;specialtyIds:string[];submissionDeadline:string|null;submittedAt:string|null;
  nextActionText:string|null;blockerCount:number;requirementCount:number;readyRequirementCount:number;createdAt:string;updatedAt:string;
};
export type StageEvent={tenderId:string;toStage:string;createdAt:string;historicalSnapshot?:boolean};
export type DecisionEvent={tenderId:string;toDecision:string;reasonCode:string|null;createdAt:string;historicalSnapshot?:boolean};
export type ResultEvent={tenderId:string;toResult:string;reasonCode:string|null;createdAt:string;historicalSnapshot?:boolean};

const activeStages=new Set(["new","analysis","clarification","calculation","approval","preparation","submitted","awaiting_result"]);

function isoDay(date:Date){return date.toISOString().slice(0,10)}
function parseDay(value:string){return new Date(`${value}T00:00:00.000Z`)}
function addDays(value:string,days:number){const date=parseDay(value);date.setUTCDate(date.getUTCDate()+days);return isoDay(date)}
function validDay(value:string|undefined){return Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(parseDay(value).getTime()))}
function numeric(value:number|string|null|undefined){if(value==null)return 0;const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function deadlineMatches(row:AnalyticsTender,deadline:string|null,now:Date){
  if(!deadline)return true;
  const state=tenderDeadlineState(row.submissionDeadline,now);
  if(deadline==="overdue")return state.key==="overdue";
  if(deadline==="today")return ["overdue","today"].includes(state.key);
  if(deadline==="3d")return ["overdue","today","urgent"].includes(state.key);
  if(deadline==="7d")return state.days!=null&&state.days<=7;
  return true;
}
function matchesFilters(row:AnalyticsTender,filters:TenderAnalyticsFilters,now:Date){
  if(filters.platform&&row.platform!==filters.platform)return false;
  if(filters.customer&&row.customer!==filters.customer)return false;
  if(filters.ownerId&&row.ownerUserId!==filters.ownerId)return false;
  if(filters.regionId&&row.regionId!==filters.regionId)return false;
  if(filters.source&&row.sourceName!==filters.source)return false;
  if(filters.specialtyId&&!row.specialtyIds.includes(filters.specialtyId))return false;
  if(filters.decision&&row.decision!==filters.decision)return false;
  if(filters.result&&row.result!==filters.result)return false;
  if(filters.priority&&row.priority!==filters.priority)return false;
  return deadlineMatches(row,filters.deadline,now);
}

export function defaultTenderAnalyticsFilters(now=new Date()):TenderAnalyticsFilters{
  const to=isoDay(now),from=addDays(to,-29),compareTo=addDays(from,-1),compareFrom=addDays(compareTo,-29);
  return {from,to,compareFrom,compareTo,platform:null,customer:null,ownerId:null,regionId:null,source:null,specialtyId:null,decision:null,result:null,priority:null,deadline:null};
}
export function normalizeTenderAnalyticsFilters(input:Partial<Record<"from"|"to"|"platform"|"customer"|"owner"|"region"|"source"|"specialty"|"decision"|"result"|"priority"|"deadline",string|undefined>>):TenderAnalyticsFilters{
  const defaults=defaultTenderAnalyticsFilters();
  let from=validDay(input.from)?input.from!:defaults.from,to=validDay(input.to)?input.to!:defaults.to;
  if(parseDay(from)>parseDay(to))[from,to]=[to,from];
  const span=Math.max(0,Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000));
  const compareTo=addDays(from,-1),compareFrom=addDays(compareTo,-span);
  return {from,to,compareFrom,compareTo,platform:input.platform||null,customer:input.customer||null,ownerId:input.owner||null,regionId:input.region||null,source:input.source||null,specialtyId:input.specialty||null,decision:input.decision||null,result:input.result||null,priority:input.priority||null,deadline:input.deadline||null};
}

export type PeriodResult={
  stages:TenderAnalyticsStage[];metrics:TenderAnalyticsMetrics;daily:TenderAnalyticsDaily[];
  breakdowns:{platforms:TenderAnalyticsBreakdownRow[];customers:TenderAnalyticsBreakdownRow[];owners:TenderAnalyticsBreakdownRow[]};
  cohortWithoutHistory:number;uncertainHistoryCount:number;
  noBidMap:Map<string,{tenders:number;value:number;headcount:number}>;
  lossMap:Map<string,{tenders:number;value:number;headcount:number}>;
};

function buildPeriodAnalytics(
  rows:AnalyticsTender[],
  stageHistory:StageEvent[],
  decisionHistory:DecisionEvent[],
  resultHistory:ResultEvent[],
  from:string,to:string,
  snapshotRows:AnalyticsTender[],
  now:Date,
):PeriodResult{
  const result=calculateTenderPeriod(rows,stageHistory,decisionHistory,resultHistory,from,to);
  const snapshot=snapshotRows.filter(row=>activeStages.has(row.rawStage));
  Object.assign(result.metrics,{
    activeTenders:snapshot.length,participating:snapshot.filter(row=>row.decision==="participate").length,
    deadline3d:snapshot.filter(row=>["overdue","today","urgent"].includes(tenderDeadlineState(row.submissionDeadline,now).key)).length,
    submittedActive:snapshot.filter(row=>["submitted","awaiting_result"].includes(row.rawStage)).length,
    awaitingResult:snapshot.filter(row=>row.rawStage==="awaiting_result").length,
    attention:snapshot.filter(row=>needsAttention(row,now)).length,
    blockerTenders:snapshot.filter(row=>row.blockerCount>0).length,unassigned:snapshot.filter(row=>!row.ownerUserId).length,
  });
  return result;
}

function needsAttention(row:AnalyticsTender,now:Date){
  const deadline=tenderDeadlineState(row.submissionDeadline,now);
  if(!row.ownerUserId||!row.nextActionText)return true;
  if(now.getTime()-new Date(row.updatedAt).getTime()>=7*86400000)return true;
  if(["overdue","today","urgent"].includes(deadline.key)&&row.decision==="undecided")return true;
  if(["overdue","today","urgent"].includes(deadline.key)&&row.blockerCount>0)return true;
  if(["overdue","today"].includes(deadline.key)&&!["submitted","awaiting_result"].includes(row.rawStage))return true;
  return false;
}

function buildDeadlineRisk(rows:AnalyticsTender[],now:Date):TenderDeadlineRiskRow[]{
  const buckets=[
    {key:"today" as const,label:"Сегодня / просрочено",match:(row:AnalyticsTender)=>["overdue","today"].includes(tenderDeadlineState(row.submissionDeadline,now).key)},
    {key:"3d" as const,label:"До 3 дней",match:(row:AnalyticsTender)=>["overdue","today","urgent"].includes(tenderDeadlineState(row.submissionDeadline,now).key)},
    {key:"7d" as const,label:"До 7 дней",match:(row:AnalyticsTender)=>{const days=tenderDeadlineState(row.submissionDeadline,now).days;return days!=null&&days<=7}},
  ];
  return buckets.map(bucket=>{const selected=rows.filter(bucket.match);return {key:bucket.key,label:bucket.label,tenders:selected.length,notReady:selected.filter(row=>!["submitted","awaiting_result"].includes(row.rawStage)||row.blockerCount>0||row.decision!=="participate").length}});
}

function demoRowToAnalytics(row:TenderRow):AnalyticsTender{
  return {id:row.id,organizationId:row.organizationId,clientId:row.clientId,customer:row.customer,platform:row.platform,sourceName:row.sourceName,ownerUserId:row.ownerUserId,owner:row.owner,createdByUserId:row.createdByUserId,teamId:row.teamId,regionId:row.regionId,priority:row.priority,rawStage:row.stage,decision:row.decision,result:row.result,noBidReasonCode:row.noBidReasonCode,resultReasonCode:row.resultReasonCode,initialPrice:row.initialPrice==null?null:numeric(row.initialPrice),headcount:null,specialtyIds:[],submissionDeadline:row.submissionDeadline,submittedAt:row.submittedAt,nextActionText:row.nextActionText,blockerCount:row.blockerCount,requirementCount:row.requirementCount,readyRequirementCount:row.readyRequirementCount,createdAt:row.createdAt,updatedAt:row.updatedAt};
}

async function demoAnalytics(actor:Actor,filters:TenderAnalyticsFilters):Promise<TenderAnalyticsData>{
  const base=[...new Map([...userTenderSamples,...await listTenders(actor)].filter(row=>canReadRow(actor.access,"sales.tender.read",row,actor)).map(row=>[row.id,row])).values()].map(demoRowToAnalytics);
  const now=new Date();
  const filtered=base.filter(row=>matchesFilters(row,filters,now));
  const current=buildPeriodAnalytics(filtered,[],[],[],filters.from,filters.to,filtered,now);
  const previous=buildPeriodAnalytics(filtered,[],[],[],filters.compareFrom,filters.compareTo,filtered,now);
  const noBidLabels:Record<string,string>={economics:"Низкая маржинальность / не проходит экономика",deadline:"Не успеваем подготовить заявку",staffing:"Нет нужного персонала / ресурсов",other:"Другое"};
  const lossLabels:Record<string,string>={price:"Цена",score:"Проиграли по баллам / критериям",competitor:"Выбран другой участник",other:"Другое"};
  const active=filtered.filter(row=>activeStages.has(row.rawStage));
  const documents:TenderDocumentAnalytics={required:active.reduce((sum,row)=>sum+row.requirementCount,0),ready:active.reduce((sum,row)=>sum+row.readyRequirementCount,0),blockers:active.reduce((sum,row)=>sum+row.blockerCount,0),tendersWithBlockers:active.filter(row=>row.blockerCount>0).length,readinessPct:active.reduce((sum,row)=>sum+row.requirementCount,0)?Math.round(active.reduce((sum,row)=>sum+row.readyRequirementCount,0)/active.reduce((sum,row)=>sum+row.requirementCount,0)*100):null,topCategories:[]};
  return {filters,history:{demo:true,cohortWithoutHistory:current.cohortWithoutHistory,headcountAvailable:false,budgetAvailable:filtered.some(row=>row.initialPrice!=null)},stages:current.stages,metrics:current.metrics,comparison:previous.metrics,daily:current.daily,comparisonDaily:previous.daily,breakdowns:current.breakdowns,noBidReasons:[...current.noBidMap.entries()].map(([code,value])=>({code,label:noBidLabels[code]??(code==="unknown"?"Причина не указана":"Причина недоступна"),...value})),lossReasons:[...current.lossMap.entries()].map(([code,value])=>({code,label:lossLabels[code]??(code==="unknown"?"Причина не указана":"Причина недоступна"),...value})),deadlineRisk:buildDeadlineRisk(active,now),documents};
}

export async function getTenderAnalytics(actor:Actor,filters:TenderAnalyticsFilters):Promise<TenderAnalyticsData>{
  requireCapability(actor,"sales.tender.read");
  if(actor.demo)return demoAnalytics(actor,filters);
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const now=new Date(),latest=[filters.to,filters.compareTo].sort().at(-1)!;
    const periodRows=await sql<AnalyticsTender[]>`
      SELECT t.id,t.organization_id "organizationId",t.client_company_id "clientId",COALESCE(c.name,t.customer_name,'Заказчик не указан') customer,
        t.platform,t.source_name "sourceName",t.owner_user_id "ownerUserId",u.display_name owner,t.created_by_user_id "createdByUserId",
        t.assigned_team_id "teamId",t.region_id "regionId",t.priority,t.stage "rawStage",t.decision,t.result,t.no_bid_reason_code "noBidReasonCode",
        t.result_reason_code "resultReasonCode",t.initial_price::float8 "initialPrice",
        (SELECT CASE WHEN count(*)=count(tr.count_required) THEN sum(tr.count_required)::int ELSE NULL END FROM tender_roles tr WHERE tr.tender_id=t.id) headcount,
        COALESCE((SELECT array_agg(DISTINCT tr.specialty_id::text) FILTER (WHERE tr.specialty_id IS NOT NULL) FROM tender_roles tr WHERE tr.tender_id=t.id),'{}'::text[]) "specialtyIds",
        t.submission_deadline::text "submissionDeadline",t.submitted_at::text "submittedAt",t.next_action_text "nextActionText",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required AND dr.status IN ('prepare','update_needed','requested')) "blockerCount",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required) "requirementCount",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required AND dr.status IN ('available','ready','not_required')) "readyRequirementCount",
        t.created_at::text "createdAt",t.updated_at::text "updatedAt"
      FROM tenders t LEFT JOIN client_companies c ON c.id=t.client_company_id LEFT JOIN app_users u ON u.id=t.owner_user_id
      WHERE t.created_at<(${latest}::date+INTERVAL '1 day') AND t.archived_at IS NULL
    `;
    const snapshotRows=await sql<AnalyticsTender[]>`
      SELECT t.id,t.organization_id "organizationId",t.client_company_id "clientId",COALESCE(c.name,t.customer_name,'Заказчик не указан') customer,
        t.platform,t.source_name "sourceName",t.owner_user_id "ownerUserId",u.display_name owner,t.created_by_user_id "createdByUserId",
        t.assigned_team_id "teamId",t.region_id "regionId",t.priority,t.stage "rawStage",t.decision,t.result,t.no_bid_reason_code "noBidReasonCode",
        t.result_reason_code "resultReasonCode",t.initial_price::float8 "initialPrice",
        (SELECT CASE WHEN count(*)=count(tr.count_required) THEN sum(tr.count_required)::int ELSE NULL END FROM tender_roles tr WHERE tr.tender_id=t.id) headcount,
        COALESCE((SELECT array_agg(DISTINCT tr.specialty_id::text) FILTER (WHERE tr.specialty_id IS NOT NULL) FROM tender_roles tr WHERE tr.tender_id=t.id),'{}'::text[]) "specialtyIds",
        t.submission_deadline::text "submissionDeadline",t.submitted_at::text "submittedAt",t.next_action_text "nextActionText",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required AND dr.status IN ('prepare','update_needed','requested')) "blockerCount",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required) "requirementCount",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required AND dr.status IN ('available','ready','not_required')) "readyRequirementCount",
        t.created_at::text "createdAt",t.updated_at::text "updatedAt"
      FROM tenders t LEFT JOIN client_companies c ON c.id=t.client_company_id LEFT JOIN app_users u ON u.id=t.owner_user_id
      WHERE t.archived_at IS NULL
    `;
    const accessible=periodRows.filter(row=>canReadRow(actor.access,"sales.tender.read",row,actor)).filter(row=>matchesFilters(row,filters,now));
    const snapshot=snapshotRows.filter(row=>canReadRow(actor.access,"sales.tender.read",row,actor)).filter(row=>matchesFilters(row,filters,now));
    const ids=accessible.map(row=>row.id);
    const [stageHistory,decisionHistory,resultHistory]=ids.length?await Promise.all([
      sql<StageEvent[]>`SELECT tender_id "tenderId",to_stage "toStage",created_at::text "createdAt",changed_by_user_id IS NULL "historicalSnapshot" FROM tender_stage_history WHERE tender_id=ANY(${ids}::uuid[]) AND created_at<(${latest}::date+INTERVAL '1 day') ORDER BY tender_id,created_at`,
      sql<DecisionEvent[]>`SELECT tender_id "tenderId",to_decision "toDecision",reason_code "reasonCode",created_at::text "createdAt",changed_by_user_id IS NULL "historicalSnapshot" FROM tender_decision_history WHERE tender_id=ANY(${ids}::uuid[]) AND created_at<(${latest}::date+INTERVAL '1 day') ORDER BY tender_id,created_at`,
      sql<ResultEvent[]>`SELECT tender_id "tenderId",to_result "toResult",reason_code "reasonCode",created_at::text "createdAt",changed_by_user_id IS NULL "historicalSnapshot" FROM tender_result_history WHERE tender_id=ANY(${ids}::uuid[]) AND created_at<(${latest}::date+INTERVAL '1 day') ORDER BY tender_id,created_at`,
    ]):[[],[],[]];
    const current=buildPeriodAnalytics(accessible,stageHistory,decisionHistory,resultHistory,filters.from,filters.to,snapshot,now);
    const previous=buildPeriodAnalytics(accessible,stageHistory,decisionHistory,resultHistory,filters.compareFrom,filters.compareTo,snapshot,now);

    const reasonCodes=[...new Set([...current.noBidMap.keys(),...current.lossMap.keys()])];
    const reasonRows=reasonCodes.length?await sql<Array<{kind:string;code:string;label:string}>>`
      SELECT kind,code,name label FROM tender_reason_catalog WHERE code=ANY(${reasonCodes}::text[]) AND active
    `:[];
    const reasonLabel=new Map(reasonRows.map(row=>[`${row.kind}:${row.code}`,row.label]));

    const activeSnapshot=snapshot.filter(row=>activeStages.has(row.rawStage));
    const snapshotIds=activeSnapshot.map(row=>row.id);
    const categoryRows=snapshotIds.length?await sql<Array<{category:string;count:number}>>`
      SELECT category,count(*)::int count
      FROM tender_document_requirements
      WHERE tender_id=ANY(${snapshotIds}::uuid[]) AND required AND status IN ('prepare','update_needed','requested')
      GROUP BY category ORDER BY count DESC,category LIMIT 6
    `:[];
    const required=activeSnapshot.reduce((sum,row)=>sum+row.requirementCount,0),ready=activeSnapshot.reduce((sum,row)=>sum+row.readyRequirementCount,0);
    const documents:TenderDocumentAnalytics={required,ready,blockers:activeSnapshot.reduce((sum,row)=>sum+row.blockerCount,0),tendersWithBlockers:activeSnapshot.filter(row=>row.blockerCount>0).length,readinessPct:required?Math.round(ready/required*100):null,topCategories:categoryRows};
    return {filters,history:{demo:false,cohortWithoutHistory:current.cohortWithoutHistory,headcountAvailable:accessible.some(row=>row.headcount!=null),budgetAvailable:accessible.some(row=>row.initialPrice!=null),uncertainHistoryCount:current.uncertainHistoryCount},stages:current.stages,metrics:current.metrics,comparison:previous.metrics,daily:current.daily,comparisonDaily:previous.daily,breakdowns:current.breakdowns,noBidReasons:[...current.noBidMap.entries()].map(([code,value])=>({code,label:reasonLabel.get(`no_bid:${code}`)??(code==="unknown"?"Причина не указана":"Причина недоступна"),...value})).sort((a,b)=>b.tenders-a.tenders),lossReasons:[...current.lossMap.entries()].map(([code,value])=>({code,label:reasonLabel.get(`lost:${code}`)??(code==="unknown"?"Причина не указана":"Причина недоступна"),...value})).sort((a,b)=>b.tenders-a.tenders),deadlineRisk:buildDeadlineRisk(activeSnapshot,now),documents};
  });
}
