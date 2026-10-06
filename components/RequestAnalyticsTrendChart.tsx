"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { RequestAnalyticsDaily } from "@/lib/commercial/request-analytics";

export type RequestAnalyticsUnit="requests"|"headcount";
export type RequestTrendMetric="new"|"proposal"|"agreed"|"conversion";
type ChartPoint={label:string;dateRange:string;newRequests:number;newHeadcount:number;proposalRequests:number;proposalHeadcount:number;agreedRequests:number;agreedHeadcount:number;conversionRequests:number|null;conversionHeadcount:number|null};
type Props={rows:RequestAnalyticsDaily[];comparisonRows:RequestAnalyticsDaily[];unit:RequestAnalyticsUnit;variant?:"inflow"|"outcomes"};
const metricLabels:Record<RequestTrendMetric,string>={new:"Новые заявки",proposal:"Первое КП",agreed:"Согласовано",conversion:"Конверсия новых"};

export function RequestAnalyticsTrendChart({rows,comparisonRows,unit,variant="inflow"}:Props){
  const ref=useRef<HTMLDivElement>(null);
  const [metric,setMetric]=useState<RequestTrendMetric>(variant==="inflow"?"new":"proposal");
  const points=useMemo(()=>bucketRequestTrendRows(rows),[rows]);
  const comparisonPoints=useMemo(()=>bucketRequestTrendRows(comparisonRows),[comparisonRows]);
  const currentValue=useMemo(()=>requestTrendTotal(metric,unit,points),[metric,unit,points]);
  const previousValue=useMemo(()=>requestTrendTotal(metric,unit,comparisonPoints),[metric,unit,comparisonPoints]);
  const delta=useMemo(()=>metricDelta(metric,currentValue,previousValue),[metric,currentValue,previousValue]);
  const chartDescription=`${metricLabels[metric]}: текущий период ${formatMetric(metric,currentValue)}, предыдущий ${formatMetric(metric,previousValue)}`;

  useEffect(()=>{
    if(!ref.current)return;
    const node=ref.current;
    const chart=echarts.init(node,undefined,{renderer:"canvas"});
    const draw=()=>{
      const css=getComputedStyle(document.documentElement);
      const text=css.getPropertyValue("--text").trim();
      const muted=css.getPropertyValue("--muted").trim();
      const border=css.getPropertyValue("--border").trim();
      const accent=css.getPropertyValue("--accent").trim();
      const panel=css.getPropertyValue("--panel").trim();
      const isPercent=metric==="conversion";
      const currentData=points.map(point=>requestTrendValue(metric,unit,point));
      const previousData=points.map((_,index)=>comparisonPoints[index]?requestTrendValue(metric,unit,comparisonPoints[index]):null);
      const seriesType=isPercent?"line":"bar";
      chart.setOption({
        animationDuration:window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:160,
        aria:{enabled:true,description:chartDescription},
        grid:{left:12,right:16,top:42,bottom:12,containLabel:true},
        tooltip:{trigger:"axis",confine:true,backgroundColor:panel,borderColor:border,borderWidth:1,padding:[10,12],textStyle:{color:text,fontSize:12},axisPointer:{type:isPercent?"line":"shadow",lineStyle:{color:border,width:1}},formatter:(params:unknown)=>{
          const entries=Array.isArray(params)?params:[];
          const index=(entries[0] as {dataIndex?:number}|undefined)?.dataIndex??0;
          const current=points[index],previous=comparisonPoints[index];
          return `<strong>${metricLabels[metric]}</strong><br/>Текущий · ${current?.dateRange??"—"}: <b>${formatMetric(metric,current?requestTrendValue(metric,unit,current):null)}</b><br/>Предыдущий · ${previous?.dateRange??"—"}: <b>${formatMetric(metric,previous?requestTrendValue(metric,unit,previous):null)}</b>`;
        }},
        legend:{top:6,left:12,itemWidth:14,itemHeight:9,itemGap:14,textStyle:{color:muted,fontSize:12},data:["Текущий период","Предыдущий период"]},
        xAxis:{type:"category",boundaryGap:!isPercent,data:points.map(point=>point.label),axisLine:{lineStyle:{color:border}},axisTick:{show:false},axisLabel:{color:muted,fontSize:12,interval:Math.max(0,Math.ceil(points.length/5)-1),hideOverlap:true}},
        yAxis:{type:"value",min:0,max:isPercent?100:undefined,minInterval:1,splitNumber:3,splitLine:{lineStyle:{color:border,type:"dashed",opacity:.65}},axisLine:{show:false},axisTick:{show:false},axisLabel:{color:muted,fontSize:12,formatter:isPercent?"{value}%":"{value}"}},
        series:[
          {name:"Текущий период",type:seriesType,smooth:false,showSymbol:isPercent,symbol:"circle",symbolSize:4,data:currentData,barMaxWidth:18,barGap:"25%",lineStyle:{width:2,color:accent},itemStyle:{color:accent,borderRadius:isPercent?undefined:[2,2,0,0]},emphasis:{focus:"series"},connectNulls:false},
          {name:"Предыдущий период",type:seriesType,smooth:false,showSymbol:isPercent,symbol:"circle",symbolSize:4,data:previousData,barMaxWidth:18,lineStyle:{width:1.6,color:muted,type:"dashed"},itemStyle:{color:muted,opacity:isPercent?1:.6,borderRadius:isPercent?undefined:[2,2,0,0]},emphasis:{focus:"series"},connectNulls:false},
        ],
      },true);
    };
    draw();
    const resize=()=>chart.resize();
    const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(node);
    const observer=new MutationObserver(draw);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    window.addEventListener("resize",resize);
    return()=>{window.removeEventListener("resize",resize);observer.disconnect();sizeObserver.disconnect();chart.dispose()};
  },[points,comparisonPoints,metric,unit,chartDescription]);

  return <section className="request-analytics-card request-trend-card">
    <div className="request-analytics-card-head">
      <div><h3>{variant==="inflow"?"Поступление заявок":"Коммерческий результат"}</h3><p>{metric==="conversion"?"Накопительная конверсия новых заявок периода. При отсутствии новых заявок — без значения.":metric==="new"?"Созданы в периоде. Столбцы сравнивают равные интервалы двух периодов.":"События в периоде, включая ранее созданные заявки. Первое КП — одна заявка независимо от числа версий."}</p></div>
      {variant==="outcomes"&&<div className="request-mini-segments" role="group" aria-label="Показатель коммерческого результата">
        {(["proposal","agreed","conversion"] as const).map(value=><button type="button" key={value} className={metric===value?"active":""} aria-pressed={metric===value} onClick={()=>setMetric(value)}>{metricLabels[value]}</button>)}
      </div>}
    </div>
    <div className="request-trend-summary">
      <div><span>Текущий период</span><strong>{formatMetric(metric,currentValue)}</strong></div>
      <div><span>Предыдущий период</span><strong>{formatMetric(metric,previousValue)}</strong></div>
      <div className={`request-trend-delta ${delta.tone}`}><span>Изменение</span><strong>{delta.text}</strong></div>
    </div>
    <div ref={ref} className="request-trend-chart" role="img" aria-label={chartDescription}/>
    <small className="request-trend-footnote">{metric==="conversion"?"Единица: % от новых заявок" : unit==="headcount"?"Единица: требуемые сотрудники":"Единица: заявки"} · {rows.length>14?"суммы по интервалам":"по дням"}{metric==="conversion"?"; конверсия — на конец интервала":""}</small>
  </section>;
}

