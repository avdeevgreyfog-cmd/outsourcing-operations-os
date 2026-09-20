import { normalizeRecruitingStage, recruitingStageLabels, recruitingStages, type RecruitingStage } from "./model";
import type { RecruitingApplicationRow, RecruitingNeedRow } from "./service";
export type RecruitingAnalyticsFilters = {
  from: string;
  to: string;
  compareFrom: string;
  compareTo: string;
  objectId: string | null;
  specialtyId: string | null;
  recruiterId: string | null;
  source: string | null;
};

export type RecruitingAnalyticsStage = {
  stage: RecruitingStage;
  label: string;
  candidates: number;
  shareTotal: number;
  conversion: number;
  notAdvanced: number;
  notAdvancedRate: number;
  avgHours: number | null;
  waiting: number;
  lost: number;
  reserved: number;
  skipped: number;
};

export type RecruitingAnalyticsMetrics = {
  totalCandidates: number;
  conversionToStart: number;
  inWork: number;
  ready: number;
  avgDaysToStart: number | null;
  started: number;
  rejected: number;
  noShow: number;
  avgFirstContactHours: number | null;
  overdueFirstContact: number;
};

export type RecruitingAnalyticsDaily = {
  date: string;
  label: string;
  newCandidates: number;
  ready: number;
  started: number;
  readyConversion: number;
  startConversion: number;
};

export type RecruitingAnalyticsSourceRow = {
  source: string;
  candidates: number;
  approved: number;
  started: number;
  conversion: number;
  avgDaysToStart: number | null;
};

export type RecruitingAnalyticsExitReason = {
  code: string;
  label: string;
  count: number;
};

export type RecruitingAnalyticsData = {
  filters: RecruitingAnalyticsFilters;
  stages: RecruitingAnalyticsStage[];
  metrics: RecruitingAnalyticsMetrics;
  comparison: RecruitingAnalyticsMetrics;
  daily: RecruitingAnalyticsDaily[];
  comparisonDaily: RecruitingAnalyticsDaily[];
  sources: RecruitingAnalyticsSourceRow[];
  exitReasons: RecruitingAnalyticsExitReason[];
  summary: { title: string; text: string; stage: string | null };
};

export type AnalyticsApplication = {
  applicationId: string;
  organizationId: string;
  objectId: string | null;
  specialtyId: string;
  regionId: string | null;
  clientId: string | null;
  ownerUserId: string | null;
  managerUserId: string | null;
  assigneeUserIds: string[];
  source: string | null;
  sourceCampaign?: string | null;
  rejectionReasonCode: string | null;
  rawStage: string;
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsHistory = {
  applicationId: string;
  toStage: string;
  reasonCode?: string | null;
  createdAt: string;
};

const stageRank = new Map<RecruitingStage,number>(recruitingStages.map((stage,index)=>[stage,index] as [RecruitingStage,number]));
const terminalStages = new Set<RecruitingStage>(["rejected","no_show"]);

function isoDay(date: Date) { return date.toISOString().slice(0,10); }
function parseDay(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function endOfDay(value: string) { return new Date(`${value}T23:59:59.999Z`); }
function addDays(value: string, days: number) { const date=parseDay(value); date.setUTCDate(date.getUTCDate()+days); return isoDay(date); }
function validDay(value: string | undefined) { return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDay(value).getTime())); }

export function defaultRecruitingAnalyticsFilters(now = new Date()): RecruitingAnalyticsFilters {
  const to=isoDay(now);
  const from=addDays(to,-29);
  const compareTo=addDays(from,-1);
  const compareFrom=addDays(compareTo,-29);
  return {from,to,compareFrom,compareTo,objectId:null,specialtyId:null,recruiterId:null,source:null};
}

