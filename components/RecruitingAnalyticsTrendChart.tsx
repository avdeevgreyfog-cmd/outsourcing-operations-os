"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { RecruitingAnalyticsDaily } from "@/lib/recruiting/analytics";

type Mode="candidates"|"conversion";
type ChartPoint={label:string;newCandidates:number;ready:number;started:number;readyConversion:number;startConversion:number};

export function RecruitingAnalyticsTrendChart({rows}:{rows:RecruitingAnalyticsDaily[]}){
  const ref=useRef<HTMLDivElement>(null);
  const [mode,setMode]=useState<Mode>("candidates");
  const points=useMemo(()=>bucketRows(rows),[rows]);

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
      const good=css.getPropertyValue("--good").trim();
      const panel=css.getPropertyValue("--panel").trim();

      const series=mode==="candidates"
        ?[
          {name:"Новые кандидаты",data:points.map(row=>row.newCandidates),color:accent,area:true},
          {name:"Вышли на работу",data:points.map(row=>row.started),color:good,area:false},
        ]
        :[
          {name:"Готовы / отклики",data:points.map(row=>row.readyConversion),color:accent,area:false},
          {name:"Вышли / отклики",data:points.map(row=>row.startConversion),color:good,area:false},
        ];

      chart.setOption({
        animationDuration:220,
        aria:{enabled:true,description:mode==="candidates"?"Динамика новых кандидатов и выходов":"Динамика конверсии в готовность и выход"},
        color:series.map(item=>item.color),
        grid:{left:10,right:16,top:42,bottom:10,containLabel:true},
        tooltip:{
          trigger:"axis",
          backgroundColor:panel,
          borderColor:border,
          borderWidth:1,
          padding:[8,10],
          textStyle:{color:text,fontSize:10},
          axisPointer:{type:"line",lineStyle:{color:border,width:1}},
          valueFormatter:(value:unknown)=>mode==="conversion"?`${value}%`:String(value),
        },
        legend:{top:5,left:4,itemWidth:14,itemHeight:7,itemGap:14,textStyle:{color:muted,fontSize:9.5},data:series.map(item=>item.name)},
        xAxis:{
          type:"category",
          boundaryGap:false,
          data:points.map(row=>row.label),
          axisLine:{lineStyle:{color:border}},
          axisTick:{show:false},
          axisLabel:{color:muted,fontSize:9,interval:Math.max(0,Math.ceil(points.length/6)-1),hideOverlap:true},
        },
        yAxis:{
          type:"value",
          min:0,
          max:mode==="conversion"?100:undefined,
          minInterval:mode==="candidates"?1:undefined,
          splitNumber:4,
          splitLine:{lineStyle:{color:border,type:"dashed",opacity:.65}},
          axisLine:{show:false},
          axisTick:{show:false},
          axisLabel:{color:muted,fontSize:9,formatter:mode==="conversion"?"{value}%":"{value}"},
        },
        series:series.map(item=>({
          name:item.name,
          type:"line",
          smooth:.3,
          showSymbol:false,
          symbol:"circle",
          symbolSize:6,
          data:item.data,
          lineStyle:{width:item.name==="Новые кандидаты"?2.2:2,color:item.color},
          itemStyle:{color:item.color},
          areaStyle:item.area?{color:item.color,opacity:.07}:undefined,
          emphasis:{focus:"series",scale:true},
        })),
      },true);
    };
    draw();
    const resize=()=>chart.resize();
    const observer=new MutationObserver(draw);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    window.addEventListener("resize",resize);
    return()=>{window.removeEventListener("resize",resize);observer.disconnect();chart.dispose()};
  },[points,mode]);

  return <div className="needs-trend-card">
    <div className="needs-analytics-card-head">
      <div><h3>Динамика воронки</h3><p>{points.length<rows.length?"Данные сгруппированы, чтобы показать тренд без дневного шума.":"Динамика по дням выбранного периода."}</p></div>
      <div className="needs-mini-segments" role="group" aria-label="Режим графика">
        <button type="button" className={mode==="candidates"?"active":""} onClick={()=>setMode("candidates")}>Кандидаты</button>
        <button type="button" className={mode==="conversion"?"active":""} onClick={()=>setMode("conversion")}>Конверсия</button>
      </div>
    </div>
    <div ref={ref} className="needs-trend-chart"/>
  </div>;
}

function bucketRows(rows:RecruitingAnalyticsDaily[]):ChartPoint[]{
  if(!rows.length)return[];
  const size=rows.length<=14?1:rows.length<=45?3:rows.length<=120?7:14;
  const formatter=new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"});
  const result:ChartPoint[]=[];
  for(let index=0;index<rows.length;index+=size){
    const bucket=rows.slice(index,index+size);
    const newCandidates=bucket.reduce((sum,row)=>sum+row.newCandidates,0);
    const ready=bucket.reduce((sum,row)=>sum+row.ready,0);
    const started=bucket.reduce((sum,row)=>sum+row.started,0);
    const first=new Date(`${bucket[0].date}T00:00:00.000Z`);
    const last=new Date(`${bucket[bucket.length-1].date}T00:00:00.000Z`);
    const label=bucket.length===1?formatter.format(first):`${formatter.format(first)}–${formatter.format(last)}`;
    result.push({
      label,newCandidates,ready,started,
      readyConversion:newCandidates?Math.round(ready/newCandidates*100):0,
      startConversion:newCandidates?Math.round(started/newCandidates*100):0,
    });
  }
  return result;
}
