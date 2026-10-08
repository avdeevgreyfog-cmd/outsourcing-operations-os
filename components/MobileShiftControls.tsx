"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {AlertTriangle,Check,ChevronDown,ChevronRight,Phone,Search,Undo2,X} from "lucide-react";
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
export function MobileShiftControls({canEdit,demo}:{canEdit:boolean;demo:boolean}){
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
 const allForDay=data?.workers??[];
 const rows=useMemo(()=>allForDay.filter(w=>(!objectId||w.objectId===objectId)&&w.kind===kind),[allForDay,objectId,kind]);
 const roles=[...new Set(rows.map(w=>w.specialty??"Без специальности"))].sort((a,b)=>a.localeCompare(b,"ru"));
 const list=rows.filter(w=>(!specialty||(w.specialty??"Без специальности")===specialty)
  &&(!search||[w.name,w.phone,w.specialty,w.objectName].some(v=>v?.toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))))
  &&(status==="all"||status==="new"&&w.firstDay||status!=="new"&&w.attendance===status))
  .sort((a,b)=>(a.attendance==="pending"?0:a.attendance==="absent"?1:2)-(b.attendance==="pending"?0:b.attendance==="absent"?1:2)||Number(b.firstDay)-Number(a.firstDay)||a.name.localeCompare(b.name,"ru"));
 const assigned=rows.filter(w=>w.assignmentId);
 const counts={all:assigned.length,present:assigned.filter(w=>w.attendance==="present").length,absent:assigned.filter(w=>w.attendance==="absent").length,pending:assigned.filter(w=>w.attendance==="pending").length,new:rows.filter(w=>w.firstDay).length};
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
  <div className="ocs-filter-sticky">
   <div className="ocs-heading"><strong>Контроль выходов</strong><label>Дата <input aria-label="Дата явки" type="date" value={date} onChange={e=>{setDate(e.target.value);setSelected([])}}/></label></div>
   <div className="ocs-object-row"><select aria-label="Объект" value={objectId} onChange={e=>{setObjectId(e.target.value);resetFilters()}}><option value="">Все доступные объекты</option>{objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select><div className="ocs-shift-toggle"><button className={kind==="day"?"active":""} onClick={()=>{setKind("day");setSelected([])}}>День</button><button className={kind==="night"?"active":""} onClick={()=>{setKind("night");setSelected([])}}>Ночь</button></div></div>
   <div className="ocs-subtabs"><button className={tab==="roster"?"active":""} onClick={()=>setTab("roster")}>Явка</button><button className={tab==="reviews"?"active":""} onClick={()=>setTab("reviews")}>Запросы {proposals.length>0?"· "+proposals.length:""}</button><Link href="/launches">Выезды <ChevronRight size={13}/></Link></div>
  </div>
  {error&&<div className="ocs-feedback error" role="alert"><AlertTriangle size={14}/>{error}<button onClick={()=>setError("")} aria-label="Закрыть"><X size={14}/></button></div>}
  {notice&&<div className="ocs-feedback" role="status"><Check size={14}/>{notice}</div>}
  {tab==="roster"&&<>
   <div className="ocs-metrics"><span>План <strong>{counts.all}</strong></span><span>На месте <strong>{counts.present}</strong></span><span>Проверить <strong>{counts.pending}</strong></span><span>Неявки <strong>{counts.absent}</strong></span></div>
   <div className="ocs-search"><Search size={15}/><input aria-label="Поиск сотрудников" placeholder="ФИО, телефон, профессия" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   <div className="ocs-refiners"><select aria-label="Профессия" value={specialty} onChange={e=>{setSpecialty(e.target.value);setSelected([])}}><option value="">Все профессии</option>{roles.map(x=><option key={x} value={x}>{x}</option>)}</select><select aria-label="Статус" value={status} onChange={e=>{setStatus(e.target.value as typeof status);setSelected([])}}><option value="all">Все статусы</option><option value="pending">Не проверены</option><option value="absent">Неявки</option><option value="present">На месте</option><option value="new">Первый выход</option></select></div>
   <div className="ocs-listbar"><span>Сотрудники <strong>{list.length}</strong></span>{canEdit&&<button onClick={()=>{setSelectionMode(v=>!v);setSelected([])}}>{selectionMode?"Отмена":"Выбрать несколько"}</button>}</div>
   <div className="ocs-roster" role="list" aria-label="Явка сотрудников">
    {list.map(w=><div role="listitem" className={"ocs-person "+(w.firstDay?"first-day ":"")} key={w.assignmentId??w.id}>
     {selectionMode&&<label className="ocs-selector"><input type="checkbox" aria-label={"Выбрать "+w.name} disabled={!w.assignmentId||!!busy} checked={selected.includes(w.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,w.id]:v.filter(id=>id!==w.id))}/></label>}
     <button className="ocs-person-main" onClick={()=>{setOpenId(w.id);setStepEditing(null)}} title={w.name}><span className="ocs-person-name">{w.name}</span><small>{w.specialty??"Сотрудник"}{!objectId?" · "+w.objectName:""}{w.firstDay?" · Первый выход":""}</small></button>
     <span className={"ocs-dot "+w.attendance} aria-label={statusName[w.attendance]} title={statusName[w.attendance]}/>
     {tel(w.phone)?<a className="ocs-row-phone" href={tel(w.phone)!} aria-label={"Позвонить "+w.name}><Phone size={15}/></a>:<span className="ocs-row-phone unavailable" title="Телефон отсутствует"><Phone size={15}/></span>}
     {canEdit&&<div className="ocs-attendance"><button className={w.attendance==="present"?"is-present":""} disabled={!w.assignmentId||!!busy} aria-label={"Отметить на месте "+w.name} title="На месте" onClick={()=>void attendance([w.id],"present")}><Check size={17}/></button><button className={w.attendance==="absent"?"is-absent":""} disabled={!w.assignmentId||!!busy} title="Неявка — уточнить" aria-label={"Отметить неявку "+w.name} onClick={()=>{setAbsenceId(w.id);setAbsenceReason("")}}><X size={17}/></button></div>}
    </div>)}
    {loading&&<div className="ocs-empty">Загружаем смену…</div>}
    {!loading&&list.length===0&&<div className="ocs-empty">Нет сотрудников по выбранным условиям.</div>}
   </div>
   {selectionMode&&<div className="ocs-bulk"><span>Выбрано: <strong>{selected.length}</strong></span><button disabled={!canEdit||!!selected.length||!!busy} onClick={()=>{const chosen=rows.filter(w=>selected.includes(w.id));if(new Set(chosen.map(x=>x.objectId)).size!==1){setError("Отмечайте сотрудников одного объекта за раз");return}if(window.confirm("Подтвердить присутствие "+selected.length+" сотрудников?"))void attendance(selected,"present")}}>На месте <Check size={15}/></button></div>}
  </>}
  {tab==="reviews"&&<div className="ocs-reviews">
   {proposals.map((p,i)=>{const name=reviews.workers?.find(x=>x.id===p.workerId);return <article className="ocs-request" key={p.workerId+p.date+p.type+i}><small>{name?.object??"Объект"} · {labelDate(p.date)}</small><strong>{name?.name??"Сотрудник"}</strong><p>{p.type==="plan"?"Изменение смены":p.type==="pattern"?"Изменение графика":"Изменение времени"}{p.kind?" · "+({night:"Ночная",day:"Дневная",off:"Выходной"}[p.kind]??""):""}{p.workDays?" · "+p.workDays+"/"+p.restDays:""}{p.startTime?" · "+p.startTime+"–"+p.endTime:""}</p>{canEdit&&<div><button disabled={busy} onClick={()=>void review(p,false)}>Отклонить</button><button disabled={busy} className="primary" onClick={()=>void review(p,true)}>Согласовать</button></div>}</article>})}
   {!reviewsLoaded&&<div className="ocs-empty">Загружаем запросы…</div>}
   {reviewsLoaded&&!proposals.length&&<div className="ocs-empty">Ожидающих решений нет.</div>}
   <Link className="ocs-link" href="/timesheets">Открыть табели и сверки <ChevronRight size={14}/></Link>
  </div>}
  {absenceId&&<div className="ocs-overlay" role="presentation" onClick={()=>setAbsenceId(null)}><section role="dialog" aria-modal="true" aria-label="Неявка" className="ocs-sheet" onClick={e=>e.stopPropagation()}><div className="ocs-sheet-head"><strong>Сотрудник не найден на месте</strong><button aria-label="Закрыть" onClick={()=>setAbsenceId(null)}><X size={17}/></button></div><p>{allForDay.find(w=>w.id===absenceId)?.name}</p><label>Причина или результат проверки<select value={absenceReason} onChange={e=>setAbsenceReason(e.target.value)}><option value="">Выберите причину</option><option value="Не отвечает на звонок">Не отвечает на звонок</option><option value="Сообщил, что не выйдет">Сообщил, что не выйдет</option><option value="Не прибыл к началу смены">Не прибыл к началу смены</option><option value="Другая причина, уточняется">Другая причина, уточняется</option></select></label><p className="ocs-help">Неявка фиксируется менеджером после проверки. Если человек приедет позже, можно отметить его на месте — история сохранится.</p><div className="ocs-absence-actions"><button disabled={!absenceReason||busy} onClick={()=>void attendance([absenceId],"pending",absenceReason)}>Ожидаем / уточняем</button><button className="ocs-danger-action" disabled={!absenceReason||busy} onClick={()=>void attendance([absenceId],"absent",absenceReason)}>Подтвердить неявку</button></div></section></div>}
  {focused&&<div className="ocs-overlay" role="presentation" onClick={()=>setOpenId(null)}><section role="dialog" aria-modal="true" aria-label={"Сотрудник "+focused.name} className="ocs-sheet ocs-worker-sheet" onClick={e=>e.stopPropagation()}>
   <div className="ocs-sheet-head"><div><strong>{focused.name}</strong><small>{focused.objectName} · {focused.specialty??"Сотрудник"}</small></div><button aria-label="Закрыть" onClick={()=>setOpenId(null)}><X size={17}/></button></div>
   <div className="ocs-sheet-row"><span>Явка</span><strong>{statusName[focused.attendance]}</strong></div><div className="ocs-sheet-row"><span>Смена</span><strong>{focused.kind==="night"?"Ночная":"Дневная"}{focused.time?" · "+focused.time:""}</strong></div>
   {focused.documents&&<div className="ocs-sheet-row"><span>Документы</span><strong>{focused.documents==="ready"?"Подготовлены":focused.documents==="problem"?"Есть вопросы":"Проверить"}</strong></div>}
   {focused.firstDay&&<><h3>Первый выход</h3>
   <div className="ocs-linked-readiness">
    <div><span>Документы</span><strong>{focused.documents==="ready"?"Подготовлены":focused.documents==="problem"?"Требуют внимания":"Проверить по карточке"}</strong></div>
    <div><span>Спецодежда и СИЗ</span><strong>{focused.ppeMissing.length?focused.ppeMissing.length+" позиций к выдаче":"Нет отмеченной недостачи"}</strong></div>
    <Link href={"/workers/"+focused.id}>Открыть данные сотрудника <ChevronRight size={13}/></Link>
   </div>
   {steps.filter(x=>x.key!=="documents_checked"&&x.key!=="ppe_checked").map(x=>{const ck=currentStep(focused,x.key);return <div key={x.key} className="ocs-step"><button onClick={()=>{setStepEditing(v=>v===x.key?null:x.key);setStepNote(ck?.note??"")}}><span className={"ocs-checkbox "+(ck?.state==="done"?"checked":"")}>{ck?.state==="done"?<Check size={12}/>:ck?.state==="issue"?"!":""}</span><span>{x.name}</span><small>{ck?.state==="issue"?"Проблема":ck?.state==="done"?"Проверено":""}</small><ChevronDown size={13}/></button>{stepEditing===x.key&&<div className="ocs-step-edit"><input placeholder="Примечание при необходимости" maxLength={500} value={stepNote} onChange={e=>setStepNote(e.target.value)}/><div><button disabled={!canEdit||busy} onClick={()=>void firstDayAction(x.key,null)}>Сбросить</button><button disabled={!canEdit||busy} onClick={()=>void firstDayAction(x.key,"issue")}>Проблема</button><button disabled={!canEdit||busy||x.key==="started"&&focused.attendance!=="present"} onClick={()=>void firstDayAction(x.key,"done")}>Проверено</button></div></div>}</div>})}</>}
   <div className="ocs-sheet-actions">{tel(focused.phone)&&<a href={tel(focused.phone)!}><Phone size={14}/> Позвонить</a>}{focused.attendance!=="pending"&&canEdit&&<button onClick={()=>{void attendance([focused.id],"pending","Перепроверка менеджером");setOpenId(null)}}><Undo2 size={14}/> На проверку</button>}<Link href={"/workers/"+focused.id}>Полная карточка <ChevronRight size={14}/></Link></div>
  </section></div>}
 </div>;
}