export function normalizeRecruitingAnalyticsFilters(input: Partial<Record<"from"|"to"|"object"|"specialty"|"recruiter"|"source",string|undefined>>): RecruitingAnalyticsFilters {
  const defaults=defaultRecruitingAnalyticsFilters();
  let from=validDay(input.from)?input.from!:defaults.from;
  let to=validDay(input.to)?input.to!:defaults.to;
  if(parseDay(from)>parseDay(to)) [from,to]=[to,from];
  const span=Math.max(0,Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000));
  // Comparison is always the immediately preceding period of exactly the same inclusive length.
  const compareTo=addDays(from,-1);
  const compareFrom=addDays(compareTo,-span);
  return {
    from,to,compareFrom,compareTo,
    objectId:input.object||null,
    specialtyId:input.specialty||null,
    recruiterId:input.recruiter||null,
    source:input.source||null,
  };
}

function matchesFilters(row: AnalyticsApplication, filters: RecruitingAnalyticsFilters) {
  if(filters.objectId && row.objectId!==filters.objectId) return false;
  if(filters.specialtyId && row.specialtyId!==filters.specialtyId) return false;
  if(filters.recruiterId && row.ownerUserId!==filters.recruiterId && !row.assigneeUserIds.includes(filters.recruiterId)) return false;
  if(filters.source && row.source!==filters.source) return false;
  return true;
}

