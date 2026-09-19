import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";
import { defaultRequestStages, type RequestStageDefinition } from "./request-workflow";

export type RequestAnalyticsFilters={
  from:string;to:string;compareFrom:string;compareTo:string;
  clientId:string|null;ownerId:string|null;regionId:string|null;source:string|null;specialtyId:string|null;
};
export type RequestAnalyticsStage={
  code:string;label:string;requests:number;headcount:number;shareRequests:number;shareHeadcount:number;
  conversionRequests:number;conversionHeadcount:number;notAdvancedRequests:number;notAdvancedHeadcount:number;notAdvancedRate:number;notAdvancedHeadcountRate:number;avgHours:number|null;
};
export type RequestAnalyticsMetrics={
  newRequests:number;newHeadcount:number;agreedRequests:number;agreedHeadcount:number;conversionRequests:number;conversionHeadcount:number;
  avgCycleDays:number|null;avgTimeToProposalDays:number|null;lostRequests:number;lostHeadcount:number;
  activeRequests:number;activeHeadcount:number;proposalClient:number;negotiation:number;attention:number;unassigned:number;
};
export type RequestAnalyticsDaily={
  date:string;label:string;newRequests:number;newHeadcount:number;proposalRequests:number;proposalHeadcount:number;
  agreedRequests:number;agreedHeadcount:number;conversionRequests:number;conversionHeadcount:number;
};
export type RequestAnalyticsBreakdownRow={
  key:string;label:string;requests:number;headcount:number;agreed:number;agreedHeadcount:number;conversion:number;headcountConversion:number;avgCycleDays:number|null;
};
export type RequestAnalyticsLossReason={code:string;label:string;requests:number;headcount:number};
export type RequestAnalyticsData={
  filters:RequestAnalyticsFilters;stages:RequestAnalyticsStage[];metrics:RequestAnalyticsMetrics;comparison:RequestAnalyticsMetrics;
  daily:RequestAnalyticsDaily[];comparisonDaily:RequestAnalyticsDaily[];
  breakdowns:{clients:RequestAnalyticsBreakdownRow[];owners:RequestAnalyticsBreakdownRow[];sources:RequestAnalyticsBreakdownRow[]};
  lossReasons:RequestAnalyticsLossReason[];
};

type AnalyticsRequest={
  id:string;organizationId:string;clientId:string|null;client:string;ownerUserId:string|null;owner:string|null;regionId:string|null;
  source:string|null;createdByUserId:string;rawStage:string;lossReasonCode:string|null;headcount:number;specialtyIds:string[];
  createdAt:string;updatedAt:string;firstProposalAt:string|null;acceptedAt:string|null;
};
type StageEvent={requestId:string;toStageCode:string;createdAt:string};

function isoDay(date:Date){return date.toISOString().slice(0,10)}
function parseDay(value:string){return new Date(`${value}T00:00:00.000Z`)}
function endOfDay(value:string){return new Date(`${value}T23:59:59.999Z`)}
function addDays(value:string,days:number){const date=parseDay(value);date.setUTCDate(date.getUTCDate()+days);return isoDay(date)}
function validDay(value:string|undefined){return Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(parseDay(value).getTime()))}
function average(values:number[]){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null}

export function defaultRequestAnalyticsFilters(now=new Date()):RequestAnalyticsFilters{
  const to=isoDay(now),from=addDays(to,-29),compareTo=addDays(from,-1),compareFrom=addDays(compareTo,-29);
  return {from,to,compareFrom,compareTo,clientId:null,ownerId:null,regionId:null,source:null,specialtyId:null};
}
export function normalizeRequestAnalyticsFilters(input:Partial<Record<"from"|"to"|"client"|"owner"|"region"|"source"|"specialty",string|undefined>>):RequestAnalyticsFilters{
  const defaults=defaultRequestAnalyticsFilters();
  let from=validDay(input.from)?input.from!:defaults.from,to=validDay(input.to)?input.to!:defaults.to;
  if(parseDay(from)>parseDay(to))[from,to]=[to,from];
  const span=Math.max(0,Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000));
  const compareTo=addDays(from,-1),compareFrom=addDays(compareTo,-span);
  return {from,to,compareFrom,compareTo,clientId:input.client||null,ownerId:input.owner||null,regionId:input.region||null,source:input.source||null,specialtyId:input.specialty||null};
}
function matchesFilters(row:AnalyticsRequest,filters:RequestAnalyticsFilters){
  if(filters.clientId&&row.clientId!==filters.clientId)return false;
  if(filters.ownerId&&row.ownerUserId!==filters.ownerId)return false;
  if(filters.regionId&&row.regionId!==filters.regionId)return false;
  if(filters.source&&row.source!==filters.source)return false;
  if(filters.specialtyId&&!row.specialtyIds.includes(filters.specialtyId))return false;
  return true;
}