export function requestTrendValue(metric:RequestTrendMetric,unit:RequestAnalyticsUnit,point:ChartPoint){
  if(metric==="new")return unit==="requests"?point.newRequests:point.newHeadcount;
  if(metric==="proposal")return unit==="requests"?point.proposalRequests:point.proposalHeadcount;
  if(metric==="agreed")return unit==="requests"?point.agreedRequests:point.agreedHeadcount;
  return unit==="requests"?point.conversionRequests:point.conversionHeadcount;
}
export function requestTrendTotal(metric:RequestTrendMetric,unit:RequestAnalyticsUnit,points:ChartPoint[]){
  if(!points.length)return metric==="conversion"?null:0;
  if(metric==="conversion")return requestTrendValue(metric,unit,points.at(-1)!);
  return points.reduce((sum,point)=>sum+(requestTrendValue(metric,unit,point)??0),0);
}
function metricDelta(metric:RequestTrendMetric,current:number|null,previous:number|null){
  if(current==null||previous==null)return {text:"—",tone:"neutral"};
  const diff=current-previous;
  if(diff===0)return {text:"без изменений",tone:"neutral"};
  if(metric==="conversion")return {text:`${diff>0?"+":""}${formatNumber(diff)} п.п.`,tone:diff>0?"good":"bad"};
  if(previous===0)return {text:current>0?"новое значение":"—",tone:"neutral"};
  const percent=diff/previous*100;
  return {text:`${percent>0?"+":""}${formatNumber(percent)}%`,tone:"neutral"};
}
function formatMetric(metric:RequestTrendMetric,value:number|null){return value==null?"—":metric==="conversion"?`${formatNumber(value)}%`:new Intl.NumberFormat("ru-RU").format(value)}
function formatNumber(value:number){return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
export function bucketRequestTrendRows(rows:RequestAnalyticsDaily[]):ChartPoint[]{
  if(!rows.length)return[];
  const size=rows.length<=14?1:rows.length<=45?3:rows.length<=120?7:14;
  const formatter=new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"});
  const fullFormatter=new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
  const result:ChartPoint[]=[];let cumulativeNewRequests=0,cumulativeNewHeadcount=0;
  for(let index=0;index<rows.length;index+=size){
    const bucket=rows.slice(index,index+size);
    const first=new Date(`${bucket[0].date}T00:00:00.000Z`),last=new Date(`${bucket[bucket.length-1].date}T00:00:00.000Z`);
    const label=bucket.length===1?formatter.format(first):`${formatter.format(first)}–${formatter.format(last)}`;
    const dateRange=bucket.length===1?fullFormatter.format(first):`${fullFormatter.format(first)} — ${fullFormatter.format(last)}`;
    const tail=bucket[bucket.length-1];
    const newRequests=bucket.reduce((sum,row)=>sum+row.newRequests,0),newHeadcount=bucket.reduce((sum,row)=>sum+row.newHeadcount,0);
    cumulativeNewRequests+=newRequests;cumulativeNewHeadcount+=newHeadcount;
    result.push({label,dateRange,newRequests,newHeadcount,
      proposalRequests:bucket.reduce((sum,row)=>sum+row.proposalRequests,0),proposalHeadcount:bucket.reduce((sum,row)=>sum+row.proposalHeadcount,0),
      agreedRequests:bucket.reduce((sum,row)=>sum+row.agreedRequests,0),agreedHeadcount:bucket.reduce((sum,row)=>sum+row.agreedHeadcount,0),
      conversionRequests:cumulativeNewRequests?tail.conversionRequests:null,conversionHeadcount:cumulativeNewHeadcount?tail.conversionHeadcount:null,
    });
  }
  return result;
}
