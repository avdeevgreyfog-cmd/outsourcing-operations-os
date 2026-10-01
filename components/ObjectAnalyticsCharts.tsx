"use client";

import { useEffect, useMemo, useRef } from "react";
import * as echarts from "echarts";
import type { ObjectAnalyticsDailyPoint, ObjectAnalyticsMovementPoint } from "@/lib/operations/object-analytics";

type ThemeColors={
  text:string;muted:string;soft:string;border:string;accent:string;good:string;warn:string;bad:string;panel:string;panel2:string;
};
type FinancePoint={id:string;periodEnd?:string|null;marginPct:number|string;planMarginPct?:number|string|null};

function themeColors():ThemeColors{
  const css=getComputedStyle(document.documentElement);
  const read=(name:string,fallback="")=>css.getPropertyValue(name).trim()||fallback;
  return {
    text:read("--text","#202124"),muted:read("--muted","#6b7280"),soft:read("--soft","#9ca3af"),border:read("--border","#e5e7eb"),
    accent:read("--accent","#e8611a"),good:read("--good","#17824f"),warn:read("--warn","#a85d00"),bad:read("--bad","#b83a3a"),
    panel:read("--panel","#fff"),panel2:read("--panel-2","#f7f7f6"),
  };
}
function shortDate(value:string){
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"));
}
function number(value:unknown){return Number(value??0)||0}
function useChart(draw:(chart:echarts.ECharts,colors:ThemeColors)=>void,deps:unknown[]){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    if(!ref.current)return;
    const node=ref.current;
    const chart=echarts.init(node,undefined,{renderer:"canvas"});
    const render=()=>draw(chart,themeColors());
    render();
    const resize=()=>chart.resize();
    const observer=new MutationObserver(render);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    window.addEventListener("resize",resize);
    return()=>{window.removeEventListener("resize",resize);observer.disconnect();chart.dispose()};
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },deps);
  return ref;
}
function commonTooltip(colors:ThemeColors){
  return {trigger:"axis" as const,backgroundColor:colors.panel,borderColor:colors.border,borderWidth:1,padding:[8,10],textStyle:{color:colors.text,fontSize:10},axisPointer:{type:"line" as const,lineStyle:{color:colors.border,width:1}}};
}
function commonXAxis(labels:string[],colors:ThemeColors){
  return {type:"category" as const,boundaryGap:false,data:labels,axisLine:{lineStyle:{color:colors.border}},axisTick:{show:false},axisLabel:{color:colors.muted,fontSize:9,hideOverlap:true,interval:"auto" as const}};
}
function commonYAxis(colors:ThemeColors){
  return {type:"value" as const,min:0,minInterval:1,splitNumber:4,splitLine:{lineStyle:{color:colors.border,type:"dashed" as const,opacity:.55}},axisLine:{show:false},axisTick:{show:false},axisLabel:{color:colors.muted,fontSize:9}};
}

export function ObjectAnalyticsTrendChart({rows,mode}:{rows:ObjectAnalyticsDailyPoint[];mode:"staffing"|"attendance"|"incidents"}){
  const labels=useMemo(()=>rows.map(row=>shortDate(row.date)),[rows]);
  const ref=useChart((chart,colors)=>{
    const staffing=mode==="staffing",attendance=mode==="attendance";
    const series=staffing?[
      {name:"План",type:"line" as const,smooth:.22,showSymbol:false,data:rows.map(row=>row.planned),lineStyle:{width:1.6,color:colors.soft,type:"dashed" as const},itemStyle:{color:colors.soft}},
      {name:"Работает",type:"line" as const,smooth:.22,showSymbol:false,data:rows.map(row=>row.working),lineStyle:{width:2.2,color:colors.accent},itemStyle:{color:colors.accent},areaStyle:{color:colors.accent,opacity:.045}},
    ]:attendance?[
      {name:"Требовалось",type:"line" as const,smooth:.22,showSymbol:false,data:rows.map(row=>row.shiftDemand),lineStyle:{width:1.6,color:colors.soft,type:"dashed" as const},itemStyle:{color:colors.soft}},
      {name:"Вышло",type:"line" as const,smooth:.22,showSymbol:false,data:rows.map(row=>row.worked),lineStyle:{width:2.2,color:colors.accent},itemStyle:{color:colors.accent},areaStyle:{color:colors.accent,opacity:.045}},
      {name:"Невыходы",type:"bar" as const,data:rows.map(row=>row.noShows),barMaxWidth:12,itemStyle:{color:colors.bad,borderRadius:[2,2,0,0] as [number,number,number,number]}},
    ]:[
      {name:"Инциденты",type:"line" as const,smooth:.22,showSymbol:false,data:rows.map(row=>row.incidents),lineStyle:{width:2.2,color:colors.accent},itemStyle:{color:colors.accent},areaStyle:{color:colors.accent,opacity:.05}},
    ];
    chart.setOption({
      animationDuration:220,
      aria:{enabled:true,description:staffing?"Динамика плановой и фактической численности":attendance?"Потребность смен, фактические выходы и невыходы":"Динамика инцидентов"},
      grid:{left:10,right:14,top:38,bottom:10,containLabel:true},
      tooltip:commonTooltip(colors),
      legend:{top:2,left:4,itemWidth:16,itemHeight:7,itemGap:16,textStyle:{color:colors.muted,fontSize:9.5},data:series.map(item=>item.name)},
      xAxis:commonXAxis(labels,colors),yAxis:commonYAxis(colors),series,
    },true);
  },[rows,mode,labels]);
  return <div ref={ref} className="object-analytics-echart"/>;
}

