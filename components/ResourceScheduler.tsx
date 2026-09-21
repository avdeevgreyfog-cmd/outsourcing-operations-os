"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Plus, UsersRound, X } from "lucide-react";
import { KeyValue, Metric, Status } from "@/components/UI";
import { rub } from "@/lib/ui/format";
import type { ShiftRow } from "@/lib/data/service";
import type { OperationsReferenceData } from "@/lib/operations/service";

type Period = "day" | "week" | "month";
type Group = "object" | "specialty";

const kindLabels:Record<string,string>={day:"День",night:"Ночь",mixed:"Смешанная"};
const statusLabels:Record<string,string>={open:"Открыта",planned:"Запланирована",closed:"Закрыта",cancelled:"Отменена"};

export function ResourceScheduler({rows,options,canEdit}:{rows:ShiftRow[];options:OperationsReferenceData;canEdit:boolean}){
  const router=useRouter();
  const [period,setPeriod]=useState<Period>("week");
  const [group,setGroup]=useState<Group>("object");
  const [selected,setSelected]=useState<ShiftRow|null>(null);
  const [showCreate,setShowCreate]=useState(false);
  const [showAssignments,setShowAssignments]=useState(false);
  const [message,setMessage]=useState("");

  const visible=useMemo(()=>{
    const sorted=[...rows].sort((a,b)=>String(a[group]).localeCompare(String(b[group]),"ru")||a.date.localeCompare(b.date));
    const dates=[...new Set(sorted.map(row=>row.date))];
    const allowed=new Set(period==="day"?dates.slice(0,1):period==="week"?dates.slice(0,7):dates);
    return sorted.filter(row=>allowed.has(row.date));
  },[rows,period,group]);
  const demand=visible.reduce((sum,row)=>sum+row.demand,0);
  const assigned=visible.reduce((sum,row)=>sum+row.assigned,0);
  const reserve=visible.reduce((sum,row)=>sum+row.reserve,0);
  const confirmed=visible.reduce((sum,row)=>sum+Number(row.confirmed??0),0);
  const deficit=visible.reduce((sum,row)=>sum+Math.max(0,row.deficit),0);
  const cost=visible.reduce((sum,row)=>sum+Number(row.cost),0);

  return <>
    <div className="scheduler-controls">
      <div className="page-actions">
        <div className="segmented" aria-label="Период">{(["day","week","month"] as Period[]).map(value=><button type="button" key={value} className={period===value?"active":""} onClick={()=>setPeriod(value)}>{value==="day"?"День":value==="week"?"Неделя":"Месяц"}</button>)}</div>
        <div className="segmented" aria-label="Группировка">{(["object","specialty"] as Group[]).map(value=><button type="button" key={value} className={group===value?"active":""} onClick={()=>setGroup(value)}>{value==="object"?"По объекту":"По специальности"}</button>)}</div>
      </div>
      {canEdit&&<button className="button primary" type="button" onClick={()=>setShowCreate(true)}><Plus size={14}/> Создать график</button>}
    </div>
    {message&&<div className="summary-strip"><span>{message}</span></div>}
    <div className="scheduler-summary">
      <Metric label="Потребность" value={demand} note="человек в сменах"/>
      <Metric label="Назначено" value={assigned} note={`${Math.round(assigned/Math.max(1,demand)*100)}% покрытия`} tone={deficit?"warn":"good"}/>
      <Metric label="Резерв" value={reserve}/>
      <Metric label="Подтверждено" value={confirmed}/>
      <Metric label="Дефицит" value={deficit} tone={deficit?"bad":"good"}/>
      <Metric label="Плановая стоимость" value={rub(cost)} note="по текущему виду"/>
    </div>
    <section className="section scheduler">
      <table className="data-table">
        <thead><tr><th>Дата / смена</th><th>{group==="object"?"Объект":"Специальность"}</th><th>{group==="object"?"Специальность":"Объект"}</th><th>Комплектование</th><th>Потребность</th><th>Назначено</th><th>Резерв</th><th>Подтверждено</th><th>Дефицит</th><th>Плановая стоимость</th><th>Статус</th></tr></thead>
        <tbody>{visible.map(row=><tr key={row.id} onDoubleClick={()=>setSelected(row)}>
          <td><button type="button" className="cell-link" onClick={()=>setSelected(row)}><strong>{row.date} · {kindLabels[row.kind]??row.kind}</strong><span>{row.time}</span></button></td>
          <td>{row[group]}</td><td>{group==="object"?row.specialty:row.object}</td>
          <td style={{minWidth:175}}><div className="scheduler-bar"><span className="assigned" style={{width:`${Math.min(100,row.assigned/Math.max(1,row.demand)*100)}%`}}/><span className="reserve" style={{width:`${Math.min(100,row.reserve/Math.max(1,row.demand)*100)}%`}}/><span className="deficit" style={{width:`${Math.min(100,Math.max(0,row.deficit)/Math.max(1,row.demand)*100)}%`}}/></div><span className="cell-sub">{row.assigned+row.reserve} из {row.demand}</span></td>
          <td className="num">{row.demand}</td><td className="num">{row.assigned}</td><td className="num">{row.reserve}</td><td className="num">{row.confirmed??"—"}</td><td className="num">{row.deficit}</td><td className="num">{rub(row.cost)}</td>
          <td><Status tone={row.deficit>0?"warn":row.status==="closed"?"neutral":"good"}>{statusLabels[row.status]??row.status}</Status></td>
        </tr>)}</tbody>
      </table>
      {!visible.length&&<div className="empty-inline">Смен в выбранном периоде нет</div>}
    </section>

    {selected&&<><div className="drawer-backdrop" onClick={()=>setSelected(null)}/><aside className="drawer">
      <button className="icon-button drawer-close" onClick={()=>setSelected(null)} aria-label="Закрыть"><X size={17}/></button>
      <div className="eyebrow">Смена · {selected.date}</div><h2>{selected.object}</h2>
      <Status tone={selected.deficit?"warn":"good"}>{kindLabels[selected.kind]??selected.kind} · {statusLabels[selected.status]??selected.status}</Status>
      <div className="drawer-content"><KeyValue label="Время" value={selected.time}/><KeyValue label="Специальность" value={selected.specialty}/><KeyValue label="Потребность" value={selected.demand}/><KeyValue label="Назначено" value={selected.assigned}/><KeyValue label="Резерв" value={selected.reserve}/><KeyValue label="Подтверждено" value={selected.confirmed??"—"}/><KeyValue label="Открытые позиции" value={selected.deficit}/><KeyValue label="Плановая стоимость" value={rub(selected.cost)} sensitive/></div>
      <div className="drawer-actions">{canEdit&&<button className="button primary" onClick={()=>setShowAssignments(true)}><UsersRound size={14}/> Состав смены</button>}<Link className="button" href={`/objects/${selected.objectId}?tab=recruiting`}><CalendarDays size={14}/> Передать в подбор</Link></div>
    </aside></>}

    {showCreate&&<ScheduleModal options={options} onClose={()=>setShowCreate(false)} onSaved={(text)=>{setShowCreate(false);setMessage(text);router.refresh()}}/>}
    {selected&&showAssignments&&<AssignmentsModal shift={selected} options={options} onClose={()=>setShowAssignments(false)} onSaved={(text)=>{setShowAssignments(false);setSelected(null);setMessage(text);router.refresh()}}/>}
  </>;
}

