"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { TenderAnalyticsDaily, TenderAnalyticsUnit } from "@/lib/tenders/analytics";

type Metric="new"|"participate"|"submitted"|"won"|"win_rate";
type ChartPoint={
  label:string;
  newTenders:number;newValue:number;newHeadcount:number;
  participateTenders:number;participateValue:number;participateHeadcount:number;
  submittedTenders:number;submittedValue:number;submittedHeadcount:number;
  wonTenders:number;wonValue:number;wonHeadcount:number;
  winRateTenders:number;winRateValue:number;winRateHeadcount:number;
};

const metricLabels:Record<Metric,string>={new:"Новые",participate:"Участвуем",submitted:"Подано",won:"Выиграно",win_rate:"Win rate"};

export function TenderAnalyticsTrendChart({rows,comparisonRows,unit}:{rows:TenderAnalyticsDaily[];comparisonRows:TenderAnalyticsDaily[];unit:TenderAnalyticsUnit}){
  const ref=useRef<HTMLDivElement>(null);
  const [metric,setMetric]=useState<Metric>("new");
  const points=useMemo(()=>bucketRows(rows),[rows]);
  const comparisonPoints=useMemo(()=>bucketRows(comparisonRows),[comparisonRows]);
  const currentValue=useMemo(()=>metricValue(metric,unit,points),[metric,unit,points]);
  const previousValue=useMemo(()=>metricValue(metric,unit,comparisonPoints),[metric,unit,comparisonPoints]);
  const delta=useMemo(()=>metricDelta(metric,currentValue,previousValue),[metric,currentValue,previousValue]);

  useEffect(()=>{
    if(!ref.current)return;
    const node=ref.current;
    const chart=echarts.init(node,undefined,{renderer:"canvas"});
    const draw=()=>{
      const css=getComputedStyle(document.documentElement);
      const text=css.getPropertyValue("--text").trim();
      const muted=css.getPropertyValue("--muted").trim();
      const soft=css.getPropertyValue("--soft").trim()||muted;
      const border=css.getPropertyValue("--border").trim();
      const accent=css.getPropertyValue("--accent").trim();
      const panel=css.getPropertyValue("--panel").trim();
      const isPercent=metric==="win_rate";
      const currentData=points.map(point=>pointValue(metric,unit,point));
      const previousData=points.map((_,index)=>comparisonPoints[index]?pointValue(metric,unit,comparisonPoints[index]):null);
      chart.setOption({
        animationDuration:220,
        aria:{enabled:true,description:`Динамика тендерного показателя «${metricLabels[metric]}» по текущему и предыдущему периоду`},
        grid:{left:10,right:14,top:34,bottom:10,containLabel:true},
        tooltip:{
          trigger:"axis",
          backgroundColor:panel,
          borderColor:border,
          borderWidth:1,
          padding:[8,10],
          textStyle:{color:text,fontSize:10},
          axisPointer:{type:"line",lineStyle:{color:border,width:1}},
          valueFormatter:(value:unknown)=>isPercent?`${value}%`:unit==="value"?formatCurrency(Number(value)):String(value),
        },
        legend:{top:2,left:4,itemWidth:16,itemHeight:7,itemGap:16,textStyle:{color:muted,fontSize:9.5},data:["Текущий период","Предыдущий период"]},
        xAxis:{type:"category",boundaryGap:false,data:points.map(point=>point.label),axisLine:{lineStyle:{color:border}},axisTick:{show:false},axisLabel:{color:muted,fontSize:9,interval:Math.max(0,Math.ceil(points.length/7)-1),hideOverlap:true}},
        yAxis:{type:"value",min:0,max:isPercent?100:undefined,minInterval:unit==="tenders"||unit==="headcount"?1:undefined,splitNumber:4,splitLine:{lineStyle:{color:border,type:"dashed",opacity:.55}},axisLine:{show:false},axisTick:{show:false},axisLabel:{color:muted,fontSize:9,formatter:isPercent?"{value}%":unit==="value"?(value:number)=>formatCurrency(value,true):"{value}"}},
        series:[
          {name:"Текущий период",type:"line",smooth:.28,showSymbol:false,symbol:"circle",symbolSize:6,data:currentData,lineStyle:{width:2.2,color:accent},itemStyle:{color:accent},areaStyle:isPercent?undefined:{color:accent,opacity:.055},emphasis:{focus:"series",scale:true}},
          {name:"Предыдущий период",type:"line",smooth:.28,showSymbol:false,symbol:"circle",symbolSize:5,data:previousData,lineStyle:{width:1.6,color:soft,type:"dashed"},itemStyle:{color:soft},emphasis:{focus:"series",scale:true},connectNulls:false},
        ],
      },true);
    };
    draw();
    const resize=()=>chart.resize();
    const observer=new MutationObserver(draw);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    window.addEventListener("resize",resize);
    return()=>{window.removeEventListener("resize",resize);observer.disconnect();chart.dispose()};
  },[points,comparisonPoints,metric,unit]);

  return <section className="request-analytics-card request-trend-card tender-trend-card">
    <div className="request-analytics-card-head">
      <div><h3>Динамика тендерной воронки</h3><p>Текущий период против предыдущего равного периода.</p></div>
      <div className="request-mini-segments" role="group" aria-label="Показатель графика">
        {(Object.keys(metricLabels) as Metric[]).map(value=><button type="button" key={value} className={metric===value?"active":""} onClick={()=>setMetric(value)}>{metricLabels[value]}</button>)}
      </div>
    </div>
    <div className="request-trend-summary">
      <div><span>{metricLabels[metric]} · текущий</span><strong>{formatMetric(metric,unit,currentValue)}</strong></div>
      <div><span>Предыдущий период</span><strong>{formatMetric(metric,unit,previousValue)}</strong></div>
      <div className={`request-trend-delta ${delta.tone}`}><span>Изменение</span><strong>{delta.text}</strong></div>
    </div>
    <div ref={ref} className="request-trend-chart"/>
  </section>;
}

