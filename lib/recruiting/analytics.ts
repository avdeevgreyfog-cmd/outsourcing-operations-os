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
  loss: number;
  lossRate: number;
  avgHours: number | null;
};

export type RecruitingAnalyticsMetrics = {
  totalCandidates: number;
  conversionToStart: number;
  inWork: number;
  ready: number;
  avgDaysToStart: number | null;
  started: number;
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

export type RecruitingAnalyticsData = {
  filters: RecruitingAnalyticsFilters;
  stages: RecruitingAnalyticsStage[];
  metrics: RecruitingAnalyticsMetrics;
  comparison: RecruitingAnalyticsMetrics;
  daily: RecruitingAnalyticsDaily[];
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

export function normalizeRecruitingAnalyticsFilters(input: Partial<Record<"from"|"to"|"compareFrom"|"compareTo"|"object"|"specialty"|"recruiter"|"source",string|undefined>>): RecruitingAnalyticsFilters {
  const defaults=defaultRecruitingAnalyticsFilters();
  let from=validDay(input.from)?input.from!:defaults.from;
  let to=validDay(input.to)?input.to!:defaults.to;
  if(parseDay(from)>parseDay(to)) [from,to]=[to,from];
  const span=Math.max(0,Math.min(365,Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000)));
  const fallbackCompareTo=addDays(from,-1);
  const fallbackCompareFrom=addDays(fallbackCompareTo,-span);
  let compareFrom=validDay(input.compareFrom)?input.compareFrom!:fallbackCompareFrom;
  let compareTo=validDay(input.compareTo)?input.compareTo!:fallbackCompareTo;
  if(parseDay(compareFrom)>parseDay(compareTo)) [compareFrom,compareTo]=[compareTo,compareFrom];
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
  let inWork=0,ready=0,started=0;
  const toStartDays:number[]=[];
  const dailyMap=new Map<string,{newCandidates:number;ready:number;started:number}>();

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
    if(!terminalStages.has(asOfStage)&&asOfStage!=="started") inWork++;
    const startedAt=firstReached.get("started");
    if(startedAt!=null){started++;toStartDays.push((startedAt-createdTime)/86400000)}
    const day=isoDay(new Date(createdTime));
    const point=dailyMap.get(day)??{newCandidates:0,ready:0,started:0};
    point.newCandidates++;
    if(maxRank>=(stageRank.get("ready")??6)) point.ready++;
    if(maxRank>=(stageRank.get("started")??7)) point.started++;
    dailyMap.set(day,point);
  }

  const total=cohort.length;
  const stages:RecruitingAnalyticsStage[]=recruitingStages.map((stage,index)=>{
    const candidates=stageReachedCounts.get(stage)??0;
    const previous=index===0?total:(stageReachedCounts.get(recruitingStages[index-1])??0);
    const next=index<recruitingStages.length-1?(stageReachedCounts.get(recruitingStages[index+1])??0):candidates;
    const loss=index<recruitingStages.length-1?Math.max(0,candidates-next):0;
    const durations=stageDurations.get(stage)??[];
    return {
      stage,
      label:stage==="new"?"Новые / отклики":stage==="preparation"?"Документы / подготовка":stage==="started"?"Вышел на работу":recruitingStageLabels[stage],
      candidates,
      shareTotal:total?Math.round(candidates/total*100):0,
      conversion:index===0?100:(previous?Math.round(candidates/previous*100):0),
      loss,
      lossRate:candidates?Math.round(loss/candidates*100):0,
      avgHours:durations.length?Number((durations.reduce((sum,value)=>sum+value,0)/durations.length).toFixed(1)):null,
    };
  });

  const daily:RecruitingAnalyticsDaily[]=[];
  let cursor=parseDay(from);
  const last=parseDay(to);
  while(cursor<=last){
    const date=isoDay(cursor), point=dailyMap.get(date)??{newCandidates:0,ready:0,started:0};
    daily.push({
      date,
      label:new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"}).format(cursor),
      ...point,
      readyConversion:point.newCandidates?Math.round(point.ready/point.newCandidates*100):0,
      startConversion:point.newCandidates?Math.round(point.started/point.newCandidates*100):0,
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
    } satisfies RecruitingAnalyticsMetrics,
  };
}

function buildSummary(stages: RecruitingAnalyticsStage[]) {
  const transitions=stages.slice(0,-1).map((stage,index)=>({stage,next:stages[index+1],loss:stage.loss,rate:stage.lossRate})).sort((a,b)=>b.rate-a.rate||b.loss-a.loss);
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

function demoAnalytics(actor: Actor, filters: RecruitingAnalyticsFilters): RecruitingAnalyticsData {
  const end=parseDay(filters.to);
  const span=Math.max(1,Math.round((parseDay(filters.to).getTime()-parseDay(filters.from).getTime())/86400000)+1);
  const recruiterId="10000000-0000-4000-8000-000000000005";
  const apps:AnalyticsApplication[]=[];
  const history:AnalyticsHistory[]=[];
  const filtered=demo.candidates.filter(row=>canReadRow(actor.access,"recruiting.candidate.read",row,actor)).filter(row=>{
    if(filters.objectId&&row.objectId!==filters.objectId)return false;
    if(filters.specialtyId&&demoSpecialtyId(row.need)!==filters.specialtyId)return false;
    if(filters.recruiterId&&filters.recruiterId!==recruiterId)return false;
    if(filters.source&&row.source!==filters.source)return false;
    return true;
  });
  filtered.forEach((row,index)=>{
    const current=normalizeRecruitingStage(row.stage);
    const rank=stageRank.get(current)??0;
    const offset=Math.min(span-1,(index*2+rank)%span);
    const created=new Date(end.getTime()-offset*86400000);
    const applicationId=`demo-analytics-${index+1}`;
    apps.push({
      applicationId,organizationId:row.organizationId,objectId:row.objectId??null,specialtyId:demoSpecialtyId(row.need),
      regionId:row.regionId??null,clientId:row.clientId??null,ownerUserId:recruiterId,managerUserId:null,
      assigneeUserIds:row.assigneeUserIds??[recruiterId],source:row.source??null,rawStage:current,createdAt:created.toISOString(),
      updatedAt:new Date(Math.min(end.getTime()+12*3600000,created.getTime()+rank*30*3600000)).toISOString(),
    });
    for(let stageIndex=0;stageIndex<=rank;stageIndex++){
      const stage=recruitingStages[stageIndex];
      history.push({applicationId,toStage:stage,createdAt:new Date(Math.min(end.getTime()+12*3600000,created.getTime()+stageIndex*30*3600000)).toISOString()});
    }
  });
  const current=buildPeriodAnalytics(apps,history,filters.from,filters.to);
  const comparison:RecruitingAnalyticsMetrics={
    totalCandidates:Math.max(0,Math.round(current.metrics.totalCandidates*.88)),
    conversionToStart:Math.max(0,current.metrics.conversionToStart-2),
    inWork:Math.max(0,Math.round(current.metrics.inWork*.92)),
    ready:Math.max(0,current.metrics.ready-1),
    avgDaysToStart:current.metrics.avgDaysToStart==null?null:Number((current.metrics.avgDaysToStart+1.8).toFixed(1)),
    started:Math.max(0,current.metrics.started-1),
  };
  return {filters,stages:current.stages,metrics:current.metrics,comparison,daily:current.daily,summary:buildSummary(current.stages)};
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
        ca.manager_user_id "managerUserId",c.source,ca.stage "rawStage",ca.created_at::text "createdAt",ca.updated_at::text "updatedAt",
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
    return {
      filters,
      stages:current.stages,
      metrics:current.metrics,
      comparison:comparison.metrics,
      daily:current.daily,
      summary:buildSummary(current.stages),
    };
  });
}