export function ObjectAnalyticsMovementChart({rows}:{rows:ObjectAnalyticsMovementPoint[]}){
  const ref=useChart((chart,colors)=>{
    chart.setOption({
      animationDuration:220,aria:{enabled:true,description:"Принятые и выбывшие сотрудники по неделям"},
      grid:{left:10,right:14,top:38,bottom:10,containLabel:true},tooltip:commonTooltip(colors),
      legend:{top:2,left:4,itemWidth:16,itemHeight:7,itemGap:16,textStyle:{color:colors.muted,fontSize:9.5},data:["Принято","Выбыло"]},
      xAxis:{...commonXAxis(rows.map(row=>shortDate(row.periodStart)),colors),boundaryGap:true},
      yAxis:commonYAxis(colors),
      series:[
        {name:"Принято",type:"bar",data:rows.map(row=>row.started),barMaxWidth:24,itemStyle:{color:colors.accent,borderRadius:[3,3,0,0]}},
        {name:"Выбыло",type:"bar",data:rows.map(row=>row.ended),barMaxWidth:24,itemStyle:{color:colors.soft,borderRadius:[3,3,0,0]}},
      ],
    },true);
  },[rows]);
  return <div ref={ref} className="object-analytics-echart"/>;
}

export function ObjectAnalyticsHoursChart({rows}:{rows:Array<{label:string;hours:number;worked:number;noShows:number}>}){
  const ref=useChart((chart,colors)=>{
    chart.setOption({
      animationDuration:220,aria:{enabled:true,description:"Фактические часы по неделям"},
      grid:{left:10,right:14,top:22,bottom:10,containLabel:true},
      tooltip:{...commonTooltip(colors),valueFormatter:(value:unknown)=>new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(number(value))+" ч"},
      xAxis:{...commonXAxis(rows.map(row=>row.label),colors),boundaryGap:true},
      yAxis:{...commonYAxis(colors),minInterval:undefined,axisLabel:{color:colors.muted,fontSize:9,formatter:(value:number)=>new Intl.NumberFormat("ru-RU",{notation:"compact",maximumFractionDigits:1}).format(value)}},
      series:[{name:"Часы",type:"bar",data:rows.map(row=>row.hours),barMaxWidth:34,itemStyle:{color:colors.accent,borderRadius:[3,3,0,0]}}],
    },true);
  },[rows]);
  return <div ref={ref} className="object-analytics-echart"/>;
}

export function ObjectAnalyticsCategoryChart({rows}:{rows:Array<{label:string;value:number}>}){
  const ordered=useMemo(()=>[...rows].sort((a,b)=>a.value-b.value),[rows]);
  const ref=useChart((chart,colors)=>{
    chart.setOption({
      animationDuration:220,aria:{enabled:true,description:"Структура инцидентов по категориям"},
      grid:{left:8,right:24,top:12,bottom:12,containLabel:true},
      tooltip:{trigger:"axis",axisPointer:{type:"shadow"},backgroundColor:colors.panel,borderColor:colors.border,borderWidth:1,textStyle:{color:colors.text,fontSize:10}},
      xAxis:{type:"value",min:0,minInterval:1,splitNumber:4,splitLine:{lineStyle:{color:colors.border,type:"dashed",opacity:.55}},axisLabel:{color:colors.muted,fontSize:9}},
      yAxis:{type:"category",data:ordered.map(row=>row.label),axisLine:{show:false},axisTick:{show:false},axisLabel:{color:colors.muted,fontSize:9.5,width:130,overflow:"truncate"}},
      series:[{name:"Инциденты",type:"bar",data:ordered.map(row=>row.value),barMaxWidth:18,itemStyle:{color:colors.accent,borderRadius:[0,3,3,0]},label:{show:true,position:"right",color:colors.text,fontSize:9}}],
    },true);
  },[ordered]);
  return <div ref={ref} className="object-analytics-echart"/>;
}

export function ObjectAnalyticsMarginChart({rows}:{rows:FinancePoint[]}){
  const ordered=useMemo(()=>[...rows].reverse(),[rows]);
  const ref=useChart((chart,colors)=>{
    const hasPlan=ordered.some(row=>row.planMarginPct!=null);
    chart.setOption({
      animationDuration:220,aria:{enabled:true,description:"Фактическая и плановая маржа объекта"},
      grid:{left:10,right:14,top:38,bottom:10,containLabel:true},tooltip:{...commonTooltip(colors),valueFormatter:(value:unknown)=>number(value).toLocaleString("ru-RU",{maximumFractionDigits:1})+"%"},
      legend:hasPlan?{top:2,left:4,itemWidth:16,itemHeight:7,itemGap:16,textStyle:{color:colors.muted,fontSize:9.5},data:["Факт","План"]}:undefined,
      xAxis:commonXAxis(ordered.map(row=>row.periodEnd?shortDate(row.periodEnd):"Период"),colors),
      yAxis:{...commonYAxis(colors),minInterval:undefined,axisLabel:{color:colors.muted,fontSize:9,formatter:"{value}%"}},
      series:[
        {name:"Факт",type:"line",smooth:.2,showSymbol:true,symbolSize:5,data:ordered.map(row=>number(row.marginPct)),lineStyle:{width:2.2,color:colors.accent},itemStyle:{color:colors.accent},areaStyle:{color:colors.accent,opacity:.04}},
        ...(hasPlan?[{name:"План",type:"line" as const,smooth:.2,showSymbol:false,data:ordered.map(row=>row.planMarginPct==null?null:number(row.planMarginPct)),lineStyle:{width:1.5,color:colors.soft,type:"dashed" as const},itemStyle:{color:colors.soft},connectNulls:false}]:[]),
      ],
    },true);
  },[ordered]);
  return <div ref={ref} className="object-analytics-echart"/>;
}
