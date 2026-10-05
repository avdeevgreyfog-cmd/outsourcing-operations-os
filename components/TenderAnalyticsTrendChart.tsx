"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import type { TenderAnalyticsDaily, TenderAnalyticsUnit } from "@/lib/tenders/analytics";
import { bucketTenderActivity, tenderPercent, tenderActivityTooltip, type TenderActivityPoint } from "@/lib/tenders/analytics-presentation.mjs";

const activity=[{key:"new",label:"Новые",token:"--soft"},{key:"participate",label:"Решили участвовать",token:"--info"},{key:"submitted",label:"Подано",token:"--accent"},{key:"won",label:"Выиграно",token:"--good"}] as const;
type Props={rows:TenderAnalyticsDaily[];comparisonRows:TenderAnalyticsDaily[];unit:TenderAnalyticsUnit;headcountAvailable?:boolean;budgetAvailable?:boolean};
export function TenderAnalyticsTrendChart({rows,comparisonRows,unit,headcountAvailable=true,budgetAvailable=true}:Props){
  const points=useMemo(()=>bucketTenderActivity(rows),[rows]);
  const previous=useMemo(()=>bucketTenderActivity(comparisonRows),[comparisonRows]);
  const suffix=unit==="tenders"?"Tenders":unit==="value"?"Value":"Headcount";
  const totals=activity.map(item=>({label:item.label,value:points.reduce((sum,point)=>sum+Number(point[`${item.key}${suffix}` as keyof TenderActivityPoint]),0)}));
  const unavailable=(unit==="headcount"&&!headcountAvailable)||(unit==="value"&&!budgetAvailable);
  const hasActivity=!unavailable&&totals.some(item=>item.value>0);
  const rateKey=`winRate${suffix}` as "winRateTenders"|"winRateValue"|"winRateHeadcount";
  const hasRate=!unavailable&&[...points,...previous].some(point=>point[rateKey]!=null);
  return <div className="tender-analytics-chart-grid">
    <section className="request-analytics-card tender-calendar-card">
      <div className="request-analytics-card-head"><div><h3>Календарная активность</h3><p>События периода по всем тендерам, включая созданные раньше.</p><p>{rows[0]?.date} — {rows.at(-1)?.date}</p></div></div>
      <div className="request-trend-summary">{totals.map(item=><div key={item.label}><span>{item.label}</span><strong>{unavailable?"—":formatValue(item.value,unit)}</strong></div>)}</div>
      {hasActivity?<Chart points={points} previous={previous} unit={unit} rate={false}/>:<p className="request-analytics-empty">{unavailable?"Выбранная единица не указана в тендерах.":"За период нет новых тендеров, решений участвовать, подач и побед для выбранной единицы."}</p>}
      <small className="tender-chart-note">Суммы и численность — по заполненным текущим полям бюджета и потребности, без исторических снимков.</small>
    </section>
    <section className="request-analytics-card tender-win-rate-card">
      <div className="request-analytics-card-head"><div><h3>Накопленная доля побед</h3><p>Победы / (победы + проигрыши), с начала календарного периода.</p></div></div>
      <div className="request-trend-summary"><div><span>Текущий период</span><strong>{unavailable?"—":tenderPercent(points.at(-1)?.[rateKey])}</strong></div><div><span>Предыдущий равный период</span><strong>{unavailable?"—":tenderPercent(previous.at(-1)?.[rateKey])}</strong></div></div>
      {hasRate?<Chart points={points} previous={previous} unit={unit} rate/>:<p className="request-analytics-empty">{unavailable?"Выбранная единица не указана.":"Нет записанных побед и проигрышей для расчёта доли."}</p>}
      <small className="tender-chart-note">Результат учитывается один раз по последней записи на конец периода. Даты предыдущего периода сопоставлены по номеру дня.</small>
    </section>
  </div>;
}
function Chart({points,previous,unit,rate}:{points:TenderActivityPoint[];previous:TenderActivityPoint[];unit:TenderAnalyticsUnit;rate:boolean}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!ref.current)return;
    const chart=echarts.init(ref.current,undefined,{renderer:"canvas"});
    const suffix=unit==="tenders"?"Tenders":unit==="value"?"Value":"Headcount";
    const draw=()=>{
      const css=getComputedStyle(document.documentElement),token=(name:string)=>css.getPropertyValue(name).trim();
      const text=token("--text"),muted=token("--muted"),border=token("--border"),panel=token("--panel");
      const rateKey=`winRate${suffix}` as "winRateTenders"|"winRateValue"|"winRateHeadcount";
      const series=rate?[
        {name:"Текущий период",type:"line",data:points.map(point=>point[rateKey]),lineStyle:{color:token("--accent"),width:2},itemStyle:{color:token("--accent")},showSymbol:false,connectNulls:false},
        {name:"Предыдущий период",type:"line",data:points.map((_,index)=>previous[index]?.[rateKey]??null),lineStyle:{color:token("--soft"),width:1.5,type:"dashed"},itemStyle:{color:token("--soft")},showSymbol:false,connectNulls:false},
      ]:activity.map(item=>({name:item.label,type:"bar",barMaxWidth:18,data:points.map(point=>point[`${item.key}${suffix}` as keyof TenderActivityPoint]),itemStyle:{color:token(item.token)},emphasis:{focus:"series"}}));
      chart.setOption({animationDuration:180,aria:{enabled:true,description:rate?"Накопленная доля побед по записанным результатам":"Новые тендеры, решения участвовать, подачи и победы по календарным датам"},
        grid:{left:12,right:12,top:48,bottom:12,containLabel:true},
        legend:{top:4,left:12,itemWidth:12,itemHeight:8,textStyle:{color:muted,fontSize:12}},
        tooltip:{trigger:"axis",backgroundColor:panel,borderColor:border,textStyle:{color:text,fontSize:12},axisPointer:{type:rate?"line":"shadow"},formatter:(raw:unknown)=>{const params=(Array.isArray(raw)?raw[0]:raw) as {dataIndex?:number}|undefined;const index=params?.dataIndex??0;return tenderActivityTooltip(points[index],previous[index],unit,rate)}},
        xAxis:{type:"category",boundaryGap:!rate,data:points.map(point=>point.label),axisLine:{lineStyle:{color:border}},axisTick:{show:false},axisLabel:{color:muted,fontSize:12,interval:Math.max(0,Math.ceil(points.length/6)-1),hideOverlap:true}},
        yAxis:{type:"value",min:0,max:rate?100:undefined,minInterval:unit==="value"?undefined:1,splitNumber:4,splitLine:{lineStyle:{color:border,type:"dashed"}},axisLabel:{color:muted,fontSize:12,formatter:rate?"{value}%":unit==="value"?(value:number)=>new Intl.NumberFormat("ru-RU",{notation:"compact",maximumFractionDigits:1}).format(value):"{value}"}},series,
      },true);
    };
    draw();
    const themeObserver=new MutationObserver(draw);themeObserver.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    const resizeObserver=new ResizeObserver(()=>chart.resize());resizeObserver.observe(ref.current);
    return()=>{resizeObserver.disconnect();themeObserver.disconnect();chart.dispose()};
  },[points,previous,unit,rate]);
  return <div ref={ref} className="request-trend-chart" role="img" aria-label={rate?"График накопленной доли побед":"Группированные столбцы календарной активности"}/>;
}
function formatValue(value:number,unit:TenderAnalyticsUnit){return new Intl.NumberFormat("ru-RU",unit==="value"?{style:"currency",currency:"RUB",notation:"compact",maximumFractionDigits:1}:{maximumFractionDigits:0}).format(value)}