export function buildPeriodAnalytics(applications: AnalyticsApplication[], history: AnalyticsHistory[], from: string, to: string) {
  const start=parseDay(from).getTime();
  const end=endOfDay(to).getTime();
  const cohort=applications.filter(row=>{const time=new Date(row.createdAt).getTime();return time>=start&&time<=end});
  const eventsByApp=new Map<string,AnalyticsHistory[]>();
  for(const event of history){
    const time=new Date(event.createdAt).getTime();
    if(time>end) continue;
    const list=eventsByApp.get(event.applicationId)??[];
    list.push(event); eventsByApp.set(event.applicationId,list);
  }
  for(const list of eventsByApp.values()) list.sort((a,b)=>new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());

  const cohortStates: Array<{reached:Map<RecruitingStage,number>;stage:RecruitingStage;lastActive:RecruitingStage}>=[];
  const stageReachedCounts=new Map<RecruitingStage,number>(recruitingStages.map(stage=>[stage,0]));
  const stageDurations=new Map<RecruitingStage,number[]>(recruitingStages.map(stage=>[stage,[]]));
  let inWork=0,ready=0,started=0,rejected=0,noShow=0,overdueFirstContact=0;
  const toStartDays:number[]=[];
  const firstContactHours:number[]=[];
  const dailyMap=new Map<string,{newCandidates:number;ready:number;started:number}>();
  const sourceMap=new Map<string,{candidates:number;approved:number;started:number;startDays:number[]}>();
  const exitReasonCounts=new Map<string,number>();

  for(const app of cohort){
    const createdTime=new Date(app.createdAt).getTime();
    const firstReached=new Map<RecruitingStage,number>();
    firstReached.set("new",createdTime);
    let asOfStage:RecruitingStage="new";
    let lastActive:RecruitingStage="new";
    let exitReason:string|null=null;
    for(const event of eventsByApp.get(app.applicationId)??[]){
      const stage=normalizeRecruitingStage(event.toStage);
      const eventTime=new Date(event.createdAt).getTime();
      asOfStage=stage;
      exitReason=event.reasonCode??null;
      if(stageRank.has(stage)){

        lastActive=stage;
        if(!firstReached.has(stage)) firstReached.set(stage,eventTime);
      }
    }
    const updatedTime=new Date(app.updatedAt).getTime();
    if(!(eventsByApp.get(app.applicationId)?.length) && updatedTime<=end){
      const current=normalizeRecruitingStage(app.rawStage);
      asOfStage=current;
      if(stageRank.has(current)){

        lastActive=current;
        if(!firstReached.has(current)) firstReached.set(current,updatedTime);
      }
    }
    cohortStates.push({reached:firstReached,stage:asOfStage,lastActive});
    recruitingStages.forEach(stage=>{if(firstReached.has(stage))stageReachedCounts.set(stage,(stageReachedCounts.get(stage)??0)+1)});
    for(let index=0;index<recruitingStages.length-1;index++){
      const stage=recruitingStages[index], next=recruitingStages[index+1];
      const entered=firstReached.get(stage), advanced=firstReached.get(next);
      if(entered!=null&&advanced!=null&&advanced>=entered) stageDurations.get(stage)!.push((advanced-entered)/3600000);
    }
    if(asOfStage==="preparation") ready++;
    if(asOfStage==="rejected") rejected++;
    if(asOfStage==="no_show") noShow++;
    if(!terminalStages.has(asOfStage)&&!["first_shift","retention_7","retention_30","reserve"].includes(asOfStage)) inWork++;

    const firstContactAt=firstReached.get("interview");
    if(firstContactAt!=null&&firstContactAt>=createdTime) firstContactHours.push((firstContactAt-createdTime)/3600000);
    else if(asOfStage==="new"&&Math.min(end,Date.now())-createdTime>4*3600000) overdueFirstContact++;

    if(terminalStages.has(asOfStage)){
      const code=exitReason??"unspecified";
      exitReasonCounts.set(code,(exitReasonCounts.get(code)??0)+1);
    }

    const sourceKey=[app.source?.trim()||"Источник не указан",app.sourceCampaign].filter(Boolean).join(" · ");
    const sourceStats=sourceMap.get(sourceKey)??{candidates:0,approved:0,started:0,startDays:[]};
    sourceStats.candidates++;
    if(firstReached.has("documents")) sourceStats.approved++;

    const createdDay=isoDay(new Date(createdTime));
    const createdPoint=dailyMap.get(createdDay)??{newCandidates:0,ready:0,started:0};
    createdPoint.newCandidates++;
    dailyMap.set(createdDay,createdPoint);

    const readyAt=firstReached.get("preparation");
    if(readyAt!=null&&readyAt>=start&&readyAt<=end){
      const readyDay=isoDay(new Date(readyAt));
      const readyPoint=dailyMap.get(readyDay)??{newCandidates:0,ready:0,started:0};
      readyPoint.ready++;
      dailyMap.set(readyDay,readyPoint);
    }

    const startedAt=firstReached.get("first_shift");
    if(startedAt!=null){
      started++;
      const startDays=(startedAt-createdTime)/86400000;
      toStartDays.push(startDays);
      sourceStats.started++;
      sourceStats.startDays.push(startDays);
      if(startedAt>=start&&startedAt<=end){
        const startedDay=isoDay(new Date(startedAt));
        const startedPoint=dailyMap.get(startedDay)??{newCandidates:0,ready:0,started:0};
        startedPoint.started++;
        dailyMap.set(startedDay,startedPoint);
      }
    }
    sourceMap.set(sourceKey,sourceStats);
  }

  const total=cohort.length;
  const stages:RecruitingAnalyticsStage[]=recruitingStages.map((stage,index)=>{
    const candidates=stageReachedCounts.get(stage)??0;
    const previous=index===0?total:(stageReachedCounts.get(recruitingStages[index-1])??0);

    const nextStage=recruitingStages[index+1];
    const notAdvanced=nextStage?cohortStates.filter(x=>x.reached.has(stage)&&!x.reached.has(nextStage)).length:0;
    const waiting=cohortStates.filter(x=>x.stage===stage&&x.stage!=="first_shift").length;
    const lost=cohortStates.filter(x=>terminalStages.has(x.stage)&&x.lastActive===stage).length;
    const reserved=cohortStates.filter(x=>x.stage==="reserve"&&x.lastActive===stage).length;
    const skipped=nextStage?cohortStates.filter(x=>x.reached.has(stage)&&!x.reached.has(nextStage)&&recruitingStages.slice(index+2).some(later=>x.reached.has(later))).length:0;
    const transitioned=index===0?total:cohortStates.filter(x=>x.reached.has(stage)&&x.reached.has(recruitingStages[index-1])).length;
    const durations=stageDurations.get(stage)??[];
    return {
      stage,
      label:stage==="new"?"Новые контакты":stage==="first_shift"?"Первый выход":recruitingStageLabels[stage],
      candidates,
      shareTotal:total?Math.round(candidates/total*100):0,
      conversion:index===0?(total?100:0):(previous?Math.round(transitioned/previous*100):0),
      waiting,lost,reserved,skipped,
      notAdvanced,
      notAdvancedRate:candidates?Math.round(notAdvanced/candidates*100):0,
      avgHours:durations.length?Number((durations.reduce((sum,value)=>sum+value,0)/durations.length).toFixed(1)):null,
    };
  });

  const daily:RecruitingAnalyticsDaily[]=[];
  let cursor=parseDay(from);
  const last=parseDay(to);
  let cumulativeNew=0,cumulativeReady=0,cumulativeStarted=0;
  while(cursor<=last){
    const date=isoDay(cursor), point=dailyMap.get(date)??{newCandidates:0,ready:0,started:0};
    cumulativeNew+=point.newCandidates;
    cumulativeReady+=point.ready;
    cumulativeStarted+=point.started;
    daily.push({
      date,
      label:new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"}).format(cursor),
      ...point,
      readyConversion:cumulativeNew?Math.round(cumulativeReady/cumulativeNew*100):0,
      startConversion:cumulativeNew?Math.round(cumulativeStarted/cumulativeNew*100):0,
    });
    cursor=new Date(cursor.getTime()+86400000);
  }

  return {
    stages,
    daily,
    metrics:{
      totalCandidates:total,
      conversionToStart:total?Math.round(started/total*100):0,
      inWork,
      ready,
      avgDaysToStart:toStartDays.length?Number((toStartDays.reduce((sum,value)=>sum+value,0)/toStartDays.length).toFixed(1)):null,
      started,
      rejected,
      noShow,
      avgFirstContactHours:firstContactHours.length?Number((firstContactHours.reduce((sum,value)=>sum+value,0)/firstContactHours.length).toFixed(1)):null,
      overdueFirstContact,
    } satisfies RecruitingAnalyticsMetrics,
    sources:[...sourceMap.entries()].map(([source,value])=>({
      source,
      candidates:value.candidates,
      approved:value.approved,
      started:value.started,
      conversion:value.candidates?Math.round(value.started/value.candidates*100):0,
      avgDaysToStart:value.startDays.length?Number((value.startDays.reduce((sum,item)=>sum+item,0)/value.startDays.length).toFixed(1)):null,
    })).sort((a,b)=>b.started-a.started||b.candidates-a.candidates),
    exitReasonCounts,
  };
}

