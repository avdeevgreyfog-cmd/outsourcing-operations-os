"use client";

import Link from "next/link";
import { useMemo,useState } from "react";
import type { WorkerRow } from "@/lib/data/service";
import { workerObjectState,workerTodayStatus } from "@/lib/operations/workforce-status";
import { Status } from "@/components/UI";
import { employmentTypeLabel } from "@/lib/ui/labels";
import { rub } from "@/lib/ui/format";

type View="grouped"|"list";

export function ObjectWorkforceWorkspace({workers,today}:{workers:WorkerRow[];today:string}){
  const [query,setQuery]=useState("");
  const [specialty,setSpecialty]=useState("");
  const [workMode,setWorkMode]=useState("");
  const [state,setState]=useState("");
  const [todayState,setTodayState]=useState("");
  const [view,setView]=useState<View>("grouped");
  const [openGroups,setOpenGroups]=useState<Set<string>>(()=>new Set());

  const specialties=useMemo(()=>[...new Set(workers.map(row=>row.specialty??"Без специальности"))].sort((a,b)=>a.localeCompare(b,"ru")),[workers]);
  const objectStates=useMemo(()=>uniqueStatuses(workers.map(row=>workerObjectState(row,today))),[workers,today]);
  const todayStates=useMemo(()=>uniqueStatuses(workers.map(row=>workerTodayStatus(row,today))),[workers,today]);
  const filtered=useMemo(()=>workers.filter(row=>{
    const objectState=workerObjectState(row,today);const day=workerTodayStatus(row,today);
    const hay=`${row.fullName} ${row.phone??""} ${row.specialty??""}`.toLocaleLowerCase("ru");
    return (!query.trim()||hay.includes(query.trim().toLocaleLowerCase("ru")))
      &&(!specialty||(row.specialty??"Без специальности")===specialty)
      &&(!workMode||row.workMode===workMode)
      &&(!state||objectState.key===state)
      &&(!todayState||day.key===todayState);
  }).sort((a,b)=>a.fullName.localeCompare(b.fullName,"ru")),[workers,query,specialty,workMode,state,todayState,today]);
  const groups=useMemo(()=>specialties.map(name=>({name,rows:filtered.filter(row=>(row.specialty??"Без специальности")===name)})).filter(group=>group.rows.length),[filtered,specialties]);
  const activeAbsences=workers.filter(row=>workerObjectState(row,today).key!=="working_period"&&workerObjectState(row,today).key!=="ended").length;
  const onShift=workers.filter(row=>workerTodayStatus(row,today).key==="on_shift").length;
  const noShows=workers.filter(row=>workerTodayStatus(row,today).key==="no_show").length;

  function toggleGroup(name:string){setOpenGroups(current=>{const next=new Set(current);if(next.has(name))next.delete(name);else next.add(name);return next})}
  const shouldOpen=(name:string)=>Boolean(query||specialty||workMode||state||todayState)||groups.length<=3||openGroups.has(name);

  return <>
    <div className="metrics-grid object-workforce-metrics">
      <div className="metric"><span>Сотрудники на объекте</span><strong>{workers.length}</strong></div>
      <div className="metric"><span>Сегодня на смене</span><strong>{onShift}</strong></div>
      <div className="metric"><span>Сейчас отсутствуют</span><strong>{activeAbsences}</strong></div>
      <div className="metric"><span>Невыходы сегодня</span><strong>{noShows}</strong></div>
    </div>
    <div className="object-workforce-toolbar">
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ФИО или телефон"/>
      <select value={specialty} onChange={e=>setSpecialty(e.target.value)}><option value="">Все специальности</option>{specialties.map(value=><option key={value}>{value}</option>)}</select>
      <select value={workMode} onChange={e=>setWorkMode(e.target.value)}><option value="">Все форматы</option><option value="local">Местные</option><option value="rotation">Вахта</option></select>
      <select value={state} onChange={e=>setState(e.target.value)}><option value="">Все состояния</option>{objectStates.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select>
      <select value={todayState} onChange={e=>setTodayState(e.target.value)}><option value="">Сегодня: все</option>{todayStates.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select>
      <div className="object-workforce-view"><button type="button" className={view==="grouped"?"active":""} onClick={()=>setView("grouped")}>По специальностям</button><button type="button" className={view==="list"?"active":""} onClick={()=>setView("list")}>Списком</button></div>
    </div>
    <div className="object-workforce-result">Показано {filtered.length} из {workers.length} · на {formatDate(today)}</div>
    {view==="list"?<WorkerTable rows={filtered} today={today} showSpecialty/>:<div className="object-workforce-groups">{groups.map(group=><section key={group.name} className="object-workforce-group"><button type="button" className="object-workforce-group-head" onClick={()=>toggleGroup(group.name)} aria-expanded={shouldOpen(group.name)}><span><strong>{group.name}</strong><small>{group.rows.length} чел.</small></span><b>{shouldOpen(group.name)?"Свернуть":"Развернуть"}</b></button>{shouldOpen(group.name)&&<WorkerTable rows={group.rows} today={today}/>}</section>)}</div>}
    {!filtered.length&&<div className="empty-inline">По выбранным фильтрам сотрудников нет</div>}
  </>;
}

function WorkerTable({rows,today,showSpecialty=false}:{rows:WorkerRow[];today:string;showSpecialty?:boolean}){
  return <div className="request-table-wrap"><table className="data-table object-workforce-table"><thead><tr><th>Сотрудник</th><th>Телефон</th>{showSpecialty&&<th>Специальность</th>}<th>Формат</th><th>Состояние</th><th>Сегодня · {shortDate(today)}</th><th>Ставка</th><th>Оформление</th></tr></thead><tbody>{rows.map(row=>{const state=workerObjectState(row,today);const day=workerTodayStatus(row,today);return <tr key={row.id}><td><Link className="cell-title" href={`/workers/${row.id}`}>{row.fullName}</Link></td><td>{row.phone?<a className="object-worker-phone" href={`tel:${row.phone.replace(/[^+\d]/g,"")}`}>{row.phone}</a>:<span className="cell-sub">Не указан</span>}</td>{showSpecialty&&<td>{row.specialty??"—"}</td>}<td>{row.workMode==="rotation"?"Вахта":"Местный"}</td><td><Status tone={state.tone}>{state.label}</Status></td><td><div className="object-worker-today"><Status tone={day.tone}>{day.label}</Status><small>{day.source}{row.todayShiftTime&&["assigned","on_shift","reserve"].includes(day.key)?` · ${row.todayShiftTime}`:""}</small></div></td><td className="num">{workerRate(row)}</td><td>{employmentTypeLabel(row.employment)}</td></tr>})}</tbody></table></div>;
}

function workerRate(row:WorkerRow){if(row.rate==null)return"—";if(row.rateUnit==="shift"&&Number(row.paidHoursPerShift)>0)return rub(row.rate)+"/см · "+rub(Number(row.rate)/Number(row.paidHoursPerShift))+"/ч";return rub(row.rate)+(row.rateUnit==="shift"?"/см":row.rateUnit==="month"?"/мес":"/ч")}
function uniqueStatuses(items:Array<{key:string;label:string}>){const map=new Map<string,string>();for(const item of items)map.set(item.key,item.label);return [...map].map(([key,label])=>({key,label})).sort((a,b)=>a.label.localeCompare(b.label,"ru"))}
function formatDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function shortDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
