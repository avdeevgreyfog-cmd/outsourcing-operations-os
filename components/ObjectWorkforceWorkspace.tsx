"use client";

import Link from "next/link";
import {useMemo,useState} from "react";
import type {WorkerRow} from "@/lib/data/service";
import {workerObjectState,workerTodayStatus} from "@/lib/operations/workforce-status";
import {rub} from "@/lib/ui/format";

type View="grouped"|"list";
type Scope="all"|"shift"|"absence"|"attention";
type SpecialtyOption={id:string;name:string};
const documentLabels:Record<string,string>={not_received:"Не получены",collecting:"Собираются",received:"Получены мастером",submitted:"Переданы на оформление",processing:"На оформлении",completed:"Готово",problem:"Есть проблема"};
const shiftLabels:Record<string,string>={day:"День",night:"Ночь",mixed:"День / ночь"};

export function ObjectWorkforceWorkspace({
  workers,today,canEdit,canManageAssets,demo,specialties,pilot=true,
}:{
  workers:WorkerRow[];
  today:string;
  canEdit:boolean;
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
  const [transferWorkerId,setTransferWorkerId]=useState("");
  const [transferSpecialtyId,setTransferSpecialtyId]=useState("");
  const [transferDate,setTransferDate]=useState(today);
  const [transferReason,setTransferReason]=useState("");

  const specialtyNames=useMemo(()=>[...new Set(workers.map(row=>row.specialty??"Без специальности"))].sort((a,b)=>a.localeCompare(b,"ru")),[workers]);
  const todayStates=useMemo(()=>uniqueStatuses(workers.map(row=>workerTodayStatus(row,today))),[workers,today]);
  const filtered=useMemo(()=>workers.filter(row=>{
    const day=workerTodayStatus(row,today);
    const objectState=workerObjectState(row,today);
    const attention=day.key==="no_show"||row.employmentDocumentsStatus==="problem"||["sick","absence"].includes(objectState.key);
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
  const attentionCount=workers.filter(row=>{const day=workerTodayStatus(row,today),state=workerObjectState(row,today);return day.key==="no_show"||row.employmentDocumentsStatus==="problem"||["sick","absence"].includes(state.key)}).length;
  const transferWorker=workers.find(row=>row.id===transferWorkerId)??null;

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

  function openTransfer(row:WorkerRow){
    setTransferWorkerId(row.id);
    setTransferSpecialtyId(row.specialtyId??specialties[0]?.id??"");
    setTransferDate(today);
    setTransferReason("");
    setMessage("");
  }
  async function transferSpecialty(){
    if(!canEdit||!transferWorker||!transferSpecialtyId)return;
    if(transferWorker.specialtyId===transferSpecialtyId){setMessage("Выберите другую специальность");return;}
    setBusy("transfer");setMessage("");
    try{
      if(!demo){
        const response=await fetch(`/api/workers/${transferWorker.id}/assignment-settings`,{
          method:"PATCH",headers:{"content-type":"application/json"},
          body:JSON.stringify({specialtyId:transferSpecialtyId,specialtyEffectiveFrom:transferDate,transferReason:transferReason||null}),
        });
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось перевести сотрудника");
        window.location.reload();
      }else{
        setMessage(`${transferWorker.fullName}: перевод запланирован с ${shortDate(transferDate)}`);
        setTransferWorkerId("");
      }
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось перевести сотрудника")}
    finally{setBusy("")}
  }

  return <div className={pilot?"object-workforce-pilot":"object-workforce-classic"}>
    {pilot&&<div className="object-local-tabs" role="tablist" aria-label="Представления персонала">
      <button type="button" className={scope==="all"?"active":""} onClick={()=>setScope("all")}>Все <span>{workers.length}</span></button>
      <button type="button" className={scope==="shift"?"active":""} onClick={()=>setScope("shift")}>На смене <span>{onShift}</span></button>
      <button type="button" className={scope==="absence"?"active":""} onClick={()=>setScope("absence")}>Отсутствуют <span>{activeAbsences}</span></button>
      <button type="button" className={scope==="attention"?"active":""} onClick={()=>setScope("attention")}>Требует внимания <span>{attentionCount}</span></button>
    </div>}
    <div className="metrics-grid object-workforce-metrics">
      <div className="metric"><span>Сотрудники на объекте</span><strong>{workers.length}</strong></div>
      <div className="metric"><span>Сегодня вышли</span><strong>{onShift}</strong></div>
      <div className="metric"><span>Планово отсутствуют</span><strong>{activeAbsences}</strong></div>
      <div className="metric"><span>Невыходы сегодня</span><strong>{noShows}</strong></div>
    </div>
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
    {transferWorker&&<div className="object-worker-transfer">
      <div><strong>Перевод внутри объекта</strong><span>{transferWorker.fullName} · сейчас {transferWorker.specialty??"без специальности"}</span></div>
      <label>Новая специальность<select value={transferSpecialtyId} onChange={event=>setTransferSpecialtyId(event.target.value)}>{specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>С даты<input type="date" min={today} value={transferDate} onChange={event=>setTransferDate(event.target.value)}/></label>
      <label className="reason">Причина<input value={transferReason} onChange={event=>setTransferReason(event.target.value)} placeholder="Например: перевод по потребности объекта"/></label>
      <div className="page-actions"><button className="button" type="button" onClick={()=>setTransferWorkerId("")}>Отмена</button><button className="button primary" type="button" disabled={busy==="transfer"||!transferSpecialtyId} onClick={()=>void transferSpecialty()}>Перевести</button></div>
      <small>Старое назначение закроется предыдущим днём. Табели, ставки и история за прошлый период сохранятся.</small>
    </div>}
    {message&&<div className="object-staffing-message">{message}</div>}
    <div className="object-workforce-result">Показано {filtered.length} из {workers.length} · {formatDate(today)}</div>
    {view==="list"
      ?<WorkerTable rows={filtered} today={today} showSpecialty canEdit={canEdit} canManageAssets={canManageAssets} busy={busy} onDocuments={updateDocuments} onTransfer={openTransfer}/>
      :<div className="object-workforce-groups">{groups.map(group=><section key={group.name} className="object-workforce-group"><button type="button" className="object-workforce-group-head" onClick={()=>toggleGroup(group.name)} aria-expanded={shouldOpen(group.name)}><span><strong>{group.name}</strong><small>{group.rows.length} чел.</small></span><b>{shouldOpen(group.name)?"Свернуть":"Развернуть"}</b></button>{shouldOpen(group.name)&&<WorkerTable rows={group.rows} today={today} canEdit={canEdit} canManageAssets={canManageAssets} busy={busy} onDocuments={updateDocuments} onTransfer={openTransfer}/>}</section>)}</div>}
    {!filtered.length&&<div className="empty-inline">По выбранным фильтрам сотрудников нет</div>}
  </div>;
}

function WorkerTable({
  rows,today,showSpecialty=false,canEdit,canManageAssets,busy,onDocuments,onTransfer,
}:{
  rows:WorkerRow[];today:string;showSpecialty?:boolean;canEdit:boolean;canManageAssets:boolean;busy:string;
  onDocuments:(row:WorkerRow,status:string)=>void;onTransfer:(row:WorkerRow)=>void;
}){
  return <div className="request-table-wrap"><table className="data-table object-workforce-table object-workforce-table-v2"><thead><tr><th>Сотрудник</th><th>Телефон</th>{showSpecialty&&<th>Специальность</th>}<th>График</th><th>Сегодня · {shortDate(today)}</th><th>Ставка</th><th>Документы</th><th>Обеспечение</th></tr></thead><tbody>{rows.map(row=>{
    const objectState=workerObjectState(row,today);const day=workerTodayStatus(row,today);const adaptation=adaptationLabel(row,today);
    return <tr key={row.id}>
      <td><Link className="cell-title" href={`/workers/${row.id}`}>{row.fullName}</Link>{adaptation&&<span className="cell-sub object-worker-adaptation">{adaptation}</span>}{canEdit&&<button type="button" className="object-worker-transfer-link" onClick={()=>onTransfer(row)}>Перевести</button>}</td>
      <td>{row.phone?<a className="object-worker-phone" href={`tel:${row.phone.replace(/[^+\d]/g,"")}`}>{row.phone}</a>:<span className="cell-sub">Не указан</span>}</td>
      {showSpecialty&&<td>{row.specialty??"—"}</td>}
      <td><strong className="object-worker-plain">{scheduleLabel(row)}</strong><span className="cell-sub">{row.workMode==="rotation"?"Вахта":"Местный"}</span></td>
      <td><WorkerToday state={objectState} day={day} shiftTime={row.todayShiftTime}/></td>
      <td className="num"><WorkerRate row={row}/></td>
      <td><div className="object-worker-doc-editor"><select value={row.employmentDocumentsStatus??"not_received"} disabled={!canEdit||busy===`docs:${row.id}`} onChange={event=>void onDocuments(row,event.target.value)}>{Object.entries(documentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><Link href={`/workers/${row.id}?tab=assignments`}>Карточка</Link></div></td>
      <td><WorkerAssets row={row} canManageAssets={canManageAssets}/></td>
    </tr>;
  })}</tbody></table></div>;
}

function WorkerAssets({row,canManageAssets}:{row:WorkerRow;canManageAssets:boolean}){
  const required=Number(row.ppeRequiredCount??0),issued=Number(row.ppeIssuedCount??0),actual=Number(row.issuedAssetCount??0);
  const sizes=[row.clothingSize&&`одежда ${row.clothingSize}`,row.shoeSize&&`обувь ${row.shoeSize}`].filter(Boolean).join(" · ");
  return <details className="object-worker-assets"><summary><strong>{required?issued>=required?"Комплект выдан":`${issued}/${required} выдано`:actual?`Выдано ${actual}`:"Не выдавалось"}</strong>{sizes&&<small>{sizes}</small>}</summary><div className="object-worker-assets-popover">{required?<><span>По шаблону: {required} поз.</span>{row.ppeMissingNames?.length?<span>Не хватает: {row.ppeMissingNames.join(", ")}</span>:<span>Комплект по шаблону закрыт</span>}</>:<span>Шаблон для специальности не задан</span>}{row.issuedAssetNames?.length?<span>На сотруднике: {row.issuedAssetNames.join(", ")}</span>:<span>Выдач не найдено</span>}{canManageAssets&&<Link className="button" href={`/assets?worker=${row.id}&action=issue`}>Выдать / вернуть</Link>}<Link href={`/workers/${row.id}?tab=assets`}>Открыть имущество</Link></div></details>;
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
function compactNumber(value:number){return Number.isInteger(value)?String(value):String(value).replace(".",",")}
function uniqueStatuses(items:Array<{key:string;label:string}>){const map=new Map<string,string>();for(const item of items)map.set(item.key,item.label);return [...map].map(([key,label])=>({key,label})).sort((a,b)=>a.label.localeCompare(b.label,"ru"))}
function formatDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function shortDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