export function buildSummary(stages: RecruitingAnalyticsStage[]) {
 const top=[...stages].sort((a,b)=>b.lost-a.lost)[0];
 return top?.lost?{title:`Выбытия на этапе «${top.label}»`,text:`Зафиксировано отказов и невыходов: ${top.lost}. Ожидающие выхода не относятся к потерям.`,stage:top.stage}:{title:"Зафиксированных потерь нет",text:"Активные заявки и резерв учитываются отдельно.",stage:null};
}
export function calculateDemoAnalytics(rows:RecruitingApplicationRow[], filters:RecruitingAnalyticsFilters, needs:RecruitingNeedRow[], reasons:RecruitingAnalyticsExitReason[]):RecruitingAnalyticsData {
 const applications:AnalyticsApplication[]=rows.map(row=>({...row,specialtyId:needs.find(n=>n.id===row.needId)?.specialtyId??'',rawStage:row.stage,createdAt:row.createdAt??'1970-01-01',updatedAt:row.updatedAt??row.createdAt??'1970-01-01'})).filter(row=>matchesFilters(row,filters));
 const ids=new Set(applications.map(x=>x.applicationId));
 const history=rows.filter(row=>ids.has(row.applicationId)).flatMap(row=>(row.stageEvents??[]).map(event=>({...event,applicationId:row.applicationId})));
 const current=buildPeriodAnalytics(applications,history,filters.from,filters.to);
 const comparison=buildPeriodAnalytics(applications,history,filters.compareFrom,filters.compareTo);
 return {filters,stages:current.stages,metrics:current.metrics,comparison:comparison.metrics,daily:current.daily,comparisonDaily:comparison.daily,sources:current.sources,summary:buildSummary(current.stages),exitReasons:[...current.exitReasonCounts].map(([code,count])=>({code,count,label:reasons.find(x=>x.code===code)?.label??(code==='unspecified'?'Причина не указана':code)}))};
}
