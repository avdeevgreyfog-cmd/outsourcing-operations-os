"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, BadgeRussianRuble, CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Clock3, Download,
  FileCheck2, Gavel, RotateCcw, Settings2, Target, Trophy, UsersRound, X,
} from "lucide-react";
import { SalesEmpty, SalesFunnel } from "@/components/sales/SalesUI";
import { TenderAnalyticsTrendChart } from "@/components/TenderAnalyticsTrendChart";
import type {
  TenderAnalyticsBreakdownRow, TenderAnalyticsData, TenderAnalyticsFilters, TenderAnalyticsUnit,
} from "@/lib/tenders/analytics";
import {
  defaultTenderAnalyticsMetricPreferences,
  tenderAnalyticsMetricCatalog,
  tenderAnalyticsMetricDefinition,
  type TenderAnalyticsMetricKey,
  type TenderAnalyticsMetricPreference,
} from "@/lib/tenders/analytics-metric-registry";
import type { TenderOptions } from "@/lib/tenders/service";
import { tenderDecisionLabels, tenderResultLabels } from "@/lib/tenders/model";

type FunnelMode="share"|"conversion"|"not_advanced"|"time";
type BreakdownMode="platforms"|"customers"|"owners";
type Props={
  data:TenderAnalyticsData;
  options:TenderOptions;
  metricPreferences:TenderAnalyticsMetricPreference[];
  canConfigure:boolean;
  demo:boolean;
};

const demoMetricStorageKey="operis.tenders.analytics.metrics.v1";