function pointValue(metric:Metric,unit:TenderAnalyticsUnit,point:ChartPoint){
  const suffix=unit==="tenders"?"Tenders":unit==="value"?"Value":"Headcount";
  if(metric==="new")return point[`new${suffix}` as keyof ChartPoint] as number;
  if(metric==="participate")return point[`participate${suffix}` as keyof ChartPoint] as number;
  if(metric==="submitted")return point[`submitted${suffix}` as keyof ChartPoint] as number;
  if(metric==="won")return point[`won${suffix}` as keyof ChartPoint] as number;
  return unit==="tenders"?point.winRateTenders:unit==="value"?point.winRateValue:point.winRateHeadcount;
}
function metricValue(metric:Metric,unit:TenderAnalyticsUnit,points:ChartPoint[]){
  if(!points.length)return 0;
  if(metric==="win_rate")return pointValue(metric,unit,points.at(-1)!);
  return points.reduce((sum,point)=>sum+pointValue(metric,unit,point),0);
}
function metricDelta(metric:Metric,current:number,previous:number){
  const diff=current-previous;
  if(diff===0)return{text:"без изменений",tone:"neutral"};
  if(metric==="win_rate")return{text:`${diff>0?"+":""}${formatNumber(diff)} п.п.`,tone:diff>0?"good":"bad"};
  if(previous===0)return{text:current>0?"новое значение":"—",tone:"neutral"};
  const percent=diff/previous*100;
  return{text:`${percent>0?"+":""}${formatNumber(percent)}%`,tone:"neutral"};
}
function formatMetric(metric:Metric,unit:TenderAnalyticsUnit,value:number){
  if(metric==="win_rate")return`${formatNumber(value)}%`;
  if(unit==="value")return formatCurrency(value);
  return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(value);
}
function formatNumber(value:number){return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
function formatCurrency(value:number,compact=false){
  if(compact)return new Intl.NumberFormat("ru-RU",{notation:"compact",maximumFractionDigits:1}).format(value);
  return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(value);
}
function bucketRows(rows:TenderAnalyticsDaily[]):ChartPoint[]{
  if(!rows.length)return[];
  const size=rows.length<=14?1:rows.length<=45?3:rows.length<=120?7:14;
  const formatter=new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"});
  const result:ChartPoint[]=[];
  for(let index=0;index<rows.length;index+=size){
    const bucket=rows.slice(index,index+size);
    const first=new Date(`${bucket[0].date}T00:00:00.000Z`),last=new Date(`${bucket[bucket.length-1].date}T00:00:00.000Z`);
    const label=bucket.length===1?formatter.format(first):`${formatter.format(first)}–${formatter.format(last)}`;
    const tail=bucket[bucket.length-1];
    result.push({
      label,
      newTenders:bucket.reduce((sum,row)=>sum+row.newTenders,0),
      newValue:bucket.reduce((sum,row)=>sum+row.newValue,0),
      newHeadcount:bucket.reduce((sum,row)=>sum+row.newHeadcount,0),
      participateTenders:bucket.reduce((sum,row)=>sum+row.participateTenders,0),
      participateValue:bucket.reduce((sum,row)=>sum+row.participateValue,0),
      participateHeadcount:bucket.reduce((sum,row)=>sum+row.participateHeadcount,0),
      submittedTenders:bucket.reduce((sum,row)=>sum+row.submittedTenders,0),
      submittedValue:bucket.reduce((sum,row)=>sum+row.submittedValue,0),
      submittedHeadcount:bucket.reduce((sum,row)=>sum+row.submittedHeadcount,0),
      wonTenders:bucket.reduce((sum,row)=>sum+row.wonTenders,0),
      wonValue:bucket.reduce((sum,row)=>sum+row.wonValue,0),
      wonHeadcount:bucket.reduce((sum,row)=>sum+row.wonHeadcount,0),
      winRateTenders:tail.winRateTenders,
      winRateValue:tail.winRateValue,
      winRateHeadcount:tail.winRateHeadcount,
    });
  }
  return result;
}
