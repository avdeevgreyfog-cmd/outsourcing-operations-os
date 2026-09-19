import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { canReadRow } from "@/lib/core/access.mjs";
import { withTenant } from "@/lib/db/client";
import * as demo from "@/lib/demo/data";
import { normalizeRecruitingStage, recruitingStageLabels, recruitingStages, type RecruitingStage } from "./model";

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

type AnalyticsApplication = {
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
  rejectionReasonCode: string | null;
  rawStage: string;
  createdAt: string;
  updatedAt: string;
};

type AnalyticsHistory = {
  applicationId: string;
  toStage: string;
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

function buildPeriodAnalytics(applications: AnalyticsApplication[], history: AnalyticsHistory[], from: string, to: string) {
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
    let maxRank=0;
    for(const event of eventsByApp.get(app.applicationId)??[]){
      const stage=normalizeRecruitingStage(event.toStage);
      const eventTime=new Date(event.createdAt).getTime();
      asOfStage=stage;
      if(stageRank.has(stage)){
        const rank=stageRank.get(stage)!;
        maxRank=Math.max(maxRank,rank);
        if(!firstReached.has(stage)) firstReached.set(stage,eventTime);
      }
    }
    const updatedTime=new Date(app.updatedAt).getTime();
    if(updatedTime<=end){
      const current=normalizeRecruitingStage(app.rawStage);
      asOfStage=current;
      if(stageRank.has(current)){
        const rank=stageRank.get(current)!;
        maxRank=Math.max(maxRank,rank);
        if(!firstReached.has(current)) firstReached.set(current,updatedTime);
      }
    }
    recruitingStages.forEach((stage,index)=>{if(maxRank>=index)stageReachedCounts.set(stage,(stageReachedCounts.get(stage)??0)+1)});
    for(let index=0;index<recruitingStages.length-1;index++){
      const stage=recruitingStages[index], next=recruitingStages[index+1];
      const entered=firstReached.get(stage), advanced=firstReached.get(next);
      if(entered!=null&&advanced!=null&&advanced>=entered) stageDurations.get(stage)!.push((advanced-entered)/3600000);
    }
    if(asOfStage==="ready") ready++;
    if(asOfStage==="rejected") rejected++;
    if(asOfStage==="no_show") noShow++;
    if(!terminalStages.has(asOfStage)&&asOfStage!=="started") inWork++;

    const firstContactAt=firstReached.get("contact");
    if(firstContactAt!=null&&firstContactAt>=createdTime) firstContactHours.push((firstContactAt-createdTime)/3600000);
    else if(asOfStage==="new"&&Math.min(end,Date.now())-createdTime>4*3600000) overdueFirstContact++;

    if(terminalStages.has(asOfStage)&&app.rejectionReasonCode){
      exitReasonCounts.set(app.rejectionReasonCode,(exitReasonCounts.get(app.rejectionReasonCode)??0)+1);
    }

    const sourceKey=app.source?.trim()||"Источник не указан";
    const sourceStats=sourceMap.get(sourceKey)??{candidates:0,approved:0,started:0,startDays:[]};
    sourceStats.candidates++;
    if(maxRank>=(stageRank.get("approved")??4)) sourceStats.approved++;

    const createdDay=isoDay(new Date(createdTime));
    const createdPoint=dailyMap.get(createdDay)??{newCandidates:0,ready:0,started:0};
    createdPoint.newCandidates++;
    dailyMap.set(createdDay,createdPoint);

    const readyAt=firstReached.get("ready");
    if(readyAt!=null&&readyAt>=start&&readyAt<=end){
      const readyDay=isoDay(new Date(readyAt));
      const readyPoint=dailyMap.get(readyDay)??{newCandidates:0,ready:0,started:0};
      readyPoint.ready++;
      dailyMap.set(readyDay,readyPoint);
    }

    const startedAt=firstReached.get("started");
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
    const next=index<recruitingStages.length-1?(stageReachedCounts.get(recruitingStages[index+1])??0):candidates;
    const notAdvanced=index<recruitingStages.length-1?Math.max(0,candidates-next):0;
    const durations=stageDurations.get(stage)??[];
    return {
      stage,
      label:stage==="new"?"Новые / отклики":stage==="preparation"?"Документы / подготовка":stage==="started"?"Вышел на работу":recruitingStageLabels[stage],
      candidates,
      shareTotal:total?Math.round(candidates/total*100):0,
      conversion:index===0?100:(previous?Math.round(candidates/previous*100):0),
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

function buildSummary(stages: RecruitingAnalyticsStage[]) {
  const transitions=stages.slice(0,-1).map((stage,index)=>({stage,next:stages[index+1],loss:stage.notAdvanced,rate:stage.notAdvancedRate})).sort((a,b)=>b.rate-a.rate||b.loss-a.loss);
  const top=transitions[0];
  if(!top||top.loss===0) return {title:"Воронка стабильна",text:"Выраженных потерь между этапами не видно. Следите за скоростью обработки новых откликов и сроком выхода.",stage:null};
  let recommendation="Проверьте причины отказов и скорость обработки на этом переходе.";
  if(top.stage.stage==="contact"&&top.next.stage==="interview") recommendation="Основная гипотеза — первичная обработка: скорость контакта, качество скрининга и подтверждение интереса.";
  else if(top.stage.stage==="approved"&&top.next.stage==="preparation") recommendation="Проверьте дожим после согласования, сбор документов и понятность дальнейших шагов для кандидата.";
  else if(top.stage.stage==="ready"&&top.next.stage==="started") recommendation="Узкое место находится на фактическом выходе: проверьте логистику, подтверждение смены и связь с кандидатом перед объектом.";
  else if(top.stage.stage==="manager_review"&&top.next.stage==="approved") recommendation="Проверьте скорость и критерии согласования со стороны менеджера объекта.";
  return {title:`Главная потеря: ${top.stage.label} → ${top.next.label}`,text:`Потеряно ${top.loss} кандидатов (${top.rate}%). ${recommendation}`,stage:top.stage.stage};
}

function demoSpecialtyId(name: string | undefined) {
  if(name==="Грузчик") return "60000000-0000-4000-8000-000000000002";
  if(name==="Сборщик мебели") return "60000000-0000-4000-8000-000000000003";
  return "60000000-0000-4000-8000-000000000001";
}

function buildDemoPeriodRows(rows: typeof demo.candidates, from: string, to: string, scale = 1, rankPenalty = 0) {
  const end=parseDay(to);
  const span=Math.max(1,Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000)+1);
  const count=Math.max(0,Math.min(rows.length,Math.round(rows.length*scale)));
  const applications:AnalyticsApplication[]=[];
  const history:AnalyticsHistory[]=[];
  rows.slice(0,count).forEach((row,index)=>{
    const current=normalizeRecruitingStage(row.stage);
    const reachedStage=normalizeRecruitingStage((row as {reachedStage?:string}).reachedStage??row.stage);
    const baseRank=stageRank.get(reachedStage)??0;
    const rank=Math.max(0,baseRank-(rankPenalty>0&&index%3===0?rankPenalty:0));
    const offset=Math.min(span-1,(index*2+rank)%span);
    const created=new Date(end.getTime()-offset*86400000);
    const applicationId=`demo-analytics-${from}-${index+1}`;
    applications.push({
      applicationId,organizationId:row.organizationId,objectId:row.objectId??null,specialtyId:demoSpecialtyId(row.need),
      regionId:row.regionId??null,clientId:row.clientId??null,ownerUserId:"10000000-0000-4000-8000-000000000005",managerUserId:null,
      assigneeUserIds:row.assigneeUserIds??["10000000-0000-4000-8000-000000000005"],source:row.source??null,rejectionReasonCode:(row as {rejectionReasonCode?:string}).rejectionReasonCode??null,
      rawStage:terminalStages.has(current)?current:(recruitingStages[rank]??"new"),createdAt:created.toISOString(),
      updatedAt:new Date(Math.min(end.getTime()+12*3600000,created.getTime()+rank*30*3600000)).toISOString(),
    });
    for(let stageIndex=0;stageIndex<=rank;stageIndex++){
      history.push({applicationId,toStage:recruitingStages[stageIndex],createdAt:new Date(Math.min(end.getTime()+12*3600000,created.getTime()+stageIndex*30*3600000)).toISOString()});
    }
  });
  return {applications,history};
}

function demoAnalytics(actor: Actor, filters: RecruitingAnalyticsFilters): RecruitingAnalyticsData {
  const recruiterId="10000000-0000-4000-8000-000000000005";
  const filtered=demo.candidates.filter(row=>canReadRow(actor.access,"recruiting.candidate.read",row,actor)).filter(row=>{
    if(filters.objectId&&row.objectId!==filters.objectId)return false;
    if(filters.specialtyId&&demoSpecialtyId(row.need)!==filters.specialtyId)return false;
    if(filters.recruiterId&&filters.recruiterId!==recruiterId)return false;
    if(filters.source&&row.source!==filters.source)return false;
    return true;
  });
  const currentSpan=Math.max(1,Math.round((parseDay(filters.to).getTime()-parseDay(filters.from).getTime())/86400000)+1);
  const compareSpan=Math.max(1,Math.round((parseDay(filters.compareTo).getTime()-parseDay(filters.compareFrom).getTime())/86400000)+1);
  const currentRows=buildDemoPeriodRows(filtered,filters.from,filters.to,1,0);
  const compareScale=Math.min(1.2,Math.max(.35,(compareSpan/currentSpan)*.86));
  const compareRows=buildDemoPeriodRows(filtered,filters.compareFrom,filters.compareTo,compareScale,1);
  const current=buildPeriodAnalytics(currentRows.applications,currentRows.history,filters.from,filters.to);
  const comparison=buildPeriodAnalytics(compareRows.applications,compareRows.history,filters.compareFrom,filters.compareTo);
  return {
    filters,stages:current.stages,metrics:current.metrics,comparison:comparison.metrics,
    daily:current.daily,comparisonDaily:comparison.daily,sources:current.sources,exitReasons:[],
    summary:buildSummary(current.stages)
  };
}

export async function getRecruitingAnalytics(actor: Actor, filters: RecruitingAnalyticsFilters): Promise<RecruitingAnalyticsData> {
  requireCapability(actor,"recruiting.candidate.read");
  if(actor.demo) return demoAnalytics(actor,filters);
  return withTenant(actor.organizationId,actor.userId,async sql=>{
    const earliest=[filters.from,filters.compareFrom].sort()[0];
    const latest=[filters.to,filters.compareTo].sort().at(-1)!;
    const rows=await sql<AnalyticsApplication[]>`
      SELECT ca.id "applicationId",ca.organization_id "organizationId",ca.object_id "objectId",n.specialty_id "specialtyId",
        COALESCE(n.region_id,o.region_id) "regionId",o.client_company_id "clientId",ca.owner_user_id "ownerUserId",
        ca.manager_user_id "managerUserId",c.source,ca.rejection_reason_code "rejectionReasonCode",ca.stage "rawStage",ca.created_at::text "createdAt",ca.updated_at::text "updatedAt",
        ARRAY_REMOVE(ARRAY[ca.owner_user_id::text,ca.manager_user_id::text],NULL)
          || ARRAY(SELECT na.recruiter_user_id::text FROM need_assignments na WHERE na.need_id=ca.need_id AND na.unassigned_at IS NULL AND na.recruiter_user_id IS NOT NULL)
          || ARRAY(SELECT oa.user_id::text FROM object_assignments oa WHERE oa.object_id=ca.object_id AND oa.effective_to IS NULL) "assigneeUserIds"
      FROM candidate_applications ca
      JOIN candidates c ON c.id=ca.candidate_id
      JOIN needs n ON n.id=ca.need_id
      LEFT JOIN objects o ON o.id=ca.object_id
      WHERE ca.created_at>=${earliest}::date AND ca.created_at<(${latest}::date+INTERVAL '1 day')
      ORDER BY ca.created_at
    `;
    const applications=rows.filter(row=>canReadRow(actor.access,"recruiting.candidate.read",row,actor)).filter(row=>matchesFilters(row,filters));
    const ids=applications.map(row=>row.applicationId);
    const history=ids.length?await sql<AnalyticsHistory[]>`
      SELECT h.application_id "applicationId",h.to_stage "toStage",h.created_at::text "createdAt"
      FROM candidate_stage_history h
      WHERE h.application_id=ANY(${ids}::uuid[]) AND h.created_at<(${latest}::date+INTERVAL '1 day')
      ORDER BY h.application_id,h.created_at
    `:[];

    const current=buildPeriodAnalytics(applications,history,filters.from,filters.to);
    const comparison=buildPeriodAnalytics(applications,history,filters.compareFrom,filters.compareTo);
    const reasonCodes=[...current.exitReasonCounts.keys()];
    const reasonRows=reasonCodes.length?await sql<Array<{code:string;label:string}>>`
      SELECT code,name label FROM candidate_exit_reasons
      WHERE code=ANY(${reasonCodes}::text[]) AND active
    `:[];
    const reasonLabel=new Map(reasonRows.map(row=>[row.code,row.label]));
    return {
      filters,
      stages:current.stages,
      metrics:current.metrics,
      comparison:comparison.metrics,
      daily:current.daily,
      comparisonDaily:comparison.daily,
      sources:current.sources,
      exitReasons:[...current.exitReasonCounts.entries()].map(([code,count])=>({code,label:reasonLabel.get(code)??code,count})).sort((a,b)=>b.count-a.count),
      summary:buildSummary(current.stages),
    };
  });
}
