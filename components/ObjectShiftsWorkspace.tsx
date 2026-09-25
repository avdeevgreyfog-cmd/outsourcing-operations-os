"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import type {ShiftRow,WorkerRow} from "@/lib/data/service";

type Kind="day"|"night"|"off"|"reserve_day"|"reserve_night"|"intershift"|"vacation"|"";
type PaintKind="day"|"night"|"off"|"reserve_day"|"reserve_night"|"clear";
type AbsenceKind="intershift"|"vacation"|"personal";
type Mode="workers"|"specialties"|"attention";
type PlannerAssignment={workerId:string;date:string;kind:"day"|"night"|"mixed";reserve:boolean;status:string};
type PlannerEntry={workerId:string;date:string;timeCode:string;factHours:number|string;dayHours:number|string;nightHours:number|string;source:string;plannedShiftKind:"day"|"night"|"mixed"|null};
type PlannerAbsence={workerId:string;type:string;from:string;to:string|null;status:string};
type PlannerDemand={date:string;specialtyId:string;specialty:string;required:number};
type LockedRange={from:string;to:string;status:string};
type PlannerData={assignments:PlannerAssignment[];entries:PlannerEntry[];absences:PlannerAbsence[];demand:PlannerDemand[];lockedRanges:LockedRange[];demo?:boolean};
type CellState={kind:Kind;label:string;source:"fact"|"plan"|"suggested"|"absence"|"none";editable:boolean;attention:boolean;factWithoutPlan:boolean;title:string};

const paintLabels:Record<PaintKind,string>={day:"День",night:"Ночь",off:"Выходной",reserve_day:"Резерв день",reserve_night:"Резерв ночь",clear:"Очистить"};
const factLabels:Record<string,string>={PLANNED:"П",WORK_PENDING:"?",DAY_OFF:"В",VACATION:"О",INTERSHIFT:"МВ",SICK:"Б",NO_SHOW:"НВ",ABSENCE:"НВ"};

