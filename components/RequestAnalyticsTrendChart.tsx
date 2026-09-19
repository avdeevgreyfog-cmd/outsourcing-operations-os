"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { RequestAnalyticsDaily } from "@/lib/commercial/request-analytics";

export type RequestAnalyticsUnit="requests"|"headcount";
type Metric="new"|"proposal"|"agreed"|"conversion";
type ChartPoint={label:string;newRequests:number;newHeadcount:number;proposalRequests:number;proposalHeadcount:number;agreedRequests:number;agreedHeadcount:number;conversionRequests:number;conversionHeadcount:number};

const metricLabels:Record<Metric,string>={new:"Новые",proposal:"КП отправлено",agreed:"Согласовано",conversion:"Конверсия"};

export function RequestAnalyticsTrendChart({rows,comparisonRows,unit}:{rows:RequestAnalyticsDaily[];comparisonRows:RequestAnalyticsDaily[];unit:RequestAnalyticsUnit}){
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
      const isPercent=metric==="conversion";
      const currentData=points.map(point=>pointValue(metric,unit,point));
      const previousData=points.map((_,index)=>comparisonPoints[index]?pointValue(metric,unit,comparisonPoints[index]):null);
      chart.setOption({
        animationDuration:220,
        aria:{enabled:true,description:`Динамика показателя «${metricLabels[metric]}» по текущему и предыдущему периоду`},
        grid:{left:10,right:14,top:34,bottom:10,containLabel:true},
        tooltip:{trigger:"axis",backgroundColor:panel,borderColor:border,borderWidth:1,padding:[8,10],textStyle:{color:text,fontSize:10},axisPointer:{type:"line",lineStyle:{color:border,width:1}},valueFormatter:(value:unknown)=>isPercent?`${value}%`:String(value)},
        legend:{top:2,left:4,itemWidth:16,itemHeight:7,itemGap:16,textStyle:{color:muted,fontSize:9.5},data:["Текущий период","Предыдущий период"]},
        xAxis:{type:"category",boundaryGap:false,data:points.map(point=>point.label),axisLine:{lineStyle:{color:border}},axisTick:{show:false},axisLabel:{color:muted,fontSize:9,interval:Math.max(0,Math.ceil(points.length/7)-1),hideOverlap:true}},
        yAxis:{type:"value",min:0,max:isPercent?100:undefined,minInterval:isPercent?undefined:1,splitNumber:4,splitLine:{lineStyle:{color:border,type:"dashed",opacity:.55}},axisLine:{show:false},axisTick:{show:false},axisLabel:{color:muted,fontSize:9,formatter:isPercent?"{value}%":"{value}"}},
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

  return <section className="request-analytics-card request-trend-card">
    <div className="request-analytics-card-head">
      <div><h3>Динамика коммерческой воронки</h3><p>Текущий период против предыдущего равного периода.</p></div>
      <div className="request-mini-segments" role="group" aria-label="Показатель графика">
        {(Object.keys(metricLabels) as Metric[]).map(value=><button type="button" key={value} className={metric===value?"active":""} onClick={()=>setMetric(value)}>{metricLabels[value]}</button>)}
      </div>
    </div>
    <div className="request-trend-summary">
      <div><span>{metricLabels[metric]} · текущий</span><strong>{formatMetric(metric,currentValue)}</strong></div>
      <div><span>Предыдущий период</span><strong>{formatMetric(metric,previousValue)}</strong></div>
      <div className={`request-trend-delta ${delta.tone}`}><span>Изменение</span><strong>{delta.text}</strong></div>
    </div>
    <div ref={ref} className="request-trend-chart"/>
  </section>;
}

function pointValue(metric:Metric,unit:RequestAnalyticsUnit,point:ChartPoint){
  if(metric==="new")return unit==="requests"?point.newRequests:point.newHeadcount;
  if(metric==="proposal")return unit==="requests"?point.proposalRequests:point.proposalHeadcount;
  if(metric==="agreed")return unit==="requests"?point.agreedRequests:point.agreedHeadcount;
  return unit==="requests"?point.conversionRequests:point.conversionHeadcount;
}
function metricValue(metric:Metric,unit:RequestAnalyticsUnit,points:ChartPoint[]){
  if(!points.length)return 0;
  if(metric==="conversion")return pointValue(metric,unit,points.at(-1)!);
  return points.reduce((sum,point)=>sum+pointValue(metric,unit,point),0);
}
function metricDelta(metric:Metric,current:number,previous:number){
  const diff=current-previous;
  if(diff===0)return {text:"без изменений",tone:"neutral"};
  if(metric==="conversion")return {text:`${diff>0?"+":""}${formatNumber(diff)} п.п.`,tone:diff>0?"good":"bad"};
  if(previous===0)return {text:current>0?"новое значение":"—",tone:"neutral"};
  const percent=diff/previous*100;
  return {text:`${percent>0?"+":""}${formatNumber(percent)}%`,tone:"neutral"};
}
function formatMetric(metric:Metric,value:number){return metric==="conversion"?`${formatNumber(value)}%`:new Intl.NumberFormat("ru-RU").format(value)}
function formatNumber(value:number){return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
function bucketRows(rows:RequestAnalyticsDaily[]):ChartPoint[]{
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
      newRequests:bucket.reduce((sum,row)=>sum+row.newRequests,0),
      newHeadcount:bucket.reduce((sum,row)=>sum+row.newHeadcount,0),
      proposalRequests:bucket.reduce((sum,row)=>sum+row.proposalRequests,0),
      proposalHeadcount:bucket.reduce((sum,row)=>sum+row.proposalHeadcount,0),
      agreedRequests:bucket.reduce((sum,row)=>sum+row.agreedRequests,0),
      agreedHeadcount:bucket.reduce((sum,row)=>sum+row.agreedHeadcount,0),
      conversionRequests:tail.conversionRequests,
      conversionHeadcount:tail.conversionHeadcount,
    });
  }
  return result;
}
