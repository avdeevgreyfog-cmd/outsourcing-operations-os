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
  const [revision,setRevision]=useState(0);
  const [focusDate,setFocusDate]=useState(today);
  const dates=useMemo(()=>Array.from({length:7},(_,i)=>addDays(start,i)),[start]);
  const end=dates.at(-1)!;

  useEffect(()=>{
    if(demo)return;
    const controller=new AbortController();
    fetch(`/api/objects/${objectId}/shift-plan?start=${start}&end=${end}`,{signal:controller.signal})
      .then(async response=>{const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось загрузить план смен");setPlanner(json as PlannerData)})
      .catch(error=>{if(error instanceof DOMException&&error.name==="AbortError")return;setMessage(error instanceof Error?error.message:"Не удалось загрузить план смен")});
    return()=>controller.abort();
  },[objectId,start,end,demo,revision]);

  const map=useMemo(()=>{
    const out=new Map<string,Kind>();
    if(planner){
      for(const row of planner.assignments){
        if(row.reserve)continue;
        out.set(`${row.workerId}:${row.date}`,row.kind==="night"?"night":"day");
      }
    }else{
      for(const shift of rows){
        if(!shift.dateIso)continue;
        const kind=normalizeKind(shift.kind);
        for(const id of shift.workerIds)out.set(`${id}:${shift.dateIso}`,kind);
      }
    }
    return out;
  },[planner,rows]);
  const reserveMap=useMemo(()=>{
    const out=new Map<string,Kind>();
    if(planner){for(const row of planner.assignments)if(row.reserve)out.set(`${row.workerId}:${row.date}`,row.kind==="night"?"reserve_night":"reserve_day")}
    else for(const shift of rows)if(shift.dateIso)for(const id of shift.reserveWorkerIds)out.set(`${id}:${shift.dateIso}`,normalizeKind(shift.kind)==="night"?"reserve_night":"reserve_day");
    return out;
  },[planner,rows]);
  const entryMap=useMemo(()=>{const out=new Map<string,PlannerEntry>();for(const row of planner?.entries??[])out.set(`${row.workerId}:${row.date}`,row);return out},[planner]);
  const demandRows=planner?.demand??[];

  function absenceFor(worker:WorkerRow,date:string):PlannerAbsence|null{
    const local=absenceOverrides[worker.id];
    if(local&&local.from<=date&&local.to>=date)return {workerId:worker.id,type:local.type,from:local.from,to:local.to,status:"confirmed"};
    const api=(planner?.absences??[]).find(item=>item.workerId===worker.id&&item.from<=date&&(!item.to||item.to>=date));
    if(api)return api;
    if(worker.absenceStatus==="confirmed"&&worker.absenceFrom&&worker.absenceFrom<=date&&(!worker.absenceTo||worker.absenceTo>=date))return {workerId:worker.id,type:worker.absenceType??"other",from:worker.absenceFrom,to:worker.absenceTo??null,status:"confirmed"};
    return null;
  }
  function scheduleKind(worker:WorkerRow,date:string):Kind{
    if(worker.scheduleWorkDays==null||worker.scheduleRestDays==null||!worker.startDate||worker.scheduleWorkDays<1||date<worker.startDate)return "";
    const anchor=worker.scheduleAnchorDate??worker.startDate;const cycle=worker.scheduleWorkDays+worker.scheduleRestDays;
    const diff=Math.floor((Date.parse(date+"T00:00:00Z")-Date.parse(anchor+"T00:00:00Z"))/86400000);
    const offset=((diff%cycle)+cycle)%cycle;if(offset>=worker.scheduleWorkDays)return "off";
    return worker.scheduleShiftKind==="night"?"night":"day";
  }
  function planned(worker:WorkerRow,date:string):Kind{
    const key=`${worker.id}:${date}`;const absence=absenceFor(worker,date);
    if(absence)return absence.type==="intershift"?"intershift":absence.type==="vacation"?"vacation":"off";
    if(overrides[key]!==undefined)return overrides[key] as Kind;
    const actual=map.get(key);if(actual)return actual;
    const reserve=reserveMap.get(key);if(reserve)return reserve;
    const entry=entryMap.get(key);
    if(entry&&!isFactual(entry)&&entry.source==="schedule"){if(entry.timeCode==="DAY_OFF")return "off";if(entry.plannedShiftKind==="night")return "night";if(entry.plannedShiftKind)return "day"}
    if(date<today)return "";
    return scheduleKind(worker,date);
  }

  function demandTotal(date:string,specialty?:string){
    if(planner)return demandRows.filter(row=>row.date===date&&(!specialty||row.specialty===specialty)).reduce((sum,row)=>sum+Number(row.required),0);
    const filtered=rows.filter(row=>row.dateIso===date&&(!specialty||row.specialty===specialty));const bySpecialty=new Map<string,number>();
    for(const row of filtered)bySpecialty.set(row.specialty,Math.max(bySpecialty.get(row.specialty)??0,Number(row.demand??0)));
    return [...bySpecialty.values()].reduce((sum,value)=>sum+value,0);
  }
  function countsFor(date:string,specialty?:string){
    let plan=0,reserve=0,suggested=0,fact=0;
    for(const worker of workers){
      if(specialty&&(worker.specialty??"Без специальности")!==specialty)continue;
      const key=`${worker.id}:${date}`,entry=entryMap.get(key),value=planned(worker,date);
      const scheduleEntryPlan=Boolean(entry&&!isFactual(entry)&&entry.timeCode==="PLANNED"&&entry.plannedShiftKind);
      if(entry&&isFactual(entry)&&(Number(entry.factHours)>0||entry.timeCode==="WORK_PENDING"))fact++;
      if(map.has(key)||scheduleEntryPlan)plan++;else if(reserveMap.has(key))reserve++;else if(date>=today&&(value==="day"||value==="night"))suggested++;
    }
    return {plan,reserve,suggested,fact};
  }
  function dateLocked(date:string){return Boolean(planner?.lockedRanges.some(range=>range.from<=date&&range.to>=date))}
  function cellState(worker:WorkerRow,date:string):CellState{
    const key=`${worker.id}:${date}`,entry=entryMap.get(key),fact=isFactual(entry),absence=absenceFor(worker,date);
    const scheduleEntryPlan:Kind=!fact&&entry?(entry.source==="schedule"&&entry.timeCode==="DAY_OFF"?"off":entry.timeCode==="PLANNED"?(entry.plannedShiftKind==="night"?"night":entry.plannedShiftKind?"day":""):""):"";
    const plan=map.get(key)??reserveMap.get(key)??scheduleEntryPlan;
    if(fact&&entry){
      const label=entry.timeCode==="WORK"?(Number(entry.factHours)>0?formatHours(entry.factHours):"—"):(factLabels[entry.timeCode]??entry.timeCode);
      const factKind=Number(entry.nightHours)>0&&Number(entry.dayHours)<=0?"night":Number(entry.dayHours)>0?"day":entry.plannedShiftKind==="night"?"night":entry.plannedShiftKind==="day"?"day":"";
      const mismatch=Boolean(plan&&["day","night"].includes(plan)&&factKind&&plan!==factKind);const attention=["WORK_PENDING","NO_SHOW","SICK","ABSENCE"].includes(entry.timeCode)||mismatch;
      return {kind:factKind as Kind,label,source:"fact",editable:false,attention,factWithoutPlan:!plan,title:`Факт из табеля: ${label}. План: ${plan?shortKind(plan):"не было"}`};
    }
    if(absence){const kind:Kind=absence.type==="intershift"?"intershift":absence.type==="vacation"?"vacation":"off";return {kind,label:shortKind(kind),source:"absence",editable:false,attention:Boolean(plan),factWithoutPlan:false,title:absence.type==="intershift"?"Межвахта":absence.type==="vacation"?"Отпуск":"Согласованный выходной"};}
    if(plan){const attention=date<today;return {kind:plan,label:shortKind(plan),source:"plan",editable:canEdit&&!dateLocked(date),attention,factWithoutPlan:false,title:attention?"План за прошедшую дату не закрыт в табеле":plan.startsWith("reserve")?"Резерв":"Зафиксированный план"};}
    const suggested=date>=today?scheduleKind(worker,date):"";
    if(suggested)return {kind:suggested,label:shortKind(suggested),source:"suggested",editable:canEdit&&!dateLocked(date),attention:false,factWithoutPlan:false,title:"Рассчитано по графику, ещё не зафиксировано"};
    const attention=date>=today&&worker.scheduleWorkDays==null;return {kind:"",label:"—",source:"none",editable:canEdit&&!dateLocked(date),attention,factWithoutPlan:false,title:attention?"Не задан график сотрудника":"Плана нет"};
  }
  function workerNeedsAttention(worker:WorkerRow){return dates.some(date=>cellState(worker,date).attention)}
  async function persistCells(cells:Array<{workerId:string;date:string;kind:PaintKind}>){
    if(!canEdit||!cells.length)return;
    const key=cells.length===1?`${cells[0].workerId}:${cells[0].date}`:"bulk";setBusy(key);setMessage("");
    const before={...overrides};setOverrides(current=>{const next={...current};for(const cell of cells)next[`${cell.workerId}:${cell.date}`]=cell.kind==="clear"?"":cell.kind;return next});
    try{
      if(!demo){
        const response=await fetch(`/api/objects/${objectId}/shift-plan`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(cells.length===1?{action:"set_cell",...cells[0]}:{action:"set_cells",cells})});
        const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось изменить план");
      }
      setMessage(cells.length===1?"План выхода изменён":`Изменено ячеек: ${cells.length}`);
      if(!demo){setOverrides({});setRevision(value=>value+1)}
    }catch(error){setOverrides(before);setMessage(error instanceof Error?error.message:"Не удалось изменить план")}
    finally{setBusy("")}
  }

  async function generate(){
    if(!canEdit)return;const generateStart=start<today?today:start;
    if(generateStart>end){setMessage("Неделя уже завершена. Прошлые даты отображаются по факту табеля.");return}
    setBusy("generate");setMessage("");
    try{
      if(!demo){
        const response=await fetch(`/api/objects/${objectId}/shift-plan`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"generate",startDate:generateStart,endDate:end,workerIds:selected.size?[...selected]:undefined})});
        const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сформировать график");
        const skipped=[json.skippedFact&&`факт ${json.skippedFact}`,json.skippedAbsence&&`отсутствия ${json.skippedAbsence}`,json.skippedExisting&&`уже запланировано ${json.skippedExisting}`].filter(Boolean).join(" · ");
        setMessage(`Зафиксировано по графикам: ${json.updated??0}${skipped?" · пропущено: "+skipped:""}`);setOverrides({});setRevision(value=>value+1);
      }else setMessage("Демо: план сформирован с текущей даты");
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось сформировать график")}
    finally{setBusy("")}
  }

  const specialties=[...new Set([...workers.map(worker=>worker.specialty??"Без специальности"),...demandRows.map(row=>row.specialty)])].sort((a,b)=>a.localeCompare(b,"ru"));
  const visibleWorkers=mode==="attention"?workers.filter(workerNeedsAttention):workers;
  const attentionCount=workers.filter(workerNeedsAttention).length;
  const weekSummary=dates.reduce((acc,date)=>{const required=demandTotal(date),counts=countsFor(date),coverage=date<today?counts.fact:counts.plan;acc.required+=required;acc.plan+=coverage;acc.reserve+=counts.reserve;acc.suggested+=date>=today?counts.suggested:0;acc.deficit+=Math.max(required-coverage,0);return acc},{required:0,plan:0,reserve:0,suggested:0,deficit:0});
  const focusGaps=specialties.map(name=>{const required=demandTotal(focusDate,name),counts=countsFor(focusDate,name),coverage=focusDate<today?counts.fact:counts.plan;return {name,required,plan:coverage,reserve:counts.reserve,suggested:focusDate>=today?counts.suggested:0,gap:Math.max(required-coverage,0)}}).filter(row=>row.required>0||row.plan>0||row.suggested>0).sort((a,b)=>b.gap-a.gap||a.name.localeCompare(b.name,"ru"));

  function toggleWorker(id:string){setSelected(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next})}
  function toggleAll(){setSelected(current=>current.size===visibleWorkers.length?new Set():new Set(visibleWorkers.map(worker=>worker.id)))}
  function applyDate(date:string){setFocusDate(date);if(!selected.size)return;void persistCells([...selected].map(workerId=>({workerId,date,kind:paint})))}
  function applySelectedRange(scope:"workweek"|"week"){
    if(!selected.size){setMessage("Сначала выберите сотрудников");return}
    const targetDates=dates.filter(date=>date>=today&&(scope==="week"||![0,6].includes(new Date(date+"T00:00:00Z").getUTCDay())));
    const cells=targetDates.flatMap(date=>[...selected].filter(workerId=>{
      const worker=workers.find(item=>item.id===workerId);return worker?cellState(worker,date).editable:false;
    }).map(workerId=>({workerId,date,kind:paint})));
    if(!cells.length){setMessage("В выбранном диапазоне нет доступных для планирования ячеек");return}
    void persistCells(cells);
  }
  function closeGapBySchedule(specialty:string,date:string,gap:number){
    const candidates=workers.filter(worker=>(worker.specialty??"Без специальности")===specialty).map(worker=>({worker,state:cellState(worker,date)}))
      .filter(item=>item.state.source==="suggested"&&(item.state.kind==="day"||item.state.kind==="night")&&item.state.editable).slice(0,gap);
    if(!candidates.length){setMessage("Нет доступных сотрудников по графику для закрытия дефицита");return}
    void persistCells(candidates.map(item=>({workerId:item.worker.id,date,kind:item.state.kind as "day"|"night"})));
  }

  async function planAbsence(){
    if(!canPlanAbsence)return;if(!selected.size){setMessage("Выберите сотрудников, которым нужно запланировать отсутствие");return}
    if(!absenceFrom||!absenceTo||absenceTo<absenceFrom){setMessage("Проверьте даты отсутствия");return}
    const selectedIds=[...selected];setBusy("absence");setMessage("");
    try{
      if(!demo)for(const workerId of selectedIds){const response=await fetch(`/api/workers/${workerId}/absences`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({absenceType,status:"confirmed",plannedFrom:absenceFrom,plannedTo:absenceTo,flexibleReturn:absenceType==="intershift",note:absenceNote||null})});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить отсутствие")}
      setAbsenceOverrides(current=>{const next={...current};for(const workerId of selectedIds)next[workerId]={type:absenceType,from:absenceFrom,to:absenceTo};return next});
      setMessage(`${absenceType==="intershift"?"Межвахта":absenceType==="vacation"?"Отпуск":"Выходной"}: запланировано для ${selectedIds.length} чел.`);setAbsenceOpen(false);if(!demo)setRevision(value=>value+1);
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось запланировать отсутствие")}
    finally{setBusy("")}
  }
  return <div className="object-shift-planner object-shift-workbench">
    <div className="object-shift-planner-toolbar">
      <div className="page-actions">
        <button className="button" onClick={()=>{const next=addDays(start,-7);setStart(next);setFocusDate(next)}}>← Неделя</button>
        <button className="button" onClick={()=>{setStart(today);setFocusDate(today)}}>Сегодня</button>
        <button className="button" onClick={()=>{const next=addDays(start,7);setStart(next);setFocusDate(next)}}>Неделя →</button>
        <strong>{formatRange(start,end)}</strong>
      </div>
      <div className="page-actions">
        <div className="segmented"><button className={mode==="workers"?"active":""} onClick={()=>setMode("workers")}>По сотрудникам</button><button className={mode==="specialties"?"active":""} onClick={()=>setMode("specialties")}>По специальностям</button><button className={mode==="attention"?"active":""} onClick={()=>setMode("attention")}>Требует внимания{attentionCount?` · ${attentionCount}`:""}</button></div>
        {canEdit&&<button className="button primary" disabled={busy==="generate"} onClick={()=>void generate()}>{selected.size?"По графику выбранных":"Сформировать с сегодня"}</button>}
      </div>
    </div>

    <div className="object-shift-week-summary">
      <div><span>Потребность</span><strong>{weekSummary.required}</strong><small>человеко-выходов</small></div>
      <div><span>План / факт</span><strong>{weekSummary.plan}</strong><small>{weekSummary.suggested?`ещё ${weekSummary.suggested} рассчитано`:"закрыто планом или фактом"}</small></div>
      <div className={weekSummary.deficit?"is-attention":""}><span>Дефицит</span><strong>{weekSummary.deficit}</strong><small>{weekSummary.deficit?"нужно закрыть":"план закрыт"}</small></div>
      <div><span>Резерв</span><strong>{weekSummary.reserve}</strong><small>не передаётся в табель как план</small></div>
    </div>

    <div className="object-shift-guidance">
      <div><strong>План → факт</strong><span>Прошедшие даты читаются из табеля. Серые будущие значения рассчитаны по графику; «Сформировать с сегодня» фиксирует их как план.</span></div>
      {canEdit&&!selected.size&&<div className="object-shift-paint"><span>Клик по ячейке:</span>{(["day","night","off","reserve_day","reserve_night","clear"] as PaintKind[]).map(kind=><button type="button" key={kind} className={paint===kind?"active":""} onClick={()=>setPaint(kind)}><b>{paintCode(kind)}</b>{paintLabels[kind]}</button>)}</div>}
    </div>

    {selected.size>0&&<div className="object-shift-bulkbar">
      <div><strong>Выбрано: {selected.size}</strong><span>Выберите действие и нажмите нужную дату.</span></div>
      <div className="object-shift-paint">
        {(["day","night","off","reserve_day","reserve_night","clear"] as PaintKind[]).map(kind=><button type="button" key={kind} className={paint===kind?"active":""} onClick={()=>setPaint(kind)}><b>{paintCode(kind)}</b>{paintLabels[kind]}</button>)}
      </div>
      <div className="page-actions object-shift-range-actions"><button className="button" type="button" onClick={()=>applySelectedRange("workweek")}>На Пн–Пт</button><button className="button" type="button" onClick={()=>applySelectedRange("week")}>На неделю</button></div>
      {canPlanAbsence&&<button className="button" type="button" onClick={()=>setAbsenceOpen(value=>!value)}>Межвахта / отпуск</button>}
      <button className="button" type="button" onClick={()=>setSelected(new Set())}>Снять выбор</button>
    </div>}

    {absenceOpen&&<div className="object-shift-absence-panel">
      <div><strong>Плановое отсутствие</strong><span>Сотрудник исключается из плановых смен, период автоматически отображается в табеле.</span></div>
      <label>Тип<select value={absenceType} onChange={event=>setAbsenceType(event.target.value as AbsenceKind)}><option value="intershift">Межвахта</option><option value="vacation">Отпуск</option><option value="personal">Согласованный выходной</option></select></label>
      <label>С<input type="date" min={today} value={absenceFrom} onChange={event=>{setAbsenceFrom(event.target.value);if(absenceTo<event.target.value)setAbsenceTo(event.target.value)}}/></label>
      <label>По<input type="date" min={absenceFrom} value={absenceTo} onChange={event=>setAbsenceTo(event.target.value)}/></label>
      <label className="note">Комментарий<input value={absenceNote} onChange={event=>setAbsenceNote(event.target.value)} placeholder="Необязательно"/></label>
      <div className="page-actions"><button className="button" type="button" onClick={()=>setAbsenceOpen(false)}>Отмена</button><button className="button primary" type="button" disabled={busy==="absence"} onClick={()=>void planAbsence()}>{busy==="absence"?"Сохраняем…":"Запланировать"}</button></div>
    </div>}

    <div className="object-shift-legend">
      <span><b>11</b> факт табеля</span><span><b>Д</b> план день</span><span><b>Н</b> план ночь</span><span><b>РД / РН</b> резерв</span><span><b>В</b> выходной</span><span><b>МВ</b> межвахта</span><span><b>О</b> отпуск</span>
      <span className="object-shift-suggested-key">Серое значение — расчёт по графику, ещё не зафиксированный план.</span>
    </div>
    {message&&<div className="object-staffing-message">{message}</div>}

    <div className="object-shift-coverage">
      {dates.map(date=>{const required=demandTotal(date),counts=countsFor(date),past=date<today,coverage=past?counts.fact:counts.plan,deficit=Math.max(required-coverage,0);return <button type="button" key={date} onClick={()=>applyDate(date)} className={`${deficit?"has-deficit":""} ${focusDate===date?"active":""}`}><span>{weekday(date)} · {shortDate(date)}</span><strong>{past?"Факт":"План"} {coverage}/{required||"—"}</strong><small>{past?(deficit?`Не хватило: ${deficit}`:"Факт закрыт"):(deficit?`Дефицит: ${deficit}`:"План закрыт")}{counts.reserve?` · резерв ${counts.reserve}`:""}</small>{!past&&counts.suggested>0&&<small>По графикам ещё +{counts.suggested}</small>}</button>})}
    </div>

    <div className="object-shift-deficit-panel">
      <div><strong>{weekday(focusDate)} · {shortDate(focusDate)}</strong><span>Потребность и покрытие по специальностям</span></div>
      <div className="object-shift-deficit-list">{focusGaps.length?focusGaps.map(row=><span key={row.name} className={row.gap?"has-gap":""}><b>{row.name}</b> {row.plan}/{row.required||"—"}{row.reserve?` · резерв ${row.reserve}`:""}{row.gap?` · −${row.gap}`:""}{focusDate>=today&&row.gap>0&&row.suggested>0&&<button type="button" onClick={()=>closeGapBySchedule(row.name,focusDate,row.gap)}>Закрыть по графику</button>}</span>):<span>Нет активной потребности на эту дату</span>}</div>
      <div className="page-actions"><Link className="button" href={`/needs?object=${objectId}`}>Потребности</Link><Link className="button" href={`/recruiting?object=${objectId}`}>Подбор</Link></div>
    </div>

    {mode!=="specialties"?<div className="request-table-wrap"><table className="data-table object-shift-matrix">
      <thead><tr>
        {(canEdit||canPlanAbsence)&&<th className="object-shift-select"><input type="checkbox" aria-label="Выбрать всех" checked={visibleWorkers.length>0&&selected.size===visibleWorkers.length} onChange={toggleAll}/></th>}
        <th className="sticky-col">Сотрудник</th><th>График</th>
        {dates.map(date=><th key={date} className={focusDate===date?"is-focus":""}><button type="button" className="object-shift-date-button" onClick={()=>applyDate(date)}><span>{weekday(date)}</span>{shortDate(date)}</button></th>)}
      </tr></thead>
      <tbody>{visibleWorkers.map(worker=><tr key={worker.id} className={workerNeedsAttention(worker)?"has-attention":""}>
        {(canEdit||canPlanAbsence)&&<td className="object-shift-select"><input type="checkbox" aria-label={`Выбрать ${worker.fullName}`} checked={selected.has(worker.id)} onChange={()=>toggleWorker(worker.id)}/></td>}
        <td className="sticky-col"><Link className="cell-title" href={`/workers/${worker.id}`}>{worker.fullName}</Link><span className="cell-sub">{worker.specialty??"—"}{worker.phone&&<> · <a href={`tel:${worker.phone.replace(/[^+\d]/g,"")}`}>{worker.phone}</a></>}</span>{workerNeedsAttention(worker)&&<small className="object-shift-worker-alert">Есть незакрытые исключения</small>}</td>
        <td><strong>{worker.scheduleWorkDays!=null&&worker.scheduleRestDays!=null?`${worker.scheduleWorkDays}/${worker.scheduleRestDays}`:"Не задан"}</strong><span className="cell-sub">{worker.scheduleShiftKind==="night"?"Ночь":worker.scheduleShiftKind==="day"?"День":worker.scheduleShiftKind==="mixed"?"Д/Н":"—"}</span></td>
        {dates.map(date=>{const state=cellState(worker,date),key=`${worker.id}:${date}`;return <td key={date} className={`object-shift-cell is-${state.kind||"empty"} source-${state.source} ${state.attention?"has-attention":""} ${state.factWithoutPlan?"fact-without-plan":""} ${focusDate===date?"is-focus":""}`} title={state.title}>{canEdit?<button type="button" className="object-shift-cell-button" disabled={!state.editable||busy===key||busy==="bulk"} onClick={()=>void persistCells([{workerId:worker.id,date,kind:paint}])}>{state.label}</button>:<b>{state.label}</b>}{state.attention&&<i className="object-shift-attention-dot" aria-hidden="true"/>}</td>})}
      </tr>)}</tbody>
    </table>{mode==="attention"&&!visibleWorkers.length&&<div className="sales-empty object-shift-empty">На этой неделе нет сотрудников, требующих внимания.</div>}</div>
    :<div className="request-table-wrap"><table className="data-table object-shift-specialty">
      <thead><tr><th>Специальность</th>{dates.map(date=><th key={date} className={focusDate===date?"is-focus":""}>{shortDate(date)}</th>)}</tr></thead>
      <tbody>{specialties.map(name=><tr key={name}><td className="cell-title">{name}</td>{dates.map(date=>{const required=demandTotal(date,name),counts=countsFor(date,name),coverage=date<today?counts.fact:counts.plan,gap=Math.max(required-coverage,0);return <td key={date} className={`${gap?"object-shift-deficit":""} ${focusDate===date?"is-focus":""}`}><strong>{date<today?"Факт":"План"} {coverage}/{required||"—"}</strong><span className="cell-sub">резерв {counts.reserve||"—"}{counts.suggested?` · расчёт +${counts.suggested}`:""}</span>{gap>0&&<small>−{gap}</small>}</td>})}</tr>)}</tbody>
    </table></div>}

    <div className="section-actions"><Link className="button primary" href={`/objects/${objectId}?tab=timesheets`}>Перейти к факту в табеле</Link><Link className="button" href={`/shifts?object=${objectId}`}>Расширенный список смен</Link></div>
  </div>;}
