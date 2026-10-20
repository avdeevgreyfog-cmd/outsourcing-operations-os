"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {RegistryDrawer} from "@/components/registry/RegistryDrawer";
import {EmployeePortalLinkControls,type LinkPayload} from "@/components/EmployeePortalLinkControls";
import {Copy,ExternalLink,Link2,RefreshCw,ShieldOff} from "lucide-react";
type Worker={id:string;name:string;objectId:string|null;object:string|null;specialty:string|null;paidHours:number;workDays?:number|null;restDays?:number|null;shiftKind?:"day"|"night"|"mixed"|null};
type Report={workerId:string;objectId:string;date:string;shiftKind:"day"|"night"|"off"|null;response:"working"|"day_off"|"cannot_work";reason:string|null;hours:number|null;updatedAt:string;employeeRespondedAt?:string|null;reconciledAt?:string|null;needsReconfirmation?:boolean;reviewStatus?:"pending"|"approved"|"rejected";approvedHours?:number|null;reviewedAt?:string|null;reviewComment?:string|null};
type Plan={workerId:string;objectId:string;date:string;timeCode:string;kind:string|null};
type LinkRecord={id:string;workerId:string;objectId:string;status:"active"|"paused"|"revoked";lastOpenedAt:string|null;createdAt:string};
type Setting={objectId:string;scheduleOwner:"manager"|"worker";confirmationDeadline:string;managerPhone?:string|null;planningHorizonDays?:number;showEmployeeDocuments?:boolean;showEmployeeWorkwear?:boolean};
type TimeUpdate={workerId:string;objectId:string;date:string;startTime:string;endTime:string;status:"proposed"|"accepted"|"rejected";appliesTo:"single"|"regular"};
type PatternChange={workerId:string;objectId:string;date:string;workDays:number;restDays:number;shiftKind:"day"|"night";floatingDaysOff:boolean;status:string};
type PlanningChange={workerId:string;objectId:string;date:string;kind:"day"|"night"|"off";status:string};
type Authority={workerId:string;objectId:string;scheduleOwner:"manager"|"worker"};
type DocumentUpdate={workerId:string;objectId:string;code:string;employeeReported:boolean;managerVerified:boolean};
type Payload={workers:Worker[];reports:Report[];links:LinkRecord[];settings:Setting[];plans?:Plan[];timeChanges?:TimeUpdate[];documents?:DocumentUpdate[];planningChanges?:PlanningChange[];workerAuthorities?:Authority[];patternChanges?:PatternChange[]};
const empty:Payload={workers:[],reports:[],links:[],settings:[]};
function localDate(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function tomorrow(){const d=new Date();d.setDate(d.getDate()+1);return localDate(d)}
function dateLabel(date:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"))}
export function WorkerConfirmationManager({objectId,workerId,canEdit,canReconcile=false,demo=false,view,hideTabs=false}:{objectId?:string;workerId?:string;canEdit:boolean;canReconcile?:boolean;demo?:boolean;view?:"answers"|"links"|"updates";hideTabs?:boolean}){
 const [data,setData]=useState<Payload>(empty);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState("");
 const [info,setInfo]=useState("");
 const [hoursReview,setHoursReview]=useState<{worker:Worker;report:Report}|null>(null);
 const [approvedHours,setApprovedHours]=useState("");
 const [reviewComment,setReviewComment]=useState("");
 const [confirmation,setConfirmation]=useState<{title:string;text:string;label:string;body:Record<string,string|number|boolean|null>}|null>(null);
 const [localMode,setMode]=useState<"answers"|"links"|"updates">("answers");
 const mode=view??localMode;
 const [search,setSearch]=useState("");
 const [patternWorker,setPatternWorker]=useState("");
 const [patternCode,setPatternCode]=useState("5/2");
 const [patternShift,setPatternShift]=useState<"day"|"night">("day");
 const [patternFloating,setPatternFloating]=useState(false);
 const [patternFrom,setPatternFrom]=useState(localDate());
 const [specialWorker,setSpecialWorker]=useState("");
 const [specialOwner,setSpecialOwner]=useState<"inherit"|"manager"|"worker">("inherit");

 const [relationType,setRelationType]=useState<"employment"|"gph"|"npd"|"custom">("gph");
 const [docCode,setDocCode]=useState("medical_book");
 const [docRequired,setDocRequired]=useState(true);
 const [onlyAttention,setOnlyAttention]=useState(false);
 const [filterObject,setFilterObject]=useState(objectId??"all");
 const [busy,setBusy]=useState("");
 const initialDates=useRef(false);
 const [day,setDay]=useState(()=>new Date(Date.now()+86400000).toISOString().slice(0,10));
 const [fromDate,setFromDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()-7);return localDate(d)});
 const [toDate,setToDate]=useState(()=>localDate());
 const load=useCallback(async()=>{
  try{
   const q=new URLSearchParams();if(objectId)q.set("objectId",objectId);if(workerId)q.set("workerId",workerId);
   const r=await fetch("/api/operations/worker-confirmations?"+q.toString(),{cache:"no-store"});
   const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось получить данные");
   setData(j);setError("");if(!initialDates.current){setDay(tomorrow());initialDates.current=true;}
  }catch(e){setError(e instanceof Error?e.message:"Ошибка получения данных")}finally{setLoaded(true)}
 },[objectId,workerId]);
 useEffect(()=>{void Promise.resolve().then(()=>load())},[load]);
 const links=useMemo(()=>new Map(data.links.map(x=>[x.workerId+":"+x.objectId,x])),[data.links]);
 const reports=useMemo(()=>new Map(data.reports.map(x=>[x.workerId+":"+x.objectId+":"+x.date,x])),[data.reports]);
 const settings=useMemo(()=>new Map(data.settings.map(x=>[x.objectId,x])),[data.settings]);
 const plans=useMemo(()=>new Map((data.plans??[]).map(x=>[x.workerId+":"+x.objectId+":"+x.date,x])),[data.plans]);
 const options=useMemo(()=>[...new Map(data.workers.filter(x=>x.objectId).map(x=>[x.objectId!,x.object??"Объект"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[data.workers]);
 const scoped=data.workers.filter(w=>(filterObject==="all"||w.objectId===filterObject)&&(!search||((w.name+" "+w.object+" "+w.specialty).toLowerCase().includes(search.toLowerCase()))));
 const visible=scoped.filter(w=>!onlyAttention||((!reports.get(w.id+":"+w.objectId+":"+day)||reports.get(w.id+":"+w.objectId+":"+day)?.needsReconfirmation)&&["PLANNED","WORK","WORK_PENDING"].includes(plans.get(w.id+":"+w.objectId+":"+day)?.timeCode??"")));
 const expected=scoped.filter(w=>{const p=plans.get(w.id+":"+w.objectId+":"+day);return p&&["PLANNED","WORK","WORK_PENDING"].includes(p.timeCode)});
 const replies=expected.filter(w=>{const r=reports.get(w.id+":"+w.objectId+":"+day);return r&&!r.needsReconfirmation}).length;
 const missing=expected.length-replies;
 const activeLinks=data.links.filter(l=>l.status==="active").length;
 async function action(body:Record<string,string|number|boolean|null>){
  if(busy)return;
  const key=String(body.action)+":"+String(body.workerId??body.objectId);setBusy(key);setError("");setInfo("");
  if(demo){
   if(body.action==="create"||body.action==="rotate"||body.action==="copy"||body.action==="copy_mobile"||body.action==="copy_desktop"){
     const url=window.location.origin+"/employee-timesheet/demo?layout="+(body.action==="copy_desktop"?"desktop":"mobile");
     try{await navigator.clipboard.writeText(url);setInfo("Демо-ссылка скопирована")}catch{setInfo("Демо-ссылка: "+url)}
   }else setInfo("Демонстрация: действие доступно в рабочем контуре");
   setBusy("");return;
  }
  try{
   const r=await fetch("/api/operations/worker-confirmations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...body,action:body.action==="copy_mobile"||body.action==="copy_desktop"?"copy":body.action})});
   const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось выполнить действие");
   if(j.path){
     const url=window.location.origin+j.path+(body.action==="copy_mobile"?"?layout=mobile":body.action==="copy_desktop"?"?layout=desktop":"");
     try{await navigator.clipboard.writeText(url);setInfo("Персональная ссылка скопирована. Отправьте её сотруднику.")}catch{setInfo("Ссылка: "+url)}
   }else setInfo(body.action==="reconcile"?`Промежуточная сверка сохранена. Проверено записей сотрудников: ${j.accepted??0}`:"Сохранено");
   await load();
  }catch(e){setError(e instanceof Error?e.message:"Ошибка сохранения")}finally{setBusy("")}
 }
 function reply(w:Worker){
  const r=reports.get(w.id+":"+w.objectId+":"+day);
  if(!r){if(!plans.has(w.id+":"+w.objectId+":"+day))return <span className="worker-confirmation-status">Выход не запланирован</span>;if(plans.get(w.id+":"+w.objectId+":"+day)?.timeCode==="DAY_OFF")return <span className="worker-confirmation-status">Выходной по графику</span>;return <span className="worker-confirmation-status warn">Нет ответа</span>;}
  if(r.needsReconfirmation){const p=plans.get(w.id+":"+w.objectId+":"+day);return <span className="worker-confirmation-status warn">{p?.timeCode==="DAY_OFF"?"Выходной по новому плану":!p?"Нет назначенной смены":"План изменён · нужен новый ответ"}</span>;}
  if(r.response==="cannot_work")return <span className="worker-confirmation-status bad">Не выйдет</span>;
  if(r.response==="day_off")return <span className="worker-confirmation-status">Выходной</span>;
  return <span className="worker-confirmation-status good">{r.shiftKind==="night"?"Выйдет ночью":"Выйдет днём"}</span>;
 }
 return <section className="worker-confirmation-manager">
  {!hideTabs&&<div className="worker-confirmation-tabs object-local-tabs">
   <button type="button" aria-pressed={mode==="answers"} className={mode==="answers"?"active":""} onClick={()=>setMode("answers")}>Подтверждения</button>
   <button type="button" aria-pressed={mode==="links"} className={mode==="links"?"active":""} onClick={()=>setMode("links")}>Персональные ссылки</button>
    <button type="button" aria-pressed={mode==="updates"} className={mode==="updates"?"active":""} onClick={()=>setMode("updates")}>Изменения сотрудников</button>
   {demo&&<span className="cell-sub">Демонстрационный режим</span>}
  </div>}
  {hideTabs&&demo&&<div className="object-context-line">Демонстрационный режим</div>}
  <div className="worker-confirmation-toolbar">
   {!objectId&&<select aria-label="Фильтр по объекту" value={filterObject} onChange={e=>setFilterObject(e.target.value)}><option value="all">Все объекты</option>{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>}
   <input aria-label="Поиск сотрудника" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по сотруднику"/>
   {mode==="answers"&&<><input type="date" value={day} onChange={e=>setDay(e.target.value)} aria-label="Дата подтверждений"/><label className="worker-confirmation-compact"><input type="checkbox" checked={onlyAttention} onChange={e=>setOnlyAttention(e.target.checked)}/> Только без ответа</label></>}
   <button type="button" className="button right" onClick={()=>void load()}><RefreshCw size={14}/> Обновить данные</button>
  </div>
  {error&&<div role="alert" className="worker-confirmation-manager-error">{error}</div>}
  {info&&<div role="status" className="worker-confirmation-note">{info}</div>}
  {!loaded?<p className="worker-confirmation-note">Загрузка данных…</p>:<>
   {mode==="answers"?<>
    <div className="worker-confirmation-summary"><span>На {dateLabel(day)}</span><span>Ответили: <b>{replies}</b></span><span>Нет ответа: <b>{missing}</b></span></div>
    <div className="worker-confirmation-note">Сведения сотрудников используются для оперативного планирования. Неответивший сотрудник не считается неявившимся.</div>
    {canReconcile&&<p className="worker-confirmation-note">Ответ сотрудника не становится автоматически утверждённым табелем. Проверяйте часы отдельно по каждому дню.</p>}
    <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Сотрудник</th>{!objectId&&<th>Объект</th>}<th>План менеджера</th><th>Подтверждение</th><th>Часы сотрудника</th><th>Проверка / источник</th><th>Последний ответ</th><th>Действия</th></tr></thead><tbody>
     {visible.map(w=>{const r=reports.get(w.id+":"+w.objectId+":"+day);return <tr key={w.id+":"+w.objectId}><td className="cell-title">{w.name}<span className="cell-sub">{w.specialty??"—"}</span></td>{!objectId&&<td>{w.object??"—"}</td>}<td>{(()=>{const p=plans.get(w.id+":"+w.objectId+":"+day);return !p?"Не запланировано":p.timeCode==="DAY_OFF"?"Выходной":p.kind==="night"?"Ночь":p.kind==="day"?"День":"Смена"})()}</td><td>{reply(w)}{r?.reason&&<span className="cell-sub">{r.reason}</span>}</td><td className="num">{r?.hours!=null?String(r.hours).replace(".",",")+" ч":"—"}{r?.hours!=null&&w.paidHours!==r.hours&&<span className="cell-sub">Норма: {w.paidHours} ч · отклонение</span>}</td>
 <td>{r?.hours!=null?(r.reviewStatus==="approved"||r.reconciledAt?"Подтверждено менеджером":r.reviewStatus==="rejected"?"Отклонено":"Требует проверки"):"—"}{r?.approvedHours!=null&&<span className="cell-sub">Итог: {r.approvedHours} ч</span>}
 {r&&<span className="cell-sub">Сотрудник по персональной ссылке{r.reviewedAt?" · проверено "+new Date(r.reviewedAt).toLocaleString("ru-RU"):""}</span>}</td>
 <td>{r?.employeeRespondedAt?new Date(r.employeeRespondedAt).toLocaleString("ru-RU"):"—"}</td>
 <td>{canReconcile&&r?.hours!=null&&r.reviewStatus!=="approved"&&!r.reconciledAt&&<button type="button" className="button" disabled={!!busy} onClick={()=>{setHoursReview({worker:w,report:r});setApprovedHours(String(r.hours));setReviewComment("");}}>Проверить часы</button>}</td></tr>})}
    </tbody></table>{!visible.length&&<div className="empty-inline">Нет сотрудников по выбранным условиям</div>}</div>
   </>:mode==="updates"?<>
    <div className="worker-confirmation-summary"><span>Изменения от сотрудников</span><span>Ожидают решения: <b>{(data.timeChanges??[]).filter(x=>x.status==="proposed").length+(data.planningChanges??[]).filter(x=>x.status==="proposed").length+(data.patternChanges??[]).filter(x=>x.status==="proposed").length}</b></span></div>
    <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Сотрудник</th><th>Объект</th><th>Что изменилось</th><th>Состояние</th><th>Действия</th></tr></thead><tbody>
     {(data.patternChanges??[]).filter(x=>scoped.some(w=>w.id===x.workerId)).map(x=>{const w=data.workers.find(w=>w.id===x.workerId);return <tr key={"pattern:"+x.workerId+":"+x.date}><td>{w?.name??"Сотрудник"}</td><td>{w?.object??"—"}</td><td>С {dateLabel(x.date)} · График {x.workDays}/{x.restDays}, {x.shiftKind==="night"?"ночь":"день"}{x.floatingDaysOff?", плавающие выходные":""}</td><td>{x.status==="proposed"?"На согласовании":x.status==="accepted"?"Принято":"Отклонено"}</td><td>{canEdit&&x.status==="proposed"&&<div className="worker-confirmation-actions"><button className="button" disabled={!!busy} onClick={()=>void action({action:"review_pattern",objectId:x.objectId,workerId:x.workerId,date:x.date,approve:true})}>Принять</button><button className="button" disabled={!!busy} onClick={()=>void action({action:"review_pattern",objectId:x.objectId,workerId:x.workerId,date:x.date,approve:false})}>Отклонить</button></div>}</td></tr>})}
     {(data.planningChanges??[]).filter(x=>scoped.some(w=>w.id===x.workerId)).map(x=>{const w=data.workers.find(w=>w.id===x.workerId);return <tr key={"plan:"+x.workerId+":"+x.date}><td>{w?.name??"Сотрудник"}</td><td>{w?.object??"—"}</td><td>{dateLabel(x.date)} · Запрошено: {x.kind==="off"?"Выходной":x.kind==="night"?"Ночная смена":"Дневная смена"}</td><td>{x.status==="proposed"?"На согласовании":x.status==="accepted"?"Принято":"Отклонено"}</td><td>{canEdit&&x.status==="proposed"&&<div className="worker-confirmation-actions"><button className="button" disabled={!!busy} onClick={()=>void action({action:"review_plan",objectId:x.objectId,workerId:x.workerId,date:x.date,approve:true})}>Принять</button><button className="button" disabled={!!busy} onClick={()=>void action({action:"review_plan",objectId:x.objectId,workerId:x.workerId,date:x.date,approve:false})}>Отклонить</button></div>}</td></tr>})}
     {(data.timeChanges??[]).filter(x=>scoped.some(w=>w.id===x.workerId)).map(x=>{const w=data.workers.find(w=>w.id===x.workerId);return <tr key={x.workerId+":"+x.date}><td>{w?.name??"Сотрудник"}</td><td>{w?.object??"—"}</td><td>{dateLabel(x.date)} · {x.startTime}–{x.endTime} · {x.appliesTo==="regular"?"Постоянный график":"Отдельная смена"}</td><td>{x.status==="proposed"?"Ожидает согласования":x.status==="accepted"?"Принято":"Отклонено"}</td><td>{canEdit&&x.status==="proposed"&&<div className="worker-confirmation-actions"><button className="button" disabled={!!busy} onClick={()=>void action({action:"review_shift_time",objectId:x.objectId,workerId:x.workerId,date:x.date,approve:true})}>Принять</button><button className="button" disabled={!!busy} onClick={()=>void action({action:"review_shift_time",objectId:x.objectId,workerId:x.workerId,date:x.date,approve:false})}>Отклонить</button></div>}</td></tr>})}
     {(data.documents??[]).filter(x=>scoped.some(w=>w.id===x.workerId)&&x.employeeReported).map(x=>{const w=data.workers.find(w=>w.id===x.workerId);return <tr key={x.workerId+":"+x.code}><td>{w?.name??"Сотрудник"}</td><td>{w?.object??"—"}</td><td>{({passport:"Паспорт",snils:"СНИЛС",inn:"ИНН",bank_details:"Реквизиты",medical_book:"Медкнижка",military:"Военный билет",application:"Заявление",photo:"Фотография",contract:"Договор"} as Record<string,string>)[x.code]??x.code}</td><td>{x.managerVerified?"Получено":"Сотрудник отметил передачу"}</td><td>{canEdit&&!x.managerVerified&&<button className="button" disabled={!!busy} onClick={()=>void action({action:"verify_document",objectId:x.objectId,workerId:x.workerId,code:x.code,verified:true})}>Получено</button>}</td></tr>})}
    </tbody></table>{!data.timeChanges?.length&&!data.documents?.length&&!data.planningChanges?.length&&!data.patternChanges?.length&&<div className="empty-inline">Изменений пока нет</div>}</div>
   </>:<>
    <EmployeePortalLinkControls data={data as LinkPayload} objectId={objectId} canEdit={canEdit} demo={demo} onRefresh={load}/>
    <div className="worker-confirmation-settings"><div className="section-head"><div><h2>Планирование графика объекта</h2><p>Настройка графика, индивидуальных исключений и требований к документам. Основные настройки кабинета находятся выше.</p></div></div>
    {objectId&&canEdit&&<div className="worker-confirmation-toolbar"><label>Горизонт планирования (дни): <select value={settings.get(objectId)?.planningHorizonDays??14} onChange={e=>void action({action:"settings",objectId,scheduleOwner:settings.get(objectId)?.scheduleOwner??"manager",horizon:Number(e.target.value)})} disabled={!!busy}>{[3,5,7,10,14,21,31].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>}
     {objectId&&canEdit&&<details className="worker-confirmation-exceptions"><summary>Индивидуальные исключения из режима объекта</summary>
       <div className="worker-confirmation-toolbar"><select aria-label="Сотрудник с индивидуальным графиком" value={specialWorker} onChange={e=>{const next=e.target.value;setSpecialWorker(next);setSpecialOwner(data.workerAuthorities?.find(x=>x.workerId===next)?.scheduleOwner??"inherit")}}><option value="">Выберите сотрудника</option>{data.workers.filter(x=>x.objectId===objectId).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={specialOwner} aria-label="Режим выбранного сотрудника" onChange={e=>setSpecialOwner(e.target.value as typeof specialOwner)}><option value="inherit">Как на объекте</option><option value="manager">Менеджер составляет график</option><option value="worker">Сотрудник составляет график</option></select>
        <button className="button" type="button" disabled={!specialWorker||!!busy} onClick={()=>void action({action:"worker_schedule_owner",objectId,workerId:specialWorker,scheduleOwner:specialOwner==="inherit"?null:specialOwner})}>Сохранить исключение</button></div>
       <p className="worker-confirmation-note">По умолчанию сотрудники используют режим своего объекта. Здесь можно назначить исключение без изменения графиков остальных.</p>
     </details>}
    {objectId&&canEdit&&<details className="worker-confirmation-exceptions"><summary>Настроить график сотрудника</summary>
     <div className="worker-confirmation-toolbar">
      <label>Сотрудник <select value={patternWorker} onChange={e=>{const id=e.target.value;setPatternWorker(id);const w=data.workers.find(w=>w.id===id);const approved=data.patternChanges?.find(p=>p.workerId===id&&p.status==="accepted");setPatternCode(approved?approved.workDays+"/"+approved.restDays:w?.workDays&&w.restDays!==null?w.workDays+"/"+w.restDays:"5/2");setPatternShift(approved?.shiftKind??(w?.shiftKind==="night"?"night":"day"));setPatternFloating(approved?.floatingDaysOff??false)}}><option value="">Выберите сотрудника</option>{data.workers.filter(w=>w.objectId===objectId).map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
      <label>График <select value={patternCode} onChange={e=>{setPatternCode(e.target.value);if(!["5/2","6/1"].includes(e.target.value))setPatternFloating(false)}}>{["5/2","6/1","2/2","3/3","4/2","7/7"].map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      <label>Смена <select value={patternShift} onChange={e=>setPatternShift(e.target.value as "day"|"night")}><option value="day">Дневная</option><option value="night">Ночная</option></select></label>
      <label>Действует с <input type="date" value={patternFrom} onChange={e=>setPatternFrom(e.target.value)}/></label>
      <label><input type="checkbox" checked={patternFloating} disabled={!["5/2","6/1"].includes(patternCode)} onChange={e=>setPatternFloating(e.target.checked)}/> Плавающие выходные</label>
      <button className="button" disabled={!patternWorker||!!busy||!patternFrom} onClick={()=>void action({action:"set_worker_pattern",objectId,workerId:patternWorker,effectiveFrom:patternFrom,workDays:Number(patternCode.split("/")[0]),restDays:Number(patternCode.split("/")[1]),shiftKind:patternShift,floatingDaysOff:patternFloating})}>Сохранить график</button>
     </div><p className="worker-confirmation-note">5/2 и 6/1 по умолчанию: выходные суббота-воскресенье или воскресенье. Циклические графики отсчитываются с даты начала.</p></details>}

     {objectId&&canEdit&&<div className="worker-confirmation-toolbar"><span className="cell-sub">Перечень документов объекта:</span><select value={relationType} onChange={e=>setRelationType(e.target.value as typeof relationType)} aria-label="Тип оформления"><option value="gph">ГПХ</option><option value="employment">Трудовой договор</option><option value="npd">Самозанятый</option><option value="custom">Другое</option></select><select value={docCode} onChange={e=>setDocCode(e.target.value)} aria-label="Документ">{[["passport","Паспорт"],["snils","СНИЛС"],["inn","ИНН"],["bank_details","Реквизиты"],["military","Военный билет"],["medical_book","Медкнижка"],["photo","Фотография"],["application","Заявление"],["contract","Договор"]].map(([code,label])=><option key={code} value={code}>{label}</option>)}</select><label><input type="checkbox" checked={docRequired} onChange={e=>setDocRequired(e.target.checked)}/> Требуется</label><button className="button" disabled={!!busy} onClick={()=>void action({action:"document_requirement",objectId,relationType,code:docCode,required:docRequired})}>Применить</button></div>}
     <p className="worker-confirmation-note"><a href="/employee-timesheet/demo?layout=mobile" target="_blank" rel="noopener noreferrer"><ExternalLink size={13} style={{verticalAlign:"middle"}}/> Версия для телефона</a> · <a href="/employee-timesheet/demo?layout=desktop" target="_blank" rel="noopener noreferrer">Версия для компьютера</a></p></div>
   </>}
  </>}
 {hoursReview&&<RegistryDrawer className="object-form-drawer" title="Проверка фактически отработанных часов" onClose={()=>setHoursReview(null)}
   footer={<><button className="button" onClick={()=>setHoursReview(null)}>Отмена</button>
    <button className="button" disabled={!!busy||!reviewComment.trim()} onClick={()=>{const {worker,report}=hoursReview;setHoursReview(null);void action({action:"review_hours",objectId:report.objectId,workerId:worker.id,date:report.date,approve:false,comment:reviewComment})}}>Отклонить</button>
    <button className="button primary" disabled={!!busy||!approvedHours.trim()||!Number.isFinite(Number(approvedHours))||Number(approvedHours)<=0||Number(approvedHours)>24} onClick={()=>{const {worker,report}=hoursReview;setHoursReview(null);void action({action:"review_hours",objectId:report.objectId,workerId:worker.id,date:report.date,approve:true,approvedHours:Number(approvedHours),comment:reviewComment})}}>Подтвердить часы</button></>}>
   <p>{hoursReview.worker.name} · {dateLabel(hoursReview.report.date)} · {hoursReview.worker.object??"Объект"}</p>
   <p>Плановая норма: {hoursReview.worker.paidHours} ч · сообщил сотрудник: {hoursReview.report.hours} ч</p>
   <p>Источник: сотрудник по персональной ссылке · {hoursReview.report.employeeRespondedAt?new Date(hoursReview.report.employeeRespondedAt).toLocaleString("ru-RU"):"время не указано"}</p>
   {hoursReview.report.reason&&<p>Причина отклонения: {hoursReview.report.reason}</p>}
   <label>Итоговые часы<input type="number" min={0.01} max={24} step={0.25} value={approvedHours} onChange={e=>setApprovedHours(e.target.value)}/></label>
   <label>Комментарий менеджера<textarea rows={3} maxLength={500} value={reviewComment} onChange={e=>setReviewComment(e.target.value)} placeholder="Причина исправления или отклонения"/></label>
   <p className="worker-confirmation-note">При подтверждении запись будет внесена в рабочий табель. Закрытые периоды изменять нельзя.</p>
  </RegistryDrawer>}
  {confirmation&&<RegistryDrawer className="object-form-drawer" title={confirmation.title} onClose={()=>setConfirmation(null)} footer={<><button className="button" onClick={()=>setConfirmation(null)}>Отмена</button><button className="button primary" onClick={()=>{const body=confirmation.body;setConfirmation(null);void action(body)}}>{confirmation.label}</button></>}><p className="object-form-explanation">{confirmation.text}</p></RegistryDrawer>}
 </section>;
}
