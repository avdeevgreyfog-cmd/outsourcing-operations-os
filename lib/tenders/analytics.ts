import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import { tenderDeadlineState } from "./model";
import { listTenders, type TenderRow } from "./service";
import { userTenderSamples } from "./demo-user-samples";

export type TenderAnalyticsUnit="tenders"|"value"|"headcount";
export type TenderAnalyticsFilters={
  from:string;to:string;compareFrom:string;compareTo:string;
  platform:string|null;customer:string|null;ownerId:string|null;regionId:string|null;source:string|null;specialtyId:string|null;
  decision:string|null;result:string|null;priority:string|null;deadline:string|null;
};
export type TenderAnalyticsStage={
  code:string;label:string;tenders:number;value:number;headcount:number;
  shareTenders:number;shareValue:number;shareHeadcount:number;
  conversionTenders:number;conversionValue:number;conversionHeadcount:number;
  notAdvancedTenders:number;notAdvancedValue:number;notAdvancedHeadcount:number;
  notAdvancedRate:number;notAdvancedValueRate:number;notAdvancedHeadcountRate:number;
  avgHours:number|null;
};
export type TenderAnalyticsMetrics={
  activeTenders:number;participating:number;deadline3d:number;submittedActive:number;awaitingResult:number;attention:number;
  newTenders:number;incomingValue:number;incomingHeadcount:number;
  submittedTenders:number;submittedValue:number;submittedHeadcount:number;
  wonTenders:number;wonValue:number;wonHeadcount:number;
  winRateTenders:number;winRateValue:number;winRateHeadcount:number;
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
  winRateTenders:number;winRateValue:number;winRateHeadcount:number;
};
export type TenderAnalyticsBreakdownRow={
  key:string;label:string;tenders:number;value:number;headcount:number;
  submitted:number;submittedValue:number;submittedHeadcount:number;
  won:number;wonValue:number;wonHeadcount:number;
  resolved:number;resolvedValue:number;resolvedHeadcount:number;
  winRateTenders:number;winRateValue:number;winRateHeadcount:number;
};
export type TenderAnalyticsReasonRow={code:string;label:string;tenders:number;value:number;headcount:number};
export type TenderDeadlineRiskRow={key:"today"|"3d"|"7d";label:string;tenders:number;notReady:number};
export type TenderDocumentAnalytics={
  required:number;ready:number;blockers:number;tendersWithBlockers:number;readinessPct:number;
  topCategories:Array<{category:string;count:number}>;
};
export type TenderAnalyticsData={
  filters:TenderAnalyticsFilters;stages:TenderAnalyticsStage[];metrics:TenderAnalyticsMetrics;comparison:TenderAnalyticsMetrics;
  daily:TenderAnalyticsDaily[];comparisonDaily:TenderAnalyticsDaily[];
  breakdowns:{platforms:TenderAnalyticsBreakdownRow[];customers:TenderAnalyticsBreakdownRow[];owners:TenderAnalyticsBreakdownRow[]};
  noBidReasons:TenderAnalyticsReasonRow[];lossReasons:TenderAnalyticsReasonRow[];
  deadlineRisk:TenderDeadlineRiskRow[];documents:TenderDocumentAnalytics;
};

type AnalyticsTender={
  id:string;organizationId:string;clientId:string|null;customer:string;platform:string|null;sourceName:string|null;
  ownerUserId:string|null;owner:string|null;createdByUserId:string;teamId:string|null;regionId:string|null;priority:string;
  rawStage:string;decision:string;result:string|null;noBidReasonCode:string|null;resultReasonCode:string|null;
  initialPrice:number|null;headcount:number;specialtyIds:string[];submissionDeadline:string|null;submittedAt:string|null;
  nextActionText:string|null;blockerCount:number;requirementCount:number;readyRequirementCount:number;createdAt:string;updatedAt:string;
};
type StageEvent={tenderId:string;toStage:string;createdAt:string};
type DecisionEvent={tenderId:string;toDecision:string;reasonCode:string|null;createdAt:string};
type ResultEvent={tenderId:string;toResult:string;reasonCode:string|null;createdAt:string};

const funnelSteps=[
  {code:"new",label:"Новые"},
  {code:"analysis",label:"Анализ"},
  {code:"participate",label:"Решили участвовать"},
  {code:"calculation",label:"Расчёт"},
  {code:"approval",label:"Согласование"},
  {code:"preparation",label:"Подготовка"},
  {code:"submitted",label:"Подано"},
  {code:"awaiting_result",label:"Ожидаем результат"},
  {code:"won",label:"Выиграно"},
] as const;
const funnelIndex=new Map(funnelSteps.map((step,index)=>[step.code,index]));
const activeStages=new Set(["new","analysis","clarification","calculation","approval","preparation","submitted","awaiting_result"]);

