"use client";

import Link from "next/link";
import {useMemo,useState} from "react";
import type {ShiftRow,WorkerRow} from "@/lib/data/service";

type Kind="day"|"night"|"off"|"";
type PaintKind="day"|"night"|"off"|"clear";
type Mode="workers"|"specialties";

const paintLabels:Record<PaintKind,string>={day:"День",night:"Ночь",off:"Выходной",clear:"Очистить"};

export function ObjectShiftsWorkspace({objectId,rows,workers,today,canEdit,demo}:{objectId:string;rows:ShiftRow[];workers:WorkerRow[];today:string;canEdit:boolean;demo:boolean}){
  const [start,setStart]=useState(today);
  const [mode,setMode]=useState<Mode>("workers");
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");
  const [paint,setPaint]=useState<PaintKind>("day");
  const [selected,setSelected]=useState<Set<string>>(()=>new Set());
  const [overrides,setOverrides]=useState<Record<string,Kind>>({});
  const dates=useMemo(()=>Array.from({length:7},(_,i)=>addDays(start,i)),[start]);

  const map=useMemo(()=>{
    const out=new Map<string,Kind>();
    for(const shift of rows){
      if(!shift.dateIso)continue;
      const kind=normalizeKind(shift.kind);
      for(const id of shift.workerIds)out.set(`${id}:${shift.dateIso}`,kind);
    }
    return out;
  },[rows]);

  function planned(worker:WorkerRow,date:string):Kind{
    const key=`${worker.id}:${date}`;
    if(overrides[key]!==undefined)return overrides[key];
    const actual=map.get(key);
    if(actual)return actual;
    if(worker.absenceStatus==="confirmed"&&worker.absenceFrom&&worker.absenceFrom<=date&&(!worker.absenceTo||worker.absenceTo>=date))return "off";
    if(worker.scheduleWorkDays==null||worker.scheduleRestDays==null||!worker.startDate)return "";
    const anchor=worker.scheduleAnchorDate??worker.startDate;
    const cycle=worker.scheduleWorkDays+worker.scheduleRestDays;
    const diff=Math.floor((Date.parse(date+"T00:00:00Z")-Date.parse(anchor+"T00:00:00Z"))/86400000);
    const offset=((diff%cycle)+cycle)%cycle;
    if(offset>=worker.scheduleWorkDays)return "off";
    return worker.scheduleShiftKind==="night"?"night":"day";
  }

  function demandFor(date:string,kind:"day"|"night",specialty?:string){
    return rows.filter(row=>row.dateIso===date&&normalizeKind(row.kind)===kind&&(!specialty||row.specialty===specialty))
      .reduce((sum,row)=>sum+Number(row.demand??0),0);
  }
  function plannedFor(date:string,kind:"day"|"night",specialty?:string){
    return workers.filter(worker=>(!specialty||(worker.specialty??"Без специальности")===specialty)&&planned(worker,date)===kind).length;
  }

  async function persistCells(cells:Array<{workerId:string;date:string;kind:PaintKind}>){
    if(!canEdit||!cells.length)return;
    const key=cells.length===1?`${cells[0].workerId}:${cells[0].date}`:"bulk";
    setBusy(key);setMessage("");
    const before={...overrides};
    setOverrides(current=>{
      const next={...current};
      for(const cell of cells)next[`${cell.workerId}:${cell.date}`]=cell.kind==="clear"?"":cell.kind;
      return next;
    });
    try{
      if(!demo){
        const response=await fetch(`/api/objects/${objectId}/shift-plan`,{
          method:"POST",
          headers:{"content-type":"application/json"},
          body:JSON.stringify(cells.length===1?{action:"set_cell",...cells[0]}:{action:"set_cells",cells}),
        });
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось изменить план");
      }
      setMessage(cells.length===1?"План выхода изменён":`Изменено ячеек: ${cells.length}`);
    }catch(error){
      setOverrides(before);
      setMessage(error instanceof Error?error.message:"Не удалось изменить план");
    }finally{setBusy("")}
  }

  async function generate(){
    if(!canEdit)return;
    setBusy("generate");setMessage("");
    try{
      if(!demo){
        const response=await fetch(`/api/objects/${objectId}/shift-plan`,{
          method:"POST",headers:{"content-type":"application/json"},
          body:JSON.stringify({action:"generate",startDate:start,endDate:dates.at(-1)}),
        });
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось сформировать график");
        setMessage(`План обновлён: ${json.updated??0} ячеек`);
        window.location.reload();
      }else setMessage("Демо: график сформирован локально");
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось сформировать график")}
    finally{setBusy("")}
  }

  function toggleWorker(id:string){
    setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next});
  }
  function toggleAll(){
    setSelected(current=>current.size===workers.length?new Set():new Set(workers.map(worker=>worker.id)));
  }
  function applyDate(date:string){
    const ids=selected.size?[...selected]:workers.map(worker=>worker.id);
    const cells=ids.map(workerId=>({workerId,date,kind:paint}));
    void persistCells(cells);
  }

  const specialties=[...new Set(workers.map(worker=>worker.specialty??"Без специальности"))].sort((a,b)=>a.localeCompare(b,"ru"));

  return <div className="object-shift-planner">
    <div className="object-shift-planner-toolbar">
      <div className="page-actions">
        <button className="button" onClick={()=>setStart(addDays(start,-7))}>← Неделя</button>
        <button className="button" onClick={()=>setStart(today)}>Сегодня</button>
        <button className="button" onClick={()=>setStart(addDays(start,7))}>Неделя →</button>
        <strong>{formatRange(start,dates.at(-1)!)}</strong>
      </div>
      <div className="page-actions">
        <div className="segmented"><button className={mode==="workers"?"active":""} onClick={()=>setMode("workers")}>По сотрудникам</button><button className={mode==="specialties"?"active":""} onClick={()=>setMode("specialties")}>По специальностям</button></div>
        {canEdit&&<button className="button primary" disabled={busy==="generate"} onClick={()=>void generate()}>Заполнить по графикам</button>}
      </div>
    </div>

    <div className="object-shift-guidance">
      <div><strong>План выходов</strong><span>Сначала заполните неделю по графикам, затем меняйте только исключения.</span></div>
      {canEdit&&<div className="object-shift-paint">
        <span>Режим:</span>
        {(["day","night","off","clear"] as PaintKind[]).map(kind=><button type="button" key={kind} className={paint===kind?"active":""} onClick={()=>setPaint(kind)}><b>{kind==="day"?"Д":kind==="night"?"Н":kind==="off"?"В":"×"}</b>{paintLabels[kind]}</button>)}
      </div>}
    </div>
    <div className="object-shift-legend">
      <span><b>Д</b> дневная</span><span><b>Н</b> ночная</span><span><b>В</b> выходной / плановое отсутствие</span>
      <span>План автоматически появляется в табеле как <b>П</b>.</span>
      {canEdit&&<span>{selected.size?`Выбрано: ${selected.size}. Нажмите дату, чтобы применить режим ко всем выбранным.`:"Без выбора дата применяется ко всем сотрудникам."}</span>}
    </div>
    {message&&<div className="object-staffing-message">{message}</div>}

    <div className="object-shift-coverage">
      {dates.map(date=>{
        const dp=plannedFor(date,"day"),dd=demandFor(date,"day"),np=plannedFor(date,"night"),nd=demandFor(date,"night");
        const deficit=Math.max(dd-dp,0)+Math.max(nd-np,0);
        return <button type="button" key={date} disabled={!canEdit||busy==="bulk"} onClick={()=>applyDate(date)} className={deficit?"has-deficit":""}>
          <span>{weekday(date)} · {shortDate(date)}</span>
          <strong>Д {dp}/{dd||"—"} · Н {np}/{nd||"—"}</strong>
          <small>{deficit?`Не хватает: ${deficit}`:"План закрыт"}</small>
        </button>;
      })}
    </div>

    {mode==="workers"?<div className="request-table-wrap"><table className="data-table object-shift-matrix">
      <thead><tr>
        {canEdit&&<th className="object-shift-select"><input type="checkbox" aria-label="Выбрать всех" checked={workers.length>0&&selected.size===workers.length} onChange={toggleAll}/></th>}
        <th className="sticky-col">Сотрудник</th><th>График</th>
        {dates.map(date=><th key={date}><button type="button" className="object-shift-date-button" disabled={!canEdit||busy==="bulk"} onClick={()=>applyDate(date)}><span>{weekday(date)}</span>{shortDate(date)}</button></th>)}
      </tr></thead>
      <tbody>{workers.map(worker=><tr key={worker.id}>
        {canEdit&&<td className="object-shift-select"><input type="checkbox" aria-label={`Выбрать ${worker.fullName}`} checked={selected.has(worker.id)} onChange={()=>toggleWorker(worker.id)}/></td>}
        <td className="sticky-col"><Link className="cell-title" href={`/workers/${worker.id}`}>{worker.fullName}</Link><span className="cell-sub">{worker.specialty??"—"}{worker.phone&&<> · <a href={`tel:${worker.phone.replace(/[^+\d]/g,"")}`}>{worker.phone}</a></>}</span></td>
        <td><strong>{worker.scheduleWorkDays!=null&&worker.scheduleRestDays!=null?`${worker.scheduleWorkDays}/${worker.scheduleRestDays}`:"Инд."}</strong><span className="cell-sub">{worker.scheduleShiftKind==="night"?"Ночь":worker.scheduleShiftKind==="day"?"День":"Д/Н"}</span></td>
        {dates.map(date=>{const value=planned(worker,date);const key=`${worker.id}:${date}`;return <td key={date} className={`object-shift-cell is-${value||"empty"}`}>
          {canEdit?<button type="button" className="object-shift-cell-button" disabled={busy===key||busy==="bulk"} onClick={()=>void persistCells([{workerId:worker.id,date,kind:paint}])} aria-label={`${worker.fullName} ${date}: ${paintLabels[paint]}`}>{shortKind(value)}</button>:<b>{shortKind(value)}</b>}
        </td>})}
      </tr>)}</tbody>
    </table></div>:<div className="request-table-wrap"><table className="data-table object-shift-specialty">
      <thead><tr><th>Специальность</th>{dates.map(date=><th key={date}>{shortDate(date)}</th>)}</tr></thead>
      <tbody>{specialties.map(name=><tr key={name}><td className="cell-title">{name}</td>{dates.map(date=>{
        const day=plannedFor(date,"day",name),night=plannedFor(date,"night",name),dayDemand=demandFor(date,"day",name),nightDemand=demandFor(date,"night",name);
        const deficit=Math.max(dayDemand-day,0)+Math.max(nightDemand-night,0);
        return <td key={date} className={deficit?"object-shift-deficit":""}><strong>Д {day}/{dayDemand||"—"}</strong><span className="cell-sub">Н {night}/{nightDemand||"—"}</span>{deficit>0&&<small>−{deficit}</small>}</td>;
      })}</tr>)}</tbody>
    </table></div>}

    <div className="section-actions"><Link className="button" href={`/timesheets?object=${objectId}`}>Открыть табель</Link><Link className="button" href={`/shifts?object=${objectId}`}>Расширенный план смен</Link></div>
  </div>;
}
function normalizeKind(value:string):Kind{if(value==="day"||value==="День")return"day";if(value==="night"||value==="Ночь")return"night";if(value==="off"||value==="Выходной")return"off";return""}
function shortKind(value:Kind){return value==="day"?"Д":value==="night"?"Н":value==="off"?"В":"—"}
function addDays(value:string,n:number){const date=new Date(value+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)}
function shortDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function weekday(value:string){return new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z")).replace(".","")}
function formatRange(a:string,b:string){return `${new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(a+"T00:00:00Z"))} — ${new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(b+"T00:00:00Z"))}`}