type BreakdownAccumulator={label:string;requests:number;headcount:number;agreed:number;agreedHeadcount:number;cycle:number[]};
type PeriodResult={
  stages:RequestAnalyticsStage[];metrics:RequestAnalyticsMetrics;daily:RequestAnalyticsDaily[];
  breakdowns:{clients:RequestAnalyticsBreakdownRow[];owners:RequestAnalyticsBreakdownRow[];sources:RequestAnalyticsBreakdownRow[]};
  lossMap:Map<string,{requests:number;headcount:number}>;
};

function buildPeriodAnalytics(rows:AnalyticsRequest[],history:StageEvent[],from:string,to:string,stageDefinitions:RequestStageDefinition[],snapshotRows:AnalyticsRequest[]):PeriodResult{
  const start=parseDay(from).getTime(),end=endOfDay(to).getTime();
  const stageOrder=stageDefinitions.filter(stage=>stage.terminalKind!=="not_agreed").sort((a,b)=>a.sortOrder-b.sortOrder);
  const stageCodes=stageOrder.map(stage=>stage.code);
  const rank=new Map<string,number>(stageCodes.map((code,index)=>[code,index]));
  const agreedCode=stageOrder.find(stage=>stage.terminalKind==="agreed")?.code??"agreed";
  const agreedRank=rank.get(agreedCode)??Math.max(0,stageCodes.length-1);
  const cohort=rows.filter(row=>{const time=new Date(row.createdAt).getTime();return time>=start&&time<=end});
  const eventsByRequest=new Map<string,StageEvent[]>();
  for(const event of history){
    if(new Date(event.createdAt).getTime()>end)continue;
    const list=eventsByRequest.get(event.requestId)??[];list.push(event);eventsByRequest.set(event.requestId,list);
  }
  for(const list of eventsByRequest.values())list.sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());

  const reachedRequests=new Map<string,number>(stageCodes.map(code=>[code,0]));
  const reachedHeadcount=new Map<string,number>(stageCodes.map(code=>[code,0]));
  const durations=new Map<string,number[]>(stageCodes.map(code=>[code,[]]));
  const cycleDays:number[]=[],proposalDays:number[]=[];
  const dailyMap=new Map<string,{newRequests:number;newHeadcount:number;proposalRequests:number;proposalHeadcount:number;agreedRequests:number;agreedHeadcount:number}>();
  const outcomes=new Map<string,{agreed:boolean;lost:boolean}>();
  const lossMap=new Map<string,{requests:number;headcount:number}>();
  const clientMap=new Map<string,BreakdownAccumulator>(),ownerMap=new Map<string,BreakdownAccumulator>(),sourceMap=new Map<string,BreakdownAccumulator>();

  for(const row of cohort){
    const createdTime=new Date(row.createdAt).getTime(),firstReached=new Map<string,number>();
    const entryStage=stageCodes[0]??"new";firstReached.set(entryStage,createdTime);
    let maxRank=0,asOfStage=entryStage;
    for(const event of eventsByRequest.get(row.id)??[]){
      const eventTime=new Date(event.createdAt).getTime(),eventRank=rank.get(event.toStageCode);
      if(eventRank!=null){maxRank=Math.max(maxRank,eventRank);if(!firstReached.has(event.toStageCode))firstReached.set(event.toStageCode,eventTime)}
      asOfStage=event.toStageCode;
    }
    const updatedTime=new Date(row.updatedAt).getTime();
    if(updatedTime<=end){
      if(rank.has(row.rawStage)){const currentRank=rank.get(row.rawStage)!;maxRank=Math.max(maxRank,currentRank);if(!firstReached.has(row.rawStage))firstReached.set(row.rawStage,updatedTime);asOfStage=row.rawStage}
      else if(row.rawStage==="not_agreed")asOfStage="not_agreed";
    }
    stageCodes.forEach((code,index)=>{if(maxRank>=index){reachedRequests.set(code,(reachedRequests.get(code)??0)+1);reachedHeadcount.set(code,(reachedHeadcount.get(code)??0)+row.headcount)}});
    for(let index=0;index<stageCodes.length-1;index++){
      const code=stageCodes[index],next=stageCodes[index+1],entered=firstReached.get(code),advanced=firstReached.get(next);
      if(entered!=null&&advanced!=null&&advanced>=entered)durations.get(code)!.push((advanced-entered)/3600000);
    }
    const acceptedFallback=row.acceptedAt?new Date(row.acceptedAt).getTime():null;
    const agreedAt=firstReached.get(agreedCode)??(acceptedFallback!=null&&acceptedFallback<=end?acceptedFallback:null);
    const agreed=agreedAt!=null||maxRank>=agreedRank||asOfStage===agreedCode,lost=asOfStage==="not_agreed";
    outcomes.set(row.id,{agreed,lost});
    if(agreedAt!=null&&agreedAt>=createdTime)cycleDays.push((agreedAt-createdTime)/86400000);
    if(row.firstProposalAt){const sentTime=new Date(row.firstProposalAt).getTime();if(sentTime<=end&&sentTime>=createdTime)proposalDays.push((sentTime-createdTime)/86400000)}
    if(lost&&row.lossReasonCode){const item=lossMap.get(row.lossReasonCode)??{requests:0,headcount:0};item.requests++;item.headcount+=row.headcount;lossMap.set(row.lossReasonCode,item)}

    const createdDay=isoDay(new Date(createdTime)),createdPoint=dailyMap.get(createdDay)??{newRequests:0,newHeadcount:0,proposalRequests:0,proposalHeadcount:0,agreedRequests:0,agreedHeadcount:0};
    createdPoint.newRequests++;createdPoint.newHeadcount+=row.headcount;dailyMap.set(createdDay,createdPoint);
    if(row.firstProposalAt){
      const sentTime=new Date(row.firstProposalAt).getTime();
      if(sentTime>=start&&sentTime<=end){const day=isoDay(new Date(sentTime)),point=dailyMap.get(day)??{newRequests:0,newHeadcount:0,proposalRequests:0,proposalHeadcount:0,agreedRequests:0,agreedHeadcount:0};point.proposalRequests++;point.proposalHeadcount+=row.headcount;dailyMap.set(day,point)}
    }
    if(agreedAt!=null&&agreedAt>=start&&agreedAt<=end){const day=isoDay(new Date(agreedAt)),point=dailyMap.get(day)??{newRequests:0,newHeadcount:0,proposalRequests:0,proposalHeadcount:0,agreedRequests:0,agreedHeadcount:0};point.agreedRequests++;point.agreedHeadcount+=row.headcount;dailyMap.set(day,point)}

    const addBreak=(map:Map<string,BreakdownAccumulator>,key:string,label:string)=>{
      const item=map.get(key)??{label,requests:0,headcount:0,agreed:0,agreedHeadcount:0,cycle:[]};
      item.requests++;item.headcount+=row.headcount;if(agreed){item.agreed++;item.agreedHeadcount+=row.headcount}
      if(agreedAt!=null&&agreedAt>=createdTime)item.cycle.push((agreedAt-createdTime)/86400000);map.set(key,item);
    };
    addBreak(clientMap,row.clientId??"none",row.client||"Без клиента");
    addBreak(ownerMap,row.ownerUserId??"none",row.owner||"Без ответственного");
    addBreak(sourceMap,row.source??"none",row.source||"Источник не указан");
  }

  const totalRequests=cohort.length,totalHeadcount=cohort.reduce((sum,row)=>sum+row.headcount,0);
  const agreedRows=cohort.filter(row=>outcomes.get(row.id)?.agreed),lostRows=cohort.filter(row=>outcomes.get(row.id)?.lost);
  const stages:RequestAnalyticsStage[]=stageOrder.map((stage,index)=>{
    const requests=reachedRequests.get(stage.code)??0,headcount=reachedHeadcount.get(stage.code)??0;
    const previousRequests=index===0?totalRequests:(reachedRequests.get(stageCodes[index-1])??0),previousHeadcount=index===0?totalHeadcount:(reachedHeadcount.get(stageCodes[index-1])??0);
    const nextRequests=index<stageOrder.length-1?(reachedRequests.get(stageCodes[index+1])??0):requests,nextHeadcount=index<stageOrder.length-1?(reachedHeadcount.get(stageCodes[index+1])??0):headcount;
    const notAdvancedRequests=index<stageOrder.length-1?Math.max(0,requests-nextRequests):0,notAdvancedHeadcount=index<stageOrder.length-1?Math.max(0,headcount-nextHeadcount):0;
    const values=durations.get(stage.code)??[];
    return {code:stage.code,label:stage.label,requests,headcount,shareRequests:totalRequests?Math.round(requests/totalRequests*100):0,shareHeadcount:totalHeadcount?Math.round(headcount/totalHeadcount*100):0,conversionRequests:index===0?100:(previousRequests?Math.round(requests/previousRequests*100):0),conversionHeadcount:index===0?100:(previousHeadcount?Math.round(headcount/previousHeadcount*100):0),notAdvancedRequests,notAdvancedHeadcount,notAdvancedRate:requests?Math.round(notAdvancedRequests/requests*100):0,notAdvancedHeadcountRate:headcount?Math.round(notAdvancedHeadcount/headcount*100):0,avgHours:values.length?Number((average(values)!).toFixed(1)):null};
  });

  const activeCodes=new Set(stageDefinitions.filter(stage=>stage.terminalKind==="active").map(stage=>stage.code));
  const snapshot=snapshotRows.filter(row=>activeCodes.has(row.rawStage));
  const attention=snapshot.filter(row=>!row.ownerUserId||(Date.now()-new Date(row.updatedAt).getTime())>=7*86400000).length;
  const metrics:RequestAnalyticsMetrics={
    newRequests:totalRequests,newHeadcount:totalHeadcount,
    agreedRequests:agreedRows.length,agreedHeadcount:agreedRows.reduce((sum,row)=>sum+row.headcount,0),
    conversionRequests:totalRequests?Math.round(agreedRows.length/totalRequests*100):0,
    conversionHeadcount:totalHeadcount?Math.round(agreedRows.reduce((sum,row)=>sum+row.headcount,0)/totalHeadcount*100):0,
    avgCycleDays:cycleDays.length?Number((average(cycleDays)!).toFixed(1)):null,
    avgTimeToProposalDays:proposalDays.length?Number((average(proposalDays)!).toFixed(1)):null,
    lostRequests:lostRows.length,lostHeadcount:lostRows.reduce((sum,row)=>sum+row.headcount,0),
    activeRequests:snapshot.length,activeHeadcount:snapshot.reduce((sum,row)=>sum+row.headcount,0),
    proposalClient:snapshot.filter(row=>row.rawStage==="proposal_client").length,negotiation:snapshot.filter(row=>row.rawStage==="negotiation").length,
    attention,unassigned:snapshot.filter(row=>!row.ownerUserId).length,
  };

  const daily:RequestAnalyticsDaily[]=[];let cursor=parseDay(from),cumNewReq=0,cumNewHead=0,cumAgreedReq=0,cumAgreedHead=0;const last=parseDay(to);
  while(cursor<=last){
    const date=isoDay(cursor),point=dailyMap.get(date)??{newRequests:0,newHeadcount:0,proposalRequests:0,proposalHeadcount:0,agreedRequests:0,agreedHeadcount:0};
    cumNewReq+=point.newRequests;cumNewHead+=point.newHeadcount;cumAgreedReq+=point.agreedRequests;cumAgreedHead+=point.agreedHeadcount;
    daily.push({date,label:new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"}).format(cursor),...point,conversionRequests:cumNewReq?Math.round(cumAgreedReq/cumNewReq*100):0,conversionHeadcount:cumNewHead?Math.round(cumAgreedHead/cumNewHead*100):0});
    cursor=new Date(cursor.getTime()+86400000);
  }
  const toBreakdown=(map:Map<string,BreakdownAccumulator>):RequestAnalyticsBreakdownRow[]=>[...map.entries()].map(([key,value])=>({key,label:value.label,requests:value.requests,headcount:value.headcount,agreed:value.agreed,agreedHeadcount:value.agreedHeadcount,conversion:value.requests?Math.round(value.agreed/value.requests*100):0,headcountConversion:value.headcount?Math.round(value.agreedHeadcount/value.headcount*100):0,avgCycleDays:value.cycle.length?Number((average(value.cycle)!).toFixed(1)):null})).sort((a,b)=>b.agreed-a.agreed||b.requests-a.requests);
  return {stages,metrics,daily,breakdowns:{clients:toBreakdown(clientMap),owners:toBreakdown(ownerMap),sources:toBreakdown(sourceMap)},lossMap};
}

function demoSpecialtyId(name:string){if(name==="Грузчик")return"60000000-0000-4000-8000-000000000002";if(name==="Сборщик мебели")return"60000000-0000-4000-8000-000000000003";return"60000000-0000-4000-8000-000000000001"}
function makeDemoRows(actor:Actor,from:string,to:string,comparison=false):{rows:AnalyticsRequest[];history:StageEvent[]}{
  const span=Math.max(1,Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000)+1),rows:AnalyticsRequest[]=[],history:StageEvent[]=[];
  const stageCodes=defaultRequestStages.filter(stage=>stage.terminalKind!=="not_agreed").sort((a,b)=>a.sortOrder-b.sortOrder).map(stage=>stage.code);
  for(let index=0;index<18;index++){
    const base=demo.requests[index%demo.requests.length],offset=(index*2)%span,created=addDays(to,-offset),maxRank=Math.max(0,Math.min(stageCodes.length-1,(index+(comparison?0:2))%stageCodes.length));
    const headcount=Math.max(3,base.roles.reduce((sum,role)=>sum+role.count,0)-index%5*2);
    const rawStage=stageCodes[maxRank]??"new",id=`demo-request-${comparison?"prev":"cur"}-${index}`;
    const acceptedAt=rawStage==="agreed"?`${addDays(created,Math.min(8,maxRank+2))}T15:00:00.000Z`:null;
    rows.push({id,organizationId:base.organizationId,clientId:base.clientId??null,client:base.client??"Без клиента",ownerUserId:base.ownerUserId??actor.userId,owner:actor.displayName,regionId:base.regionId??null,source:index%3===0?"public_form":"manual",createdByUserId:base.createdByUserId,rawStage,lossReasonCode:null,headcount,specialtyIds:base.roles.map(role=>demoSpecialtyId(role.name)),createdAt:`${created}T09:00:00.000Z`,updatedAt:`${addDays(created,Math.min(maxRank,6))}T16:00:00.000Z`,firstProposalAt:maxRank>=5?`${addDays(created,4)}T12:00:00.000Z`:null,acceptedAt});
    for(let stageIndex=0;stageIndex<=maxRank;stageIndex++)history.push({requestId:id,toStageCode:stageCodes[stageIndex],createdAt:`${addDays(created,stageIndex)}T10:00:00.000Z`});
  }
  return {rows,history};
}
function demoAnalytics(actor:Actor,filters:RequestAnalyticsFilters):RequestAnalyticsData{
  const currentDemo=makeDemoRows(actor,filters.from,filters.to,false),previousDemo=makeDemoRows(actor,filters.compareFrom,filters.compareTo,true);
  const currentRows=currentDemo.rows.filter(row=>matchesFilters(row,filters)),previousRows=previousDemo.rows.filter(row=>matchesFilters(row,filters));
  const current=buildPeriodAnalytics(currentRows,currentDemo.history,filters.from,filters.to,defaultRequestStages,currentRows);
  const previous=buildPeriodAnalytics(previousRows,previousDemo.history,filters.compareFrom,filters.compareTo,defaultRequestStages,previousRows);
  return {filters,stages:current.stages,metrics:current.metrics,comparison:previous.metrics,daily:current.daily,comparisonDaily:previous.daily,breakdowns:current.breakdowns,lossReasons:[]};
}