export function TenderAnalytics({data,options,metricPreferences,canConfigure,demo}:Props){
  const router=useRouter();
  const [unit,setUnit]=useState<TenderAnalyticsUnit>("tenders");
  const [mode,setMode]=useState<FunnelMode>("conversion");
  const [breakdownMode,setBreakdownMode]=useState<BreakdownMode>("platforms");
  const [preferences,setPreferences]=useState<TenderAnalyticsMetricPreference[]>(metricPreferences);
  const [draftPreferences,setDraftPreferences]=useState<TenderAnalyticsMetricPreference[]>(metricPreferences);
  const [showMetrics,setShowMetrics]=useState(false);
  const [savingMetrics,setSavingMetrics]=useState(false);
  const [metricError,setMetricError]=useState("");
  const filters=data.filters;
  const periodLength=periodDays(filters.from,filters.to);

  useEffect(()=>{
    if(!demo)return;
    let frame=0;
    try{
      const raw=localStorage.getItem(demoMetricStorageKey);
      if(!raw)return;
      const parsed=JSON.parse(raw) as TenderAnalyticsMetricPreference[];
      const allowed=new Set(tenderAnalyticsMetricCatalog.map(item=>item.key));
      const clean=parsed.filter(item=>allowed.has(item.key));
      if(clean.length)frame=requestAnimationFrame(()=>{setPreferences(clean);setDraftPreferences(clean)});
    }catch{}
    return()=>{if(frame)cancelAnimationFrame(frame)};
  },[demo]);

  function apply(patch:Partial<TenderAnalyticsFilters>){
    const next={...filters,...patch};
    const params=new URLSearchParams({view:"analytics",from:next.from,to:next.to});
    if(next.platform)params.set("platform",next.platform);
    if(next.customer)params.set("customer",next.customer);
    if(next.ownerId)params.set("owner",next.ownerId);
    if(next.regionId)params.set("region",next.regionId);
    if(next.source)params.set("source",next.source);
    if(next.specialtyId)params.set("specialty",next.specialtyId);
    if(next.decision)params.set("decision",next.decision);
    if(next.result)params.set("result",next.result);
    if(next.priority)params.set("priority",next.priority);
    if(next.deadline)params.set("deadline",next.deadline);
    router.replace(`/tenders?${params.toString()}`,{scroll:false});
  }
  function setPreset(days:number){apply({from:shiftDay(filters.to,-(days-1)),to:filters.to})}

  const funnelSteps=useMemo(()=>data.stages.map(stage=>{
    const value=stageUnitValue(stage,unit);
    const share=stageUnitShare(stage,unit);
    const conversion=stageUnitConversion(stage,unit);
    const notAdvanced=stageUnitNotAdvanced(stage,unit);
    const notAdvancedRate=stageUnitNotAdvancedRate(stage,unit);
    return {
      key:stage.code,label:stage.label,value,
      note:`${share}% от входящего объёма`,
      aside:mode==="share"?`${share}%`:mode==="conversion"?`${conversion}%`:mode==="not_advanced"?(stage.code==="won"?"—":`−${formatUnitCompact(notAdvanced,unit)} · ${notAdvancedRate}%`):formatDuration(stage.avgHours),
    };
  }),[data.stages,unit,mode]);

  const gaps=useMemo(()=>data.stages.slice(0,-1).map((stage,index)=>({
    from:stage.label,to:data.stages[index+1]?.label??"",
    count:stageUnitNotAdvanced(stage,unit),
    rate:stageUnitNotAdvancedRate(stage,unit),
  })).sort((a,b)=>b.rate-a.rate||b.count-a.count).slice(0,5),[data.stages,unit]);

  const visibleMetrics=useMemo(()=>preferences.filter(item=>item.visible).sort((a,b)=>a.position-b.position),[preferences]);

  function metricRaw(key:TenderAnalyticsMetricKey,current:boolean){
    const metrics=current?data.metrics:data.comparison;
    return metrics[camelMetricKey(key)];
  }

  function openMetricSettings(){
    const byKey=new Map(preferences.map(item=>[item.key,item]));
    setDraftPreferences(tenderAnalyticsMetricCatalog.map(def=>byKey.get(def.key)??{key:def.key,label:def.label,visible:def.defaultVisible,position:def.defaultPosition,targetValue:null}).sort((a,b)=>a.position-b.position));
    setMetricError("");setShowMetrics(true);
  }
  function moveMetric(index:number,direction:-1|1){
    setDraftPreferences(current=>{
      const next=[...current],target=index+direction;
      if(target<0||target>=next.length)return current;
      [next[index],next[target]]=[next[target],next[index]];
      return next.map((item,position)=>({...item,position:position*10}));
    });
  }
  async function saveMetricSettings(){
    const normalized=draftPreferences.map((item,index)=>({...item,position:index*10,label:item.label.trim()||tenderAnalyticsMetricDefinition(item.key).label}));
    if(!normalized.some(item=>item.visible)){setMetricError("Оставьте хотя бы один показатель.");return}
    setSavingMetrics(true);setMetricError("");
    try{
      if(demo){
        localStorage.setItem(demoMetricStorageKey,JSON.stringify(normalized));
        setPreferences(normalized);setShowMetrics(false);return;
      }
      const response=await fetch("/api/tenders/analytics/metrics",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({items:normalized})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось сохранить показатели");
      setPreferences(normalized);setShowMetrics(false);router.refresh();
    }catch(error){setMetricError(error instanceof Error?error.message:"Не удалось сохранить показатели")}
    finally{setSavingMetrics(false)}
  }

  function exportCsv(){
    const header=["Этап","Тендеры","Стоимость","Численность","Конверсия тендеров","Конверсия стоимости","Конверсия численности","Не перешли","Среднее время"];
    const lines=data.stages.map(stage=>[
      stage.label,stage.tenders,stage.value,stage.headcount,
      `${stage.conversionTenders}%`,`${stage.conversionValue}%`,`${stage.conversionHeadcount}%`,
      stage.code==="won"?"—":formatUnitCompact(stageUnitNotAdvanced(stage,unit),unit),
      formatDuration(stage.avgHours),
    ]);
    const csv="\ufeff"+[header,...lines].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(";")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}),url=URL.createObjectURL(blob),anchor=document.createElement("a");
    anchor.href=url;anchor.download=`analitika-tenderov-${filters.from}-${filters.to}.csv`;anchor.click();URL.revokeObjectURL(url);
  }

  const breakdownRows=data.breakdowns[breakdownMode];

  return <div className="request-analytics-screen tender-analytics-screen">
    <section className="request-analytics-filters" aria-label="Фильтры аналитики тендеров">
      <div className="request-date-filter"><span><CalendarDays size={14}/> Период</span><input type="date" value={filters.from} onChange={event=>apply({from:event.target.value})}/><i>—</i><input type="date" value={filters.to} onChange={event=>apply({to:event.target.value})}/></div>
      <div className="request-period-presets" role="group" aria-label="Быстрый выбор периода">{[7,30,90].map(days=><button type="button" key={days} className={periodLength===days?"active":""} onClick={()=>setPreset(days)}>{days} дней</button>)}</div>
      <div className="request-auto-compare"><span>Сравнение</span><strong>{formatRange(filters.compareFrom,filters.compareTo)}</strong><small>предыдущий равный период</small></div>
      <select value={filters.platform??""} onChange={event=>apply({platform:event.target.value||null})}><option value="">Все площадки</option>{options.platforms.map(item=><option key={item} value={item}>{item}</option>)}</select>
      <select value={filters.customer??""} onChange={event=>apply({customer:event.target.value||null})}><option value="">Все заказчики</option>{options.customers.map(item=><option key={item} value={item}>{item}</option>)}</select>
      <select value={filters.ownerId??""} onChange={event=>apply({ownerId:event.target.value||null})}><option value="">Все ответственные</option>{options.members.map(item=><option key={item.userId} value={item.userId}>{item.name}</option>)}</select>
      <select value={filters.regionId??""} onChange={event=>apply({regionId:event.target.value||null})}><option value="">Все регионы</option>{options.regions.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={filters.specialtyId??""} onChange={event=>apply({specialtyId:event.target.value||null})}><option value="">Все специальности</option>{options.specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <select value={filters.source??""} onChange={event=>apply({source:event.target.value||null})}><option value="">Все источники</option>{options.sources.map(item=><option key={item} value={item}>{item}</option>)}</select>
      <select value={filters.decision??""} onChange={event=>apply({decision:event.target.value||null})}><option value="">Все решения</option>{Object.entries(tenderDecisionLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      <select value={filters.result??""} onChange={event=>apply({result:event.target.value||null})}><option value="">Все результаты</option>{Object.entries(tenderResultLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
      <select value={filters.priority??""} onChange={event=>apply({priority:event.target.value||null})}><option value="">Все приоритеты</option><option value="high">Высокий</option><option value="normal">Обычный</option><option value="low">Низкий</option></select>
      <select value={filters.deadline??""} onChange={event=>apply({deadline:event.target.value||null})}><option value="">Все сроки</option><option value="overdue">Просрочено</option><option value="today">Сегодня / просрочено</option><option value="3d">До 3 дней</option><option value="7d">До 7 дней</option></select>
      <button type="button" className="button" onClick={()=>router.replace("/tenders?view=analytics",{scroll:false})}><RotateCcw size={14}/> Сбросить</button>
    </section>

    <section className="request-operational-strip tender-operational-strip" aria-label="Оперативное состояние тендеров">
      <div><span>Активные тендеры</span><strong>{data.metrics.activeTenders}</strong></div>
      <div><span>Участвуем</span><strong>{data.metrics.participating}</strong></div>
      <div><span>Подача ≤ 3 дней</span><strong>{data.metrics.deadline3d}</strong></div>
      <div><span>Подано</span><strong>{data.metrics.submittedActive}</strong></div>
      <div><span>Ожидаем результат</span><strong>{data.metrics.awaitingResult}</strong></div>
      <div className={data.metrics.attention?"has-attention":""}><span>Требуют внимания</span><strong>{data.metrics.attention}</strong><small>дедлайн, блокеры, решение или ответственность</small></div>
    </section>

    <div className="request-analytics-primary-grid">
      <section className="request-analytics-card request-funnel-card">
        <div className="request-analytics-card-head">
          <div><h3>Тендерная воронка</h3><p>Основной путь от регистрации тендера до победы. Уточнения, No Bid и проигрыши вынесены в отдельные результаты.</p></div>
          <div className="request-analytics-head-actions">
            <div className="request-unit-toggle" role="group" aria-label="Единица анализа"><button type="button" className={unit==="tenders"?"active":""} onClick={()=>setUnit("tenders")}>Тендеры</button><button type="button" className={unit==="value"?"active":""} onClick={()=>setUnit("value")}>Стоимость</button><button type="button" className={unit==="headcount"?"active":""} onClick={()=>setUnit("headcount")}>Численность</button></div>
            <div className="request-mini-segments" role="group" aria-label="Режим воронки">{([
              ["share","Доля"],["conversion","Конверсия"],["not_advanced","Не перешли"],["time","Среднее время"],
            ] as const).map(([value,label])=><button type="button" key={value} className={mode===value?"active":""} onClick={()=>setMode(value)}>{label}</button>)}</div>
          </div>
        </div>
        <div className="request-funnel-columns"><span>Этап</span><span>{unit==="tenders"?"Тендеры":unit==="value"?"₽":"Чел."}</span><span>{funnelModeLabel(mode)}</span></div>
        <SalesFunnel label="Тендерная воронка" steps={funnelSteps} showIndex/>
      </section>

      <aside className="request-kpi-panel">
        <div className="request-kpi-title"><span>Ключевые показатели</span><div><small>{formatRange(filters.from,filters.to)}</small>{canConfigure&&<button type="button" className="icon-button" onClick={openMetricSettings} aria-label="Настроить показатели"><Settings2 size={15}/></button>}</div></div>
        <div className="request-kpi-grid">{visibleMetrics.map(item=>{
          const definition=tenderAnalyticsMetricDefinition(item.key),current=metricRaw(item.key,true),previous=definition.comparison?metricRaw(item.key,false):null;
          const delta=definition.comparison&&current!=null&&previous!=null?metricTrend(current,previous,definition.direction,definition.format):null;
          return <div className="request-kpi-card" key={item.key}><span className="request-kpi-icon">{metricIcon(item.key)}</span><div><span>{item.label}</span><strong>{formatMetricValue(current,definition.format)}</strong><small className={delta?.tone??"neutral"}>{metricFootnote(item,definition,delta?.text??null)}</small></div></div>;
        })}</div>
      </aside>
    </div>

    <div className="request-analytics-secondary-grid">
      <section className="request-analytics-card request-gap-card">
        <div className="request-analytics-card-head"><div><h3>Где застревают тендеры?</h3><p>Разрыв между достигнутыми этапами. Активный тендер здесь не считается проигранным.</p></div></div>
        <div className="request-gap-list">{gaps.length?gaps.map((item,index)=><div className="request-gap-row" key={`${item.from}-${item.to}`}><span className="request-gap-rank">{index+1}</span><span className="request-gap-copy"><strong>{item.from} → {item.to}</strong><i><span style={{width:`${item.rate}%`}}/></i></span><b>{formatUnitCompact(item.count,unit)} <small>({item.rate}%)</small></b></div>):<SalesEmpty title="Разрывов между этапами нет" text="Переходы появятся после движения тендеров по воронке."/>}</div>
      </section>

      <TenderAnalyticsTrendChart rows={data.daily} comparisonRows={data.comparisonDaily} unit={unit}/>

      <section className="request-analytics-card tender-deadline-card">
        <div className="request-analytics-card-head"><div><h3>Риск подачи</h3><p>Сколько тендеров приближается к дедлайну и сколько из них ещё не готовы.</p></div></div>
        <div className="tender-deadline-risk">{data.deadlineRisk.map(row=><div key={row.key}><span>{row.label}</span><strong>{row.tenders}</strong><small>{row.notReady} не готовы</small></div>)}</div>
      </section>

      <section className="request-analytics-card tender-doc-readiness">
        <div className="request-analytics-card-head"><div><h3>Готовность документов</h3><p>Требования по активным тендерам в выбранном контуре.</p></div></div>
        <div className="tender-doc-readiness-body"><div className="tender-doc-readiness-kpis"><div><span>Готовность</span><strong>{data.documents.readinessPct}%</strong></div><div><span>Готово</span><strong>{data.documents.ready}/{data.documents.required}</strong></div><div><span>Блокеры</span><strong>{data.documents.blockers}</strong></div><div><span>Тендеров с блокерами</span><strong>{data.documents.tendersWithBlockers}</strong></div></div><div className="tender-doc-progress"><i><b style={{width:`${Math.min(100,data.documents.readinessPct)}%`}}/></i></div>{data.documents.topCategories.length>0&&<div className="tender-doc-categories">{data.documents.topCategories.map(item=><span key={item.category}>{item.category}<strong>{item.count}</strong></span>)}</div>}</div>
      </section>

      <section className="request-analytics-card request-breakdown-card">
        <div className="request-analytics-card-head"><div><h3>Разрез эффективности</h3><p>Площадки, заказчики и ответственные по подаче, победам и win rate.</p></div><div className="request-mini-segments">{(["platforms","customers","owners"] as BreakdownMode[]).map(value=><button type="button" key={value} className={breakdownMode===value?"active":""} onClick={()=>setBreakdownMode(value)}>{value==="platforms"?"Площадки":value==="customers"?"Заказчики":"Ответственные"}</button>)}</div></div>
        <BreakdownTable rows={breakdownRows} unit={unit}/>
      </section>

      <div className="tender-reason-grid">
        <section className="request-analytics-card tender-reason-card">
          <div className="request-analytics-card-head"><div><h3>Почему не участвуем</h3><p>Причины Bid / No Bid, а не результаты торгов.</p></div></div>
          <ReasonList rows={data.noBidReasons} unit={unit} empty="Причины появятся после фиксации решений «Не участвуем»."/>
        </section>
        <section className="request-analytics-card tender-reason-card">
          <div className="request-analytics-card-head"><div><h3>Почему проигрываем</h3><p>Причины проигрыша только среди поданных тендеров.</p></div></div>
          <ReasonList rows={data.lossReasons} unit={unit} empty="Причины появятся после фиксации проигранных тендеров."/>
        </section>
      </div>

      <section className="request-analytics-card request-stage-details">
        <div className="request-analytics-card-head"><div><h3>Этапы воронки — детали</h3><p>Конверсия, скорость и разрыв по каждой ступени тендерного процесса.</p></div><button type="button" className="button" onClick={exportCsv}><Download size={14}/> Экспорт</button></div>
        <div className="request-stage-table-wrap"><table className="data-table request-stage-table"><thead><tr><th>#</th><th>Этап</th><th>Тендеры</th><th>Стоимость</th><th>Численность</th><th>Конверсия</th><th>Не перешли</th><th>Ср. время</th></tr></thead><tbody>{data.stages.map((stage,index)=><tr key={stage.code}><td>{index+1}</td><td><strong>{stage.label}</strong></td><td>{stage.tenders}</td><td>{formatCurrency(stage.value,true)}</td><td>{stage.headcount}</td><td>{stageUnitConversion(stage,unit)}%</td><td>{stage.code==="won"?"—":`${formatUnitCompact(stageUnitNotAdvanced(stage,unit),unit)} (${stageUnitNotAdvancedRate(stage,unit)}%)`}</td><td>{formatDuration(stage.avgHours)}</td></tr>)}</tbody></table></div>
      </section>
    </div>

    {showMetrics&&<div className="recruiting-modal analytics-settings-backdrop" onMouseDown={event=>{if(event.currentTarget===event.target)setShowMetrics(false)}}><div className="recruiting-modal-card needs-metric-settings"><div className="recruiting-modal-head needs-metric-settings-head"><div><h2>Настроить показатели</h2><p>Формулы системные. Настройте состав, порядок, подпись и целевое значение.</p></div><button type="button" className="icon-button" onClick={()=>setShowMetrics(false)}><X size={17}/></button></div><div className="needs-metric-settings-body">{metricError&&<div className="recruiting-error">{metricError}</div>}<div className="needs-metric-settings-toolbar"><span>Показывается <strong>{draftPreferences.filter(item=>item.visible).length}</strong> из {draftPreferences.length}</span><small>Порядок строк соответствует порядку карточек.</small></div><div className="needs-metric-settings-list">{draftPreferences.map((item,index)=>{const definition=tenderAnalyticsMetricDefinition(item.key);return <div className={`needs-metric-setting-row ${item.visible?"is-visible":"is-hidden"}`} key={item.key}><label className="needs-metric-visible"><input type="checkbox" checked={item.visible} onChange={event=>setDraftPreferences(current=>current.map(row=>row.key===item.key?{...row,visible:event.target.checked}:row))}/><span className="needs-metric-title"><strong>{definition.label}</strong><small>{definition.description}</small></span></label><label className="needs-metric-field"><span>Название в карточке</span><input className="needs-metric-label-input" value={item.label} onChange={event=>setDraftPreferences(current=>current.map(row=>row.key===item.key?{...row,label:event.target.value}:row))}/></label><label className="needs-metric-field needs-metric-target"><span>Цель</span><div><input className="needs-metric-target-input" type="number" step="0.1" value={item.targetValue??""} onChange={event=>setDraftPreferences(current=>current.map(row=>row.key===item.key?{...row,targetValue:event.target.value===""?null:Number(event.target.value)}:row))} placeholder="—"/><small>{metricTargetUnit(definition.format)}</small></div></label><div className="needs-metric-order"><button type="button" className="icon-button" disabled={index===0} onClick={()=>moveMetric(index,-1)}><ChevronUp size={14}/></button><button type="button" className="icon-button" disabled={index===draftPreferences.length-1} onClick={()=>moveMetric(index,1)}><ChevronDown size={14}/></button></div></div>})}</div></div><div className="recruiting-form-actions needs-metric-settings-footer"><button type="button" className="button needs-metric-reset" onClick={()=>setDraftPreferences(defaultTenderAnalyticsMetricPreferences())}>Сбросить к стандарту</button><span/><button type="button" className="button" onClick={()=>setShowMetrics(false)}>Отмена</button><button type="button" className="button primary" disabled={savingMetrics} onClick={()=>void saveMetricSettings()}>{savingMetrics?"Сохраняю…":"Сохранить"}</button></div></div></div>}
  </div>;
}

function BreakdownTable({rows,unit}:{rows:TenderAnalyticsBreakdownRow[];unit:TenderAnalyticsUnit}){
  return <div className="request-breakdown-table-wrap"><table className="data-table request-breakdown-table"><thead><tr><th>Контур</th><th>{unitLabel(unit)}</th><th>Подано</th><th>Выиграно</th><th>Win rate</th></tr></thead><tbody>{rows.length?rows.slice(0,10).map(row=><tr key={row.key}><td><strong>{row.label}</strong></td><td>{formatBreakdown(row,"flow",unit)}</td><td>{formatBreakdown(row,"submitted",unit)}</td><td>{formatBreakdown(row,"won",unit)}</td><td>{unit==="tenders"?row.winRateTenders:unit==="value"?row.winRateValue:row.winRateHeadcount}%</td></tr>):<tr><td colSpan={5}>Нет данных для выбранного разреза</td></tr>}</tbody></table></div>;
}
function ReasonList({rows,unit,empty}:{rows:Array<{code:string;label:string;tenders:number;value:number;headcount:number}>;unit:TenderAnalyticsUnit;empty:string}){
  return <div className="request-loss-reason-list">{rows.length?rows.slice(0,8).map(row=><div key={row.code}><span>{row.label}</span><strong>{formatUnit(row[unit],unit)}</strong></div>):<div className="request-analytics-empty">{empty}</div>}</div>;
}
function stageUnitValue(stage:TenderAnalyticsData["stages"][number],unit:TenderAnalyticsUnit){return unit==="tenders"?stage.tenders:unit==="value"?stage.value:stage.headcount}
function stageUnitShare(stage:TenderAnalyticsData["stages"][number],unit:TenderAnalyticsUnit){return unit==="tenders"?stage.shareTenders:unit==="value"?stage.shareValue:stage.shareHeadcount}
function stageUnitConversion(stage:TenderAnalyticsData["stages"][number],unit:TenderAnalyticsUnit){return unit==="tenders"?stage.conversionTenders:unit==="value"?stage.conversionValue:stage.conversionHeadcount}
function stageUnitNotAdvanced(stage:TenderAnalyticsData["stages"][number],unit:TenderAnalyticsUnit){return unit==="tenders"?stage.notAdvancedTenders:unit==="value"?stage.notAdvancedValue:stage.notAdvancedHeadcount}
function stageUnitNotAdvancedRate(stage:TenderAnalyticsData["stages"][number],unit:TenderAnalyticsUnit){return unit==="tenders"?stage.notAdvancedRate:unit==="value"?stage.notAdvancedValueRate:stage.notAdvancedHeadcountRate}
function formatBreakdown(row:TenderAnalyticsBreakdownRow,kind:"flow"|"submitted"|"won",unit:TenderAnalyticsUnit){
  if(kind==="flow")return formatUnit(unit==="tenders"?row.tenders:unit==="value"?row.value:row.headcount,unit);
  if(kind==="submitted")return formatUnit(unit==="tenders"?row.submitted:unit==="value"?row.submittedValue:row.submittedHeadcount,unit);
  return formatUnit(unit==="tenders"?row.won:unit==="value"?row.wonValue:row.wonHeadcount,unit);
}
function formatUnit(value:number,unit:TenderAnalyticsUnit){return unit==="value"?formatCurrency(value,true):new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(value)}
function formatUnitCompact(value:number,unit:TenderAnalyticsUnit){return unit==="value"?formatCurrency(value,true):new Intl.NumberFormat("ru-RU",{notation:value>=1000?"compact":"standard",maximumFractionDigits:1}).format(value)}
function unitLabel(unit:TenderAnalyticsUnit){return unit==="tenders"?"Тендеры":unit==="value"?"Стоимость":"Численность"}
function formatCurrency(value:number,compact=false){return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",notation:compact?"compact":"standard",maximumFractionDigits:compact?1:0}).format(value)}
function formatNumber(value:number){return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
function formatDuration(hours:number|null){if(hours==null)return"—";return hours<24?`${formatNumber(hours)} ч`:`${formatNumber(hours/24)} дн.`}
function funnelModeLabel(mode:FunnelMode){return mode==="share"?"Доля":mode==="conversion"?"Конверсия":mode==="not_advanced"?"Не перешли":"Среднее время"}
function parseDay(value:string){return new Date(`${value}T00:00:00.000Z`)}
function shiftDay(value:string,days:number){const date=parseDay(value);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function periodDays(from:string,to:string){return Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000)+1}
function formatRange(from:string,to:string){const formatter=new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"});return`${formatter.format(parseDay(from))} — ${formatter.format(parseDay(to))}`}

function camelMetricKey(key:TenderAnalyticsMetricKey):keyof TenderAnalyticsData["metrics"]{
  const map:Record<TenderAnalyticsMetricKey,keyof TenderAnalyticsData["metrics"]>={
    active_tenders:"activeTenders",participating:"participating",deadline_3d:"deadline3d",submitted_active:"submittedActive",awaiting_result:"awaitingResult",attention:"attention",
    new_tenders:"newTenders",incoming_value:"incomingValue",incoming_headcount:"incomingHeadcount",submitted_tenders:"submittedTenders",submitted_value:"submittedValue",submitted_headcount:"submittedHeadcount",
    won_tenders:"wonTenders",won_value:"wonValue",won_headcount:"wonHeadcount",win_rate_tenders:"winRateTenders",win_rate_value:"winRateValue",win_rate_headcount:"winRateHeadcount",
    avg_decision_hours:"avgDecisionHours",avg_cycle_days:"avgCycleDays",avg_submission_lead_hours:"avgSubmissionLeadHours",blocker_tenders:"blockerTenders",unassigned:"unassigned",no_bid_count:"noBidCount",lost_count:"lostCount",
  };
  return map[key];
}
function metricIcon(key:TenderAnalyticsMetricKey){
  if(key.includes("win_rate"))return <Target size={18}/>;
  if(key.startsWith("won_"))return <Trophy size={18}/>;
  if(key.includes("value"))return <BadgeRussianRuble size={18}/>;
  if(key.includes("headcount"))return <UsersRound size={18}/>;
  if(key.includes("avg_"))return <Clock3 size={18}/>;
  if(key==="attention"||key==="deadline_3d"||key==="blocker_tenders"||key==="unassigned"||key==="lost_count")return <AlertTriangle size={18}/>;
  if(key==="submitted_active"||key==="submitted_tenders")return <FileCheck2 size={18}/>;
  if(key==="participating")return <CheckCircle2 size={18}/>;
  return <Gavel size={18}/>;
}
function metricTargetUnit(format:"number"|"percent"|"days"|"hours"|"currency"){return format==="percent"?"%":format==="days"?"дн.":format==="hours"?"ч":format==="currency"?"₽":"значение"}
function formatMetricValue(value:number|null,format:"number"|"percent"|"days"|"hours"|"currency"){if(value==null)return"—";if(format==="percent")return`${formatNumber(value)}%`;if(format==="days")return`${formatNumber(value)} дн.`;if(format==="hours")return value<24?`${formatNumber(value)} ч`:`${formatNumber(value/24)} дн.`;if(format==="currency")return formatCurrency(value,true);return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
function metricTrend(current:number,previous:number,direction:"higher"|"lower"|"neutral",format:"number"|"percent"|"days"|"hours"|"currency"){
  if(current===previous)return{text:"без изменений",tone:"neutral"};
  const diff=current-previous,tone=direction==="neutral"?"neutral":direction==="higher"?(diff>0?"good":"bad"):(diff<0?"good":"bad");
  if(format==="percent")return{text:`${diff>0?"+":""}${formatNumber(diff)} п.п. к прошлому периоду`,tone};
  if(previous===0)return{text:current>0?"новое значение":"—",tone};
  const pct=diff/previous*100;return{text:`${pct>0?"+":""}${formatNumber(pct)}% к прошлому периоду`,tone};
}
function metricFootnote(item:TenderAnalyticsMetricPreference,definition:ReturnType<typeof tenderAnalyticsMetricDefinition>,delta:string|null){
  const target=item.targetValue!=null?`цель ${formatMetricValue(item.targetValue,definition.format)}`:null;
  if(target&&delta)return`${delta} · ${target}`;if(target)return target;if(delta)return delta;return definition.description;
}
