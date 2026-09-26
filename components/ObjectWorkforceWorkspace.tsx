"use client";

import Link from "next/link";
import {createPortal} from "react-dom";
import {useMemo,useState} from "react";
import {ArrowRight,LogOut,MoreHorizontal,X} from "lucide-react";
import type {WorkerRow} from "@/lib/data/service";
import {workerObjectState,workerTodayStatus} from "@/lib/operations/workforce-status";
import {rub} from "@/lib/ui/format";

type View="grouped"|"list";
type Scope="all"|"shift"|"absence"|"attention";
type ActionMode="transfer"|"exit"|null;
type TimingMode="date"|"shifts";
type SpecialtyOption={id:string;name:string};
type ObjectOption={id:string;name:string};

const documentLabels:Record<string,string>={not_received:"Не получены",collecting:"Собираются",received:"Получены мастером",submitted:"Переданы на оформление",processing:"На оформлении",completed:"Готово",problem:"Есть проблема"};
const shiftLabels:Record<string,string>={day:"День",night:"Ночь",mixed:"День / ночь"};
const exitReasonLabels:Record<string,string>={
  employee_request:"По инициативе сотрудника",
  employer_decision:"По инициативе компании",
  project_end:"Завершение потребности / проекта",
  transfer_out:"Вывод с объекта / перевод вне компании",
  no_show:"Невыходы / прекращение работы",
  medical:"Медицинские ограничения",
  other:"Другая причина",
};

