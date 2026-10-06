"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, UsersRound, X } from "lucide-react";
import { KeyValue, Metric, Status } from "@/components/UI";
import { rub } from "@/lib/ui/format";
import type { ShiftRow } from "@/lib/data/service";
import type { OperationsReferenceData } from "@/lib/operations/service";

type ShiftView="calendar"|"list"|"workers";

const kindLabels:Record<string,string>={day:"День",night:"Ночь",mixed:"Смешанная"};
const statusLabels:Record<string,string>={open:"Открыта",planned:"Запланирована",closed:"Закрыта",cancelled:"Отменена"};

function isoToday(){return new Date().toISOString().slice(0,10)}
function addIso(value:string,days:number){const date=new Date(value+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function monday(value:string){const date=new Date(value+"T00:00:00Z");const day=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-day);return date.toISOString().slice(0,10)}
function displayDay(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function weekday(value:string){return new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z")).replace(".","")}

export function ResourceScheduler({rows,options,canEdit}:{rows:ShiftRow[];options:OperationsReferenceData;canEdit:boolean}){
  const router=useRouter();
  const [view,setView]=useState<ShiftView>("calendar");
  const [week,setWeek]=useState(monday(isoToday()));
  const [manager,setManager]=useState("all");
  const [objectId,setObjectId]=useState("all");
  const [specialtyId,setSpecialtyId]=useState("all");
  const [kind,setKind]=useState("all");
  const [deficitOnly,setDeficitOnly]=useState(false);
  const [selected,setSelected]=useState<ShiftRow|null>(null);
  const [showCreate,setShowCreate]=useState(false);
  const [showAssignments,setShowAssignments]=useState(false);
  const [message,setMessage]=useState("");

  const dates=useMemo(()=>Array.from({length:7},(_,index)=>addIso(week,index)),[week]);
  const dateSet=useMemo(()=>new Set(dates),[dates]);
  const objectMap=useMemo(()=>new Map(options.objects.map(row=>[row.id,row])),[options.objects]);
  const managerOptions=useMemo(()=>[...new Map(options.objects.map(row=>[row.ownerUserId??"unassigned",row.ownerName??"Менеджер не назначен"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[options.objects]);
  const objectOptions=useMemo(()=>options.objects.filter(row=>manager==="all"||(row.ownerUserId??"unassigned")===manager),[options.objects,manager]);

  const scoped=useMemo(()=>rows.filter(row=>{
    const object=objectMap.get(row.objectId);
    if(manager!=="all"&&(object?.ownerUserId??"unassigned")!==manager)return false;
    if(objectId!=="all"&&row.objectId!==objectId)return false;
    if(specialtyId!=="all"&&row.specialtyId!==specialtyId)return false;
    if(kind!=="all"&&row.kind!==kind)return false;
    if(deficitOnly&&row.deficit<=0)return false;
    return true;
  }),[rows,objectMap,manager,objectId,specialtyId,kind,deficitOnly]);
  const visible=useMemo(()=>scoped.filter(row=>row.dateIso&&dateSet.has(row.dateIso)),[scoped,dateSet]);
  const demand=visible.reduce((sum,row)=>sum+row.demand,0);
  const assigned=visible.reduce((sum,row)=>sum+row.assigned,0);
  const confirmed=visible.reduce((sum,row)=>sum+Number(row.confirmed??0),0);
  const deficit=visible.reduce((sum,row)=>sum+Math.max(0,row.deficit),0);

  const managerGroups=useMemo(()=>{
    const map=new Map<string,{id:string;name:string;objects:Map<string,{id:string;name:string;rows:ShiftRow[]}>}>();
    for(const row of visible){
      const object=objectMap.get(row.objectId);
      const managerId=object?.ownerUserId??"unassigned",managerName=object?.ownerName??"Менеджер не назначен";
      const group=map.get(managerId)??{id:managerId,name:managerName,objects:new Map()};
      const objectGroup=group.objects.get(row.objectId)??{id:row.objectId,name:row.object,rows:[]};
      objectGroup.rows.push(row);group.objects.set(row.objectId,objectGroup);map.set(managerId,group);
    }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  },[visible,objectMap]);

  const workerSchedule=useMemo(()=>{
    const workers=new Map(options.workers.map(row=>[row.id,row]));
    return options.workers.filter(worker=>{
      if(objectId!=="all"&&worker.objectId!==objectId)return false;
      if(specialtyId!=="all"&&worker.specialtyId!==specialtyId)return false;
      const object=worker.objectId?objectMap.get(worker.objectId):null;
      if(manager!=="all"&&(object?.ownerUserId??"unassigned")!==manager)return false;
      return visible.some(row=>row.workerIds.includes(worker.id)||row.reserveWorkerIds.includes(worker.id));
    }).map(worker=>({
      worker,
      cells:Object.fromEntries(dates.map(date=>{
        const shifts=visible.filter(row=>row.dateIso===date&&(row.workerIds.includes(worker.id)||row.reserveWorkerIds.includes(worker.id)));
        const labels=shifts.map(row=>row.reserveWorkerIds.includes(worker.id)?"Р":row.kind==="night"?"Н":row.kind==="day"?"Д":"С");
        return [date,labels.join("/")];
      })),
    })).sort((a,b)=>(a.worker.object??"").localeCompare(b.worker.object??"","ru")||a.worker.fullName.localeCompare(b.worker.fullName,"ru"));
  },[options.workers,visible,dates,objectMap,manager,objectId,specialtyId]);

  const hasFilters=manager!=="all"||objectId!=="all"||specialtyId!=="all"||kind!=="all"||deficitOnly;
  const weekLabel=displayDay(dates[0])+"–"+displayDay(dates[6]);

  return <>
    <div className="metrics-grid personnel-portfolio-metrics">
      <div className="metric"><span>Потребность</span><strong>{demand}</strong><small>человеко-выходов за неделю</small></div>
      <div className="metric"><span>Назначено</span><strong>{assigned}</strong><small>{Math.round(assigned/Math.max(1,demand)*100)}% покрытия</small></div>
      <div className={"metric "+(confirmed<assigned?"tone-warn":"tone-good")}><span>Подтверждено</span><strong>{confirmed}</strong><small>из {assigned} назначенных</small></div>
      <div className={"metric "+(deficit?"tone-bad":"tone-good")}><span>Дефицит</span><strong>{deficit}</strong><small>по сменам выбранной недели</small></div>
    </div>

    <div className="object-local-tabs personnel-portfolio-tabs" role="tablist" aria-label="Представление графиков и смен">
      <button type="button" className={view==="calendar"?"active":""} onClick={()=>setView("calendar")}>Календарь</button>
      <button type="button" className={view==="list"?"active":""} onClick={()=>setView("list")}>Список смен <span>{visible.length}</span></button>
      <button type="button" className={view==="workers"?"active":""} onClick={()=>setView("workers")}>Графики сотрудников <span>{workerSchedule.length}</span></button>
    </div>

    <div className="scheduler-controls personnel-portfolio-toolbar">
      <div className="personnel-portfolio-filters">
        <div className="shift-week-navigation"><button className="icon-button" type="button" onClick={()=>setWeek(value=>addIso(value,-7))} aria-label="Предыдущая неделя"><ChevronLeft size={15}/></button><button className="button shift-week-current" type="button" onClick={()=>setWeek(monday(isoToday()))}>{weekLabel}</button><button className="icon-button" type="button" onClick={()=>setWeek(value=>addIso(value,7))} aria-label="Следующая неделя"><ChevronRight size={15}/></button></div>
        <select value={manager} onChange={event=>{setManager(event.target.value);setObjectId("all")}} aria-label="Менеджер"><option value="all">Все менеджеры</option>{managerOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select value={objectId} onChange={event=>setObjectId(event.target.value)} aria-label="Объект"><option value="all">Все объекты</option>{objectOptions.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <select value={specialtyId} onChange={event=>setSpecialtyId(event.target.value)} aria-label="Специальность"><option value="all">Все профессии</option>{options.specialties.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>
        <select value={kind} onChange={event=>setKind(event.target.value)} aria-label="Смена"><option value="all">Все смены</option><option value="day">День</option><option value="night">Ночь</option><option value="mixed">Смешанная</option></select>
        <button type="button" className={"button "+(deficitOnly?"active":"")} onClick={()=>setDeficitOnly(value=>!value)}>Только дефицит</button>
        {hasFilters&&<button type="button" className="button" onClick={()=>{setManager("all");setObjectId("all");setSpecialtyId("all");setKind("all");setDeficitOnly(false)}}>Сбросить</button>}
      </div>
      {canEdit&&<button className="button primary" type="button" onClick={()=>setShowCreate(true)}><Plus size={14}/> Создать график</button>}
    </div>

    {message&&<div className="summary-strip"><span>{message}</span></div>}

    {view==="calendar"&&<div className="personnel-portfolio-groups shift-portfolio-calendar">
      {managerGroups.map(group=><section className="section personnel-manager-group" key={group.id}>
        <div className="personnel-manager-head"><div><strong>{group.name}</strong><span>{group.objects.size} объектов · дефицит {Array.from(group.objects.values()).flatMap(item=>item.rows).reduce((sum,row)=>sum+Math.max(0,row.deficit),0)}</span></div></div>
        {[...group.objects.values()].map(object=>{
          const lineKeys=[...new Map(object.rows.map(row=>[row.specialtyId+":"+row.kind,{specialtyId:row.specialtyId,specialty:row.specialty,kind:row.kind}])).values()].sort((a,b)=>a.specialty.localeCompare(b.specialty,"ru")||a.kind.localeCompare(b.kind));
          return <div className="shift-calendar-object" key={object.id}>
            <div className="shift-calendar-object-head"><Link href={"/objects/"+object.id+"?tab=shifts"}>{object.name}</Link><span>{object.rows.length} смен</span></div>
            <div className="request-table-wrap"><table className="data-table shift-calendar-table"><thead><tr><th>Профессия / смена</th>{dates.map(date=><th key={date}><span>{weekday(date)}</span>{displayDay(date)}</th>)}</tr></thead><tbody>
              {lineKeys.map(line=><tr key={line.specialtyId+":"+line.kind}><td><strong>{line.specialty}</strong><span className="cell-sub">{kindLabels[line.kind]??line.kind}</span></td>{dates.map(date=>{
                const cell=object.rows.find(row=>row.specialtyId===line.specialtyId&&row.kind===line.kind&&row.dateIso===date);
                return <td key={date}>{cell?<button type="button" className={"shift-calendar-cell "+(cell.deficit>0?"has-deficit":cell.assigned>=cell.demand?"is-covered":"")} onClick={()=>setSelected(cell)}><strong>{cell.assigned}/{cell.demand}</strong>{cell.deficit>0?<small>−{cell.deficit}</small>:cell.reserve>0?<small>резерв {cell.reserve}</small>:<small>{cell.confirmed??0} подтв.</small>}</button>:<span className="cell-sub">—</span>}</td>;
              })}</tr>)}
            </tbody></table></div>
          </div>;
        })}
      </section>)}
      {!managerGroups.length&&<div className="empty-inline">Смен по выбранным фильтрам и неделе нет.</div>}
    </div>}

    {view==="list"&&<section className="section section-flush"><div className="request-table-wrap"><table className="data-table shift-portfolio-list"><thead><tr><th>Дата / смена</th><th>Менеджер</th><th>Объект</th><th>Профессия</th><th>Комплектование</th><th>Потребность</th><th>Назначено</th><th>Резерв</th><th>Подтверждено</th><th>Дефицит</th><th>Статус</th></tr></thead><tbody>
      {visible.map(row=>{const object=objectMap.get(row.objectId);return <tr key={row.id} onDoubleClick={()=>setSelected(row)}><td><button type="button" className="cell-link" onClick={()=>setSelected(row)}><strong>{displayDay(row.dateIso??dates[0])} · {kindLabels[row.kind]??row.kind}</strong><span>{row.time}</span></button></td><td>{object?.ownerName??"—"}</td><td><Link href={"/objects/"+row.objectId+"?tab=shifts"}>{row.object}</Link></td><td>{row.specialty}</td><td className="scheduler-coverage-cell"><div className="scheduler-bar"><span className="assigned" style={{width:`${Math.min(100,row.assigned/Math.max(1,row.demand)*100)}%`}}/><span className="reserve" style={{width:`${Math.min(100,row.reserve/Math.max(1,row.demand)*100)}%`}}/><span className="deficit" style={{width:`${Math.min(100,Math.max(0,row.deficit)/Math.max(1,row.demand)*100)}%`}}/></div><span className="cell-sub">{row.assigned+row.reserve} из {row.demand}</span></td><td className="num">{row.demand}</td><td className="num">{row.assigned}</td><td className="num">{row.reserve}</td><td className="num">{row.confirmed??"—"}</td><td className="num"><Status tone={row.deficit?"bad":"good"}>{row.deficit}</Status></td><td><Status tone={row.status==="closed"?"neutral":row.deficit?"warn":"good"}>{statusLabels[row.status]??row.status}</Status></td></tr>})}
    </tbody></table>{!visible.length&&<div className="empty-inline">Смен за выбранную неделю нет.</div>}</div></section>}

    {view==="workers"&&<section className="section section-flush"><div className="request-table-wrap"><table className="data-table shift-worker-calendar"><thead><tr><th>Сотрудник</th><th>Менеджер</th><th>Объект</th><th>Профессия</th>{dates.map(date=><th key={date}><span>{weekday(date)}</span>{displayDay(date)}</th>)}</tr></thead><tbody>
      {workerSchedule.map(item=>{const object=item.worker.objectId?objectMap.get(item.worker.objectId):null;return <tr key={item.worker.id}><td><Link className="cell-title" href={"/workers/"+item.worker.id}>{item.worker.fullName}</Link></td><td>{object?.ownerName??"—"}</td><td>{item.worker.objectId?<Link href={"/objects/"+item.worker.objectId+"?tab=workforce"}>{item.worker.object??"Объект"}</Link>:"—"}</td><td>{item.worker.specialty??"—"}</td>{dates.map(date=><td key={date} className="shift-worker-day">{item.cells[date]?<Status tone={item.cells[date].includes("Р")?"info":"good"}>{item.cells[date]}</Status>:<span className="cell-sub">—</span>}</td>)}</tr>})}
    </tbody></table>{!workerSchedule.length&&<div className="empty-inline">На выбранной неделе назначений сотрудников нет.</div>}</div><div className="shift-worker-legend"><span><b>Д</b> дневная</span><span><b>Н</b> ночная</span><span><b>С</b> смешанная</span><span><b>Р</b> резерв</span></div></section>}

    {selected&&<><div className="drawer-backdrop" onClick={()=>setSelected(null)}/><aside className="drawer">
      <button className="icon-button drawer-close" onClick={()=>setSelected(null)} aria-label="Закрыть"><X size={17}/></button>
      <div className="eyebrow">Смена · {selected.date}</div><h2>{selected.object}</h2>
      <Status tone={selected.deficit?"warn":"good"}>{kindLabels[selected.kind]??selected.kind} · {statusLabels[selected.status]??selected.status}</Status>
      <div className="drawer-content"><KeyValue label="Время" value={selected.time}/><KeyValue label="Специальность" value={selected.specialty}/><KeyValue label="Потребность" value={selected.demand}/><KeyValue label="Назначено" value={selected.assigned}/><KeyValue label="Резерв" value={selected.reserve}/><KeyValue label="Подтверждено" value={selected.confirmed??"—"}/><KeyValue label="Открытые позиции" value={selected.deficit}/><KeyValue label="Плановая стоимость" value={rub(selected.cost)} sensitive/></div>
      <div className="drawer-actions">{canEdit&&<button className="button primary" onClick={()=>setShowAssignments(true)}><UsersRound size={14}/> Состав смены</button>}<Link className="button" href={`/objects/${selected.objectId}?tab=staffing`}><CalendarDays size={14}/> Передать в подбор</Link></div>
    </aside></>}

    {showCreate&&<ScheduleModal options={options} onClose={()=>setShowCreate(false)} onSaved={(text)=>{setShowCreate(false);setMessage(text);router.refresh()}}/>}
    {selected&&showAssignments&&<AssignmentsModal shift={selected} options={options} onClose={()=>setShowAssignments(false)} onSaved={(text)=>{setShowAssignments(false);setSelected(null);setMessage(text);router.refresh()}}/>}
  </>;
}

function ScheduleModal({options,onClose,onSaved}:{options:OperationsReferenceData;onClose:()=>void;onSaved:(message:string)=>void}){
  const [objectId,setObjectId]=useState(options.objects[0]?.id??"");
  const [specialtyId,setSpecialtyId]=useState(options.specialties[0]?.id??"");
  const [startDate,setStartDate]=useState("");
  const [endDate,setEndDate]=useState("");
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
