"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock3, Download, RotateCcw, TrendingUp, UserRoundCheck, UsersRound } from "lucide-react";
import { SalesFunnel } from "@/components/sales/SalesUI";
import { RecruitingAnalyticsTrendChart } from "@/components/RecruitingAnalyticsTrendChart";
import type { RecruitingAnalyticsData, RecruitingAnalyticsFilters } from "@/lib/recruiting/analytics";
import type { RecruitingOptions } from "@/lib/recruiting/service";

type FunnelMode="candidates"|"conversion"|"losses"|"time";

export function RecruitingNeedsAnalytics({data,options}:{data:RecruitingAnalyticsData;options:RecruitingOptions}){
  const router=useRouter();
  const [mode,setMode]=useState<FunnelMode>("candidates");
  const filters=data.filters;
  const funnelHref=buildRecruitingHref(filters);
  const currentPeriodDays=periodDays(filters.from,filters.to);

  function apply(patch:Partial<RecruitingAnalyticsFilters>){
    const next={...filters,...patch};
    const params=new URLSearchParams({view:"analytics",from:next.from,to:next.to});
    if(next.objectId)params.set("object",next.objectId);
    if(next.specialtyId)params.set("specialty",next.specialtyId);
    if(next.recruiterId)params.set("recruiter",next.recruiterId);
    if(next.source)params.set("source",next.source);
    router.replace(`/needs?${params.toString()}`,{scroll:false});
  }

  function setPreset(days:number){
    apply({from:shiftDay(filters.to,-(days-1)),to:filters.to});
  }

  const funnelSteps=useMemo(()=>data.stages.map(stage=>({
    key:stage.stage,
    label:stage.label,
    value:stage.candidates,
    note:`${stage.shareTotal}% от общего потока`,
    aside:mode==="candidates"?`${stage.shareTotal}%`:mode==="conversion"?`${stage.conversion}%`:mode==="losses"?(stage.stage==="started"?"—":`−${stage.loss} · ${stage.lossRate}%`):formatDuration(stage.avgHours),
  })),[data.stages,mode]);

  const losses=useMemo(()=>data.stages.slice(0,-1).map((stage,index)=>({
    from:stage.label,
    to:data.stages[index+1].label,
    loss:stage.loss,
    rate:stage.lossRate,
  })).sort((a,b)=>b.rate-a.rate||b.loss-a.loss).slice(0,5),[data.stages]);

  const stageRows=data.stages;
  const kpis=[
    {label:"Кандидаты за период",value:String(data.metrics.totalCandidates),delta:trend(data.metrics.totalCandidates,data.comparison.totalCandidates,"percent",true),icon:<UsersRound size={18}/>},
    {label:"Конверсия до выхода",value:`${data.metrics.conversionToStart}%`,delta:trend(data.metrics.conversionToStart,data.comparison.conversionToStart,"pp",true),icon:<TrendingUp size={18}/>},
    {label:"В работе на конец периода",value:String(data.metrics.inWork),delta:trend(data.metrics.inWork,data.comparison.inWork,"percent",null),icon:<UsersRound size={18}/>},
    {label:"Готовы к выходу",value:String(data.metrics.ready),delta:trend(data.metrics.ready,data.comparison.ready,"percent",true),icon:<UserRoundCheck size={18}/>},
    {label:"Среднее время до выхода",value:data.metrics.avgDaysToStart==null?"—":`${formatNumber(data.metrics.avgDaysToStart)} дн.`,delta:trendNullable(data.metrics.avgDaysToStart,data.comparison.avgDaysToStart),icon:<Clock3 size={18}/>},
    {label:"Вышли на работу",value:String(data.metrics.started),delta:trend(data.metrics.started,data.comparison.started,"percent",true),icon:<CheckCircle2 size={18}/>},
  ];

  function exportCsv(){
    const header=["Этап","Кандидаты","Доля от общего","Конверсия","Потери","Процент потерь","Среднее время"];
    const lines=stageRows.map(stage=>[
      stage.label,
      stage.candidates,
      `${stage.shareTotal}%`,
      `${stage.conversion}%`,
      stage.loss,
      `${stage.lossRate}%`,
      formatDuration(stage.avgHours),
    ]);
    const csv="\ufeff"+[header,...lines].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(";")).join("\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");
    anchor.href=url;anchor.download=`voronka-podbora-${filters.from}-${filters.to}.csv`;anchor.click();
    URL.revokeObjectURL(url);
  }

  return <div className="needs-analytics-screen">
    <section className="needs-analytics-filters" aria-label="Фильтры аналитики">
      <div className="needs-date-filter">
        <span><CalendarDays size={14}/> Период</span>
        <input type="date" value={filters.from} onChange={event=>apply({from:event.target.value})}/>
        <i>—</i>
        <input type="date" value={filters.to} onChange={event=>apply({to:event.target.value})}/>
      </div>
      <div className="needs-period-presets" role="group" aria-label="Быстрый выбор периода">
        {[7,30,90].map(days=><button type="button" key={days} className={currentPeriodDays===days?"active":""} onClick={()=>setPreset(days)}>{days} дней</button>)}
      </div>
      <div className="needs-auto-compare" title="Сравнение рассчитывается автоматически для предыдущего периода той же длительности">
        <span>Сравнение</span>
        <strong>{formatRange(filters.compareFrom,filters.compareTo)}</strong>
        <small>предыдущий равный период</small>
      </div>
      <select value={filters.objectId??""} onChange={event=>apply({objectId:event.target.value||null})} aria-label="Объект">
        <option value="">Все объекты</option>{options.objects.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select value={filters.specialtyId??""} onChange={event=>apply({specialtyId:event.target.value||null})} aria-label="Специальность">
        <option value="">Все специальности</option>{options.specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select value={filters.recruiterId??""} onChange={event=>apply({recruiterId:event.target.value||null})} aria-label="Рекрутер">
        <option value="">Все рекрутеры</option>{options.recruiters.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <select value={filters.source??""} onChange={event=>apply({source:event.target.value||null})} aria-label="Источник">
        <option value="">Все источники</option>{options.sources.map(item=><option key={item} value={item}>{item}</option>)}
      </select>
      <button type="button" className="button" onClick={()=>router.replace("/needs?view=analytics",{scroll:false})}><RotateCcw size={14}/> Сбросить</button>
    </section>

    <div className="needs-analytics-primary-grid">
      <section className="needs-analytics-funnel-card">
        <div className="needs-analytics-card-head">
          <div><h3>Воронка кандидатов</h3><p>Дошедшие до этапа кандидаты за выбранный период.</p></div>
          <div className="needs-analytics-head-actions">
            <Link className="button" href={funnelHref}><UsersRound size={14}/> Открыть кандидатов</Link>
            <div className="needs-mini-segments" role="group" aria-label="Режим воронки">
              {([
                ["candidates","Кандидаты"],
                ["conversion","Конверсия"],
                ["losses","Потери"],
                ["time","Среднее время"],
              ] as const).map(([value,label])=><button key={value} type="button" className={mode===value?"active":""} onClick={()=>setMode(value)}>{label}</button>)}
            </div>
          </div>
        </div>
        <div className="needs-funnel-column-head"><span>Этап</span><span>Кандидаты</span><span>{modeLabel(mode)}</span></div>
        <SalesFunnel label="Воронка кандидатов" steps={funnelSteps} onStep={()=>router.push(funnelHref)} showIndex/>
      </section>

      <aside className="needs-analytics-kpi-panel">
        <div className="needs-analytics-side-title"><span>Ключевые показатели</span><small>{formatRange(filters.from,filters.to)}</small></div>
        <div className="needs-kpi-grid">{kpis.map(item=><div className="needs-kpi-card" key={item.label}>
          <span className="needs-kpi-icon">{item.icon}</span>
          <div><span>{item.label}</span><strong>{item.value}</strong><small className={item.delta.tone}>{item.delta.text}</small></div>
        </div>)}</div>
      </aside>
    </div>

    <div className="needs-analytics-bottom-grid">
      <section className="needs-loss-card">
        <div className="needs-analytics-card-head"><div><h3>Где теряем кандидатов?</h3><p>Пять самых заметных потерь между соседними этапами.</p></div></div>
        <div className="needs-loss-list">{losses.length?losses.map((item,index)=><div className="needs-loss-row" key={`${item.from}-${item.to}`}>
          <span className="needs-loss-rank">{index+1}</span>
          <span className="needs-loss-copy"><strong>{item.from} → {item.to}</strong><i><span style={{width:`${item.rate}%`}}/></i></span>
          <b>{item.loss} <small>({item.rate}%)</small></b>
        </div>):<div className="needs-analytics-empty">Потерь между этапами за период нет.</div>}</div>
      </section>

      <RecruitingAnalyticsTrendChart rows={data.daily}/>

      <section className="needs-stage-details-card">
        <div className="needs-analytics-card-head"><div><h3>Этапы воронки — детали</h3><p>Конверсия, скорость прохождения и потери.</p></div><button type="button" className="button" onClick={exportCsv}><Download size={14}/> Экспорт</button></div>
        <div className="needs-stage-table-wrap"><table className="data-table needs-stage-table"><thead><tr><th>#</th><th>Этап</th><th>Кандидаты</th><th>Конверсия</th><th>Потери</th><th>Ср. время</th></tr></thead><tbody>{stageRows.map((stage,index)=><tr key={stage.stage}><td>{index+1}</td><td><strong>{stage.label}</strong></td><td>{stage.candidates}</td><td>{stage.conversion}%</td><td>{stage.stage==="started"?"—":`${stage.loss} (${stage.lossRate}%)`}</td><td>{formatDuration(stage.avgHours)}</td></tr>)}</tbody></table></div>
      </section>
    </div>
  </div>;
}

function modeLabel(mode:FunnelMode){return mode==="candidates"?"Доля от общего":mode==="conversion"?"Конверсия":mode==="losses"?"Потери":"Среднее время"}

function formatNumber(value:number){return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
function formatDuration(hours:number|null){
  if(hours==null)return "—";
  if(hours<24)return `${formatNumber(hours)} ч`;
  return `${formatNumber(hours/24)} дн.`;
}
function parseDay(value:string){return new Date(`${value}T00:00:00.000Z`)}
function shiftDay(value:string,days:number){const date=parseDay(value);date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function periodDays(from:string,to:string){return Math.round((parseDay(to).getTime()-parseDay(from).getTime())/86400000)+1}
function formatRange(from:string,to:string){
  const formatter=new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"});
  return `${formatter.format(parseDay(from))} — ${formatter.format(parseDay(to))}`;
}

function trend(current:number,previous:number,kind:"percent"|"pp",higherIsBetter:boolean|null){
  if(previous===current)return {text:"без изменений",tone:"neutral"};
  const diff=current-previous;
  const tone=higherIsBetter==null?"neutral":((higherIsBetter?diff>0:diff<0)?"good":"bad");
  if(kind==="pp")return {text:`${diff>0?"+":""}${formatNumber(diff)} п.п. к прошлому периоду`,tone};
  if(previous===0)return {text:current>0?"+ новое значение":"—",tone};
  const pct=diff/previous*100;
  return {text:`${pct>0?"+":""}${formatNumber(pct)}% к прошлому периоду`,tone};
}
function trendNullable(current:number|null,previous:number|null){
  if(current==null||previous==null)return {text:"недостаточно данных",tone:"neutral"};
  return trend(current,previous,"percent",false);
}

function buildRecruitingHref(filters:RecruitingAnalyticsFilters){const params=new URLSearchParams();if(filters.objectId)params.set("object",filters.objectId);if(filters.specialtyId)params.set("specialty",filters.specialtyId);if(filters.recruiterId)params.set("recruiter",filters.recruiterId);if(filters.source)params.set("source",filters.source);const query=params.toString();return query?`/recruiting?${query}`:"/recruiting"}
