"use client";

import Link from "next/link";
import { useMemo,useState } from "react";
import type { WorkerRow } from "@/lib/data/service";
import { workerObjectState,workerTodayStatus } from "@/lib/operations/workforce-status";
import { rub } from "@/lib/ui/format";

type View="grouped"|"list";

const documentLabels:Record<string,string>={
  not_received:"Не получены",
  collecting:"Собираются",
  received:"Получены мастером",
  submitted:"Переданы на оформление",
  processing:"На оформлении",
  completed:"Готово",
  problem:"Есть проблема",
};
const shiftLabels:Record<string,string>={day:"День",night:"Ночь",mixed:"День / ночь"};

export function ObjectWorkforceWorkspace({workers,today}:{workers:WorkerRow[];today:string}){
  const [query,setQuery]=useState("");
  const [specialty,setSpecialty]=useState("");
  const [schedule,setSchedule]=useState("");
  const [todayState,setTodayState]=useState("");
  const [view,setView]=useState<View>("grouped");
  const [openGroups,setOpenGroups]=useState<Set<string>>(()=>new Set());

  const specialties=useMemo(()=>[...new Set(workers.map(row=>row.specialty??"Без специальности"))].sort((a,b)=>a.localeCompare(b,"ru")),[workers]);
  const todayStates=useMemo(()=>uniqueStatuses(workers.map(row=>workerTodayStatus(row,today))),[workers,today]);
  const filtered=useMemo(()=>workers.filter(row=>{
    const day=workerTodayStatus(row,today);
    const hay=`${row.fullName} ${row.phone??""} ${row.specialty??""}`.toLocaleLowerCase("ru");
    return (!query.trim()||hay.includes(query.trim().toLocaleLowerCase("ru")))
      &&(!specialty||(row.specialty??"Без специальности")===specialty)
      &&(!schedule||row.scheduleShiftKind===schedule)
      &&(!todayState||day.key===todayState);
  }).sort((a,b)=>a.fullName.localeCompare(b.fullName,"ru")),[workers,query,specialty,schedule,todayState,today]);
  const groups=useMemo(()=>specialties.map(name=>({name,rows:filtered.filter(row=>(row.specialty??"Без специальности")===name)})).filter(group=>group.rows.length),[filtered,specialties]);
  const activeAbsences=workers.filter(row=>!["working_period","ended"].includes(workerObjectState(row,today).key)).length;
  const onShift=workers.filter(row=>workerTodayStatus(row,today).key==="on_shift").length;
  const noShows=workers.filter(row=>workerTodayStatus(row,today).key==="no_show").length;

  function toggleGroup(name:string){setOpenGroups(current=>{const next=new Set(current);if(next.has(name))next.delete(name);else next.add(name);return next})}
  const shouldOpen=(name:string)=>Boolean(query||specialty||schedule||todayState)||groups.length<=3||openGroups.has(name);

  return <>
    <div className="metrics-grid object-workforce-metrics">
      <div className="metric"><span>Сотрудники на объекте</span><strong>{workers.length}</strong></div>
      <div className="metric"><span>Сегодня вышли</span><strong>{onShift}</strong></div>
      <div className="metric"><span>Планово отсутствуют</span><strong>{activeAbsences}</strong></div>
      <div className="metric"><span>Невыходы сегодня</span><strong>{noShows}</strong></div>
    </div>
    <div className="object-workforce-toolbar compact">
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="ФИО или телефон"/>
      <select value={specialty} onChange={e=>setSpecialty(e.target.value)}><option value="">Все специальности</option>{specialties.map(value=><option key={value}>{value}</option>)}</select>
      <select value={schedule} onChange={e=>setSchedule(e.target.value)}><option value="">Все смены</option><option value="day">День</option><option value="night">Ночь</option><option value="mixed">День / ночь</option></select>
      <select value={todayState} onChange={e=>setTodayState(e.target.value)}><option value="">Сегодня: все</option>{todayStates.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select>
      <div className="object-workforce-view"><button type="button" className={view==="grouped"?"active":""} onClick={()=>setView("grouped")}>По специальностям</button><button type="button" className={view==="list"?"active":""} onClick={()=>setView("list")}>Списком</button></div>
    </div>
    <div className="object-workforce-result">Показано {filtered.length} из {workers.length} · {formatDate(today)}</div>
    {view==="list"?<WorkerTable rows={filtered} today={today} showSpecialty/>:<div className="object-workforce-groups">{groups.map(group=><section key={group.name} className="object-workforce-group"><button type="button" className="object-workforce-group-head" onClick={()=>toggleGroup(group.name)} aria-expanded={shouldOpen(group.name)}><span><strong>{group.name}</strong><small>{group.rows.length} чел.</small></span><b>{shouldOpen(group.name)?"Свернуть":"Развернуть"}</b></button>{shouldOpen(group.name)&&<WorkerTable rows={group.rows} today={today}/>}</section>)}</div>}
    {!filtered.length&&<div className="empty-inline">По выбранным фильтрам сотрудников нет</div>}
  </>;
}

function WorkerTable({rows,today,showSpecialty=false}:{rows:WorkerRow[];today:string;showSpecialty?:boolean}){
  return <div className="request-table-wrap"><table className="data-table object-workforce-table object-workforce-table-v2"><thead><tr><th>Сотрудник</th><th>Телефон</th>{showSpecialty&&<th>Специальность</th>}<th>График</th><th>Сегодня · {shortDate(today)}</th><th>Ставка</th><th>Документы</th><th>Обеспечение</th></tr></thead><tbody>{rows.map(row=>{
    const objectState=workerObjectState(row,today);const day=workerTodayStatus(row,today);const adaptation=adaptationLabel(row,today);
    return <tr key={row.id}>
      <td><Link className="cell-title" href={`/workers/${row.id}`}>{row.fullName}</Link>{adaptation&&<span className="cell-sub object-worker-adaptation">{adaptation}</span>}</td>
      <td>{row.phone?<a className="object-worker-phone" href={`tel:${row.phone.replace(/[^+\d]/g,"")}`}>{row.phone}</a>:<span className="cell-sub">Не указан</span>}</td>
      {showSpecialty&&<td>{row.specialty??"—"}</td>}
      <td><strong className="object-worker-plain">{scheduleLabel(row)}</strong><span className="cell-sub">{row.workMode==="rotation"?"Вахта":"Местный"}</span></td>
      <td><WorkerToday state={objectState} day={day} shiftTime={row.todayShiftTime}/></td>
      <td className="num"><WorkerRate row={row}/></td>
      <td><span className={`object-worker-docs ${row.employmentDocumentsStatus==="problem"?"is-alert":""}`}>{documentLabels[row.employmentDocumentsStatus??""]??"Не указано"}</span></td>
      <td><WorkerAssets row={row}/></td>
    </tr>})}</tbody></table></div>;
}

function WorkerToday({state,day,shiftTime}:{state:ReturnType<typeof workerObjectState>;day:ReturnType<typeof workerTodayStatus>;shiftTime?:string|null}){
  const exceptional=!["working_period","on_shift","assigned","day_off","unmarked"].includes(day.key)||["intershift","vacation","sick","absence"].includes(state.key);
  const primary=state.key!=="working_period"?state.label:day.key==="on_shift"?"Работает":day.label;
  const secondary=state.key!=="working_period"?(day.key!==state.key?`Сегодня: ${day.label}`:state.source):day.key==="on_shift"?`Сегодня: выход${shiftTime?` · ${shiftTime}`:""}`:day.source;
  return <div className={`object-worker-current ${exceptional?"is-attention":""}`}><strong>{primary}</strong><small>{secondary}</small></div>;
}

function WorkerRate({row}:{row:WorkerRow}){
  if(row.rate==null)return <>—</>;
  const hours=Number(row.paidHoursPerShift??0);
  if(row.rateUnit==="hour"){
    const hourly=Number(row.rate);return <div className="object-worker-rate"><strong>{rub(hourly)}/ч</strong>{hours>0&&<small>{rub(hourly*hours)}/смена ({compactNumber(hours)} ч)</small>}</div>;
  }
  if(row.rateUnit==="shift"){
    const shift=Number(row.rate);return <div className="object-worker-rate"><strong>{hours>0?`${rub(shift/hours)}/ч`:"—"}</strong><small>{rub(shift)}/смена{hours>0?` (${compactNumber(hours)} ч)`:""}</small></div>;
  }
  return <div className="object-worker-rate"><strong>{rub(row.rate)}/мес</strong></div>;
}

function WorkerAssets({row}:{row:WorkerRow}){
  const count=Number(row.issuedAssetCount??0);const sizes=[row.clothingSize&&`одежда ${row.clothingSize}`,row.shoeSize&&`обувь ${row.shoeSize}`].filter(Boolean).join(" · ");
  return <div className="object-worker-assets" title={row.issuedAssetNames?.join("\n")||undefined}><strong>{count?`Выдано ${count}`:"Не выдавалось"}</strong>{sizes&&<small>{sizes}</small>}</div>;
}

function scheduleLabel(row:WorkerRow){
  const cycle=row.scheduleWorkDays!=null&&row.scheduleRestDays!=null?`${row.scheduleWorkDays}/${row.scheduleRestDays}`:"Индивидуальный";
  return `${cycle} · ${shiftLabels[row.scheduleShiftKind??"mixed"]??"День / ночь"}`;
}
function adaptationLabel(row:WorkerRow,today:string){
  if(!row.startDate||!row.transitionDays||Number(row.transitionDays)<=0)return null;
  const end=new Date(row.startDate+"T00:00:00Z");end.setUTCDate(end.getUTCDate()+Number(row.transitionDays)-1);
  if(today>end.toISOString().slice(0,10))return null;
  return `Адаптация до ${shortDate(end.toISOString().slice(0,10))}`;
}
function compactNumber(value:number){return Number.isInteger(value)?String(value):String(value).replace(".",",")}
function uniqueStatuses(items:Array<{key:string;label:string}>){const map=new Map<string,string>();for(const item of items)map.set(item.key,item.label);return [...map].map(([key,label])=>({key,label})).sort((a,b)=>a.label.localeCompare(b.label,"ru"))}
function formatDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function shortDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}