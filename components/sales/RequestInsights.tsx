"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download,
  FileText, Handshake, RotateCcw, Settings2, TrendingUp, UsersRound, X,
} from "lucide-react";
import { SalesEmpty } from "./SalesUI";
import { RequestAnalyticsTrendChart, type RequestAnalyticsUnit } from "@/components/RequestAnalyticsTrendChart";
import type { RequestAnalyticsData, RequestAnalyticsFilters, RequestAnalyticsBreakdownRow } from "@/lib/commercial/request-analytics";
import {
  defaultRequestAnalyticsMetricPreferences,
  requestAnalyticsMetricCatalog,
  requestAnalyticsMetricDefinition,
  type RequestAnalyticsMetricKey,
  type RequestAnalyticsMetricPreference,
} from "@/lib/commercial/request-analytics-metric-registry";
import { requestSourceLabel, defaultRequestStages, type RequestWorkspaceOptions, type RequestBoardRow, type RequestStageDefinition } from "@/lib/commercial/request-workflow";
import { analyticsFromBoardRows } from "@/lib/commercial/request-analytics-calculation";

export const lossLabels: Record<string, string> = {
  price:"Цена / экономика",
  competitor:"Выбран другой подрядчик",
  cancelled:"Потребность отменена",
  timing:"Не устроили сроки",
  terms:"Не устроили условия",
  conditions:"Не устроили условия",
  no_response:"Нет ответа заказчика",
  staffing_failure:"Не смогли обеспечить персонал",
  staffing:"Не смогли обеспечить персонал",
  other:"Другое",
};

export function daysSince(value:string,now:number){
  const time=Date.parse(value);
  return Number.isFinite(time)?Math.max(0,Math.floor((now-time)/86400000)):null;
}

type FunnelMode="share"|"conversion"|"not_advanced"|"time";
type BreakdownMode="clients"|"owners"|"sources";
type Props={
  analytics:RequestAnalyticsData;
  options:RequestWorkspaceOptions;
  metricPreferences:RequestAnalyticsMetricPreference[];
  canConfigureMetrics:boolean;
  demo:boolean;
  demoRows?:RequestBoardRow[];
  stageDefinitions?:RequestStageDefinition[];
  onStage:(code:string,requestIds?:string[])=>void;
};

const demoMetricStorageKey="operis.requests.analytics.metrics.v1";

