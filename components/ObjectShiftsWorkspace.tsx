"use client";

import Link from "next/link";
import { useMemo,useState } from "react";
import type { ShiftRow,WorkerRow } from "@/lib/data/service";
import { workerTodayStatus } from "@/lib/operations/workforce-status";
import { Status } from "@/components/UI";

const laneOrder=["day","night","mixed"] as const;
const laneLabels:Record<string,string>={day:"Дневная смена",night:"Ночная смена",mixed:"Смешанная смена",День:"Дневная смена",Ночь:"Ночная смена"};

export function ObjectShiftsWorkspace({objectId,rows,workers,today}:{objectId:string;rows:ShiftRow[];workers:WorkerRow[];today:string}){
  const dates=useMemo(()=>[...new Set(rows.map(row=>row.dateIso).filter((value):value is string=>Boolean(value)))].sort(),[rows]);
  const initial=dates.includes(today)?today:(dates.find(value=>value>=today)??dates.at(-1)??today);
  const [date,setDate]=useState(initial);
  const selected=rows.filter(row=>row.dateIso===date);
  const workerById=useMemo(()=>new Map(workers.map(row=>[row.id,row])),[workers]);
  const assignedIds=[...new Set(selected.flatMap(row=>row.workerIds))];
  const factWorkers=date===today?assignedIds.map(id=>workerById.get(id)).filter((row):row is WorkerRow=>Boolean(row)):[];
  const onShift=date===today?factWorkers.filter(row=>workerTodayStatus(row,today).key==="on_shift").length:0;
  const noShows=date===today?factWorkers.filter(row=>workerTodayStatus(row,today).key==="no_show").length:0;
  const demand=selected.reduce((sum,row)=>sum+row.demand,0);
  const assigned=selected.reduce((sum,row)=>sum+row.assigned,0);
  const confirmed=selected.reduce((sum,row)=>sum+Number(row.confirmed??0),0);
  const reserve=selected.reduce((sum,row)=>sum+row.reserve,0);
  const deficit=selected.reduce((sum,row)=>sum+row.deficit,0);
  const groups=laneOrder.map(kind=>({kind,rows:selected.filter(row=>normalizeKind(row.kind)===kind)})).filter(group=>group.rows.length);

  return <>
    <div className="object-shift-daybar">
      <div><strong>{date===today?"Сегодня":formatDate(date)}</strong><span>{date===today?formatDate(date):"Оперативный план смен"}</span></div>
      {dates.length>1&&<select value={date} onChange={e=>setDate(e.target.value)}>{dates.map(value=><option key={value} value={value}>{value===today?`Сегодня · ${shortDate(value)}`:formatDate(value)}</option>)}</select>}
    </div>
    <div className="object-shift-summary">
      <ShiftMetric label="План" value={demand}/><ShiftMetric label="Назначено" value={assigned}/><ShiftMetric label="Подтверждено" value={confirmed}/><ShiftMetric label={date===today?"Вышли":"Резерв"} value={date===today?onShift:reserve}/><ShiftMetric label={date===today?"Невыходы":"Дефицит"} value={date===today?noShows:deficit} tone={(date===today?noShows:deficit)>0?"bad":undefined}/>
    </div>
    {selected.length?<div className="object-shift-lanes">{groups.map(group=><section className={`object-shift-lane is-${group.kind}`} key={group.kind}><div className="object-shift-lane-head"><div><strong>{laneLabels[group.kind]}</strong><span>{timeRange(group.rows)}</span></div><div><span>План {group.rows.reduce((sum,row)=>sum+row.demand,0)}</span><span>Назначено {group.rows.reduce((sum,row)=>sum+row.assigned,0)}</span></div></div><div className="object-shift-list">{group.rows.map(row=><ShiftRowView key={row.id} row={row} workers={workers} today={today} selectedDate={date}/>)}</div></section>)}</div>:<div className="object-shift-empty"><strong>На эту дату смены не сформированы</strong><span>Создайте план смен или выберите другую дату.</span></div>}
    <div className="section-actions"><Link className="button" href={`/objects/${objectId}?tab=timesheets`}>Табель объекта</Link><Link className="button primary" href={`/shifts?object=${objectId}`}>Открыть полный график</Link></div>
  </>;
}

function ShiftRowView({row,workers,today,selectedDate}:{row:ShiftRow;workers:WorkerRow[];today:string;selectedDate:string}){
  const assigned=workers.filter(worker=>row.workerIds.includes(worker.id));
  const reserve=workers.filter(worker=>row.reserveWorkerIds.includes(worker.id));
  const onShift=selectedDate===today?assigned.filter(worker=>workerTodayStatus(worker,today).key==="on_shift").length:null;
  const noShows=selectedDate===today?assigned.filter(worker=>workerTodayStatus(worker,today).key==="no_show").length:null;
  return <details className="object-shift-card"><summary><div><strong>{row.specialty}</strong><span>{row.time}</span></div><div className="object-shift-numbers"><span>План <b>{row.demand}</b></span><span>Назначено <b>{row.assigned}</b></span><span>Подтверждено <b>{row.confirmed??0}</b></span>{selectedDate===today&&<span>Вышли <b>{onShift}</b></span>}<span>Резерв <b>{row.reserve}</b></span><Status tone={row.deficit?"warn":"good"}>{row.deficit?`−${row.deficit}`:"План закрыт"}</Status></div></summary><div className="object-shift-people">{assigned.map(worker=>{const day=selectedDate===today?workerTodayStatus(worker,today):null;return <div key={worker.id}><Link href={`/workers/${worker.id}`}>{worker.fullName}</Link><span>{worker.phone??"Телефон не указан"}</span><strong className={day?.key==="no_show"?"priority-critical":""}>{day?.label??"Назначен"}</strong></div>})}{reserve.map(worker=><div key={`reserve-${worker.id}`}><Link href={`/workers/${worker.id}`}>{worker.fullName}</Link><span>{worker.phone??"Телефон не указан"}</span><strong>Резерв</strong></div>)}{!assigned.length&&!reserve.length&&<div className="empty-inline">Сотрудники на смену ещё не назначены</div>}{selectedDate===today&&Boolean(noShows)&&<small className="priority-critical">Невыходы: {noShows}</small>}</div></details>;
}

function ShiftMetric({label,value,tone}:{label:string;value:number;tone?:"bad"}){return <div className={tone?"is-alert":""}><span>{label}</span><strong>{value}</strong></div>}
function normalizeKind(value:string):"day"|"night"|"mixed"{if(value==="day"||value==="День")return"day";if(value==="night"||value==="Ночь")return"night";return"mixed"}
function timeRange(rows:ShiftRow[]){return [...new Set(rows.map(row=>row.time))].join(" · ")}
function formatDate(value:string){return new Intl.DateTimeFormat("ru-RU",{weekday:"short",day:"2-digit",month:"long",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function shortDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}