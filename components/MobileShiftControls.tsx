"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {AlertTriangle,CalendarDays,Check,ChevronDown,ChevronLeft,ChevronRight,Filter,MoreHorizontal,Phone,Search,Undo2,Users,ClipboardCheck,Factory,X} from "lucide-react";
import type {MobileDesk,MobileWorker,FirstDayStep} from "@/lib/operations/mobile-manager";

type Review={workerId:string;objectId:string;date:string;status:string;kind?:string;workDays?:number;restDays?:number;startTime?:string;endTime?:string};
type ReviewPayload={workers?:{id:string;name:string;object:string|null}[];planningChanges?:Review[];patternChanges?:Review[];timeChanges?:Review[]};
const steps:{key:FirstDayStep;name:string}[]=[
 {key:"met",name:"Встретили сотрудника"},{key:"pass_checked",name:"Пропуск и допуск проверены"},
 {key:"documents_checked",name:"Документы проверены"},{key:"briefing_checked",name:"Инструктаж проведён"},
 {key:"ppe_checked",name:"СИЗ проверены"},{key:"started",name:"Приступил к работе"}
];
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const dateShift=(iso:string,n:number)=>{const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const labelDate=(iso:string)=>new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",timeZone:"UTC"}).format(new Date(iso+"T00:00:00Z"));
const tel=(s:string|null)=>s?"tel:"+s.replace(/[^\d+]/g,""):null;
const statusName={present:"На месте",absent:"Неявка",pending:"Не проверен"} as const;
const empty:ReviewPayload={workers:[],planningChanges:[],patternChanges:[],timeChanges:[]};
export function MobileShiftControls({canEdit,demo,onOpenSchedule}:{canEdit:boolean;demo:boolean;onOpenSchedule?:()=>void}){
 const [data,setData]=useState<MobileDesk|null>(null);
 const [date,setDate]=useState(today());
 const [objectId,setObjectId]=useState("");
 const [kind,setKind]=useState<"day"|"night">("day");
 const [search,setSearch]=useState("");
 const [specialty,setSpecialty]=useState("");
 const [status,setStatus]=useState<"all"|"pending"|"absent"|"present"|"new">("all");
 const [tab,setTab]=useState<"roster"|"reviews">("roster");
 const [selected,setSelected]=useState<string[]>([]);
 const [selectionMode,setSelectionMode]=useState(false);
 const [openId,setOpenId]=useState<string|null>(null);
 const [absenceId,setAbsenceId]=useState<string|null>(null);
 const [absenceReason,setAbsenceReason]=useState("");
 const [stepEditing,setStepEditing]=useState<FirstDayStep|null>(null);
 const [stepNote,setStepNote]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [reviews,setReviews]=useState<ReviewPayload>(empty);
 const [reviewsLoaded,setReviewsLoaded]=useState(false);
 const [loading,setLoading]=useState(true);
 const [showSearch,setShowSearch]=useState(false);
 const [showFilters,setShowFilters]=useState(false);
 const [showDate,setShowDate]=useState(false);
 const [moreOpen,setMoreOpen]=useState(false);
 const searchRef=useRef<HTMLInputElement>(null);
 const selectedOnce=useRef(false);
 const refresh=useCallback(async(target:string)=>{
  const res=await fetch("/api/field-manager?date="+encodeURIComponent(target),{cache:"no-store"});
  const json=await res.json();if(!res.ok)throw new Error(json.error??"Не удалось загрузить явку");
  setData(json as MobileDesk);
 },[]);
 useEffect(()=>{let active=true;Promise.resolve().then(()=>{setLoading(true);return refresh(date)}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Ошибка загрузки")}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[date,refresh]);
 useEffect(()=>{if(tab!=="reviews"||reviewsLoaded)return;
  let active=true;Promise.resolve().then(async()=>{const r=await fetch("/api/operations/worker-confirmations",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось загрузить согласования");if(active){setReviews(j);setReviewsLoaded(true)}}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Ошибка")});return()=>{active=false};
 },[tab,reviewsLoaded]);
 const objects=data?.objects??[];
 useEffect(()=>{if(!selectedOnce.current&&data?.objects.length){selectedOnce.current=true;setObjectId(data.objects.find(o=>data.workers.some(w=>w.objectId===o.id&&w.attendance==="pending"))?.id??data.objects[0].id)}},[data]);
 const moveDate=(n:number)=>{const target=dateShift(date,n);if(target>=dateShift(today(),-7)&&target<=dateShift(today(),14)){setDate(target);setSelected([]);setOpenId(null)}};
 const switchTab=(value:"roster"|"reviews")=>{setTab(value);setSelected([]);setSelectionMode(false);setMoreOpen(false)};
 const allForDay=data?.workers??[];
 const rows=useMemo(()=>allForDay.filter(w=>(!objectId||w.objectId===objectId)&&w.kind===kind),[allForDay,objectId,kind]);
 const roles=[...new Set(rows.map(w=>w.specialty??"Без специальности"))].sort((a,b)=>a.localeCompare(b,"ru"));
 const list=rows.filter(w=>(!specialty||(w.specialty??"Без специальности")===specialty)
  &&(!search||[w.name,w.phone,w.specialty,w.objectName].some(v=>v?.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))))
  &&(status==="all"||status==="new"&&w.firstDay||status!=="new"&&w.attendance===status))
  .sort((a,b)=>(a.attendance==="pending"?0:a.attendance==="absent"?1:2)-(b.attendance==="pending"?0:b.attendance==="absent"?1:2)||Number(b.firstDay)-Number(a.firstDay)||a.name.localeCompare(b.name,"ru"));
 const assigned=rows.filter(w=>w.assignmentId);
 const counts={all:rows.length,planned:assigned.length,present:assigned.filter(w=>w.attendance==="present").length,absent:assigned.filter(w=>w.attendance==="absent").length,pending:rows.filter(w=>w.attendance==="pending").length,new:rows.filter(w=>w.firstDay).length};
 const focused=allForDay.find(w=>w.id===openId)||null;
 const checks=data?.checks??[];
 const currentStep=(w:MobileWorker,key:FirstDayStep)=>checks.find(x=>x.workerId===w.id&&x.date===date&&x.checkpoint===key);
 const proposals=[
  ...(reviews.planningChanges??[]).filter(x=>x.status==="proposed").map(x=>({...x,type:"plan" as const})),
  ...(reviews.patternChanges??[]).filter(x=>x.status==="proposed").map(x=>({...x,type:"pattern" as const})),
  ...(reviews.timeChanges??[]).filter(x=>x.status==="proposed").map(x=>({...x,type:"time" as const}))
 ].filter(x=>!objectId||x.objectId===objectId);
 const resetFilters=()=>{setSearch("");setSpecialty("");setStatus("all");setSelected([])};
 async function mutate(payload:Record<string,unknown>,message:string,patch?:(prev:MobileDesk)=>MobileDesk){
  setBusy(true);setError("");setNotice("");
  try{
   if(!demo){const r=await fetch("/api/field-manager",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok)throw new Error(j.error??"Изменения не сохранены");await refresh(date)}
   else if(patch)setData(prev=>prev?patch(prev):prev);
   setNotice(message);return true;
  }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить");return false}
  finally{setBusy(false)}
 }
 async function attendance(ids:string[],state:"present"|"absent"|"pending",reason:string|null=null){
  const members=rows.filter(w=>ids.includes(w.id)&&w.assignmentId);
  if(!members.length||members.length!==ids.length){setError("Все выбранные сотрудники должны быть назначены на смену");return}
  if(members.some(w=>w.objectId!==members[0].objectId)){setError("Массовая отметка выполняется отдельно для каждого объекта");return}
  if(state==="absent"&&!reason?.trim()){setError("Укажите причину или результат проверки неявки");return}
  const ok=await mutate({action:"attendance",date,objectId:members[0].objectId,kind,workerIds:ids,state,reason},state==="present"?"Явка сохранена":state==="absent"?"Неявка зафиксирована":"Отметка сброшена",
   prev=>({...prev,workers:prev.workers.map(w=>ids.includes(w.id)?{...w,attendance:state,reason}:w)}));
  if(ok){setSelected([]);setAbsenceId(null);setAbsenceReason("");}
 }
 async function firstDayAction(key:FirstDayStep,state:"done"|"issue"|null){
  if(!focused)return;
  const ok=await mutate({action:"first_day",objectId:focused.objectId,workerId:focused.id,date,checkpoint:key,state,note:stepNote.trim()||null},
   state==="done"?"Этап проверен":state==="issue"?"Проблема отмечена":"Отметка снята",
   prev=>({...prev,checks:[...prev.checks.filter(x=>!(x.workerId===focused.id&&x.date===date&&x.checkpoint===key)),...(state?[{workerId:focused.id,date,checkpoint:key,state,note:stepNote||null}]:[])]}));
  if(ok){setStepEditing(null);setStepNote("")}
 }
 async function review(item:(typeof proposals)[number],approve:boolean){
  setBusy(true);setError("");
  try{
   if(!demo){const action=item.type==="plan"?"review_plan":item.type==="pattern"?"review_pattern":"review_shift_time";
    const r=await fetch("/api/operations/worker-confirmations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,objectId:item.objectId,workerId:item.workerId,date:item.date,approve})});
    const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось обработать запрос")}
   setReviewsLoaded(false);setReviews(old=>({...old,
    [item.type==="plan"?"planningChanges":item.type==="pattern"?"patternChanges":"timeChanges"]:
      (old[item.type==="plan"?"planningChanges":item.type==="pattern"?"patternChanges":"timeChanges"]??[]).filter(x=>x.workerId!==item.workerId||x.date!==item.date)}));
   setNotice(approve?"Изменение согласовано":"Запрос отклонён");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка согласования")}finally{setBusy(false)}
 }
 return <div className="operis-compact-shifts">
  <div className="ocs-top-area">
   <header className="ocs-mobile-hero">
    <div><h2>Явка</h2><p>Контроль выходов на объектах</p></div>
    <button className="ocs-overflow" aria-label="Другие действия" aria-expanded={moreOpen} onClick={()=>setMoreOpen(v=>!v)}><MoreHorizontal size={23}/></button>
   </header>
   {moreOpen&&<div className="ocs-more-menu"><button onClick={()=>{setMoreOpen(false);setTab("reviews")}}><ClipboardCheck size={16}/> Запросы сотрудников <ChevronRight size={15}/></button><Link href="/launches"><Factory size={16}/> План запусков и выезды <ChevronRight size={15}/></Link><Link href="/timesheets"><CalendarDays size={16}/> Табели и сверка <ChevronRight size={15}/></Link>{onOpenSchedule&&<button onClick={onOpenSchedule}><CalendarDays size={16}/> Графики и смены <ChevronRight size={15}/></button>}<button onClick={()=>{setMoreOpen(false);setShowSearch(true);requestAnimationFrame(()=>searchRef.current?.focus())}}><Search size={16}/> Найти сотрудника <ChevronRight size={15}/></button></div>}
   <div className="ocs-object-switch">
    <span>Объект</span>
    <div><select aria-label="Выбрать объект" value={objectId} onChange={e=>{setObjectId(e.target.value);resetFilters()}}><option value="">Все доступные объекты</option>{objects.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select><ChevronDown size={17}/></div>
   </div>
   <div className="ocs-shift-date">
    <div className="ocs-shift-toggle" role="group" aria-label="Выбор смены"><button aria-pressed={kind==="day"} className={kind==="day"?"active":""} onClick={()=>{setKind("day");setSelected([])}}>День</button><button aria-pressed={kind==="night"} className={kind==="night"?"active":""} onClick={()=>{setKind("night");setSelected([])}}>Ночь</button></div>
    <div className="ocs-date-control">
     <button aria-label="Предыдущий день" disabled={date<=dateShift(today(),-7)} onClick={()=>moveDate(-1)}><ChevronLeft size={18}/></button>
     <button className="ocs-date-label" onClick={()=>setShowDate(v=>!v)} aria-expanded={showDate}><CalendarDays size={15}/>{labelDate(date)}<ChevronDown size={12}/></button>
     <button aria-label="Следующий день" disabled={date>=dateShift(today(),14)} onClick={()=>moveDate(1)}><ChevronRight size={18}/></button>
    </div>
   </div>
   {showDate&&<div className="ocs-calendar-picker"><input type="date" aria-label="Укажите дату" min={dateShift(today(),-7)} max={dateShift(today(),14)} value={date} onChange={e=>{if(e.target.value){setDate(e.target.value);setShowDate(false);setSelected([])}}}/><button onClick={()=>{setDate(today());setShowDate(false);setSelected([])}}>Сегодня</button></div>}
   {tab==="roster"&&<div className="ocs-attendance-summary"><span><strong>{counts.planned}</strong> в плане</span><span className="ocs-summary-pending"><strong>{counts.pending}</strong> проверить</span><span className="ocs-summary-absent"><strong>{counts.absent}</strong> неявки</span></div>}
  </div>
  {error&&<div className="ocs-feedback error" role="alert"><AlertTriangle size={14}/>{error}<button onClick={()=>setError("")} aria-label="Закрыть"><X size={14}/></button></div>}
  {notice&&<div className="ocs-feedback" role="status"><Check size={14}/>{notice}</div>}
  {tab==="roster"&&<>
   <div className="ocs-status-rail" role="group" aria-label="Фильтр явки">
    {([{key:"all",label:"Все",count:counts.all},{key:"pending",label:"Проверить",count:counts.pending},{key:"present",label:"На месте",count:counts.present},{key:"absent",label:"Неявки",count:counts.absent},{key:"new",label:"Новички",count:counts.new}] as const).map(c=><button key={c.key} aria-pressed={status===c.key} className={status===c.key?"active":""} onClick={()=>{setStatus(c.key);setSelected([])}}>{c.label}<span>{c.count}</span></button>)}
   </div>
   <div className="ocs-list-tools">
    <div><strong>Сотрудники</strong><span>{list.length}</span></div>
    <div className="ocs-tool-actions">
     <button aria-label="Поиск" aria-pressed={showSearch} className={showSearch?"active":""} onClick={()=>{setShowSearch(v=>!v);if(!showSearch)requestAnimationFrame(()=>searchRef.current?.focus());else setSearch("")}}><Search size={18}/></button>
     <button aria-label="Фильтр по профессии" aria-pressed={!!specialty} className={specialty?"active":""} onClick={()=>setShowFilters(true)}><Filter size={18}/>{specialty&&<i/>}</button>
     {canEdit&&<button aria-label={selectionMode?"Отменить выбор":"Выбрать сотрудников"} aria-pressed={selectionMode} className={selectionMode?"active":""} onClick={()=>{setSelectionMode(v=>!v);setSelected([])}}><Users size={18}/></button>}
    </div>
   </div>
   {showSearch&&<label className="ocs-search-expanded"><Search size={17}/><input ref={searchRef} value={search} aria-label="Поиск по ФИО и телефону" onChange={e=>setSearch(e.target.value)} placeholder="ФИО, телефон, должность" type="search"/><button aria-label="Закрыть поиск" onClick={()=>{setSearch("");setShowSearch(false)}}><X size={17}/></button></label>}
   {specialty&&<div className="ocs-current-filter"><span>{specialty}</span><button aria-label="Сбросить профессию" onClick={()=>setSpecialty("")}><X size={14}/></button></div>}
   <div className="ocs-roster" role="list" aria-label="Список явки">
    {list.map(w=><div role="listitem" className={"ocs-person "+(w.attendance!=="pending"?"marked ":"")+(w.firstDay?"first-day ":"")} key={w.assignmentId??w.id}>
     {selectionMode?<label className="ocs-selector"><input type="checkbox" aria-label={"Выбрать "+w.name} disabled={!w.assignmentId||!!busy} checked={selected.includes(w.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,w.id]:v.filter(id=>id!==w.id))}/></label>:<span className={"ocs-attendance-indicator "+w.attendance} aria-label={statusName[w.attendance]} title={statusName[w.attendance]}/>}
     <button className="ocs-person-main" onClick={()=>{setOpenId(w.id);setStepEditing(null)}} title={w.name}>
      <span className="ocs-person-name">{w.name}{w.firstDay&&<span className="ocs-newbie-tag">Новый</span>}</span>
      <small>{w.specialty??"Сотрудник"}{!objectId?" · "+w.objectName:""}</small>
     </button>
     {tel(w.phone)?<a className="ocs-row-phone" href={tel(w.phone)!} aria-label={"Позвонить "+w.name}><Phone size={16}/></a>:null}
     {!selectionMode&&canEdit&&<button className={"ocs-quick-present "+(w.attendance==="present"?"is-present":"")} aria-label={"Отметить присутствие: "+w.name} title={w.attendance==="present"?"На месте":"Отметить на месте"} disabled={!w.assignmentId||!!busy} onClick={()=>void attendance([w.id],"present")}><Check size={19}/></button>}
     {!selectionMode&&<button className="ocs-quick-more" aria-label={"Действия с сотрудником "+w.name} onClick={()=>{setOpenId(w.id);setStepEditing(null)}}><MoreHorizontal size={19}/></button>}
    </div>)}
    {loading&&<div className="ocs-empty">Загружаем сотрудников…</div>}
    {!loading&&list.length===0&&<div className="ocs-empty">Нет сотрудников по выбранным условиям.{(search||specialty||status!=="all")&&<button onClick={resetFilters}>Сбросить фильтры</button>}</div>}
   </div>
   {selectionMode&&<div className="ocs-bulk"><span>Выбрано <strong>{selected.length}</strong></span><button disabled={!canEdit||!selected.length||!!busy} onClick={()=>{const chosen=rows.filter(w=>selected.includes(w.id));if(new Set(chosen.map(x=>x.objectId)).size!==1){setError("Выберите сотрудников одного объекта");return}if(window.confirm("Отметить на месте "+selected.length+" сотрудников?"))void attendance(selected,"present")}}>Подтвердить явку <Check size={15}/></button></div>}
  </>}
  {tab==="reviews"&&<div className="ocs-reviews">
   {proposals.map((p,i)=>{const name=reviews.workers?.find(x=>x.id===p.workerId);return <article className="ocs-request" key={p.workerId+p.date+p.type+i}><small>{name?.object??"Объект"} · {labelDate(p.date)}</small><strong>{name?.name??"Сотрудник"}</strong><p>{p.type==="plan"?"Изменение смены":p.type==="pattern"?"Изменение графика":"Изменение времени"}{p.kind?" · "+({night:"Ночная",day:"Дневная",off:"Выходной"}[p.kind]??""):""}{p.workDays?" · "+p.workDays+"/"+p.restDays:""}{p.startTime?" · "+p.startTime+"–"+p.endTime:""}</p>{canEdit&&<div><button disabled={busy} onClick={()=>void review(p,false)}>Отклонить</button><button disabled={busy} className="primary" onClick={()=>void review(p,true)}>Согласовать</button></div>}</article>})}
   {!reviewsLoaded&&<div className="ocs-empty">Загружаем запросы…</div>}
   {reviewsLoaded&&!proposals.length&&<div className="ocs-empty">Ожидающих решений нет.</div>}
   <Link className="ocs-link" href="/timesheets">Открыть табели и сверки <ChevronRight size={14}/></Link>
  </div>}
  {showFilters&&<div className="ocs-overlay" role="presentation" onClick={()=>setShowFilters(false)}><section role="dialog" aria-modal="true" aria-label="Фильтры сотрудников" className="ocs-sheet ocs-filters-sheet" onClick={e=>e.stopPropagation()}>
   <div className="ocs-sheet-handle"/>
   <div className="ocs-sheet-head"><strong>Профессия</strong><button aria-label="Закрыть фильтры" onClick={()=>setShowFilters(false)}><X size={18}/></button></div>
   <div className="ocs-specialty-list">
    {[{name:"Все профессии",value:"",count:rows.length},...roles.map(name=>({name,value:name,count:rows.filter(w=>(w.specialty??"Без специальности")===name).length}))].map(r=><button key={r.value} className={specialty===r.value?"active":""} onClick={()=>{setSpecialty(r.value);setShowFilters(false);setSelected([])}}><span className="ocs-specialty-check">{specialty===r.value&&<Check size={14}/>}</span><span>{r.name}</span><small>{r.count}</small></button>)}
   </div>
  </section></div>}
  {absenceId&&<div className="ocs-overlay" role="presentation" onClick={()=>setAbsenceId(null)}><section role="dialog" aria-modal="true" aria-label="Неявка" className="ocs-sheet" onClick={e=>e.stopPropagation()}><div className="ocs-sheet-head"><strong>Сотрудник не найден на месте</strong><button aria-label="Закрыть" onClick={()=>setAbsenceId(null)}><X size={17}/></button></div><p>{allForDay.find(w=>w.id===absenceId)?.name}</p><label>Причина или результат проверки<select value={absenceReason} onChange={e=>setAbsenceReason(e.target.value)}><option value="">Выберите причину</option><option value="Не отвечает на звонок">Не отвечает на звонок</option><option value="Сообщил, что не выйдет">Сообщил, что не выйдет</option><option value="Не прибыл к началу смены">Не прибыл к началу смены</option><option value="Другая причина, уточняется">Другая причина, уточняется</option></select></label><p className="ocs-help">Неявка фиксируется менеджером после проверки. Если человек приедет позже, можно отметить его на месте — история сохранится.</p><div className="ocs-absence-actions"><button disabled={!absenceReason||busy} onClick={()=>void attendance([absenceId],"pending",absenceReason)}>Ожидаем / уточняем</button><button className="ocs-danger-action" disabled={!absenceReason||busy} onClick={()=>void attendance([absenceId],"absent",absenceReason)}>Подтвердить неявку</button></div></section></div>}
  {focused&&<div className="ocs-overlay" role="presentation" onClick={()=>setOpenId(null)}><section role="dialog" aria-modal="true" aria-label={"Сотрудник "+focused.name} className="ocs-sheet ocs-worker-sheet" onClick={e=>e.stopPropagation()}>
   <div className="ocs-sheet-head"><div><strong>{focused.name}</strong><small>{focused.objectName} · {focused.specialty??"Сотрудник"}</small></div><button aria-label="Закрыть" onClick={()=>setOpenId(null)}><X size={17}/></button></div>
   <div className="ocs-sheet-row"><span>Явка</span><strong>{statusName[focused.attendance]}</strong></div><div className="ocs-sheet-row"><span>Смена</span><strong>{focused.kind==="night"?"Ночная":"Дневная"}{focused.time?" · "+focused.time:""}</strong></div>
   {focused.documents&&!focused.firstDay&&<div className="ocs-sheet-row"><span>Документы</span><strong>{focused.documents==="ready"?"Подготовлены":focused.documents==="problem"?"Есть вопросы":"Проверить"}</strong></div>}
   {focused.firstDay&&<><h3>Первый выход</h3>
   <div className="ocs-linked-readiness">
    <div><span>Документы</span><strong>{focused.documents==="ready"?"Подготовлены":focused.documents==="problem"?"Требуют внимания":"Проверить по карточке"}</strong></div>
    <div><span>Спецодежда и СИЗ</span><strong>{focused.ppeMissing.length?focused.ppeMissing.length+" позиций к выдаче":"Нет отмеченной недостачи"}</strong></div>
    <Link href={"/workers/"+focused.id}>Открыть данные сотрудника <ChevronRight size={13}/></Link>
   </div>
   {steps.filter(x=>x.key!=="documents_checked"&&x.key!=="ppe_checked").map(x=>{const ck=currentStep(focused,x.key);return <div key={x.key} className="ocs-step"><button onClick={()=>{setStepEditing(v=>v===x.key?null:x.key);setStepNote(ck?.note??"")}}><span className={"ocs-checkbox "+(ck?.state==="done"?"checked":"")}>{ck?.state==="done"?<Check size={12}/>:ck?.state==="issue"?"!":""}</span><span>{x.name}</span><small>{ck?.state==="issue"?"Проблема":ck?.state==="done"?"Проверено":""}</small><ChevronDown size={13}/></button>{stepEditing===x.key&&<div className="ocs-step-edit"><input placeholder="Примечание при необходимости" maxLength={500} value={stepNote} onChange={e=>setStepNote(e.target.value)}/><div><button disabled={!canEdit||busy} onClick={()=>void firstDayAction(x.key,null)}>Сбросить</button><button disabled={!canEdit||busy} onClick={()=>void firstDayAction(x.key,"issue")}>Проблема</button><button disabled={!canEdit||busy||x.key==="started"&&focused.attendance!=="present"} onClick={()=>void firstDayAction(x.key,"done")}>Проверено</button></div></div>}</div>})}</>}
   <div className="ocs-sheet-actions">{tel(focused.phone)&&<a href={tel(focused.phone)!}><Phone size={14}/> Позвонить</a>}{focused.attendance!=="pending"&&canEdit&&<button onClick={()=>{void attendance([focused.id],"pending","Перепроверка менеджером");setOpenId(null)}}><Undo2 size={14}/> На проверку</button>}<Link href={"/workers/"+focused.id}>Полная карточка <ChevronRight size={14}/></Link></div>
  </section></div>}
  <nav className="ocs-bottom-shortcuts" aria-label="Быстрые переходы по сменам">
   <button className={tab==="roster"?"active":""} aria-current={tab==="roster"?"page":undefined} onClick={()=>switchTab("roster")}><Users size={20}/><span>Явка</span></button>
   <button className={tab==="reviews"?"active":""} aria-current={tab==="reviews"?"page":undefined} onClick={()=>switchTab("reviews")}><ClipboardCheck size={20}/><span>Запросы</span></button>
   <Link href="/launches"><Factory size={20}/><span>Выезды</span></Link>
  </nav>
 </div>;
}