export function ObjectWorkforceWorkspace({
  workers,today,objectId,objectName,objects,canEdit,canOffboard,canManageAssets,demo,specialties,pilot=true,
}:{
  workers:WorkerRow[];
  today:string;
  objectId:string;
  objectName:string;
  objects:ObjectOption[];
  canEdit:boolean;
  canOffboard:boolean;
  canManageAssets:boolean;
  demo:boolean;
  specialties:SpecialtyOption[];
  pilot?:boolean;
}){
  const [query,setQuery]=useState("");
  const [scope,setScope]=useState<Scope>("all");
  const [specialty,setSpecialty]=useState("");
  const [schedule,setSchedule]=useState("");
  const [todayState,setTodayState]=useState("");
  const [view,setView]=useState<View>("grouped");
  const [openGroups,setOpenGroups]=useState<Set<string>>(()=>new Set());
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");

  const [actionMode,setActionMode]=useState<ActionMode>(null);
  const [actionWorkerId,setActionWorkerId]=useState("");
  const [transferScope,setTransferScope]=useState<"same"|"other">("same");
  const [targetObjectId,setTargetObjectId]=useState(objectId);
  const [targetSpecialtyId,setTargetSpecialtyId]=useState("");
  const [timingMode,setTimingMode]=useState<TimingMode>("date");
  const [actionDate,setActionDate]=useState(today);
  const [shiftCount,setShiftCount]=useState("3");
  const [dayRate,setDayRate]=useState("");
  const [nightRate,setNightRate]=useState("");
  const [workMode,setWorkMode]=useState<"local"|"rotation">("local");
  const [paidHours,setPaidHours]=useState("");
  const [reason,setReason]=useState("");
  const [exitReasonCode,setExitReasonCode]=useState("employee_request");
  const [replacementRequired,setReplacementRequired]=useState(true);
  const [returnToRecruiting,setReturnToRecruiting]=useState(true);

  const specialtyNames=useMemo(()=>[...new Set(workers.map(row=>row.specialty??"Без специальности"))].sort((a,b)=>a.localeCompare(b,"ru")),[workers]);
  const todayStates=useMemo(()=>uniqueStatuses(workers.map(row=>workerTodayStatus(row,today))),[workers,today]);
  const filtered=useMemo(()=>workers.filter(row=>{
    const day=workerTodayStatus(row,today);
    const objectState=workerObjectState(row,today);
    const attention=day.key==="no_show"||row.employmentDocumentsStatus==="problem"||["sick","absence"].includes(objectState.key)||Boolean(row.plannedExitDate);
    const inScope=scope==="all"
      ||(scope==="shift"&&day.key==="on_shift")
      ||(scope==="absence"&&!["working_period","ended"].includes(objectState.key))
      ||(scope==="attention"&&attention);
    const hay=`${row.fullName} ${row.phone??""} ${row.specialty??""}`.toLocaleLowerCase("ru");
    return inScope
      &&(!query.trim()||hay.includes(query.trim().toLocaleLowerCase("ru")))
      &&(!specialty||(row.specialty??"Без специальности")===specialty)
      &&(!schedule||row.scheduleShiftKind===schedule)
      &&(!todayState||day.key===todayState);
  }).sort((a,b)=>a.fullName.localeCompare(b.fullName,"ru")),[workers,scope,query,specialty,schedule,todayState,today]);
  const groups=useMemo(()=>specialtyNames.map(name=>({name,rows:filtered.filter(row=>(row.specialty??"Без специальности")===name)})).filter(group=>group.rows.length),[filtered,specialtyNames]);
  const activeAbsences=workers.filter(row=>!["working_period","ended"].includes(workerObjectState(row,today).key)).length;
  const onShift=workers.filter(row=>workerTodayStatus(row,today).key==="on_shift").length;
  const noShows=workers.filter(row=>workerTodayStatus(row,today).key==="no_show").length;
  const attentionCount=workers.filter(row=>{const day=workerTodayStatus(row,today),state=workerObjectState(row,today);return day.key==="no_show"||row.employmentDocumentsStatus==="problem"||["sick","absence"].includes(state.key)||Boolean(row.plannedExitDate)}).length;
  const actionWorker=workers.find(row=>row.id===actionWorkerId)??null;
  const shiftsDate=actionWorker?dateFromShiftCount(actionWorker,Number(shiftCount||0),today,actionMode==="transfer"):null;
  const resolvedDate=timingMode==="shifts"?shiftsDate:actionDate;

  function toggleGroup(name:string){
    setOpenGroups(current=>{const next=new Set(current);if(next.has(name))next.delete(name);else next.add(name);return next});
  }
  const shouldOpen=(name:string)=>Boolean(query||specialty||schedule||todayState)||groups.length<=3||openGroups.has(name);

  async function updateDocuments(row:WorkerRow,status:string){
    if(!canEdit)return;
    setBusy(`docs:${row.id}`);setMessage("");
    try{
      const response=await fetch(`/api/workers/${row.id}/assignment-settings`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({employmentDocumentsStatus:status})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось изменить документы");
      row.employmentDocumentsStatus=status;
      setMessage(`${row.fullName}: ${documentLabels[status]}`);
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось изменить документы")}
    finally{setBusy("")}
  }

  function openAction(row:WorkerRow,mode:Exclude<ActionMode,null>){
    setActionWorkerId(row.id);setActionMode(mode);setMessage("");setBusy("");
    setTransferScope("same");setTargetObjectId(objectId);setTargetSpecialtyId(row.specialtyId??specialties[0]?.id??"");
    setTimingMode("date");setActionDate(addDays(today,1));setShiftCount("3");
    setDayRate(row.dayRate==null?"":String(Number(row.dayRate)));setNightRate(row.nightRate==null?"":String(Number(row.nightRate)));
    setWorkMode(row.workMode==="rotation"?"rotation":"local");setPaidHours(row.paidHoursPerShift==null?"":String(Number(row.paidHoursPerShift)));
    setReason("");setExitReasonCode("employee_request");setReplacementRequired(true);setReturnToRecruiting(true);
  }
  function closeAction(){setActionMode(null);setActionWorkerId("");setBusy("");}

  async function saveTransfer(){
    if(!actionWorker||!resolvedDate||!targetSpecialtyId||!canEdit)return;
    if(transferScope==="same"&&actionWorker.specialtyId===targetSpecialtyId&&sameNumber(dayRate,actionWorker.dayRate)&&sameNumber(nightRate,actionWorker.nightRate)){
      setMessage("Измените специальность или ставку.");return;
    }
    setBusy("action");setMessage("");
    try{
      if(demo){setMessage(`${actionWorker.fullName}: перевод запланирован с ${formatDate(resolvedDate)}`);closeAction();return;}
      const url=transferScope==="same"?`/api/workers/${actionWorker.id}/assignment-settings`:`/api/workers/${actionWorker.id}/transfer`;
      const payload=transferScope==="same"
        ?{...(actionWorker.specialtyId===targetSpecialtyId?{}:{specialtyId:targetSpecialtyId}),specialtyEffectiveFrom:resolvedDate,dayRate:nullableNumber(dayRate),nightRate:nullableNumber(nightRate),transferReason:reason||null}
        :{objectId:targetObjectId,specialtyId:targetSpecialtyId,effectiveFrom:resolvedDate,workMode,paidHoursPerShift:nullableNumber(paidHours),dayRate:nullableNumber(dayRate),nightRate:nullableNumber(nightRate),reason:reason||null};
      const response=await fetch(url,{method:transferScope==="same"?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить перевод");
      window.location.reload();
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось сохранить перевод")}
    finally{setBusy("")}
  }

  async function saveExit(){
    if(!actionWorker||!resolvedDate||!canOffboard)return;
    setBusy("action");setMessage("");
    try{
      if(demo){setMessage(`${actionWorker.fullName}: завершение работы запланировано на ${formatDate(resolvedDate)}`);closeAction();return;}
      const future=resolvedDate>today;
      const response=await fetch(`/api/workers/${actionWorker.id}/exit`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        action:future?"plan":"complete",effectiveDate:resolvedDate,reasonCode:exitReasonCode,reason:reason||null,returnToRecruiting,...(future?{replacementRequired}:{}),
      })});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить завершение работы");
      window.location.reload();
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось сохранить завершение работы")}
    finally{setBusy("")}
  }

  return <div className={pilot?"object-workforce-pilot":"object-workforce-classic"}>
    {pilot&&<div className="object-local-tabs" role="tablist" aria-label="Представления персонала">
      <button type="button" className={scope==="all"?"active":""} onClick={()=>setScope("all")}>Все <span>{workers.length}</span></button>
      <button type="button" className={scope==="shift"?"active":""} onClick={()=>setScope("shift")}>На смене <span>{onShift}</span></button>
      <button type="button" className={scope==="absence"?"active":""} onClick={()=>setScope("absence")}>Отсутствуют <span>{activeAbsences}</span></button>
      <button type="button" className={scope==="attention"?"active":""} onClick={()=>setScope("attention")}>Требует внимания <span>{attentionCount}</span></button>
    </div>}
    {!pilot&&<div className="metrics-grid object-workforce-metrics">
      <div className="metric"><span>Сотрудники на объекте</span><strong>{workers.length}</strong></div>
      <div className="metric"><span>Сегодня вышли</span><strong>{onShift}</strong></div>
      <div className="metric"><span>Планово отсутствуют</span><strong>{activeAbsences}</strong></div>
      <div className="metric"><span>Невыходы сегодня</span><strong>{noShows}</strong></div>
    </div>}
    <div className="object-workforce-commandbar">
      <div className="object-workforce-toolbar compact">
        <input value={query} onChange={event=>setQuery(event.target.value)} placeholder="ФИО или телефон"/>
        <select value={specialty} onChange={event=>setSpecialty(event.target.value)}><option value="">Все специальности</option>{specialtyNames.map(value=><option key={value}>{value}</option>)}</select>
        <select value={schedule} onChange={event=>setSchedule(event.target.value)}><option value="">Все смены</option><option value="day">День</option><option value="night">Ночь</option><option value="mixed">День / ночь</option></select>
        <select value={todayState} onChange={event=>setTodayState(event.target.value)}><option value="">Сегодня: все</option>{todayStates.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}</select>
        <div className="object-workforce-view"><button type="button" className={view==="grouped"?"active":""} onClick={()=>setView("grouped")}>По специальностям</button><button type="button" className={view==="list"?"active":""} onClick={()=>setView("list")}>Списком</button></div>
      </div>
      {(query||specialty||schedule||todayState)&&<div className="object-active-filters">
        {query&&<button type="button" onClick={()=>setQuery("")}>Поиск: {query} ×</button>}
        {specialty&&<button type="button" onClick={()=>setSpecialty("")}>{specialty} ×</button>}
        {schedule&&<button type="button" onClick={()=>setSchedule("")}>{schedule==="day"?"День":schedule==="night"?"Ночь":"День / ночь"} ×</button>}
        {todayState&&<button type="button" onClick={()=>setTodayState("")}>{todayStates.find(item=>item.key===todayState)?.label??todayState} ×</button>}
        <button type="button" className="clear" onClick={()=>{setQuery("");setSpecialty("");setSchedule("");setTodayState("")}}>Сбросить всё</button>
      </div>}
    </div>
    {message&&<div className="object-staffing-message">{message}</div>}
    <div className="object-workforce-result"><span>Показано {filtered.length} из {workers.length}</span><span>{formatDate(today)}</span></div>
    {view==="list"
      ?<WorkerTable rows={filtered} today={today} showSpecialty canEdit={canEdit} canOffboard={canOffboard} canManageAssets={canManageAssets} busy={busy} onDocuments={updateDocuments} onAction={openAction}/>
      :<div className="object-workforce-groups">{groups.map(group=><section key={group.name} className="object-workforce-group"><button type="button" className="object-workforce-group-head" onClick={()=>toggleGroup(group.name)} aria-expanded={shouldOpen(group.name)}><span><strong>{group.name}</strong><small>{group.rows.length} чел.</small></span><b>{shouldOpen(group.name)?"Свернуть":"Развернуть"}</b></button>{shouldOpen(group.name)&&<WorkerTable rows={group.rows} today={today} canEdit={canEdit} canOffboard={canOffboard} canManageAssets={canManageAssets} busy={busy} onDocuments={updateDocuments} onAction={openAction}/>}</section>)}</div>}
    {!filtered.length&&<div className="empty-inline">По выбранным фильтрам сотрудников нет</div>}

    {actionWorker&&actionMode&&<Portal><div className="recruiting-modal object-worker-action-overlay" onMouseDown={event=>{if(event.currentTarget===event.target)closeAction()}}><div className="recruiting-modal-card object-worker-action-drawer">
      <div className="recruiting-modal-head"><div><h2>{actionMode==="transfer"?"Перевести сотрудника":"Запустить завершение работы"}</h2><p>{actionWorker.fullName} · {actionWorker.specialty??"специальность не указана"} · {objectName}</p></div><button className="icon-button" type="button" onClick={closeAction}><X size={17}/></button></div>
      <div className="candidate-import-body object-worker-action-body">
        {actionMode==="transfer"?<>
          <div className="object-action-choice"><button type="button" className={transferScope==="same"?"active":""} onClick={()=>{setTransferScope("same");setTargetObjectId(objectId)}}>Внутри текущего объекта</button><button type="button" className={transferScope==="other"?"active":""} onClick={()=>{setTransferScope("other");setTargetObjectId(objects.find(item=>item.id!==objectId)?.id??"")}}>На другой объект</button></div>
          <div className="candidate-import-options">
            {transferScope==="other"&&<label>Новый объект<select value={targetObjectId} onChange={event=>setTargetObjectId(event.target.value)}><option value="">Выберите</option>{objects.filter(item=>item.id!==objectId).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            <label>Новая специальность<select value={targetSpecialtyId} onChange={event=>setTargetSpecialtyId(event.target.value)}>{specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label>Ставка день, ₽/ч<input type="number" min="0" step="1" value={dayRate} onChange={event=>setDayRate(event.target.value)}/></label>
            <label>Ставка ночь, ₽/ч<input type="number" min="0" step="1" value={nightRate} onChange={event=>setNightRate(event.target.value)}/></label>
            {transferScope==="other"&&<><label>Формат работы<select value={workMode} onChange={event=>setWorkMode(event.target.value as "local"|"rotation")}><option value="local">Местный</option><option value="rotation">Вахта</option></select></label><label>Оплачиваемых часов в смене<input type="number" min="0.5" max="24" step="0.5" value={paidHours} onChange={event=>setPaidHours(event.target.value)}/></label></>}
          </div>
        </>:<>
          <div className="candidate-import-options">
            <label>Причина<select value={exitReasonCode} onChange={event=>setExitReasonCode(event.target.value)}>{Object.entries(exitReasonLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
          </div>
          <label className="operations-check"><input type="checkbox" checked={replacementRequired} onChange={event=>setReplacementRequired(event.target.checked)}/> Нужна замена на объект</label>
          <label className="operations-check"><input type="checkbox" checked={returnToRecruiting} onChange={event=>setReturnToRecruiting(event.target.checked)}/> Передать сотрудника в повторный подбор после завершения</label>
        </>}

        <div className="object-action-timing">
          <strong>{actionMode==="transfer"?"Когда перевести":"Когда завершить работу"}</strong>
          <div className="object-action-choice compact"><button type="button" className={timingMode==="date"?"active":""} onClick={()=>setTimingMode("date")}>По дате</button><button type="button" className={timingMode==="shifts"?"active":""} onClick={()=>setTimingMode("shifts")}>После смен</button></div>
          {timingMode==="date"?<label>{actionMode==="transfer"?"Новое назначение с":"Последний день работы"}<input type="date" min={today} value={actionDate} onChange={event=>setActionDate(event.target.value)}/></label>:<div className="object-action-shifts"><label>Ещё отработает смен<input type="number" min="1" max="90" value={shiftCount} onChange={event=>setShiftCount(event.target.value)}/></label>{resolvedDate?<div className="object-action-date-preview"><span>{actionMode==="transfer"?"Новое назначение":"Завершение работы"}</span><strong>{formatDate(resolvedDate)}</strong><small>{actionWorker.upcomingShiftDates?.length?"По запланированным сменам":"По графику текущего назначения"}</small></div>:<div className="recruiting-error">Не удалось рассчитать дату по сменам. Выберите дату вручную.</div>}</div>}
        </div>

        <label>Комментарий<input value={reason} onChange={event=>setReason(event.target.value)} placeholder={actionMode==="transfer"?"Причина перевода / договорённость":"Причина и важные детали"}/></label>
        {actionMode==="transfer"&&resolvedDate&&<div className="object-action-summary"><strong>Будет изменено</strong><span>{objectName} → {transferScope==="same"?objectName:objects.find(item=>item.id===targetObjectId)?.name??"объект не выбран"}</span><span>{actionWorker.specialty??"Без специальности"} → {specialties.find(item=>item.id===targetSpecialtyId)?.name??"не выбрана"}</span><span>С {formatDate(resolvedDate)}</span></div>}
        {message&&<div className="recruiting-error">{message}</div>}
      </div>
      <div className="recruiting-modal-footer"><button className="button" type="button" onClick={closeAction}>Отмена</button>{actionMode==="transfer"?<button className="button primary" type="button" disabled={busy==="action"||!resolvedDate||!targetSpecialtyId||(transferScope==="other"&&!targetObjectId)} onClick={()=>void saveTransfer()}><ArrowRight size={14}/>{busy==="action"?"Сохраняю…":"Перевести"}</button>:<button className="button primary" type="button" disabled={busy==="action"||!resolvedDate} onClick={()=>void saveExit()}><LogOut size={14}/>{busy==="action"?"Сохраняю…":resolvedDate&&resolvedDate>today?"Запланировать":"Завершить работу"}</button>}</div>
    </div></div></Portal>}
  </div>;
}

function WorkerTable({
  rows,today,showSpecialty=false,canEdit,canOffboard,canManageAssets,busy,onDocuments,onAction,
}:{
  rows:WorkerRow[];today:string;showSpecialty?:boolean;canEdit:boolean;canOffboard:boolean;canManageAssets:boolean;busy:string;
  onDocuments:(row:WorkerRow,status:string)=>void;onAction:(row:WorkerRow,mode:"transfer"|"exit")=>void;
}){
  return <div className="request-table-wrap"><table className="data-table object-workforce-table object-workforce-table-v2"><thead><tr><th>Сотрудник</th><th>Телефон</th>{showSpecialty&&<th>Специальность</th>}<th>График</th><th>Сегодня · {shortDate(today)}</th><th>Ставка</th><th>Документы</th><th>Обеспечение</th>{(canEdit||canOffboard)&&<th aria-label="Действия"></th>}</tr></thead><tbody>{rows.map(row=>{
    const objectState=workerObjectState(row,today);const day=workerTodayStatus(row,today);const adaptation=adaptationLabel(row,today);
    return <tr key={row.id}>
      <td><Link className="cell-title" href={`/workers/${row.id}`}>{row.fullName}</Link>{row.plannedExitDate?<span className="cell-sub object-worker-planned-change is-exit">Завершение работы · до {formatDate(row.plannedExitDate)}</span>:row.plannedTransferDate?<span className="cell-sub object-worker-planned-change">Перевод {formatDate(row.plannedTransferDate)} → {row.plannedTransferObject??row.plannedTransferSpecialty??"новое назначение"}</span>:adaptation&&<span className="cell-sub object-worker-adaptation">{adaptation}</span>}</td>
      <td>{row.phone?<a className="object-worker-phone" href={`tel:${row.phone.replace(/[^+\d]/g,"")}`}>{row.phone}</a>:<span className="cell-sub">Не указан</span>}</td>
      {showSpecialty&&<td>{row.specialty??"—"}</td>}
      <td><strong className="object-worker-plain">{scheduleLabel(row)}</strong><span className="cell-sub">{row.workMode==="rotation"?"Вахта":"Местный"}</span></td>
      <td><WorkerToday state={objectState} day={day} shiftTime={row.todayShiftTime}/></td>
      <td className="num"><WorkerRate row={row}/></td>
      <td><div className="object-worker-doc-editor"><select value={row.employmentDocumentsStatus??"not_received"} disabled={!canEdit||busy===`docs:${row.id}`} onChange={event=>void onDocuments(row,event.target.value)}>{Object.entries(documentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><Link href={`/workers/${row.id}?tab=assignments`}>Карточка</Link></div></td>
      <td><WorkerAssets row={row} canManageAssets={canManageAssets}/></td>
      {(canEdit||canOffboard)&&<td className="object-worker-actions-cell"><details className="object-worker-actions"><summary className="icon-button" aria-label={`Действия: ${row.fullName}`}><MoreHorizontal size={16}/></summary><div>{canEdit&&<button type="button" onClick={()=>onAction(row,"transfer")}><ArrowRight size={14}/> Перевести</button>}{canOffboard&&<button type="button" className="danger" onClick={()=>onAction(row,"exit")}><LogOut size={14}/> Завершение работы</button>}<Link href={`/workers/${row.id}`}>Открыть карточку</Link></div></details></td>}
    </tr>;
  })}</tbody></table></div>;
}

function WorkerAssets({row,canManageAssets}:{row:WorkerRow;canManageAssets:boolean}){
  const required=Number(row.ppeRequiredCount??0),issued=Number(row.ppeIssuedCount??0),actual=Number(row.issuedAssetCount??0);
  const sizes=[row.clothingSize&&`одежда ${row.clothingSize}`,row.shoeSize&&`обувь ${row.shoeSize}`].filter(Boolean).join(" · ");
  return <details className="object-worker-assets"><summary><strong>{required?issued>=required?"Комплект выдан":`${issued}/${required} выдано`:actual?`Выдано ${actual}`:"Не выдавалось"}</strong>{sizes&&<small>{sizes}</small>}</summary><div className="object-worker-assets-popover">{required?<><span>По норме: {required} поз.</span>{row.ppeMissingNames?.length?<span>Не хватает: {row.ppeMissingNames.join(", ")}</span>:<span>Комплект по норме закрыт</span>}</>:<span>Норма для специальности не задана</span>}{row.issuedAssetNames?.length?<span>На сотруднике: {row.issuedAssetNames.join(", ")}</span>:<span>Выдач не найдено</span>}{canManageAssets&&<Link className="button" href={`/assets?worker=${row.id}&action=issue`}>Выдать / вернуть</Link>}<Link href={`/workers/${row.id}?tab=assets`}>Открыть имущество</Link></div></details>;
}
function WorkerToday({state,day,shiftTime}:{state:ReturnType<typeof workerObjectState>;day:ReturnType<typeof workerTodayStatus>;shiftTime?:string|null}){
  const exceptional=!["working_period","on_shift","assigned","day_off","unmarked"].includes(day.key)||["intershift","vacation","sick","absence"].includes(state.key);
  const primary=state.key!=="working_period"?state.label:day.key==="on_shift"?"Работает":day.label;
  const secondary=state.key!=="working_period"?(day.key!==state.key?`Сегодня: ${day.label}`:state.source):day.key==="on_shift"?`Сегодня: выход${shiftTime?` · ${shiftTime}`:""}`:day.source;
  return <div className={`object-worker-current ${exceptional?"is-attention":""}`}><strong>{primary}</strong><small>{secondary}</small></div>;
}
function WorkerRate({row}:{row:WorkerRow}){
  const hours=Number(row.paidHoursPerShift??0),day=row.dayRate==null?null:Number(row.dayRate),night=row.nightRate==null?null:Number(row.nightRate);
  if(day!=null||night!=null){const main=day??night!;return <div className="object-worker-rate"><strong>{rub(main)}/ч</strong><small>{day!=null&&night!=null&&day!==night?`день ${rub(day)} · ночь ${rub(night)}`:hours>0?`${rub(main*hours)}/смена (${compactNumber(hours)} ч)`:"день / ночь"}</small></div>}
  if(row.rate==null)return <>—</>;
  const rate=Number(row.rate);
  return <div className="object-worker-rate"><strong>{rub(row.rateUnit==="shift"&&hours>0?rate/hours:rate)}/ч</strong>{hours>0&&<small>{rub(row.rateUnit==="shift"?rate:rate*hours)}/смена ({compactNumber(hours)} ч)</small>}</div>;
}
function scheduleLabel(row:WorkerRow){const cycle=row.scheduleWorkDays!=null&&row.scheduleRestDays!=null?`${row.scheduleWorkDays}/${row.scheduleRestDays}`:"Индивидуальный";return `${cycle} · ${shiftLabels[row.scheduleShiftKind??"mixed"]??"День / ночь"}`}
function adaptationLabel(row:WorkerRow,today:string){if(!row.startDate||!row.transitionDays||Number(row.transitionDays)<=0)return null;const end=new Date(row.startDate+"T00:00:00Z");end.setUTCDate(end.getUTCDate()+Number(row.transitionDays)-1);if(today>end.toISOString().slice(0,10))return null;return `Адаптация до ${shortDate(end.toISOString().slice(0,10))}`}
function nullableNumber(value:string){const n=Number(value);return value.trim()&&Number.isFinite(n)&&n>0?n:null}
function sameNumber(value:string,current:number|string|null|undefined){const next=nullableNumber(value),now=current==null?null:Number(current);return next===now}
function addDays(value:string,days:number){const date=new Date(value+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function dateFromShiftCount(row:WorkerRow,count:number,today:string,transfer:boolean){
  if(!Number.isInteger(count)||count<1)return null;
  const explicit=(row.upcomingShiftDates??[]).filter(value=>value>=today);
  if(explicit.length>=count){const last=explicit[count-1];return transfer?addDays(last,1):last;}
  const work=Number(row.scheduleWorkDays??0),rest=Number(row.scheduleRestDays??0),anchor=row.scheduleAnchorDate??row.startDate;
  if(!work||rest<0||!anchor)return null;
  const cycle=work+rest;let remaining=count;
  for(let offset=0;offset<370;offset++){
    const date=addDays(today,offset);const diff=Math.floor((Date.parse(date+"T00:00:00Z")-Date.parse(anchor+"T00:00:00Z"))/86400000);
    const position=((diff%cycle)+cycle)%cycle;
    if(position<work&&--remaining===0)return transfer?addDays(date,1):date;
  }
  return null;
}
function compactNumber(value:number){return Number.isInteger(value)?String(value):String(value).replace(".",",")}
function uniqueStatuses(items:Array<{key:string;label:string}>){const map=new Map<string,string>();for(const item of items)map.set(item.key,item.label);return [...map].map(([key,label])=>({key,label})).sort((a,b)=>a.label.localeCompare(b.label,"ru"))}
function formatDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function shortDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
