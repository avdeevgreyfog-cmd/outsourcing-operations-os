import { requestSourceLabel, type RequestBoardRow, type RequestStageDefinition } from "./request-workflow";

export type RequestAnalyticsFilters={
  from:string;to:string;compareFrom:string;compareTo:string;
  clientId:string|null;ownerId:string|null;regionId:string|null;source:string|null;specialtyId:string|null;
};
export type RequestAnalyticsStage={
  requestIds:string[];pendingRequests:number;lostRequests:number;code:string;label:string;requests:number;headcount:number;shareRequests:number;shareHeadcount:number;
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

export type AnalyticsRequest={
  id:string;organizationId:string;clientId:string|null;client:string;ownerUserId:string|null;owner:string|null;regionId:string|null;
  source:string|null;createdByUserId:string;rawStage:string;lossReasonCode:string|null;headcount:number;specialtyIds:string[];
  createdAt:string;updatedAt:string;firstProposalAt:string|null;acceptedAt:string|null;
};
export type StageEvent={requestId:string;toStageCode:string;lossReasonCode:string|null;createdAt:string};

function isoDay(date:Date){return date.toISOString().slice(0,10)}
function parseDay(value:string){return new Date(`${value}T00:00:00.000Z`)}
function endOfDay(value:string){return new Date(`${value}T23:59:59.999Z`)}
function addDays(value:string,days:number){const date=parseDay(value);date.setUTCDate(date.getUTCDate()+days);return isoDay(date)}
function validDay(value:string|undefined){return Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(parseDay(value).getTime())&&isoDay(parseDay(value))===value)}
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
export function matchesFilters(row:AnalyticsRequest,filters:RequestAnalyticsFilters){
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

export function buildPeriodAnalytics(rows:AnalyticsRequest[],history:StageEvent[],from:string,to:string,stageDefinitions:RequestStageDefinition[],snapshotRows:AnalyticsRequest[]):PeriodResult{
  const start=parseDay(from).getTime(),end=endOfDay(to).getTime();
  const stageOrder=stageDefinitions.filter(stage=>stage.terminalKind!=="not_agreed").sort((a,b)=>a.sortOrder-b.sortOrder);
  const stageCodes=stageOrder.map(stage=>stage.code);
  const rank=new Map<string,number>(stageCodes.map((code,index)=>[code,index]));
  const agreedCode=stageOrder.find(stage=>stage.terminalKind==="agreed")?.code??"agreed";
  const cohort=rows.filter(row=>{const time=new Date(row.createdAt).getTime();return time>=start&&time<=end});
  const eventsByRequest=new Map<string,StageEvent[]>();
  for(const event of history){
    if(new Date(event.createdAt).getTime()>end)continue;
    const list=eventsByRequest.get(event.requestId)??[];list.push(event);eventsByRequest.set(event.requestId,list);
  }
  for(const list of eventsByRequest.values())list.sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());

  const reachedIds=new Map<string,Set<string>>(stageCodes.map(code=>[code,new Set()]));
  const cohortAgreements=new Map<string,{requests:number;headcount:number}>();
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
    const entryStage=stageCodes.includes("new")?"new":stageCodes[0]??"new";firstReached.set(entryStage,createdTime);
    let asOfStage=entryStage,asOfLossReasonCode:string|null=null;
    for(const event of eventsByRequest.get(row.id)??[]){
      const eventTime=new Date(event.createdAt).getTime(),eventRank=rank.get(event.toStageCode);
      if(eventRank!=null){if(!firstReached.has(event.toStageCode))firstReached.set(event.toStageCode,eventTime)}
      asOfStage=event.toStageCode;if(event.toStageCode==="not_agreed")asOfLossReasonCode=event.lossReasonCode;
    }
    const updatedTime=new Date(row.updatedAt).getTime();
    if(updatedTime<=end){
      if(rank.has(row.rawStage)){if(!firstReached.has(row.rawStage))firstReached.set(row.rawStage,updatedTime);asOfStage=row.rawStage}
      else if(row.rawStage==="not_agreed"){asOfStage="not_agreed";asOfLossReasonCode=row.lossReasonCode}
    }

    for(let index=0;index<stageCodes.length-1;index++){
      const code=stageCodes[index],next=stageCodes[index+1],entered=firstReached.get(code),advanced=firstReached.get(next);
      if(entered!=null&&advanced!=null&&advanced>=entered)durations.get(code)!.push((advanced-entered)/3600000);
    }
    const acceptedFallback=row.acceptedAt?new Date(row.acceptedAt).getTime():null;
    const agreedAt=firstReached.get(agreedCode)??(acceptedFallback!=null&&acceptedFallback<=end?acceptedFallback:null);
    if(agreedAt!=null)firstReached.set(agreedCode,agreedAt);
    stageCodes.forEach(code=>{if(firstReached.has(code)){reachedIds.get(code)!.add(row.id);reachedRequests.set(code,(reachedRequests.get(code)??0)+1);reachedHeadcount.set(code,(reachedHeadcount.get(code)??0)+row.headcount)}});
    const lost=asOfStage==="not_agreed",agreed=!lost&&(agreedAt!=null||asOfStage===agreedCode);
    outcomes.set(row.id,{agreed,lost});
    if(agreedAt!=null&&agreedAt>=createdTime)cycleDays.push((agreedAt-createdTime)/86400000);
    if(row.firstProposalAt){const sentTime=new Date(row.firstProposalAt).getTime();if(sentTime<=end&&sentTime>=createdTime)proposalDays.push((sentTime-createdTime)/86400000)}
    if(lost&&asOfLossReasonCode){const item=lossMap.get(asOfLossReasonCode)??{requests:0,headcount:0};item.requests++;item.headcount+=row.headcount;lossMap.set(asOfLossReasonCode,item)}

    const createdDay=isoDay(new Date(createdTime)),createdPoint=dailyMap.get(createdDay)??{newRequests:0,newHeadcount:0,proposalRequests:0,proposalHeadcount:0,agreedRequests:0,agreedHeadcount:0};
    createdPoint.newRequests++;createdPoint.newHeadcount+=row.headcount;dailyMap.set(createdDay,createdPoint);
    if(agreed&&agreedAt!=null&&agreedAt>=start&&agreedAt<=end){const day=isoDay(new Date(agreedAt)),point=cohortAgreements.get(day)??{requests:0,headcount:0};point.requests++;point.headcount+=row.headcount;cohortAgreements.set(day,point)}

    const addBreak=(map:Map<string,BreakdownAccumulator>,key:string,label:string)=>{
      const item=map.get(key)??{label,requests:0,headcount:0,agreed:0,agreedHeadcount:0,cycle:[]};
      item.requests++;item.headcount+=row.headcount;if(agreed){item.agreed++;item.agreedHeadcount+=row.headcount}
      if(agreedAt!=null&&agreedAt>=createdTime)item.cycle.push((agreedAt-createdTime)/86400000);map.set(key,item);
    };
    addBreak(clientMap,row.clientId??"none",row.client||"Без клиента");
    addBreak(ownerMap,row.ownerUserId??"none",row.owner||"Без ответственного");
    addBreak(sourceMap,row.source??"none",requestSourceLabel(row.source));
  }

  // Calendar events are counted for all accessible requests, including older cohorts.
  // First proposal is a request milestone; it is not the number of proposal versions sent.
  for(const row of rows){
    const rowEvents=eventsByRequest.get(row.id)??[];
    const agreedTimes=rowEvents.filter(event=>event.toStageCode===agreedCode).map(event=>Date.parse(event.createdAt));
    if(row.acceptedAt)agreedTimes.push(Date.parse(row.acceptedAt));
    const agreedAt=agreedTimes.length?Math.min(...agreedTimes):row.rawStage===agreedCode?Date.parse(row.updatedAt):null;
    for(const [kind,time] of [["proposal",row.firstProposalAt?Date.parse(row.firstProposalAt):null],["agreed",agreedAt]] as const){
      if(time==null||!Number.isFinite(time)||time<start||time>end)continue;
      const day=isoDay(new Date(time)),point=dailyMap.get(day)??{newRequests:0,newHeadcount:0,proposalRequests:0,proposalHeadcount:0,agreedRequests:0,agreedHeadcount:0};
      if(kind==="proposal"){point.proposalRequests++;point.proposalHeadcount+=row.headcount}else{point.agreedRequests++;point.agreedHeadcount+=row.headcount}
      dailyMap.set(day,point);
    }
  }
  const totalRequests=cohort.length,totalHeadcount=cohort.reduce((sum,row)=>sum+row.headcount,0);
  const agreedRows=cohort.filter(row=>outcomes.get(row.id)?.agreed),lostRows=cohort.filter(row=>outcomes.get(row.id)?.lost);
  const stages:RequestAnalyticsStage[]=stageOrder.map((stage,index)=>{
    const requests=reachedRequests.get(stage.code)??0,headcount=reachedHeadcount.get(stage.code)??0;
    const previousRequests=index===0?totalRequests:(reachedRequests.get(stageCodes[index-1])??0),previousHeadcount=index===0?totalHeadcount:(reachedHeadcount.get(stageCodes[index-1])??0);
    const ids=reachedIds.get(stage.code)??new Set<string>(),previousIds=index===0?new Set(cohort.map(row=>row.id)):reachedIds.get(stageCodes[index-1])??new Set<string>(),nextIds=reachedIds.get(stageCodes[index+1])??new Set<string>();
    const nonAdvanced=index<stageOrder.length-1?cohort.filter(row=>ids.has(row.id)&&!nextIds.has(row.id)):[];
    const notAdvancedRequests=nonAdvanced.length,notAdvancedHeadcount=nonAdvanced.reduce((sum,row)=>sum+row.headcount,0);
    const converted=cohort.filter(row=>ids.has(row.id)&&previousIds.has(row.id));
    const convertedHeadcount=converted.reduce((sum,row)=>sum+row.headcount,0);
    const pendingRequests=nonAdvanced.filter(row=>!outcomes.get(row.id)?.agreed&&!outcomes.get(row.id)?.lost).length,lostRequests=nonAdvanced.filter(row=>outcomes.get(row.id)?.lost).length;
    const values=durations.get(stage.code)??[];
    return {requestIds:[...ids],pendingRequests,lostRequests,code:stage.code,label:stage.label,requests,headcount,shareRequests:totalRequests?Math.round(requests/totalRequests*100):0,shareHeadcount:totalHeadcount?Math.round(headcount/totalHeadcount*100):0,conversionRequests:index===0?(totalRequests?Math.round(requests/totalRequests*100):0):(previousRequests?Math.round(converted.length/previousRequests*100):0),conversionHeadcount:index===0?(totalHeadcount?Math.round(headcount/totalHeadcount*100):0):(previousHeadcount?Math.round(convertedHeadcount/previousHeadcount*100):0),notAdvancedRequests,notAdvancedHeadcount,notAdvancedRate:requests?Math.round(notAdvancedRequests/requests*100):0,notAdvancedHeadcountRate:headcount?Math.round(notAdvancedHeadcount/headcount*100):0,avgHours:values.length?Number((average(values)!).toFixed(1)):null};
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
    cumNewReq+=point.newRequests;cumNewHead+=point.newHeadcount;cumAgreedReq+=cohortAgreements.get(date)?.requests??0;cumAgreedHead+=cohortAgreements.get(date)?.headcount??0;
    daily.push({date,label:new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"}).format(cursor),...point,conversionRequests:cumNewReq?Math.round(cumAgreedReq/cumNewReq*100):0,conversionHeadcount:cumNewHead?Math.round(cumAgreedHead/cumNewHead*100):0});
    cursor=new Date(cursor.getTime()+86400000);
  }
  const toBreakdown=(map:Map<string,BreakdownAccumulator>):RequestAnalyticsBreakdownRow[]=>[...map.entries()].map(([key,value])=>({key,label:value.label,requests:value.requests,headcount:value.headcount,agreed:value.agreed,agreedHeadcount:value.agreedHeadcount,conversion:value.requests?Math.round(value.agreed/value.requests*100):0,headcountConversion:value.headcount?Math.round(value.agreedHeadcount/value.headcount*100):0,avgCycleDays:value.cycle.length?Number((average(value.cycle)!).toFixed(1)):null})).sort((a,b)=>b.agreed-a.agreed||b.requests-a.requests);
  return {stages,metrics,daily,breakdowns:{clients:toBreakdown(clientMap),owners:toBreakdown(ownerMap),sources:toBreakdown(sourceMap)},lossMap};
}


// Demo has no full stage/proposal history. Use only the list's saved milestones;
// do not fabricate intermediate transitions or comparative requests.
export function analyticsFromBoardRows(boardRows:RequestBoardRow[],filters:RequestAnalyticsFilters,stages:RequestStageDefinition[],specialties:Array<{id:string;name:string}>=[]):RequestAnalyticsData{
  const rows:AnalyticsRequest[]=boardRows.map(row=>({...row,rawStage:row.workflowStageCode,specialtyIds:row.roles.map(role=>specialties.find(specialty=>specialty.name===role.name)?.id??role.name),firstProposalAt:row.proposalSentCount===1?row.lastProposalAt:null,acceptedAt:row.workflowStageCode==="agreed"?row.closedAt??row.updatedAt:null})).filter(row=>matchesFilters(row,filters));
  const snapshot=rows.filter(row=>!boardRows.find(board=>board.id===row.id)?.archivedAt);
  const current=buildPeriodAnalytics(rows,[],filters.from,filters.to,stages,snapshot),previous=buildPeriodAnalytics(rows,[],filters.compareFrom,filters.compareTo,stages,snapshot);
  const labels:Record<string,string>={price:"Цена / экономика",competitor:"Выбран другой подрядчик",cancelled:"Потребность отменена",timing:"Не устроили сроки",terms:"Не устроили условия",conditions:"Не устроили условия",no_response:"Нет ответа заказчика",staffing_failure:"Не смогли обеспечить персонал",staffing:"Не смогли обеспечить персонал",other:"Другое"};
  return {filters,stages:current.stages,metrics:current.metrics,comparison:previous.metrics,daily:current.daily,comparisonDaily:previous.daily,breakdowns:current.breakdowns,lossReasons:[...current.lossMap].map(([code,value])=>({code,label:labels[code]??"Причина не указана",...value})).sort((a,b)=>b.requests-a.requests)};
}