export function RequestInsights({analytics:serverAnalytics,options,metricPreferences,canConfigureMetrics,demo,demoRows,stageDefinitions=defaultRequestStages,onStage}:Props){
  const analytics=useMemo(()=>demo&&demoRows?analyticsFromBoardRows(demoRows,serverAnalytics.filters,stageDefinitions,options.specialties):serverAnalytics,[demo,demoRows,serverAnalytics,stageDefinitions,options.specialties]);
  const router=useRouter();
  const [unit,setUnit]=useState<RequestAnalyticsUnit>("requests");
  const [mode,setMode]=useState<FunnelMode>("conversion");
  const [breakdownMode,setBreakdownMode]=useState<BreakdownMode>("clients");
  const [preferences,setPreferences]=useState<RequestAnalyticsMetricPreference[]>(metricPreferences);
  const [draftPreferences,setDraftPreferences]=useState<RequestAnalyticsMetricPreference[]>(metricPreferences);
  const [showMetrics,setShowMetrics]=useState(false);
  const [savingMetrics,setSavingMetrics]=useState(false);
  const [metricError,setMetricError]=useState("");
  const filters=analytics.filters;
  const currentPeriodDays=periodDays(filters.from,filters.to);

  useEffect(()=>{
    if(!demo)return;
    let frame=0;
    try{
      const raw=localStorage.getItem(demoMetricStorageKey);
      if(!raw)return;
      const parsed=JSON.parse(raw) as RequestAnalyticsMetricPreference[];
      const allowed=new Set(requestAnalyticsMetricCatalog.map(item=>item.key));
      const clean=parsed.filter(item=>allowed.has(item.key));
      if(clean.length)frame=requestAnimationFrame(()=>{setPreferences(clean);setDraftPreferences(clean)});
    }catch{}
    return()=>{if(frame)cancelAnimationFrame(frame)};
  },[demo]);

  function apply(patch:Partial<RequestAnalyticsFilters>){
    const next={...filters,...patch};
    const params=new URLSearchParams({view:"analytics",from:next.from,to:next.to});
    if(next.clientId)params.set("client",next.clientId);
    if(next.ownerId)params.set("owner",next.ownerId);
    if(next.regionId)params.set("region",next.regionId);
    if(next.source)params.set("source",next.source);
    if(next.specialtyId)params.set("specialty",next.specialtyId);
    router.replace(`/requests?${params.toString()}`,{scroll:false});
  }
  function setPreset(days:number){apply({from:shiftDay(filters.to,-(days-1)),to:filters.to})}

  const funnelSteps=useMemo(()=>analytics.stages.map((stage,index)=>{
    const value=unit==="requests"?stage.requests:stage.headcount;
    const share=unit==="requests"?stage.shareRequests:stage.shareHeadcount;
    const conversion=unit==="requests"?stage.conversionRequests:stage.conversionHeadcount;
    const notAdvanced=unit==="requests"?stage.notAdvancedRequests:stage.notAdvancedHeadcount;
    const notAdvancedRate=unit==="requests"?stage.notAdvancedRate:stage.notAdvancedHeadcountRate;
    const incoming=unit==="requests"?analytics.metrics.newRequests:analytics.metrics.newHeadcount;
    const previous=index===0?incoming:unit==="requests"?analytics.stages[index-1].requests:analytics.stages[index-1].headcount;
    return {
      key:stage.code,label:stage.label,value,requestIds:stage.requestIds,note:incoming?`${share}% от входящего объёма`:"Нет входящих заявок",
      aside:mode==="share"?(incoming?`${share}%`:"—"):mode==="conversion"?(previous?`${conversion}%`:"—"):mode==="not_advanced"?(stage.code===analytics.stages.at(-1)?.code||!value?"—":`${notAdvanced} · ${notAdvancedRate}%`):formatDuration(stage.avgHours),
    };
  }),[analytics.stages,analytics.metrics.newRequests,analytics.metrics.newHeadcount,unit,mode]);

  const gaps=useMemo(()=>analytics.stages.slice(0,-1).map((stage,index)=>({
    from:stage.label,to:analytics.stages[index+1]?.label??"",
    count:unit==="requests"?stage.notAdvancedRequests:stage.notAdvancedHeadcount,
    rate:unit==="requests"?stage.notAdvancedRate:stage.notAdvancedHeadcountRate,
    pending:stage.pendingRequests,lost:stage.lostRequests,
  })).filter(item=>item.count>0).sort((a,b)=>b.rate-a.rate||b.count-a.count).slice(0,5),[analytics.stages,unit]);

  const visibleMetrics=useMemo(()=>preferences.filter(item=>item.visible).sort((a,b)=>a.position-b.position),[preferences]);

  function metricRaw(key:RequestAnalyticsMetricKey,current:boolean){
    const metrics=current?analytics.metrics:analytics.comparison;
    if(key==="conversion_requests"&&!metrics.newRequests)return null;
    if(key==="conversion_headcount"&&!metrics.newHeadcount)return null;
    return metrics[camelMetricKey(key)];
  }

  function openMetricSettings(){
    const byKey=new Map(preferences.map(item=>[item.key,item]));
    setDraftPreferences(requestAnalyticsMetricCatalog.map(def=>byKey.get(def.key)??{key:def.key,label:def.label,visible:def.defaultVisible,position:def.defaultPosition,targetValue:null}).sort((a,b)=>a.position-b.position));
    setMetricError("");setShowMetrics(true);
  }
  function moveMetric(index:number,direction:-1|1){
    setDraftPreferences(current=>{
      const next=[...current],target=index+direction;if(target<0||target>=next.length)return current;
      [next[index],next[target]]=[next[target],next[index]];
      return next.map((item,position)=>({...item,position:position*10}));
    });
  }
  async function saveMetricSettings(){
    const normalized=draftPreferences.map((item,index)=>({...item,position:index*10,label:item.label.trim()||requestAnalyticsMetricDefinition(item.key).label}));
    if(!normalized.some(item=>item.visible)){setMetricError("Оставьте хотя бы один показатель.");return}
    setSavingMetrics(true);setMetricError("");
    try{
      if(demo){
        localStorage.setItem(demoMetricStorageKey,JSON.stringify(normalized));setPreferences(normalized);setShowMetrics(false);return;
      }
      const response=await fetch("/api/requests/analytics/metrics",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({items:normalized})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить показатели");
      setPreferences(normalized);setShowMetrics(false);router.refresh();
    }catch(error){setMetricError(error instanceof Error?error.message:"Не удалось сохранить показатели")}
    finally{setSavingMetrics(false)}
  }

  function stageConversion(index:number,analysisUnit:RequestAnalyticsUnit){
    const stage=analytics.stages[index];
    const denominator=index===0?(analysisUnit==="requests"?analytics.metrics.newRequests:analytics.metrics.newHeadcount):(analysisUnit==="requests"?analytics.stages[index-1].requests:analytics.stages[index-1].headcount);
    return denominator?`${analysisUnit==="requests"?stage.conversionRequests:stage.conversionHeadcount}%`:"—";
  }

  function exportCsv(){
    const header=["Этап","Заявки","Численность","Конверсия заявок","Конверсия численности","Не перешли, заявки","Не перешли, чел.","Среднее время"];
    const lines=analytics.stages.map((stage,index)=>[stage.label,stage.requests,stage.headcount,stageConversion(index,"requests"),stageConversion(index,"headcount"),stage.notAdvancedRequests,stage.notAdvancedHeadcount,formatDuration(stage.avgHours)]);
    const csv="\ufeff"+[header,...lines].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(";")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),anchor=document.createElement("a");
    anchor.href=url;anchor.download=`analitika-zayavok-${filters.from}-${filters.to}.csv`;anchor.click();URL.revokeObjectURL(url);
  }

  const breakdownRows=analytics.breakdowns[breakdownMode];
  const sourceOptions=[...new Set(options.sources)];

  return <div className="request-analytics-screen request-analytics-unified">
    {demo&&<p className="request-analytics-context-note"><AlertTriangle size={14} aria-hidden="true"/><span>Демо: история переходов неполная. Учитываются только известные этапы.</span></p>}
    <section className="request-analytics-filters" aria-label="Фильтры аналитики заявок">
      <div className="request-date-filter"><span><CalendarDays size={14}/> Период</span><input aria-label="Начало периода аналитики" type="date" value={filters.from} onChange={event=>apply({from:event.target.value})}/><i>—</i><input aria-label="Конец периода аналитики" type="date" value={filters.to} onChange={event=>apply({to:event.target.value})}/></div>
      <div className="request-period-presets" role="group" aria-label="Быстрый выбор периода">{[7,30,90].map(days=><button type="button" key={days} className={currentPeriodDays===days?"active":""} onClick={()=>setPreset(days)}>{days} дней</button>)}</div>
      <div className="request-auto-compare"><span>Сравнение</span><strong>{formatRange(filters.compareFrom,filters.compareTo)}</strong><small>предыдущий равный период</small></div>
      <select value={filters.clientId??""} onChange={event=>apply({clientId:event.target.value||null})} aria-label="Клиент"><option value="">Все клиенты</option>{options.clients.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={filters.ownerId??""} onChange={event=>apply({ownerId:event.target.value||null})} aria-label="Ответственный"><option value="">Все ответственные</option>{options.members.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={filters.regionId??""} onChange={event=>apply({regionId:event.target.value||null})} aria-label="Регион"><option value="">Все регионы</option>{options.regions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={filters.specialtyId??""} onChange={event=>apply({specialtyId:event.target.value||null})} aria-label="Специальность"><option value="">Все специальности</option>{options.specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={filters.source??""} onChange={event=>apply({source:event.target.value||null})} aria-label="Источник"><option value="">Все источники</option>{sourceOptions.map(item=><option key={item} value={item}>{requestSourceLabel(item)}</option>)}</select>
      <button type="button" className="button" onClick={()=>router.replace("/requests?view=analytics",{scroll:false})}><RotateCcw size={14}/> Сбросить</button>
    </section>

    <details className="request-analytics-help">
      <summary><span>Как считаются показатели</span><ChevronDown size={14} aria-hidden="true"/></summary>
      <div>
        <p><strong>За период</strong> — новые заявки выбранного периода и их результат. <strong>Сейчас</strong> — текущее состояние всех доступных заявок, вне выбранного периода. Графики событий показывают события по датам, в том числе по более ранним заявкам.</p>
        <p><strong>Воронка и разрывы</strong> учитывают только зафиксированные этапы. Если следующий этап не записан, заявка входит в разрыв; это может быть работающий процесс, несогласование или пропущенная запись. Разрыв сам по себе не означает отказ.</p>
        {demo&&<p><strong>Демо</strong> использует те же заявки, что таблица и доска, без полной истории переходов и отправок. Первое КП учитывается только при единственной известной отправке; пропущенные этапы не восстанавливаются.</p>}
      </div>
    </details>

      <section className="request-kpi-panel request-kpi-overview">
        <div className="request-kpi-title"><span>Показатели заявок</span><div><small>Период: {formatRange(filters.from,filters.to)}</small>{canConfigureMetrics&&<button type="button" className="icon-button" onClick={openMetricSettings} aria-label="Настроить показатели"><Settings2 size={15}/></button>}</div></div>
        <div className="request-kpi-grid">{visibleMetrics.map(item=>{
          const definition=requestAnalyticsMetricDefinition(item.key),current=metricRaw(item.key,true),previous=definition.comparison?metricRaw(item.key,false):null;
          const delta=definition.comparison&&current!=null&&previous!=null?metricTrend(current,previous,definition.direction,definition.format):null;
          return <div className="request-kpi-card" key={item.key}><span className="request-kpi-icon">{metricIcon(item.key)}</span><div><span>{item.label}</span><em>{definition.comparison?"За период":"Сейчас · вне периода"}</em><strong>{formatMetricValue(current,definition.format)}</strong><small className={delta?.tone??"neutral"}>{metricFootnote(item,definition,delta?.text??null)}</small></div></div>;
        })}</div>
      </section>

    <div className="request-analytics-primary-grid">
      <section className="request-analytics-card request-funnel-card">
        <div className="request-analytics-card-head">
          <div><h3>Коммерческая воронка</h3><p>Новые заявки выбранного периода.</p><p className="request-funnel-shape-note">Форма условная: ширина не отражает количество.</p></div>
          <div className="request-analytics-head-actions">
            <div className="request-unit-toggle" role="group" aria-label="Единица анализа"><button type="button" className={unit==="requests"?"active":""} aria-pressed={unit==="requests"} onClick={()=>setUnit("requests")}>Заявки</button><button type="button" className={unit==="headcount"?"active":""} aria-pressed={unit==="headcount"} onClick={()=>setUnit("headcount")}>Численность</button></div>
            <div className="request-mini-segments" role="group" aria-label="Режим воронки">{([
              ["share","Доля"],["conversion","Конверсия"],["not_advanced","Не перешли"],["time","Среднее время"],
            ] as const).map(([value,label])=><button type="button" key={value} className={mode===value?"active":""} aria-pressed={mode===value} onClick={()=>setMode(value)}>{label}</button>)}</div>
          </div>
        </div>
        <div className="request-funnel-readable" aria-label="Коммерческая воронка заявок">
          <div className="request-funnel-readable-head"><span>Этап</span><span>{unit==="requests"?"Заявки":"Численность"}</span><span>{funnelModeLabel(mode)}</span></div>
          {funnelSteps.map((step,index)=>{
            const width=100-index*58/Math.max(funnelSteps.length-1,1),nextWidth=100-(index+1)*58/Math.max(funnelSteps.length-1,1),inset=(100-width)/2,nextInset=(100-nextWidth)/2;
            return <button type="button" className="request-funnel-readable-row" key={step.key} onClick={()=>onStage(step.key,step.requestIds)} aria-label={`${step.label}: ${step.value}. Показать заявки`}>
              <span className="request-funnel-stage-name"><i>{index+1}</i><span><strong>{step.label}</strong><small>{step.note}</small></span></span>
              <span className="request-funnel-polygon"><i style={{clipPath:`polygon(${inset}% 0,${100-inset}% 0,${100-nextInset}% 100%,${nextInset}% 100%)`}}/><strong>{step.value}</strong></span>
              <span className="request-funnel-result">{step.aside}</span>
            </button>;
          })}
        </div>
      </section>

      <section className="request-analytics-card request-gap-card">
        <div className="request-analytics-card-head"><div><h3>Где застревают заявки?</h3><p>Переходы без следующего зафиксированного этапа.</p></div></div>
        <div className="request-gap-list">{gaps.length?gaps.map((item,index)=><div className="request-gap-row" key={`${item.from}-${item.to}`}><span className="request-gap-rank">{index+1}</span><span className="request-gap-copy"><strong>{item.from} → {item.to}</strong><small>В работе: {item.pending} заяв. · Не согласовано: {item.lost} заяв.</small><i><span style={{width:`${item.rate}%`}}/></i></span><b>{item.count} <small>({item.rate}%)</small></b></div>):<SalesEmpty title="Зафиксированных разрывов нет" text="Все зафиксированные переходы пройдены либо для анализа пока недостаточно данных."/>}</div>
      </section>
    </div>

    <div className="request-analytics-chart-grid">
      <RequestAnalyticsTrendChart rows={analytics.daily} comparisonRows={analytics.comparisonDaily} unit={unit} variant="inflow"/>
      <RequestAnalyticsTrendChart rows={analytics.daily} comparisonRows={analytics.comparisonDaily} unit={unit} variant="outcomes"/>
    </div>

    <div className="request-analytics-secondary-grid">
      <section className="request-analytics-card request-breakdown-card">
        <div className="request-analytics-card-head"><div><h3>Разрез эффективности</h3><p>Результат по новым заявкам периода.</p></div><div className="request-mini-segments">{(["clients","owners","sources"] as BreakdownMode[]).map(value=><button type="button" key={value} className={breakdownMode===value?"active":""} aria-pressed={breakdownMode===value} onClick={()=>setBreakdownMode(value)}>{value==="clients"?"Клиенты":value==="owners"?"Ответственные":"Источники"}</button>)}</div></div>
        <BreakdownTable rows={breakdownRows} unit={unit}/>
      </section>

      <section className={`request-analytics-card request-loss-reasons${analytics.lossReasons.length?"":" is-empty"}`}>
        <div className="request-analytics-card-head"><div><h3>Причины несогласования</h3><p>Зафиксированные причины по заявкам периода.</p></div></div>
        <div className="request-loss-reason-list">{analytics.lossReasons.length?analytics.lossReasons.slice(0,8).map(row=><div key={row.code}><span>{row.label}</span><strong>{unit==="requests"?row.requests:row.headcount}</strong></div>):<div className="request-analytics-empty">Причины за этот период ещё не зафиксированы.</div>}</div>
      </section>
    </div>

    <details className="request-analytics-card request-stage-details">
        <summary className="request-stage-details-summary"><span><strong>Этапы воронки — детали</strong><small>Конверсия, скорость и разрыв по каждой ступени</small></span><ChevronDown size={16} aria-hidden="true"/></summary><div className="request-stage-details-actions"><button type="button" className="button" onClick={exportCsv}><Download size={14}/> Экспорт</button></div>
        <div className="request-stage-table-wrap"><table className="data-table request-stage-table"><thead><tr><th>#</th><th>Этап</th><th>Заявки</th><th>Численность</th><th>Конверсия</th><th>Не перешли</th><th>Ср. время</th></tr></thead><tbody>{analytics.stages.map((stage,index)=><tr key={stage.code}><td>{index+1}</td><td><strong>{stage.label}</strong></td><td>{stage.requests}</td><td>{stage.headcount}</td><td>{stageConversion(index,unit)}</td><td>{index===analytics.stages.length-1||!(unit==="requests"?stage.requests:stage.headcount)?"—":unit==="requests"?`${stage.notAdvancedRequests} (${stage.notAdvancedRate}%)`:`${stage.notAdvancedHeadcount} (${stage.notAdvancedHeadcountRate}%)`}</td><td>{formatDuration(stage.avgHours)}</td></tr>)}</tbody></table></div>
    </details>

    {showMetrics&&<div className="recruiting-modal analytics-settings-backdrop" onMouseDown={event=>{if(event.currentTarget===event.target)setShowMetrics(false)}}><div className="recruiting-modal-card needs-metric-settings"><div className="recruiting-modal-head needs-metric-settings-head"><div><h2>Настроить показатели</h2><p>Формулы системные. Настройте состав, порядок, подпись и целевое значение.</p></div><button type="button" className="icon-button" aria-label="Закрыть настройки показателей" onClick={()=>setShowMetrics(false)}><X size={17}/></button></div><div className="needs-metric-settings-body">{metricError&&<div className="recruiting-error">{metricError}</div>}<div className="needs-metric-settings-toolbar"><span>Показывается <strong>{draftPreferences.filter(item=>item.visible).length}</strong> из {draftPreferences.length}</span><small>Порядок строк соответствует порядку карточек.</small></div><div className="needs-metric-settings-list">{draftPreferences.map((item,index)=>{const definition=requestAnalyticsMetricDefinition(item.key);return <div className={`needs-metric-setting-row ${item.visible?"is-visible":"is-hidden"}`} key={item.key}><label className="needs-metric-visible"><input type="checkbox" checked={item.visible} onChange={event=>setDraftPreferences(current=>current.map(row=>row.key===item.key?{...row,visible:event.target.checked}:row))}/><span className="needs-metric-title"><strong>{definition.label}</strong><small>{definition.description}</small></span></label><label className="needs-metric-field"><span>Название в карточке</span><input className="needs-metric-label-input" value={item.label} onChange={event=>setDraftPreferences(current=>current.map(row=>row.key===item.key?{...row,label:event.target.value}:row))}/></label><label className="needs-metric-field needs-metric-target"><span>Цель</span><div><input className="needs-metric-target-input" type="number" step="0.1" value={item.targetValue??""} onChange={event=>setDraftPreferences(current=>current.map(row=>row.key===item.key?{...row,targetValue:event.target.value===""?null:Number(event.target.value)}:row))} placeholder="—"/><small>{metricTargetUnit(definition.format)}</small></div></label><div className="needs-metric-order"><button type="button" className="icon-button" disabled={index===0} onClick={()=>moveMetric(index,-1)}><ChevronUp size={14}/></button><button type="button" className="icon-button" disabled={index===draftPreferences.length-1} onClick={()=>moveMetric(index,1)}><ChevronDown size={14}/></button></div></div>})}</div></div><div className="recruiting-form-actions needs-metric-settings-footer"><button type="button" className="button needs-metric-reset" onClick={()=>setDraftPreferences(defaultRequestAnalyticsMetricPreferences())}>Сбросить к стандарту</button><span/><button type="button" className="button" onClick={()=>setShowMetrics(false)}>Отмена</button><button type="button" className="button primary" disabled={savingMetrics} onClick={()=>void saveMetricSettings()}>{savingMetrics?"Сохраняю…":"Сохранить"}</button></div></div></div>}
  </div>;
}

function BreakdownTable({rows,unit}:{rows:RequestAnalyticsBreakdownRow[];unit:RequestAnalyticsUnit}){
  return <div className="request-breakdown-table-wrap"><table className="data-table request-breakdown-table"><thead><tr><th>Контур</th><th>{unit==="requests"?"Заявки":"Численность"}</th><th>Согласовано</th><th>Конверсия</th><th>Ср. цикл</th></tr></thead><tbody>{rows.length?rows.slice(0,10).map(row=><tr key={row.key}><td><strong>{row.label}</strong></td><td>{unit==="requests"?row.requests:row.headcount}</td><td>{unit==="requests"?row.agreed:row.agreedHeadcount}</td><td>{(unit==="requests"?row.requests:row.headcount)?`${unit==="requests"?row.conversion:row.headcountConversion}%`:"—"}</td><td>{row.avgCycleDays==null?"—":`${formatNumber(row.avgCycleDays)} дн.`}</td></tr>):<tr><td colSpan={5}>Нет данных для выбранного разреза</td></tr>}</tbody></table></div>;
}

function camelMetricKey(key:RequestAnalyticsMetricKey):keyof RequestAnalyticsData["metrics"]{
  const map:Record<RequestAnalyticsMetricKey,keyof RequestAnalyticsData["metrics"]>={
    active_requests:"activeRequests",active_headcount:"activeHeadcount",proposal_client:"proposalClient",negotiation:"negotiation",attention:"attention",
    new_requests:"newRequests",new_headcount:"newHeadcount",agreed_requests:"agreedRequests",agreed_headcount:"agreedHeadcount",conversion_requests:"conversionRequests",
    conversion_headcount:"conversionHeadcount",avg_cycle_days:"avgCycleDays",avg_time_to_proposal_days:"avgTimeToProposalDays",lost_requests:"lostRequests",
    lost_headcount:"lostHeadcount",unassigned:"unassigned",
  };
  return map[key];
}
function metricIcon(key:RequestAnalyticsMetricKey){
  if(key.includes("headcount"))return <UsersRound size={18}/>;
  if(key.includes("conversion"))return <TrendingUp size={18}/>;
  if(key.includes("avg_"))return <Clock3 size={18}/>;
  if(key==="attention"||key==="unassigned"||key.startsWith("lost_"))return <AlertTriangle size={18}/>;
  if(key==="proposal_client")return <FileText size={18}/>;
  if(key==="negotiation")return <Handshake size={18}/>;
  if(key.startsWith("agreed_"))return <CheckCircle2 size={18}/>;
  return <BriefcaseBusiness size={18}/>;
}
function metricTargetUnit(format:"number"|"percent"|"days"|"hours"){return format==="percent"?"%":format==="days"?"дн.":format==="hours"?"ч":"значение"}
function formatMetricValue(value:number|null,format:"number"|"percent"|"days"|"hours"){if(value==null)return"—";if(format==="percent")return`${formatNumber(value)}%`;if(format==="days")return`${formatNumber(value)} дн.`;if(format==="hours")return value<24?`${formatNumber(value)} ч`:`${formatNumber(value/24)} дн.`;return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
function metricTrend(current:number,previous:number,direction:"higher"|"lower"|"neutral",format:"number"|"percent"|"days"|"hours"){
  if(current===previous)return{text:"без изменений",tone:"neutral"};
  const diff=current-previous,tone=direction==="neutral"?"neutral":direction==="higher"?(diff>0?"good":"bad"):(diff<0?"good":"bad");
  if(format==="percent")return{text:`${diff>0?"+":""}${formatNumber(diff)} п.п. к прошлому периоду`,tone};
  if(previous===0)return{text:current>0?"новое значение":"—",tone};
  const pct=diff/previous*100;return{text:`${pct>0?"+":""}${formatNumber(pct)}% к прошлому периоду`,tone};
}
function metricFootnote(item:RequestAnalyticsMetricPreference,definition:ReturnType<typeof requestAnalyticsMetricDefinition>,delta:string|null){
  const target=item.targetValue!=null?`цель ${formatMetricValue(item.targetValue,definition.format)}`:null;
  if(target&&delta)return`${delta} · ${target}`;if(target)return target;if(delta)return delta;return definition.description;
}
function funnelModeLabel(mode:FunnelMode){return mode==="share"?"Доля":mode==="conversion"?"Конверсия":mode==="not_advanced"?"Не перешли":"Среднее время"}
function formatNumber(value:number){return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
function formatDuration(hours:number|null){if(hours==null)return"—";return hours<24?`${formatNumber(hours)} ч`:`${formatNumber(hours/24)} дн.`}
function parseDay(value:string){return new Date(`${value}T00:00:00.000Z`)}
function shiftDay(value:string,days:number){const date=parseDay(value);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function periodDays(from:string,to:string){return Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000)+1}
function formatRange(from:string,to:string){const formatter=new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"});return`${formatter.format(parseDay(from))} — ${formatter.format(parseDay(to))}`}
