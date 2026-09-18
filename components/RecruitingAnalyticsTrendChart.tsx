"use client";

import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts";
import type { RecruitingAnalyticsDaily } from "@/lib/recruiting/analytics";

type Mode="candidates"|"conversion";

export function RecruitingAnalyticsTrendChart({rows}:{rows:RecruitingAnalyticsDaily[]}){
  const ref=useRef<HTMLDivElement>(null);
  const [mode,setMode]=useState<Mode>("candidates");

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
      const info=css.getPropertyValue("--info").trim()||accent;
      const panel=css.getPropertyValue("--panel").trim();
      const panel2=css.getPropertyValue("--panel-2").trim();

      const candidateSeries=[
        {name:"Новые кандидаты",data:rows.map(row=>row.newCandidates),color:accent},
        {name:"Готовы к выходу",data:rows.map(row=>row.ready),color:info},
        {name:"Вышли на работу",data:rows.map(row=>row.started),color:good},
      ];
      const conversionSeries=[
        {name:"Готовы / отклики",data:rows.map(row=>row.readyConversion),color:info},
        {name:"Вышли / отклики",data:rows.map(row=>row.startConversion),color:good},
      ];
      const series=mode==="candidates"?candidateSeries:conversionSeries;

      chart.setOption({
        animationDuration:240,
        aria:{enabled:true,description:mode==="candidates"?"Динамика кандидатов по датам":"Динамика конверсии по датам"},
        color:series.map(item=>item.color),
        grid:{left:14,right:18,top:44,bottom:12,containLabel:true},
        tooltip:{
          trigger:"axis",
          backgroundColor:panel,
          borderColor:border,
          borderWidth:1,
          textStyle:{color:text,fontSize:11},
          axisPointer:{type:"line",lineStyle:{color:border}},
        },
        legend:{top:5,left:4,itemWidth:13,itemHeight:7,textStyle:{color:muted,fontSize:10},data:series.map(item=>item.name)},
        xAxis:{type:"category",boundaryGap:false,data:rows.map(row=>row.label),axisLine:{lineStyle:{color:border}},axisTick:{show:false},axisLabel:{color:muted,fontSize:9,interval:"auto"}},
        yAxis:{
          type:"value",
          min:0,
          max:mode==="conversion"?100:undefined,
          splitLine:{lineStyle:{color:border}},
          axisLabel:{color:muted,fontSize:9,formatter:mode==="conversion"?"{value}%":"{value}"},
        },
        series:series.map(item=>({
          name:item.name,
          type:"line",
          smooth:.22,
          showSymbol:false,
          symbolSize:5,
          data:item.data,
          lineStyle:{width:2,color:item.color},
          itemStyle:{color:item.color},
          areaStyle:mode==="candidates"?{color:panel2,opacity:.18}:undefined,
          emphasis:{focus:"series"},
        })),
      },true);
    };
    draw();
    const resize=()=>chart.resize();
    const observer=new MutationObserver(draw);
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["data-theme"]});
    window.addEventListener("resize",resize);
    return()=>{window.removeEventListener("resize",resize);observer.disconnect();chart.dispose()};
  },[rows,mode]);

  return <div className="needs-trend-card">
    <div className="needs-analytics-card-head">
      <div><h3>Динамика воронки</h3><p>Когорты кандидатов по дате попадания в подбор.</p></div>
      <div className="needs-mini-segments" role="group" aria-label="Режим графика">
        <button type="button" className={mode==="candidates"?"active":""} onClick={()=>setMode("candidates")}>По кандидатам</button>
        <button type="button" className={mode==="conversion"?"active":""} onClick={()=>setMode("conversion")}>По конверсии</button>
      </div>
    </div>
    <div ref={ref} className="needs-trend-chart"/>
  </div>;
}