function isFactual(entry:PlannerEntry|undefined){
  if(!entry)return false;
  if(entry.source==="schedule")return Number(entry.factHours)>0||["WORK_PENDING","NO_SHOW","SICK","ABSENCE"].includes(entry.timeCode);
  if(entry.timeCode==="PLANNED")return false;
  if(entry.timeCode==="WORK")return Number(entry.factHours)>0;
  return true;
}
function normalizeKind(value:string):Kind{if(value==="day"||value==="День")return"day";if(value==="night"||value==="Ночь")return"night";if(value==="off"||value==="Выходной")return"off";return""}
function shortKind(value:Kind){return value==="day"?"Д":value==="night"?"Н":value==="off"?"В":value==="reserve_day"?"РД":value==="reserve_night"?"РН":value==="intershift"?"МВ":value==="vacation"?"О":"—"}
function paintCode(value:PaintKind){return value==="clear"?"×":shortKind(value)}
function formatHours(value:number|string){const amount=Number(value);return Number.isInteger(amount)?String(amount):String(amount).replace(".",",")}
function addDays(value:string,n:number){const date=new Date(value+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+n);return date.toISOString().slice(0,10)}
function shortDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function weekday(value:string){return new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z")).replace(".","")}
function formatRange(a:string,b:string){return `${new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",timeZone:"UTC"}).format(new Date(a+"T00:00:00Z"))} — ${new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(b+"T00:00:00Z"))}`}