function isoDay(date:Date){return date.toISOString().slice(0,10)}
function parseDay(value:string){return new Date(`${value}T00:00:00.000Z`)}
function endOfDay(value:string){return new Date(`${value}T23:59:59.999Z`)}
function addDays(value:string,days:number){const date=parseDay(value);date.setUTCDate(date.getUTCDate()+days);return isoDay(date)}
function validDay(value:string|undefined){return Boolean(value&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(parseDay(value).getTime()))}
function average(values:number[]){return values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null}
function numeric(value:number|string|null|undefined){if(value==null)return 0;const parsed=Number(value);return Number.isFinite(parsed)?parsed:0}
function actualStageRank(stage:string){
  if(stage==="new")return 0;
  if(stage==="analysis"||stage==="clarification")return 1;
  if(stage==="calculation")return 3;
  if(stage==="approval")return 4;
  if(stage==="preparation")return 5;
  if(stage==="submitted")return 6;
  if(stage==="awaiting_result")return 7;
  return 0;
}
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

type BreakdownAccumulator={
  label:string;tenders:number;value:number;headcount:number;
  submitted:number;submittedValue:number;submittedHeadcount:number;
  won:number;wonValue:number;wonHeadcount:number;
  resolved:number;resolvedValue:number;resolvedHeadcount:number;
};
type PeriodResult={
  stages:TenderAnalyticsStage[];metrics:TenderAnalyticsMetrics;daily:TenderAnalyticsDaily[];
  breakdowns:{platforms:TenderAnalyticsBreakdownRow[];customers:TenderAnalyticsBreakdownRow[];owners:TenderAnalyticsBreakdownRow[]};
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
  const start=parseDay(from).getTime(),end=endOfDay(to).getTime();
  const cohort=rows.filter(row=>{const created=new Date(row.createdAt).getTime();return created>=start&&created<=end});
  const stageByTender=new Map<string,StageEvent[]>(),decisionByTender=new Map<string,DecisionEvent[]>(),resultByTender=new Map<string,ResultEvent[]>();
  for(const event of stageHistory){if(new Date(event.createdAt).getTime()<=end){const list=stageByTender.get(event.tenderId)??[];list.push(event);stageByTender.set(event.tenderId,list)}}
  for(const event of decisionHistory){if(new Date(event.createdAt).getTime()<=end){const list=decisionByTender.get(event.tenderId)??[];list.push(event);decisionByTender.set(event.tenderId,list)}}
  for(const event of resultHistory){if(new Date(event.createdAt).getTime()<=end){const list=resultByTender.get(event.tenderId)??[];list.push(event);resultByTender.set(event.tenderId,list)}}
  for(const lists of [stageByTender,decisionByTender,resultByTender])for(const list of lists.values())list.sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());

  const reachedCount=new Array<number>(funnelSteps.length).fill(0),reachedValue=new Array<number>(funnelSteps.length).fill(0),reachedHeadcount=new Array<number>(funnelSteps.length).fill(0);
  const durationByStep=new Map<string,number[]>(funnelSteps.map(step=>[step.code,[]]));
  const decisionHours:number[]=[],cycleDays:number[]=[],submissionLeadHours:number[]=[];
  const noBidMap=new Map<string,{tenders:number;value:number;headcount:number}>(),lossMap=new Map<string,{tenders:number;value:number;headcount:number}>();
  const dailyMap=new Map<string,{newTenders:number;newValue:number;newHeadcount:number;participateTenders:number;participateValue:number;participateHeadcount:number;submittedTenders:number;submittedValue:number;submittedHeadcount:number;wonTenders:number;wonValue:number;wonHeadcount:number;lostTenders:number;lostValue:number;lostHeadcount:number}>();
  const platformMap=new Map<string,BreakdownAccumulator>(),customerMap=new Map<string,BreakdownAccumulator>(),ownerMap=new Map<string,BreakdownAccumulator>();

  let submittedTenders=0,submittedValue=0,submittedHeadcount=0,wonTenders=0,wonValue=0,wonHeadcount=0,lostCount=0,noBidCount=0;
  let resolvedCompetitiveValue=0,resolvedCompetitiveHeadcount=0;

  for(const row of cohort){
    const value=numeric(row.initialPrice),headcount=row.headcount,createdTime=new Date(row.createdAt).getTime();
    const firstReached=new Map<string,number>();
    firstReached.set("new",createdTime);
    let maxRank=0;

    for(const event of stageByTender.get(row.id)??[]){
      const eventTime=new Date(event.createdAt).getTime(),rank=actualStageRank(event.toStage);
      maxRank=Math.max(maxRank,rank);
      if(event.toStage==="analysis"||event.toStage==="clarification"){if(!firstReached.has("analysis"))firstReached.set("analysis",eventTime)}
      else if(["calculation","approval","preparation","submitted","awaiting_result"].includes(event.toStage)){if(!firstReached.has(event.toStage))firstReached.set(event.toStage,eventTime)}
    }

    const rowUpdated=new Date(row.updatedAt).getTime();
    if(rowUpdated<=end&&activeStages.has(row.rawStage)){
      maxRank=Math.max(maxRank,actualStageRank(row.rawStage));
      if((row.rawStage==="analysis"||row.rawStage==="clarification")&&!firstReached.has("analysis"))firstReached.set("analysis",rowUpdated);
      else if(["calculation","approval","preparation","submitted","awaiting_result"].includes(row.rawStage)&&!firstReached.has(row.rawStage))firstReached.set(row.rawStage,rowUpdated);
    }

    const decisions=decisionByTender.get(row.id)??[];
    const bidDecision=decisions.find(event=>event.toDecision==="participate"||event.toDecision==="no_bid");
    let participateAt=decisions.find(event=>event.toDecision==="participate")?.createdAt;
    if(!participateAt&&maxRank>=3)participateAt=firstReached.get("calculation")?new Date(firstReached.get("calculation")!).toISOString():null;
    if(participateAt){const time=new Date(participateAt).getTime();firstReached.set("participate",time);maxRank=Math.max(maxRank,2)}
    if(bidDecision){const time=new Date(bidDecision.createdAt).getTime();if(time>=createdTime)decisionHours.push((time-createdTime)/3600000)}

    if(row.submittedAt){
      const time=new Date(row.submittedAt).getTime();
      if(time<=end){firstReached.set("submitted",firstReached.get("submitted")??time);maxRank=Math.max(maxRank,6)}
    }

    const results=resultByTender.get(row.id)??[];
    const firstResult=results[0];
    const wonEvent=results.find(event=>event.toResult==="won");
    const lostEvent=results.find(event=>event.toResult==="lost");
    if(wonEvent){const time=new Date(wonEvent.createdAt).getTime();firstReached.set("won",time)}
    else if(row.result==="won"&&rowUpdated<=end)firstReached.set("won",rowUpdated);

    if(firstResult){const time=new Date(firstResult.createdAt).getTime();if(time>=createdTime)cycleDays.push((time-createdTime)/86400000)}
    else if(row.result&&rowUpdated<=end&&rowUpdated>=createdTime)cycleDays.push((rowUpdated-createdTime)/86400000);

    const noBidEvent=[...decisions].reverse().find(event=>event.toDecision==="no_bid");
    const noBidAsOf=Boolean(noBidEvent)||(row.decision==="no_bid"&&rowUpdated<=end);
    const noBidReason=noBidEvent?.reasonCode??(noBidAsOf?row.noBidReasonCode:null);
    if(noBidAsOf){noBidCount++;if(noBidReason){const item=noBidMap.get(noBidReason)??{tenders:0,value:0,headcount:0};item.tenders++;item.value+=value;item.headcount+=headcount;noBidMap.set(noBidReason,item)}}

    const won=Boolean(wonEvent)||(row.result==="won"&&rowUpdated<=end);
    const lost=Boolean(lostEvent)||(row.result==="lost"&&rowUpdated<=end);
    const lossReason=lostEvent?.reasonCode??(lost?row.resultReasonCode:null);
    if(lost){lostCount++;resolvedCompetitiveValue+=value;resolvedCompetitiveHeadcount+=headcount;if(lossReason){const item=lossMap.get(lossReason)??{tenders:0,value:0,headcount:0};item.tenders++;item.value+=value;item.headcount+=headcount;lossMap.set(lossReason,item)}}
    if(won){wonTenders++;wonValue+=value;wonHeadcount+=headcount;resolvedCompetitiveValue+=value;resolvedCompetitiveHeadcount+=headcount}

    const submitted=firstReached.has("submitted");
    if(submitted){submittedTenders++;submittedValue+=value;submittedHeadcount+=headcount}
    if(submitted&&row.submissionDeadline){
      const submittedAt=firstReached.get("submitted")!,deadline=new Date(row.submissionDeadline).getTime();
      submissionLeadHours.push((deadline-submittedAt)/3600000);
    }

    for(let index=0;index<funnelSteps.length;index++){
      const code=funnelSteps[index].code;
      let reached=false;
      if(code==="won")reached=won;
      else if(code==="participate")reached=firstReached.has("participate")||maxRank>=3;
      else reached=maxRank>=index;
      if(reached){reachedCount[index]++;reachedValue[index]+=value;reachedHeadcount[index]+=headcount}
    }

    for(let index=0;index<funnelSteps.length-1;index++){
      const current=funnelSteps[index].code,next=funnelSteps[index+1].code;
      const entered=firstReached.get(current),advanced=firstReached.get(next);
      if(entered!=null&&advanced!=null&&advanced>=entered)durationByStep.get(current)!.push((advanced-entered)/3600000);
    }

    const createdDay=isoDay(new Date(createdTime));
    const createPoint=dailyMap.get(createdDay)??emptyDailyPoint();
    createPoint.newTenders++;createPoint.newValue+=value;createPoint.newHeadcount+=headcount;dailyMap.set(createdDay,createPoint);

    const participateTime=firstReached.get("participate");
    if(participateTime!=null&&participateTime>=start&&participateTime<=end){
      const day=isoDay(new Date(participateTime)),point=dailyMap.get(day)??emptyDailyPoint();
      point.participateTenders++;point.participateValue+=value;point.participateHeadcount+=headcount;dailyMap.set(day,point);
    }
    const submittedTime=firstReached.get("submitted");
    if(submittedTime!=null&&submittedTime>=start&&submittedTime<=end){
      const day=isoDay(new Date(submittedTime)),point=dailyMap.get(day)??emptyDailyPoint();
      point.submittedTenders++;point.submittedValue+=value;point.submittedHeadcount+=headcount;dailyMap.set(day,point);
    }
    const wonTime=firstReached.get("won");
    if(wonTime!=null&&wonTime>=start&&wonTime<=end){
      const day=isoDay(new Date(wonTime)),point=dailyMap.get(day)??emptyDailyPoint();
      point.wonTenders++;point.wonValue+=value;point.wonHeadcount+=headcount;dailyMap.set(day,point);
    }
    const lostTime=lostEvent?new Date(lostEvent.createdAt).getTime():(lost?rowUpdated:null);
    if(lostTime!=null&&lostTime>=start&&lostTime<=end){
      const day=isoDay(new Date(lostTime)),point=dailyMap.get(day)??emptyDailyPoint();
      point.lostTenders++;point.lostValue+=value;point.lostHeadcount+=headcount;dailyMap.set(day,point);
    }

    const addBreak=(map:Map<string,BreakdownAccumulator>,key:string,label:string)=>{
      const item=map.get(key)??{label,tenders:0,value:0,headcount:0,submitted:0,submittedValue:0,submittedHeadcount:0,won:0,wonValue:0,wonHeadcount:0,resolved:0,resolvedValue:0,resolvedHeadcount:0};
      item.tenders++;item.value+=value;item.headcount+=headcount;
      if(submitted){item.submitted++;item.submittedValue+=value;item.submittedHeadcount+=headcount}
      if(won){item.won++;item.wonValue+=value;item.wonHeadcount+=headcount}
      if(won||lost){item.resolved++;item.resolvedValue+=value;item.resolvedHeadcount+=headcount}
      map.set(key,item);
    };
    addBreak(platformMap,row.platform??"none",row.platform||"Площадка не указана");
    addBreak(customerMap,row.customer||"none",row.customer||"Заказчик не указан");
    addBreak(ownerMap,row.ownerUserId??"none",row.owner||"Без ответственного");
  }

  const totalTenders=cohort.length,totalValue=cohort.reduce((sum,row)=>sum+numeric(row.initialPrice),0),totalHeadcount=cohort.reduce((sum,row)=>sum+row.headcount,0);
  const stages:TenderAnalyticsStage[]=funnelSteps.map((step,index)=>{
    const tenders=reachedCount[index],value=reachedValue[index],headcount=reachedHeadcount[index];
    const prevTenders=index===0?totalTenders:reachedCount[index-1],prevValue=index===0?totalValue:reachedValue[index-1],prevHeadcount=index===0?totalHeadcount:reachedHeadcount[index-1];
    const nextTenders=index<funnelSteps.length-1?reachedCount[index+1]:tenders,nextValue=index<funnelSteps.length-1?reachedValue[index+1]:value,nextHeadcount=index<funnelSteps.length-1?reachedHeadcount[index+1]:headcount;
    const notAdvancedTenders=Math.max(0,tenders-nextTenders),notAdvancedValue=Math.max(0,value-nextValue),notAdvancedHeadcount=Math.max(0,headcount-nextHeadcount);
    const durations=durationByStep.get(step.code)??[];
    return {code:step.code,label:step.label,tenders,value,headcount,shareTenders:totalTenders?Math.round(tenders/totalTenders*100):0,shareValue:totalValue?Math.round(value/totalValue*100):0,shareHeadcount:totalHeadcount?Math.round(headcount/totalHeadcount*100):0,conversionTenders:index===0?100:(prevTenders?Math.round(tenders/prevTenders*100):0),conversionValue:index===0?100:(prevValue?Math.round(value/prevValue*100):0),conversionHeadcount:index===0?100:(prevHeadcount?Math.round(headcount/prevHeadcount*100):0),notAdvancedTenders,notAdvancedValue,notAdvancedHeadcount,notAdvancedRate:tenders?Math.round(notAdvancedTenders/tenders*100):0,notAdvancedValueRate:value?Math.round(notAdvancedValue/value*100):0,notAdvancedHeadcountRate:headcount?Math.round(notAdvancedHeadcount/headcount*100):0,avgHours:durations.length?Number((average(durations)!).toFixed(1)):null};
  });

  const snapshot=snapshotRows.filter(row=>activeStages.has(row.rawStage));
  const attention=snapshot.filter(row=>needsAttention(row,now)).length;
  const metrics:TenderAnalyticsMetrics={
    activeTenders:snapshot.length,
    participating:snapshot.filter(row=>row.decision==="participate").length,
    deadline3d:snapshot.filter(row=>["overdue","today","urgent"].includes(tenderDeadlineState(row.submissionDeadline,now).key)).length,
    submittedActive:snapshot.filter(row=>["submitted","awaiting_result"].includes(row.rawStage)).length,
    awaitingResult:snapshot.filter(row=>row.rawStage==="awaiting_result").length,
    attention,
    newTenders:totalTenders,incomingValue:totalValue,incomingHeadcount:totalHeadcount,
    submittedTenders,submittedValue,submittedHeadcount,
    wonTenders,wonValue,wonHeadcount,
    winRateTenders:(wonTenders+lostCount)?Math.round(wonTenders/(wonTenders+lostCount)*100):0,
    winRateValue:resolvedCompetitiveValue?Math.round(wonValue/resolvedCompetitiveValue*100):0,
    winRateHeadcount:resolvedCompetitiveHeadcount?Math.round(wonHeadcount/resolvedCompetitiveHeadcount*100):0,
    avgDecisionHours:decisionHours.length?Number((average(decisionHours)!).toFixed(1)):null,
    avgCycleDays:cycleDays.length?Number((average(cycleDays)!).toFixed(1)):null,
    avgSubmissionLeadHours:submissionLeadHours.length?Number((average(submissionLeadHours)!).toFixed(1)):null,
    blockerTenders:snapshot.filter(row=>row.blockerCount>0).length,
    unassigned:snapshot.filter(row=>!row.ownerUserId).length,
    noBidCount,lostCount,
  };

  const daily:TenderAnalyticsDaily[]=[];
  let cursor=parseDay(from),cumWon=0,cumLost=0,cumWonValue=0,cumLostValue=0,cumWonHead=0,cumLostHead=0;
  const last=parseDay(to);
  while(cursor<=last){
    const date=isoDay(cursor),point=dailyMap.get(date)??emptyDailyPoint();
    cumWon+=point.wonTenders;cumLost+=point.lostTenders;cumWonValue+=point.wonValue;cumLostValue+=point.lostValue;cumWonHead+=point.wonHeadcount;cumLostHead+=point.lostHeadcount;
    daily.push({date,label:new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"}).format(cursor),...point,winRateTenders:(cumWon+cumLost)?Math.round(cumWon/(cumWon+cumLost)*100):0,winRateValue:(cumWonValue+cumLostValue)?Math.round(cumWonValue/(cumWonValue+cumLostValue)*100):0,winRateHeadcount:(cumWonHead+cumLostHead)?Math.round(cumWonHead/(cumWonHead+cumLostHead)*100):0});
    cursor=new Date(cursor.getTime()+86400000);
  }

  const toBreakdown=(map:Map<string,BreakdownAccumulator>):TenderAnalyticsBreakdownRow[]=>[...map.entries()].map(([key,item])=>({key,label:item.label,tenders:item.tenders,value:item.value,headcount:item.headcount,submitted:item.submitted,submittedValue:item.submittedValue,submittedHeadcount:item.submittedHeadcount,won:item.won,wonValue:item.wonValue,wonHeadcount:item.wonHeadcount,resolved:item.resolved,resolvedValue:item.resolvedValue,resolvedHeadcount:item.resolvedHeadcount,winRateTenders:item.resolved?Math.round(item.won/item.resolved*100):0,winRateValue:item.resolvedValue?Math.round(item.wonValue/item.resolvedValue*100):0,winRateHeadcount:item.resolvedHeadcount?Math.round(item.wonHeadcount/item.resolvedHeadcount*100):0})).sort((a,b)=>b.won-a.won||b.tenders-a.tenders);

  return {stages,metrics,daily,breakdowns:{platforms:toBreakdown(platformMap),customers:toBreakdown(customerMap),owners:toBreakdown(ownerMap)},noBidMap,lossMap};
}

function emptyDailyPoint(){return {newTenders:0,newValue:0,newHeadcount:0,participateTenders:0,participateValue:0,participateHeadcount:0,submittedTenders:0,submittedValue:0,submittedHeadcount:0,wonTenders:0,wonValue:0,wonHeadcount:0,lostTenders:0,lostValue:0,lostHeadcount:0}}
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

function demoRowToAnalytics(row:TenderRow,index:number):AnalyticsTender{
  return {id:row.id,organizationId:row.organizationId,clientId:row.clientId,customer:row.customer,platform:row.platform,sourceName:row.sourceName,ownerUserId:row.ownerUserId,owner:row.owner,createdByUserId:row.createdByUserId,teamId:row.teamId,regionId:row.regionId,priority:row.priority,rawStage:row.stage,decision:row.decision,result:row.result,noBidReasonCode:row.noBidReasonCode,resultReasonCode:row.resultReasonCode,initialPrice:numeric(row.initialPrice)||null,headcount:Math.max(0,row.roleCount?10+index*3:0),specialtyIds:[],submissionDeadline:row.submissionDeadline,submittedAt:row.submittedAt,nextActionText:row.nextActionText,blockerCount:row.blockerCount,requirementCount:row.requirementCount,readyRequirementCount:row.readyRequirementCount,createdAt:row.createdAt,updatedAt:row.updatedAt};
}

function makeDemoHistory(rows:AnalyticsTender[]):{stages:StageEvent[];decisions:DecisionEvent[];results:ResultEvent[]}{
  const stages:StageEvent[]=[],decisions:DecisionEvent[]=[],results:ResultEvent[]=[];
  const sequence=["new","analysis","calculation","approval","preparation","submitted","awaiting_result"];
  for(const [index,row] of rows.entries()){
    const created=row.createdAt.slice(0,10);
    const rawRank=Math.max(0,actualStageRank(row.rawStage));
    const stageLimit=Math.min(sequence.length-1,rawRank===0?0:rawRank===1?1:rawRank-1);
    for(let i=0;i<=stageLimit;i++)stages.push({tenderId:row.id,toStage:sequence[i],createdAt:`${addDays(created,i)}T10:00:00.000Z`});
    if(row.decision==="participate"||rawRank>=3)decisions.push({tenderId:row.id,toDecision:"participate",reasonCode:null,createdAt:`${addDays(created,2)}T12:00:00.000Z`});
    if(row.decision==="no_bid")decisions.push({tenderId:row.id,toDecision:"no_bid",reasonCode:row.noBidReasonCode??"economics",createdAt:`${addDays(created,2)}T12:00:00.000Z`});
    if(row.result)results.push({tenderId:row.id,toResult:row.result,reasonCode:row.result==="lost"?(row.resultReasonCode??"price"):null,createdAt:`${addDays(created,7+index%3)}T15:00:00.000Z`});
  }
  return {stages,decisions,results};
}

async function demoAnalytics(actor:Actor,filters:TenderAnalyticsFilters):Promise<TenderAnalyticsData>{
  const base=[...userTenderSamples,...await listTenders(actor)].map(demoRowToAnalytics);
  const now=new Date();
  const filtered=base.filter(row=>matchesFilters(row,filters,now));
  const currentHistory=makeDemoHistory(filtered);
  const current=buildPeriodAnalytics(filtered,currentHistory.stages,currentHistory.decisions,currentHistory.results,filters.from,filters.to,filtered,now);
  const previousRows=filtered.map((row,index)=>({...row,id:`prev-${row.id}`,createdAt:`${addDays(filters.compareFrom,index%Math.max(1,Math.round((parseDay(filters.compareTo).getTime()-parseDay(filters.compareFrom).getTime())/86400000)+1))}T09:00:00.000Z`,result:index%3===0?null:row.result,decision:index%4===0?"undecided":row.decision,submittedAt:index%3===0?null:row.submittedAt}));
  const previousHistory=makeDemoHistory(previousRows);
  const previous=buildPeriodAnalytics(previousRows,previousHistory.stages,previousHistory.decisions,previousHistory.results,filters.compareFrom,filters.compareTo,previousRows,now);
  const noBidLabels:Record<string,string>={economics:"Низкая маржинальность / не проходит экономика",deadline:"Не успеваем подготовить заявку",staffing:"Нет нужного персонала / ресурсов",other:"Другое"};
  const lossLabels:Record<string,string>={price:"Цена",score:"Проиграли по баллам / критериям",competitor:"Выбран другой участник",other:"Другое"};
  const active=filtered.filter(row=>activeStages.has(row.rawStage));
  const documents:TenderDocumentAnalytics={required:active.reduce((sum,row)=>sum+row.requirementCount,0),ready:active.reduce((sum,row)=>sum+row.readyRequirementCount,0),blockers:active.reduce((sum,row)=>sum+row.blockerCount,0),tendersWithBlockers:active.filter(row=>row.blockerCount>0).length,readinessPct:active.reduce((sum,row)=>sum+row.requirementCount,0)?Math.round(active.reduce((sum,row)=>sum+row.readyRequirementCount,0)/active.reduce((sum,row)=>sum+row.requirementCount,0)*100):0,topCategories:[{category:"Корпоративные документы",count:2},{category:"Налоговые справки",count:1}]};
  return {filters,stages:current.stages,metrics:current.metrics,comparison:previous.metrics,daily:current.daily,comparisonDaily:previous.daily,breakdowns:current.breakdowns,noBidReasons:[...current.noBidMap.entries()].map(([code,value])=>({code,label:noBidLabels[code]??code,...value})),lossReasons:[...current.lossMap.entries()].map(([code,value])=>({code,label:lossLabels[code]??code,...value})),deadlineRisk:buildDeadlineRisk(active,now),documents};
}

export async function getTenderAnalytics(actor:Actor,filters:TenderAnalyticsFilters):Promise<TenderAnalyticsData>{
  requireCapability(actor,"sales.tender.read");
  if(actor.demo)return demoAnalytics(actor,filters);
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const now=new Date(),earliest=[filters.from,filters.compareFrom].sort()[0],latest=[filters.to,filters.compareTo].sort().at(-1)!;
    const periodRows=await sql<AnalyticsTender[]>`
      SELECT t.id,t.organization_id "organizationId",t.client_company_id "clientId",COALESCE(c.name,t.customer_name,'Заказчик не указан') customer,
        t.platform,t.source_name "sourceName",t.owner_user_id "ownerUserId",u.display_name owner,t.created_by_user_id "createdByUserId",
        t.assigned_team_id "teamId",t.region_id "regionId",t.priority,t.stage "rawStage",t.decision,t.result,t.no_bid_reason_code "noBidReasonCode",
        t.result_reason_code "resultReasonCode",t.initial_price::float8 "initialPrice",
        COALESCE((SELECT sum(COALESCE(tr.count_required,0))::int FROM tender_roles tr WHERE tr.tender_id=t.id),0) headcount,
        COALESCE((SELECT array_agg(DISTINCT tr.specialty_id::text) FILTER (WHERE tr.specialty_id IS NOT NULL) FROM tender_roles tr WHERE tr.tender_id=t.id),'{}'::text[]) "specialtyIds",
        t.submission_deadline::text "submissionDeadline",t.submitted_at::text "submittedAt",t.next_action_text "nextActionText",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required AND dr.status IN ('prepare','update_needed','requested')) "blockerCount",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required) "requirementCount",
        (SELECT count(*)::int FROM tender_document_requirements dr WHERE dr.tender_id=t.id AND dr.required AND dr.status IN ('available','ready','not_required')) "readyRequirementCount",
        t.created_at::text "createdAt",t.updated_at::text "updatedAt"
      FROM tenders t LEFT JOIN client_companies c ON c.id=t.client_company_id LEFT JOIN app_users u ON u.id=t.owner_user_id
      WHERE t.created_at>=${earliest}::date AND t.created_at<(${latest}::date+INTERVAL '1 day') AND t.archived_at IS NULL
    `;
    const snapshotRows=await sql<AnalyticsTender[]>`
      SELECT t.id,t.organization_id "organizationId",t.client_company_id "clientId",COALESCE(c.name,t.customer_name,'Заказчик не указан') customer,
        t.platform,t.source_name "sourceName",t.owner_user_id "ownerUserId",u.display_name owner,t.created_by_user_id "createdByUserId",
        t.assigned_team_id "teamId",t.region_id "regionId",t.priority,t.stage "rawStage",t.decision,t.result,t.no_bid_reason_code "noBidReasonCode",
        t.result_reason_code "resultReasonCode",t.initial_price::float8 "initialPrice",
        COALESCE((SELECT sum(COALESCE(tr.count_required,0))::int FROM tender_roles tr WHERE tr.tender_id=t.id),0) headcount,
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
      sql<StageEvent[]>`SELECT tender_id "tenderId",to_stage "toStage",created_at::text "createdAt" FROM tender_stage_history WHERE tender_id=ANY(${ids}::uuid[]) AND created_at<(${latest}::date+INTERVAL '1 day') ORDER BY tender_id,created_at`,
      sql<DecisionEvent[]>`SELECT tender_id "tenderId",to_decision "toDecision",reason_code "reasonCode",created_at::text "createdAt" FROM tender_decision_history WHERE tender_id=ANY(${ids}::uuid[]) AND created_at<(${latest}::date+INTERVAL '1 day') ORDER BY tender_id,created_at`,
      sql<ResultEvent[]>`SELECT tender_id "tenderId",to_result "toResult",reason_code "reasonCode",created_at::text "createdAt" FROM tender_result_history WHERE tender_id=ANY(${ids}::uuid[]) AND created_at<(${latest}::date+INTERVAL '1 day') ORDER BY tender_id,created_at`,
    ]):[[],[],[]];
    const current=buildPeriodAnalytics(accessible,stageHistory,decisionHistory,resultHistory,filters.from,filters.to,snapshot,now);
    const previous=buildPeriodAnalytics(accessible,stageHistory,decisionHistory,resultHistory,filters.compareFrom,filters.compareTo,snapshot,now);

    const reasonCodes=[...new Set([...current.noBidMap.keys(),...current.lossMap.keys()])];
    const reasonRows=reasonCodes.length?await sql<Array<{kind:string;code:string;label:string}>>`
      SELECT kind,code,name label FROM tender_reason_catalog WHERE code=ANY(${reasonCodes}::text[]) AND active
    `:[];
    const reasonLabel=new Map(reasonRows.map(row=>[`${row.kind}:${row.code}`,row.label]));

    const snapshotIds=snapshot.map(row=>row.id);
    const categoryRows=snapshotIds.length?await sql<Array<{category:string;count:number}>>`
      SELECT category,count(*)::int count
      FROM tender_document_requirements
      WHERE tender_id=ANY(${snapshotIds}::uuid[]) AND required AND status IN ('prepare','update_needed','requested')
      GROUP BY category ORDER BY count DESC,category LIMIT 6
    `:[];
    const required=snapshot.reduce((sum,row)=>sum+row.requirementCount,0),ready=snapshot.reduce((sum,row)=>sum+row.readyRequirementCount,0);
    const documents:TenderDocumentAnalytics={required,ready,blockers:snapshot.reduce((sum,row)=>sum+row.blockerCount,0),tendersWithBlockers:snapshot.filter(row=>row.blockerCount>0).length,readinessPct:required?Math.round(ready/required*100):0,topCategories:categoryRows};
    return {filters,stages:current.stages,metrics:current.metrics,comparison:previous.metrics,daily:current.daily,comparisonDaily:previous.daily,breakdowns:current.breakdowns,noBidReasons:[...current.noBidMap.entries()].map(([code,value])=>({code,label:reasonLabel.get(`no_bid:${code}`)??code,...value})).sort((a,b)=>b.tenders-a.tenders),lossReasons:[...current.lossMap.entries()].map(([code,value])=>({code,label:reasonLabel.get(`lost:${code}`)??code,...value})).sort((a,b)=>b.tenders-a.tenders),deadlineRisk:buildDeadlineRisk(snapshot,now),documents};
  });
}