export async function getRequestAnalytics(actor:Actor,filters:RequestAnalyticsFilters):Promise<RequestAnalyticsData>{
  requireCapability(actor,"sales.request.read");
  if(actor.demo)return demoAnalytics(actor,filters);
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const earliest=[filters.from,filters.compareFrom].sort()[0],latest=[filters.to,filters.compareTo].sort().at(-1)!;
    const stages=await sql<RequestStageDefinition[]>`
      SELECT code,label,sort_order "sortOrder",color,active,terminal_kind "terminalKind"
      FROM request_stage_definitions WHERE active OR code IN ('new','agreed','not_agreed') ORDER BY sort_order,created_at
    `;
    const periodRows=await sql<AnalyticsRequest[]>`
      SELECT r.id,r.organization_id "organizationId",r.client_company_id "clientId",COALESCE(c.name,'Без клиента') client,
        r.owner_user_id "ownerUserId",owner.display_name owner,r.region_id "regionId",r.source,r.created_by_user_id "createdByUserId",
        COALESCE(r.workflow_stage_code,'new') "rawStage",r.loss_reason_code "lossReasonCode",
        COALESCE((SELECT sum(rr.count_required)::int FROM request_roles rr WHERE rr.request_id=r.id),0) headcount,
        COALESCE((SELECT array_agg(DISTINCT rr.specialty_id::text) FROM request_roles rr WHERE rr.request_id=r.id),'{}'::text[]) "specialtyIds",
        r.created_at::text "createdAt",r.updated_at::text "updatedAt",
        (SELECT min(p.sent_at)::text FROM proposals p WHERE p.request_id=r.id AND p.sent_at IS NOT NULL) "firstProposalAt",
        (SELECT min(p.accepted_at)::text FROM proposals p WHERE p.request_id=r.id AND p.accepted_at IS NOT NULL) "acceptedAt"
      FROM requests r LEFT JOIN client_companies c ON c.id=r.client_company_id LEFT JOIN app_users owner ON owner.id=r.owner_user_id
      WHERE r.created_at>=${earliest}::date AND r.created_at<(${latest}::date+INTERVAL '1 day')
    `;
    const snapshotRows=await sql<AnalyticsRequest[]>`
      SELECT r.id,r.organization_id "organizationId",r.client_company_id "clientId",COALESCE(c.name,'Без клиента') client,
        r.owner_user_id "ownerUserId",owner.display_name owner,r.region_id "regionId",r.source,r.created_by_user_id "createdByUserId",
        COALESCE(r.workflow_stage_code,'new') "rawStage",r.loss_reason_code "lossReasonCode",
        COALESCE((SELECT sum(rr.count_required)::int FROM request_roles rr WHERE rr.request_id=r.id),0) headcount,
        COALESCE((SELECT array_agg(DISTINCT rr.specialty_id::text) FROM request_roles rr WHERE rr.request_id=r.id),'{}'::text[]) "specialtyIds",
        r.created_at::text "createdAt",r.updated_at::text "updatedAt",
        (SELECT min(p.sent_at)::text FROM proposals p WHERE p.request_id=r.id AND p.sent_at IS NOT NULL) "firstProposalAt",
        (SELECT min(p.accepted_at)::text FROM proposals p WHERE p.request_id=r.id AND p.accepted_at IS NOT NULL) "acceptedAt"
      FROM requests r LEFT JOIN client_companies c ON c.id=r.client_company_id LEFT JOIN app_users owner ON owner.id=r.owner_user_id
      WHERE r.archived_at IS NULL
    `;
    const accessible=periodRows.filter(row=>canReadRow(actor.access,"sales.request.read",row,actor)).filter(row=>matchesFilters(row,filters));
    const snapshot=snapshotRows.filter(row=>canReadRow(actor.access,"sales.request.read",row,actor)).filter(row=>matchesFilters(row,filters));
    const ids=accessible.map(row=>row.id);
    const history=ids.length?await sql<StageEvent[]>`
      SELECT request_id "requestId",to_stage_code "toStageCode",created_at::text "createdAt"
      FROM request_stage_history WHERE request_id=ANY(${ids}::uuid[]) AND created_at<(${latest}::date+INTERVAL '1 day')
      ORDER BY request_id,created_at
    `:[];
    const current=buildPeriodAnalytics(accessible,history,filters.from,filters.to,stages,snapshot);
    const previous=buildPeriodAnalytics(accessible,history,filters.compareFrom,filters.compareTo,stages,snapshot);
    const reasonCodes=[...current.lossMap.keys()];
    const reasonRows=reasonCodes.length?await sql<Array<{code:string;label:string}>>`
      SELECT code,name label FROM request_loss_reasons WHERE code=ANY(${reasonCodes}::text[]) AND active
    `:[];
    const labels=new Map(reasonRows.map(row=>[row.code,row.label]));
    return {filters,stages:current.stages,metrics:current.metrics,comparison:previous.metrics,daily:current.daily,comparisonDaily:previous.daily,breakdowns:current.breakdowns,lossReasons:[...current.lossMap.entries()].map(([code,value])=>({code,label:labels.get(code)??code,requests:value.requests,headcount:value.headcount})).sort((a,b)=>b.requests-a.requests)};
  });
}
