"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, BriefcaseBusiness, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download,
  Gauge, RotateCcw, Settings2, TrendingUp, UserRoundCheck, UsersRound, X,
} from "lucide-react";
import { SalesFunnel } from "@/components/sales/SalesUI";
import { RecruitingAnalyticsTrendChart } from "@/components/RecruitingAnalyticsTrendChart";
import type { RecruitingAnalyticsData, RecruitingAnalyticsFilters } from "@/lib/recruiting/analytics";
import {
  recruitingMetricCatalog, recruitingMetricDefinition, type RecruitingMetricKey, type RecruitingMetricPreference,
} from "@/lib/recruiting/analytics-metric-registry";
import type { RecruitingApplicationRow, RecruitingNeedRow, RecruitingOptions } from "@/lib/recruiting/service";

type FunnelMode="candidates"|"conversion"|"losses"|"time";
import {useRecruitingApplications} from "@/lib/recruiting/demo-client";
import {calculateDemoAnalytics} from "@/lib/recruiting/analytics-engine";
import {workRisks,isActiveStage} from "@/lib/recruiting/workflow";

type Props={
  applications:RecruitingApplicationRow[];
  data:RecruitingAnalyticsData;
  options:RecruitingOptions;
  needs:RecruitingNeedRow[];
  metricPreferences:RecruitingMetricPreference[];
  canConfigure:boolean;
  demo:boolean;
};

const demoMetricStorageKey="operis.recruiting.analytics.metrics.v1";