export function ObjectShiftsWorkspace({objectId,rows,workers,today,canEdit,canPlanAbsence,demo}:{objectId:string;rows:ShiftRow[];workers:WorkerRow[];today:string;canEdit:boolean;canPlanAbsence:boolean;demo:boolean}){
  const [start,setStart]=useState(today);
  const [mode,setMode]=useState<Mode>("workers");
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");
  const [paint,setPaint]=useState<PaintKind>("day");
  const [selected,setSelected]=useState<Set<string>>(()=>new Set());
  const [overrides,setOverrides]=useState<Record<string,Kind>>({});
  const [absenceOpen,setAbsenceOpen]=useState(false);
  const [absenceType,setAbsenceType]=useState<AbsenceKind>("intershift");
  const [absenceFrom,setAbsenceFrom]=useState(today);
  const [absenceTo,setAbsenceTo]=useState(addDays(today,7));
  const [absenceNote,setAbsenceNote]=useState("");
  const [absenceOverrides,setAbsenceOverrides]=useState<Record<string,{type:AbsenceKind;from:string;to:string}>>({});
  const [planner,setPlanner]=useState<PlannerData|null>(null);
  const [plannerLoading,setPlannerLoading]=useState(false);
  const [revision,setRevision]=useState(0);
  const [focusDate,setFocusDate]=useState(today);
  const dates=useMemo(()=>Array.from({length:7},(_,i)=>addDays(start,i)),[start]);
  const end=dates.at(-1)!;

  useEffect(()=>{
    if(demo){setPlanner(null);return}
    const controller=new AbortController();setPlannerLoading(true);
    fetch(`/api/objects/${objectId}/shift-plan?start=${start}&end=${end}`,{signal:controller.signal})
      .then(async response=>{const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось загрузить план смен");setPlanner(json as PlannerData)})
      .catch(error=>{if(error instanceof DOMException&&error.name==="AbortError")return;setMessage(error instanceof Error?error.message:"Не удалось загрузить план смен")})
      .finally(()=>setPlannerLoading(false));
    return()=>controller.abort();
  },[objectId,start,end,demo,revision]);

  useEffect(()=>{if(!dates.includes(focusDate))setFocusDate(start)},[dates,focusDate,start]);

  const map=useMemo(()=>{
    const out=new Map<string,Kind>();
    for(const shift of rows){
      if(!shift.dateIso)continue;
      const kind=normalizeKind(shift.kind);
      for(const id of shift.workerIds)out.set(`${id}:${shift.dateIso}`,kind);
    }
    return out;
  },[rows]);

  function absenceFor(worker:WorkerRow,date:string):AbsenceKind|null{
    const local=absenceOverrides[worker.id];
    if(local&&local.from<=date&&local.to>=date)return local.type;
    if(worker.absenceStatus==="confirmed"&&worker.absenceFrom&&worker.absenceFrom<=date&&(!worker.absenceTo||worker.absenceTo>=date)){
      if(worker.absenceType==="intershift"||worker.absenceType==="vacation"||worker.absenceType==="personal")return worker.absenceType;
    }
    return null;
  }
  function planned(worker:WorkerRow,date:string):Kind{
    const key=`${worker.id}:${date}`;
    const absence=absenceFor(worker,date);
    if(absence)return absence==="personal"?"off":absence;
    if(overrides[key]!==undefined)return overrides[key];
    const actual=map.get(key);
    if(actual)return actual;
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
    if(!selected.size){setMessage("Для массового изменения сначала выберите сотрудников");return;}
    const cells=[...selected].map(workerId=>({workerId,date,kind:paint}));
    void persistCells(cells);
  }

  async function planAbsence(){
    if(!canPlanAbsence)return;
    if(!selected.size){setMessage("Выберите сотрудников, которым нужно запланировать отсутствие");return;}
    if(!absenceFrom||!absenceTo||absenceTo<absenceFrom){setMessage("Проверьте даты отсутствия");return;}
    const selectedIds=[...selected];
    setBusy("absence");setMessage("");
    try{
      if(!demo){
        for(const workerId of selectedIds){
          const response=await fetch(`/api/workers/${workerId}/absences`,{
            method:"POST",headers:{"content-type":"application/json"},
            body:JSON.stringify({absenceType,status:"confirmed",plannedFrom:absenceFrom,plannedTo:absenceTo,flexibleReturn:absenceType==="intershift",note:absenceNote||null}),
          });
          const json=await response.json().catch(()=>({}));
          if(!response.ok)throw new Error(json.error??"Не удалось сохранить отсутствие");
        }
      }
      setAbsenceOverrides(current=>{
        const next={...current};
        for(const workerId of selectedIds)next[workerId]={type:absenceType,from:absenceFrom,to:absenceTo};
        return next;
      });
      setMessage(`${absenceType==="intershift"?"Межвахта":absenceType==="vacation"?"Отпуск":"Выходной"}: запланировано для ${selectedIds.length} чел. с ${shortDate(absenceFrom)} по ${shortDate(absenceTo)}`);
      setAbsenceOpen(false);
      if(!demo)window.location.reload();
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось запланировать отсутствие")}
    finally{setBusy("")}
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
        {canPlanAbsence&&<button className="button" type="button" onClick={()=>{if(!selected.size){setMessage("Сначала выберите сотрудников слева");return}setAbsenceOpen(value=>!value)}}>Плановое отсутствие</button>}
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
    {absenceOpen&&<div className="object-shift-absence-panel">
      <div><strong>Плановое отсутствие</strong><span>Выбрано сотрудников: {selected.size}. После сохранения период автоматически исключается из плана смен и отображается в табеле.</span></div>
      <label>Тип<select value={absenceType} onChange={event=>setAbsenceType(event.target.value as AbsenceKind)}><option value="intershift">Межвахта</option><option value="vacation">Отпуск</option><option value="personal">Согласованный выходной</option></select></label>
      <label>С<input type="date" min={today} value={absenceFrom} onChange={event=>{setAbsenceFrom(event.target.value);if(absenceTo<event.target.value)setAbsenceTo(event.target.value)}}/></label>
      <label>По<input type="date" min={absenceFrom} value={absenceTo} onChange={event=>setAbsenceTo(event.target.value)}/></label>
      <label className="note">Комментарий<input value={absenceNote} onChange={event=>setAbsenceNote(event.target.value)} placeholder="Необязательно"/></label>
      <div className="page-actions"><button className="button" type="button" onClick={()=>setAbsenceOpen(false)}>Отмена</button><button className="button primary" type="button" disabled={busy==="absence"} onClick={()=>void planAbsence()}>{busy==="absence"?"Сохраняем…":"Запланировать"}</button></div>
    </div>}
    <div className="object-shift-legend">
      <span><b>Д</b> дневная</span><span><b>Н</b> ночная</span><span><b>В</b> выходной</span><span><b>МВ</b> межвахта</span><span><b>О</b> отпуск</span>
      <span>План автоматически появляется в табеле как <b>П</b>.</span>
      {canEdit&&<span>{selected.size?`Выбрано: ${selected.size}. Нажмите дату, чтобы применить режим ко всем выбранным.`:"Для массового изменения выберите сотрудников слева."}</span>}
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
        {(canEdit||canPlanAbsence)&&<th className="object-shift-select"><input type="checkbox" aria-label="Выбрать всех" checked={workers.length>0&&selected.size===workers.length} onChange={toggleAll}/></th>}
        <th className="sticky-col">Сотрудник</th><th>График</th>
        {dates.map(date=><th key={date}><button type="button" className="object-shift-date-button" disabled={!canEdit||busy==="bulk"} onClick={()=>applyDate(date)}><span>{weekday(date)}</span>{shortDate(date)}</button></th>)}
      </tr></thead>
      <tbody>{workers.map(worker=><tr key={worker.id}>
        {(canEdit||canPlanAbsence)&&<td className="object-shift-select"><input type="checkbox" aria-label={`Выбрать ${worker.fullName}`} checked={selected.has(worker.id)} onChange={()=>toggleWorker(worker.id)}/></td>}
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
function shortKind(value:Kind){return value==="day"?"Д":value==="night"?"Н":value==="off"?"В":value==="intershift"?"МВ":value==="vacation"?"О":"—"}
function addDays(value:string,n:number){const date=new Date(value+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)}
function shortDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function weekday(value:string){return new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z")).replace(".","")}
function formatRange(a:string,b:string){return `${new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(a+"T00:00:00Z"))} — ${new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(b+"T00:00:00Z"))}`}
