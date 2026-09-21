"use client";

import { useMemo, useState } from "react";
import { Flag, GitBranch, X } from "lucide-react";
import { KeyValue, Metric, Status } from "@/components/UI";
import type { LaunchTaskRow } from "@/lib/data/service";

const taskStatusLabels:Record<string,string>={planned:"Запланировано",in_progress:"В работе",blocked:"Заблокировано",done:"Завершено",cancelled:"Отменено"};
const riskLabels:Record<string,string>={normal:"Норма",watch:"Контроль",high:"Высокий",critical:"Критический"};
const DAY=86_400_000;

function parseDate(value?:string|null){
  if(!value)return null;
  const date=new Date(value+"T00:00:00Z");
  return Number.isNaN(date.getTime())?null:date;
}
function label(date:Date){
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(date);
}

export function LaunchGantt({ rows }: { rows: LaunchTaskRow[] }) {
  const [selected,setSelected]=useState<LaunchTaskRow|null>(null);
  const critical=rows.filter(row=>row.critical&&row.status!=="done").length;
  const milestones=rows.filter(row=>row.milestone).length;
  const progress=rows.length?Math.round(rows.reduce((sum,row)=>sum+Number(row.progress||0),0)/rows.length):0;
  const baselineChanges=rows.filter(row=>row.baselineStartDate&&row.baselineEndDate&&(row.baselineStartDate!==row.startDate||row.baselineEndDate!==row.endDate)).length;

  const timeline=useMemo(()=>{
    const starts=rows.map(row=>parseDate(row.startDate)).filter((value):value is Date=>Boolean(value));
    const ends=rows.map(row=>parseDate(row.endDate)).filter((value):value is Date=>Boolean(value));
    const start=starts.length?new Date(Math.min(...starts.map(value=>value.getTime()))):new Date();
    const end=ends.length?new Date(Math.max(...ends.map(value=>value.getTime()))):new Date(start.getTime()+19*DAY);
    if(end.getTime()<=start.getTime())end.setUTCDate(start.getUTCDate()+19);
    const span=Math.max(1,(end.getTime()-start.getTime())/DAY);
    const ticks=Array.from({length:20},(_,index)=>new Date(start.getTime()+span*DAY*index/19));
    return {start,end,span,ticks};
  },[rows]);

  const pos=(value?:string|null)=>{
    const date=parseDate(value);if(!date)return 0;
    return Math.max(0,Math.min(100,(date.getTime()-timeline.start.getTime())/(timeline.span*DAY)*100));
  };
  const width=(start?:string|null,end?:string|null)=>Math.max(1,pos(end)-pos(start)+100/timeline.span);

  return <>
    <div className="gantt-summary">
      <Metric label="Задачи" value={rows.length} note="в текущем плане"/>
      <Metric label="Общий прогресс" value={progress+"%"}/>
      <Metric label="Критические блокеры" value={critical} tone={critical?"bad":"good"}/>
      <Metric label="Контрольные точки" value={milestones}/>
      <Metric label="Отклонения от baseline" value={baselineChanges} tone={baselineChanges?"warn":undefined}/>
    </div>
    <section className="section gantt">
      <div className="gantt-head"><div>Структура работ / задача</div><div className="gantt-dates">{timeline.ticks.map((value,index)=><span key={index}>{index%3===0||index===19?label(value):""}</span>)}</div></div>
      {rows.map(task=><div className={"gantt-row "+(task.critical?"critical-row":"")} key={task.id}>
        <button type="button" className="gantt-task-name" style={{paddingLeft:14+task.level*18}} onClick={()=>setSelected(task)}>
          {task.milestone?<Flag size={13}/>:task.dependencyIds.length?<GitBranch size={13}/>:<span/>}
          <span><strong>{task.title}</strong><small>{task.owner} · {task.progress}%</small></span>
        </button>
        <div className="gantt-timeline">{timeline.ticks.map((_,index)=><i key={index}/>)}
          {task.baselineStartDate&&task.baselineEndDate&&!task.milestone&&<span className="gantt-baseline" style={{left:pos(task.baselineStartDate)+"%",width:width(task.baselineStartDate,task.baselineEndDate)+"%"}}/>}
          {task.milestone
            ?<button type="button" className="gantt-milestone" style={{left:pos(task.startDate)+"%"}} onClick={()=>setSelected(task)} aria-label={task.title}/>
            :<button type="button" className={"gantt-bar "+(task.critical?"critical":"")} style={{left:pos(task.startDate)+"%",width:width(task.startDate,task.endDate)+"%"}} onClick={()=>setSelected(task)}><span style={{width:task.progress+"%"}}/><em>{task.progress}%</em></button>}
          {new Date()>=timeline.start&&new Date()<=timeline.end&&<b className="today-line" style={{left:pos(new Date().toISOString().slice(0,10))+"%"}}/>}
        </div>
      </div>)}
      {!rows.length&&<div className="empty-inline">В выбранном плане пока нет задач</div>}
      <div className="gantt-legend"><span><i className="baseline"/> Исходный план</span><span><i className="normal"/> Текущий план</span><span><i className="critical"/> Критический путь</span><span><i className="today"/> Сегодня</span></div>
    </section>
    {selected&&<><div className="drawer-backdrop" onClick={()=>setSelected(null)}/><aside className="drawer"><button className="icon-button drawer-close" onClick={()=>setSelected(null)} aria-label="Закрыть"><X size={17}/></button><div className="eyebrow">Задача запуска · {selected.object}</div><h2>{selected.title}</h2><Status tone={selected.risk==="high"||selected.risk==="critical"?"warn":selected.status==="done"?"good":"info"}>{taskStatusLabels[selected.status]??"В работе"}</Status><div className="drawer-content"><KeyValue label="Ответственный" value={selected.owner}/><KeyValue label="Текущий план" value={selected.start+"–"+selected.end}/><KeyValue label="Исходный план" value={(selected.baselineStart??"—")+"–"+(selected.baselineEnd??"—")}/><KeyValue label="Прогресс" value={selected.progress+"%"}/><KeyValue label="Риск" value={riskLabels[selected.risk]??"Контроль"}/><KeyValue label="Критический путь" value={selected.critical?"Да":"Нет"}/><KeyValue label="Зависимости" value={selected.dependencyIds.length||"Нет"}/></div></aside></>}
  </>;
}