export function RecruitingNeedsAnalytics({applications,data:serverData,options,needs,metricPreferences,canConfigure,demo}:Props){
  const router=useRouter();
  const rows=useRecruitingApplications(applications,demo);
  const data=useMemo(()=>demo?calculateDemoAnalytics(rows,serverData.filters,needs,options.exitReasons.map(x=>({code:x.code,label:x.name,count:0}))):serverData,[demo,rows,serverData,needs,options.exitReasons]);
  const [analysisView,setAnalysisView]=useState<'cohort'|'current'>('cohort');
  const currentRows=rows.filter(row=>(!data.filters.objectId||row.objectId===data.filters.objectId)&&(!data.filters.specialtyId||needs.find(n=>n.id===row.needId)?.specialtyId===data.filters.specialtyId)&&(!data.filters.recruiterId||row.ownerUserId===data.filters.recruiterId||row.assigneeUserIds.includes(data.filters.recruiterId))&&(!data.filters.source||row.source===data.filters.source));
  const [mode,setMode]=useState<FunnelMode>("conversion");
  const [showMetrics,setShowMetrics]=useState(false);
  const [savingMetrics,setSavingMetrics]=useState(false);
  const [metricError,setMetricError]=useState("");
  const [preferences,setPreferences]=useState<RecruitingMetricPreference[]>(metricPreferences);
  const [draftPreferences,setDraftPreferences]=useState<RecruitingMetricPreference[]>(metricPreferences);
  const filters=data.filters;
  const funnelHref=buildRecruitingHref(filters);
  const currentPeriodDays=periodDays(filters.from,filters.to);

  useEffect(()=>{
    if(!demo)return;
    let frame=0;
    try{
      const raw=localStorage.getItem(demoMetricStorageKey);
      if(!raw)return;
      const parsed=JSON.parse(raw) as RecruitingMetricPreference[];
      const allowed=new Set(recruitingMetricCatalog.map(item=>item.key));
      const clean=parsed.filter(item=>allowed.has(item.key));
      if(clean.length)frame=requestAnimationFrame(()=>{setPreferences(clean);setDraftPreferences(clean)});
    }catch{}
    return()=>{if(frame)cancelAnimationFrame(frame)};
  },[demo]);

  function apply(patch:Partial<RecruitingAnalyticsFilters>){
    const next={...filters,...patch};
    const params=new URLSearchParams({view:"analytics",from:next.from,to:next.to});
    if(next.objectId)params.set("object",next.objectId);
    if(next.specialtyId)params.set("specialty",next.specialtyId);
    if(next.recruiterId)params.set("recruiter",next.recruiterId);
    if(next.source)params.set("source",next.source);
    router.replace(`/needs?${params.toString()}`,{scroll:false});
  }

  function setPreset(days:number){apply({from:shiftDay(filters.to,-(days-1)),to:filters.to})}

  const funnelSteps=useMemo(()=>data.stages.map(stage=>({
    key:stage.stage,
    label:stage.label,
    value:analysisView==="current"?currentRows.filter(x=>x.stage===stage.stage).length:stage.candidates,
    note:analysisView==="current"?"Сейчас на этапе":`${stage.shareTotal}% заявок набора`,
    aside:analysisView==="current"?`${currentRows.filter(x=>x.stage===stage.stage&&workRisks(x).length).length} требуют действия`:mode==="candidates"?`${stage.shareTotal}%`:mode==="conversion"?`${stage.conversion}%`:mode==="losses"?(stage.stage==="started"?"—":`−${stage.notAdvanced} · ${stage.notAdvancedRate}%`):formatDuration(stage.avgHours),
  })),[data.stages,mode,analysisView,currentRows]);

  const gaps=data.stages.filter(stage=>stage.lost>0).map(stage=>({from:stage.label,to:'Выбытие',count:stage.lost,rate:stage.candidates?Math.round(stage.lost/stage.candidates*100):0})).sort((a,b)=>b.count-a.count);

  const staffing=useMemo(()=>{
    const active=needs.filter(row=>["open","in_progress","paused"].includes(row.status))
      .filter(row=>!filters.objectId||row.objectId===filters.objectId)
      .filter(row=>!filters.specialtyId||row.specialtyId===filters.specialtyId)
      .filter(row=>!filters.recruiterId||row.recruiters.some(item=>item.userId===filters.recruiterId));
    const required=active.reduce((sum,row)=>sum+row.required,0);
    const working=active.reduce((sum,row)=>sum+row.working,0);
    const ready=active.reduce((sum,row)=>sum+row.ready,0);
    const toRecruit=active.reduce((sum,row)=>sum+row.toRecruit,0);
    return {required,working,ready,toRecruit,coverage:required?Math.round(working/required*100):0};
  },[needs,filters.objectId,filters.specialtyId,filters.recruiterId]);

  const visibleMetrics=useMemo(()=>preferences.filter(item=>item.visible).sort((a,b)=>a.position-b.position),[preferences]);

  function metricRaw(key:RecruitingMetricKey,current:boolean){
    const metrics=current?data.metrics:data.comparison;
    if(key==="staffing_deficit")return staffing.toRecruit;
    if(key==="staffing_coverage")return staffing.coverage;
    if(key==="staffing_required")return staffing.required;
    if(key==="staffing_working")return staffing.working;
    if(key==="total_candidates")return metrics.totalCandidates;
    if(key==="conversion_to_start")return metrics.conversionToStart;
    if(key==="in_work")return metrics.inWork;
    if(key==="ready")return metrics.ready;
    if(key==="started")return metrics.started;
    if(key==="avg_days_to_start")return metrics.avgDaysToStart;
    if(key==="avg_first_contact_hours")return metrics.avgFirstContactHours;
    if(key==="overdue_first_contact")return metrics.overdueFirstContact;
    if(key==="rejected")return metrics.rejected;
    return metrics.noShow;
  }

  function exportCsv(){
    const header=["Этап","Заявки","Доля от общего","Конверсия","На этапе","Выбыли","Резерв","Пропустили следующий","Среднее время"];
    const lines=data.stages.map(stage=>[
      stage.label,stage.candidates,`${stage.shareTotal}%`,`${stage.conversion}%`,stage.waiting,stage.lost,stage.reserved,stage.skipped,formatDuration(stage.avgHours),
    ]);
    const csv="\ufeff"+[header,...lines].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(";")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download=`voronka-podbora-${filters.from}-${filters.to}.csv`;anchor.click();URL.revokeObjectURL(url);
  }

  function openMetricSettings(){
    const byKey=new Map(preferences.map(item=>[item.key,item]));
    const full=recruitingMetricCatalog.map(def=>byKey.get(def.key)??{key:def.key,label:def.label,visible:def.defaultVisible,position:def.defaultPosition,targetValue:null});
    setDraftPreferences(full.sort((a,b)=>a.position-b.position));
    setMetricError("");setShowMetrics(true);
  }

  function moveMetric(index:number,direction:-1|1){
    setDraftPreferences(current=>{
      const next=[...current];const target=index+direction;if(target<0||target>=next.length)return current;
      [next[index],next[target]]=[next[target],next[index]];
      return next.map((item,position)=>({...item,position:position*10}));
    });
  }

  async function saveMetricSettings(){
    const normalized=draftPreferences.map((item,index)=>({...item,position:index*10,label:item.label.trim()||recruitingMetricDefinition(item.key).label}));
    if(!normalized.some(item=>item.visible)){setMetricError("Оставьте хотя бы один показатель.");return}
    setSavingMetrics(true);setMetricError("");
    try{
      if(demo){
        localStorage.setItem(demoMetricStorageKey,JSON.stringify(normalized));
        setPreferences(normalized);setShowMetrics(false);return;
      }
      const response=await fetch("/api/recruiting/analytics/metrics",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({items:normalized})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось сохранить показатели");
      setPreferences(normalized);setShowMetrics(false);router.refresh();
    }catch(error){setMetricError(error instanceof Error?error.message:"Не удалось сохранить показатели")}
    finally{setSavingMetrics(false)}
  }

  return <div className="needs-analytics-screen">
    <div className="recruiting-toolbar" role="group" aria-label="Вид аналитики"><button className="button" aria-pressed={analysisView==='cohort'} onClick={()=>setAnalysisView('cohort')}>Конверсия набора</button><button className="button" aria-pressed={analysisView==='current'} onClick={()=>setAnalysisView('current')}>Текущая очередь</button></div>
    <p className="cell-sub">{demo?'Учебная история с фиксированными датами. ':''}Конверсия — по заявкам, созданным в выбранный период, на конец этого периода. Текущая очередь и комплектация — на сегодня, независимо от периода. Пропущенные этапы не считаются пройденными.</p>
    <section className="needs-analytics-filters" aria-label="Фильтры аналитики">
      <div className="needs-date-filter"><span><CalendarDays size={14}/> Период</span><input type="date" value={filters.from} onChange={event=>apply({from:event.target.value})}/><i>—</i><input type="date" value={filters.to} onChange={event=>apply({to:event.target.value})}/></div>
      <div className="needs-period-presets" role="group" aria-label="Быстрый выбор периода">{[7,30,90].map(days=><button type="button" key={days} className={currentPeriodDays===days?"active":""} onClick={()=>setPreset(days)}>{days} дней</button>)}</div>
      <div className="needs-auto-compare" title="Сравнение рассчитывается автоматически для предыдущего периода той же длительности"><span>Сравнение</span><strong>{formatRange(filters.compareFrom,filters.compareTo)}</strong><small>предыдущий равный период</small></div>
      <select value={filters.objectId??""} onChange={event=>apply({objectId:event.target.value||null})} aria-label="Объект"><option value="">Все объекты</option>{options.objects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={filters.specialtyId??""} onChange={event=>apply({specialtyId:event.target.value||null})} aria-label="Специальность"><option value="">Все специальности</option>{options.specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={filters.recruiterId??""} onChange={event=>apply({recruiterId:event.target.value||null})} aria-label="Рекрутер"><option value="">Все рекрутеры</option>{options.recruiters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={filters.source??""} onChange={event=>apply({source:event.target.value||null})} aria-label="Источник"><option value="">Все источники</option>{options.sources.map(item=><option key={item} value={item}>{item}</option>)}</select>
      <button type="button" className="button" onClick={()=>router.replace("/needs?view=analytics",{scroll:false})}><RotateCcw size={14}/> Сбросить</button>
    </section>

    <section className="needs-staffing-strip" aria-label="Комплектация потребности">
      <div><span>План</span><strong>{staffing.required}</strong></div>
      <div><span>Работают</span><strong>{staffing.working}</strong></div>
      <div><span>Готовы</span><strong>{staffing.ready}</strong></div>
      <div><span>Нужно найти</span><strong>{staffing.toRecruit}</strong></div>
      <div className="needs-staffing-progress"><span>Комплектация на сегодня</span><strong>{staffing.coverage}%</strong><i><b style={{width:`${Math.min(100,staffing.coverage)}%`}}/></i></div>
    </section>

    <div className="needs-analytics-primary-grid">
      <section className="needs-analytics-funnel-card">
        <div className="needs-analytics-card-head">
          <div><h3>{analysisView==="current"?"Сейчас на этапах":"Конверсия набора"}</h3><p>{analysisView==="current"?"Текущие заявки выбранного объекта, рекрутера и источника.":"Заявки, созданные за период. Переходы учитываются по записанной истории."}</p></div>
          <div className="needs-analytics-head-actions"><Link className="button" href={funnelHref}><UsersRound size={14}/> Открыть кандидатов</Link><div className="needs-mini-segments" role="group" aria-label="Режим воронки">{([
            ["candidates","Доля"],["conversion","Конверсия"],["losses","Не перешли"],["time","Среднее время"],
          ] as const).map(([value,label])=><button key={value} type="button" className={mode===value?"active":""} onClick={()=>setMode(value)}>{label}</button>)}</div></div>
        </div>
        <div className="needs-funnel-column-head"><span>Этап</span><span>Кандидаты</span><span>{modeLabel(mode)}</span></div>
        <p className="cell-sub">Нажмите на этап, чтобы открыть его текущую очередь.</p><SalesFunnel label="Воронка кандидатов" steps={funnelSteps} onStep={key=>router.push(`${funnelHref}${funnelHref.includes("?")?"&":"?"}stage=${key}&queue=${key==="started"?"closed":"active"}`)} showIndex/>
      </section>

      <aside className="needs-analytics-kpi-panel">
        <div className="needs-analytics-side-title"><span>Ключевые показатели</span><div className="needs-analytics-side-actions"><small>{formatRange(filters.from,filters.to)}</small>{canConfigure&&<button type="button" className="icon-button" onClick={openMetricSettings} aria-label="Настроить показатели"><Settings2 size={15}/></button>}</div></div>
        <div className="needs-kpi-grid">{visibleMetrics.map(item=>{
          const definition=recruitingMetricDefinition(item.key);
          const current=metricRaw(item.key,true);
          const previous=definition.comparison&&data.comparison.totalCandidates>0?metricRaw(item.key,false):null;
          const delta=definition.comparison&&typeof current==="number"&&typeof previous==="number"?metricTrend(current,previous,definition.direction,definition.format):null;
          return <div className="needs-kpi-card" key={item.key}><span className="needs-kpi-icon">{metricIcon(item.key)}</span><div><span>{item.label}</span><strong>{formatMetricValue(current,definition.format)}</strong><small className={delta?.tone??"neutral"}>{metricFootnote(item,definition,current,delta?.text??null)}</small></div></div>;
        })}</div>
      </aside>
    </div>

    <div className="needs-analytics-bottom-grid">
      <section className="needs-loss-card">
        <div className="needs-analytics-card-head"><div><h3>Фактические потери</h3><p>Отказы и невыходы по последнему рабочему этапу. Ожидающие выхода и резерв сюда не входят.</p></div></div>
        <div className="needs-loss-list">{gaps.length?gaps.map((item,index)=><div className="needs-loss-row" key={`${item.from}-${item.to}`}><span className="needs-loss-rank">{index+1}</span><span className="needs-loss-copy"><strong>{item.from} → {item.to}</strong><i><span style={{width:`${item.rate}%`}}/></i></span><b>{item.count} <small>({item.rate}%)</small></b></div>):<div className="needs-analytics-empty">Зафиксированных отказов и невыходов в наборе нет.</div>}</div>
      </section>

      <section className="needs-loss-card"><div className="needs-analytics-card-head"><div><h3>Требует действия сейчас</h3><p>Просрочки и незапланированные действия — отдельно от потерь.</p></div></div><div className="needs-loss-list">{[['attention','Заявки с рисками',currentRows.filter(x=>workRisks(x).length).length],['missing','Нет следующего действия',currentRows.filter(x=>isActiveStage(x.stage)&&!x.nextActionAt).length],['reserve','В резерве',currentRows.filter(x=>x.stage==='reserve').length]].map(([queue,label,count])=><Link className="needs-loss-row" key={queue} href={`${funnelHref}${funnelHref.includes('?')?'&':'?'}queue=${queue}`}><span>{label}</span><strong>{count}</strong></Link>)}</div></section>
      <RecruitingAnalyticsTrendChart rows={data.daily} comparisonRows={data.comparisonDaily}/>

      <section className="needs-source-card">
        <div className="needs-analytics-card-head"><div><h3>Эффективность источников</h3><p>Источники и кампании выбранного набора. Расходы не подключены: стоимость привлечения не рассчитывается.</p></div></div>
        <div className="needs-source-table-wrap"><table className="data-table needs-source-table"><thead><tr><th>Источник</th><th>Кандидаты</th><th>Согласованы</th><th>Вышли</th><th>Конверсия</th><th>Ср. срок</th></tr></thead><tbody>{data.sources.length?data.sources.map(row=><tr key={row.source}><td><strong>{row.source}</strong>{row.candidates<10&&<span className="cell-sub">Малая выборка · {row.candidates} заявок</span>}</td><td>{row.candidates}</td><td>{row.approved}</td><td>{row.started}</td><td>{row.conversion}%</td><td>{row.avgDaysToStart==null?"—":`${formatNumber(row.avgDaysToStart)} дн.`}</td></tr>):<tr><td colSpan={6}>Нет данных по источникам</td></tr>}</tbody></table></div>
      </section>

      <section className="needs-exit-card">
        <div className="needs-analytics-card-head"><div><h3>Причины выбытия</h3><p>Только фактические отказы и невыходы, а не разрыв между ступенями.</p></div></div>
        <div className="needs-exit-list">{data.exitReasons.length?data.exitReasons.slice(0,8).map(row=><div key={row.code}><span>{row.label}</span><strong>{row.count}</strong></div>):<div className="needs-analytics-empty">Причины появятся после фиксации отказов и невыходов.</div>}</div>
      </section>

      <section className="needs-stage-details-card">
        <div className="needs-analytics-card-head"><div><h3>Этапы воронки — детали</h3><p>Состояние набора на конец периода. Среднее время — только по записанным соседним переходам.</p></div><button type="button" className="button" onClick={exportCsv}><Download size={14}/> Экспорт</button></div>
        <div className="needs-stage-table-wrap"><table className="data-table needs-stage-table"><thead><tr><th>#</th><th>Этап</th><th>Кандидаты</th><th>Конверсия</th><th>На этапе</th><th>Выбыли</th><th>Резерв</th><th>Пропустили следующий</th><th>Ср. время</th></tr></thead><tbody>{data.stages.map((stage,index)=><tr key={stage.stage}><td>{index+1}</td><td><strong>{stage.label}</strong></td><td>{stage.candidates}</td><td>{stage.conversion}%</td><td>{stage.waiting}</td><td>{stage.lost}</td><td>{stage.reserved}</td><td>{stage.skipped}</td><td>{formatDuration(stage.avgHours)}</td></tr>)}</tbody></table></div>
      </section>
    </div>

    {showMetrics&&<div className="recruiting-modal analytics-settings-backdrop" onMouseDown={event=>{if(event.currentTarget===event.target)setShowMetrics(false)}}><div className="recruiting-modal-card needs-metric-settings"><div className="recruiting-modal-head needs-metric-settings-head"><div><h2>Настроить показатели</h2><p>Формулы системные. Настройте состав, порядок, подпись и целевое значение.</p></div><button type="button" className="icon-button" onClick={()=>setShowMetrics(false)} aria-label="Закрыть настройки"><X size={17}/></button></div><div className="needs-metric-settings-body">{metricError&&<div className="recruiting-error">{metricError}</div>}<div className="needs-metric-settings-toolbar"><span>Показывается <strong>{draftPreferences.filter(item=>item.visible).length}</strong> из {draftPreferences.length}</span><small>Порядок строк соответствует порядку карточек в аналитике.</small></div><div className="needs-metric-settings-list">{draftPreferences.map((item,index)=>{const definition=recruitingMetricDefinition(item.key);return <div className={`needs-metric-setting-row ${item.visible?"is-visible":"is-hidden"}`} key={item.key}><label className="needs-metric-visible"><input type="checkbox" checked={item.visible} onChange={event=>setDraftPreferences(current=>current.map(row=>row.key===item.key?{...row,visible:event.target.checked}:row))}/><span className="needs-metric-title"><strong>{definition.label}</strong><small>{definition.description}</small></span></label><label className="needs-metric-field"><span>Название в карточке</span><input className="needs-metric-label-input" value={item.label} onChange={event=>setDraftPreferences(current=>current.map(row=>row.key===item.key?{...row,label:event.target.value}:row))} aria-label={`Название: ${definition.label}`}/></label><label className="needs-metric-field needs-metric-target"><span>Цель</span><div><input className="needs-metric-target-input" type="number" step="0.1" value={item.targetValue??""} onChange={event=>setDraftPreferences(current=>current.map(row=>row.key===item.key?{...row,targetValue:event.target.value===""?null:Number(event.target.value)}:row))} placeholder="—" aria-label={`Цель: ${definition.label}`}/><small>{metricTargetUnit(definition.format)}</small></div></label><div className="needs-metric-order" aria-label={`Порядок: ${definition.label}`}><button type="button" className="icon-button" disabled={index===0} onClick={()=>moveMetric(index,-1)} aria-label="Переместить выше"><ChevronUp size={14}/></button><button type="button" className="icon-button" disabled={index===draftPreferences.length-1} onClick={()=>moveMetric(index,1)} aria-label="Переместить ниже"><ChevronDown size={14}/></button></div></div>})}</div></div><div className="recruiting-form-actions needs-metric-settings-footer"><button type="button" className="button needs-metric-reset" onClick={()=>{const reset=recruitingMetricCatalog.map(def=>({key:def.key,label:def.label,visible:def.defaultVisible,position:def.defaultPosition,targetValue:null}));setDraftPreferences(reset)}}>Сбросить к стандарту</button><span/><button type="button" className="button" onClick={()=>setShowMetrics(false)}>Отмена</button><button type="button" className="button primary" disabled={savingMetrics} onClick={()=>void saveMetricSettings()}>{savingMetrics?"Сохраняю…":"Сохранить"}</button></div></div></div>}
  </div>;
}

function modeLabel(mode:FunnelMode){return mode==="candidates"?"Доля от общего":mode==="conversion"?"Конверсия":mode==="losses"?"Не перешли":"Среднее время"}
function formatNumber(value:number){return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
function formatDuration(hours:number|null){if(hours==null)return "—";if(hours<24)return `${formatNumber(hours)} ч`;return `${formatNumber(hours/24)} дн.`}
function parseDay(value:string){return new Date(`${value}T00:00:00.000Z`)}
function shiftDay(value:string,days:number){const date=parseDay(value);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function periodDays(from:string,to:string){return Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000)+1}
function formatRange(from:string,to:string){const formatter=new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"});return `${formatter.format(parseDay(from))} — ${formatter.format(parseDay(to))}`}

function metricTargetUnit(format:"number"|"percent"|"days"|"hours"){return format==="percent"?"%":format==="days"?"дн.":format==="hours"?"ч":"значение"}
function metricIcon(key:RecruitingMetricKey){
  if(key==="staffing_deficit"||key==="staffing_required"||key==="staffing_working")return <BriefcaseBusiness size={18}/>;
  if(key==="staffing_coverage")return <Gauge size={18}/>;
  if(key==="conversion_to_start")return <TrendingUp size={18}/>;
  if(key==="avg_days_to_start"||key==="avg_first_contact_hours")return <Clock3 size={18}/>;
  if(key==="overdue_first_contact"||key==="rejected"||key==="no_show")return <AlertTriangle size={18}/>;
  if(key==="ready")return <UserRoundCheck size={18}/>;
  if(key==="started")return <CheckCircle2 size={18}/>;
  return <UsersRound size={18}/>;
}
function formatMetricValue(value:number|null,format:"number"|"percent"|"days"|"hours"){
  if(value==null)return "—";
  if(format==="percent")return `${formatNumber(value)}%`;
  if(format==="days")return `${formatNumber(value)} дн.`;
  if(format==="hours")return value<24?`${formatNumber(value)} ч`:`${formatNumber(value/24)} дн.`;
  return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value);
}
function metricTrend(current:number,previous:number,direction:"higher"|"lower"|"neutral",format:"number"|"percent"|"days"|"hours"){
  if(current===previous)return {text:"без изменений",tone:"neutral"};
  const diff=current-previous;
  const tone=direction==="neutral"?"neutral":direction==="higher"?(diff>0?"good":"bad"):(diff<0?"good":"bad");
  if(format==="percent")return {text:`${diff>0?"+":""}${formatNumber(diff)} п.п. к прошлому периоду`,tone};
  if(previous===0)return {text:current>0?"новое значение":"—",tone};
  const pct=diff/previous*100;
  return {text:`${pct>0?"+":""}${formatNumber(pct)}% к прошлому периоду`,tone};
}
function metricFootnote(item:RecruitingMetricPreference,definition:ReturnType<typeof recruitingMetricDefinition>,current:number|null,delta:string|null){
  const target=item.targetValue!=null?`цель ${formatMetricValue(item.targetValue,definition.format)}`:null;
  if(target&&delta)return `${delta} · ${target}`;
  if(target)return target;
  if(delta)return delta;
  if(item.key==="staffing_deficit")return "с учётом готовых к выходу";
  if(item.key==="staffing_coverage")return "работают / план";
  if(item.key==="overdue_first_contact")return "SLA первого контакта — 4 часа";
  return definition.description;
}
function buildRecruitingHref(filters:RecruitingAnalyticsFilters){const params=new URLSearchParams();if(filters.objectId)params.set("object",filters.objectId);if(filters.specialtyId)params.set("specialty",filters.specialtyId);if(filters.recruiterId)params.set("recruiter",filters.recruiterId);if(filters.source)params.set("source",filters.source);const query=params.toString();return query?`/recruiting?${query}`:"/recruiting"}