function ScheduleModal({options,onClose,onSaved}:{options:OperationsReferenceData;onClose:()=>void;onSaved:(message:string)=>void}){
  const today=new Date().toISOString().slice(0,10);
  const finish=new Date(Date.now()+13*86400000).toISOString().slice(0,10);
  const [objectId,setObjectId]=useState(options.objects[0]?.id??"");
  const [specialtyId,setSpecialtyId]=useState(options.specialties[0]?.id??"");
  const [startDate,setStartDate]=useState(today);
  const [endDate,setEndDate]=useState(finish);
  const [workDays,setWorkDays]=useState(6);
  const [restDays,setRestDays]=useState(1);
  const [shiftKind,setShiftKind]=useState<"day"|"night"|"mixed">("day");
  const [startTime,setStartTime]=useState("08:00");
  const [endTime,setEndTime]=useState("20:00");
  const [demandCount,setDemandCount]=useState(1);
  const [workerIds,setWorkerIds]=useState<string[]>([]);
  const [reserveWorkerIds,setReserveWorkerIds]=useState<string[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const workers=options.workers.filter(worker=>worker.objectId===objectId&&(!specialtyId||worker.specialtyId===specialtyId));
  function selectWorker(id:string,mode:"primary"|"reserve"|"none"){
    setWorkerIds(current=>mode==="primary"?[...new Set([...current,id])]:current.filter(value=>value!==id));
    setReserveWorkerIds(current=>mode==="reserve"?[...new Set([...current,id])]:current.filter(value=>value!==id));
  }
  function applyPattern(work:number,rest:number){setWorkDays(work);setRestDays(rest)}
  async function save(){
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/shifts/series",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({objectId,specialtyId,startDate,endDate,startTime,endTime,shiftKind,demandCount,workDays,restDays,workerIds,reserveWorkerIds})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось создать график");
      const warningCount=Array.isArray(json.warnings)?json.warnings.length:0;
      onSaved(`График создан: ${json.created??0} смен. Дефицит: ${json.totalDeficit??0}${warningCount?`. Пропущено назначений: ${warningCount}`:""}`);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать график");}finally{setBusy(false)}
  }
  return <Portal><div className="recruiting-modal" onMouseDown={event=>{if(event.currentTarget===event.target)onClose()}}><div className="recruiting-modal-card schedule-modal">
    <div className="recruiting-modal-head"><div><h2>Создать график смен</h2><p>Система построит смены на период, проверит подтверждённые отсутствия и пересечения.</p></div><button className="icon-button" onClick={onClose}><X size={17}/></button></div>
    <div className="candidate-import-body">
      <div className="candidate-import-options">
        <label>Объект<select value={objectId} onChange={e=>{setObjectId(e.target.value);setWorkerIds([]);setReserveWorkerIds([])}}>{options.objects.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>Специальность<select value={specialtyId} onChange={e=>{setSpecialtyId(e.target.value);setWorkerIds([]);setReserveWorkerIds([])}}>{options.specialties.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>Начало<input type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
        <label>Окончание<input type="date" value={endDate} onChange={e=>setEndDate(e.target.value)}/></label>
        <label>Тип смены<select value={shiftKind} onChange={e=>setShiftKind(e.target.value as typeof shiftKind)}><option value="day">Дневная</option><option value="night">Ночная</option><option value="mixed">Смешанная</option></select></label>
        <label>Потребность<input type="number" min="1" value={demandCount} onChange={e=>setDemandCount(Number(e.target.value)||1)}/></label>
        <label>Начало смены<input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label>
        <label>Конец смены<input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label>
      </div>
      <div className="schedule-pattern-row"><strong>Цикл</strong><div className="segmented"><button type="button" className={workDays===6&&restDays===1?"active":""} onClick={()=>applyPattern(6,1)}>6/1</button><button type="button" className={workDays===7&&restDays===0?"active":""} onClick={()=>applyPattern(7,0)}>7/0</button><button type="button" className={workDays===5&&restDays===2?"active":""} onClick={()=>applyPattern(5,2)}>5/2</button></div><label>Рабочих<input type="number" min="1" max="31" value={workDays} onChange={e=>setWorkDays(Number(e.target.value)||1)}/></label><label>Выходных<input type="number" min="0" max="31" value={restDays} onChange={e=>setRestDays(Math.max(0,Number(e.target.value)||0))}/></label></div>
      <div className="schedule-workers"><div className="section-head"><div><h3>Состав на период</h3><p>Можно оставить пустым и закрыть смены позже. Подтверждённые отсутствия автоматически исключаются.</p></div><span className="cell-sub">{workers.length} доступно</span></div>
        <div className="schedule-worker-list">{workers.map(worker=>{const mode=workerIds.includes(worker.id)?"primary":reserveWorkerIds.includes(worker.id)?"reserve":"none";return <div className="schedule-worker-row" key={worker.id}><div><strong>{worker.fullName}</strong><small>{worker.specialty??"Специальность не указана"}</small></div><select value={mode} onChange={e=>selectWorker(worker.id,e.target.value as typeof mode)}><option value="none">Не назначен</option><option value="primary">Основной</option><option value="reserve">Резерв</option></select></div>})}{!workers.length&&<div className="empty-inline">На объекте пока нет сотрудников с этой специальностью.</div>}</div>
      </div>
      {error&&<div className="recruiting-error">{error}</div>}
    </div>
    <div className="recruiting-modal-footer"><button className="button" onClick={onClose}>Отмена</button><button className="button primary" disabled={busy||!objectId||!specialtyId||!startDate||!endDate} onClick={()=>void save()}>{busy?"Создаю…":"Создать график"}</button></div>
  </div></div></Portal>;
}

function AssignmentsModal({shift,options,onClose,onSaved}:{shift:ShiftRow;options:OperationsReferenceData;onClose:()=>void;onSaved:(message:string)=>void}){
  const [workerIds,setWorkerIds]=useState<string[]>(shift.workerIds??[]);
  const [reserveWorkerIds,setReserveWorkerIds]=useState<string[]>(shift.reserveWorkerIds??[]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const workers=options.workers.filter(worker=>worker.objectId===shift.objectId&&worker.specialtyId===shift.specialtyId);
  function selectWorker(id:string,mode:"primary"|"reserve"|"none"){
    setWorkerIds(current=>mode==="primary"?[...new Set([...current,id])]:current.filter(value=>value!==id));
    setReserveWorkerIds(current=>mode==="reserve"?[...new Set([...current,id])]:current.filter(value=>value!==id));
  }
  async function save(){
    setBusy(true);setError("");
    try{
      const response=await fetch(`/api/shifts/${shift.id}/assignments`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({workerIds,reserveWorkerIds})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(Array.isArray(json.warnings)?json.warnings.join("; "):json.error??"Не удалось изменить смену");
      onSaved(`Состав смены обновлён: ${json.assigned??0} основных, ${json.reserve??0} резерв, дефицит ${json.deficit??0}.`);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить смену")}finally{setBusy(false)}
  }
  return <Portal><div className="recruiting-modal" onMouseDown={event=>{if(event.currentTarget===event.target)onClose()}}><div className="recruiting-modal-card schedule-modal">
    <div className="recruiting-modal-head"><div><h2>Состав смены</h2><p>{shift.object} · {shift.specialty} · {shift.date} · {shift.time}</p></div><button className="icon-button" onClick={onClose}><X size={17}/></button></div>
    <div className="candidate-import-body"><div className="schedule-worker-list">{workers.map(worker=>{const mode=workerIds.includes(worker.id)?"primary":reserveWorkerIds.includes(worker.id)?"reserve":"none";return <div className="schedule-worker-row" key={worker.id}><div><strong>{worker.fullName}</strong><small>{worker.specialty??"—"}</small></div><select value={mode} onChange={e=>selectWorker(worker.id,e.target.value as typeof mode)}><option value="none">Не назначен</option><option value="primary">Основной</option><option value="reserve">Резерв</option></select></div>})}{!workers.length&&<div className="empty-inline">Нет доступных сотрудников по этой специальности.</div>}</div>{error&&<div className="recruiting-error">{error}</div>}</div>
    <div className="recruiting-modal-footer"><button className="button" onClick={onClose}>Отмена</button><button className="button primary" disabled={busy} onClick={()=>void save()}>{busy?"Сохраняю…":"Сохранить состав"}</button></div>
  </div></div></Portal>;
}

function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
