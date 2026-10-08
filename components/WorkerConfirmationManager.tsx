"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {Copy,ExternalLink,Link2,RefreshCw,ShieldOff} from "lucide-react";
type Worker={id:string;name:string;objectId:string|null;object:string|null;specialty:string|null;paidHours:number;workDays?:number|null;restDays?:number|null;shiftKind?:"day"|"night"|"mixed"|null};
type Report={workerId:string;objectId:string;date:string;shiftKind:"day"|"night"|"off"|null;response:"working"|"day_off"|"cannot_work";reason:string|null;hours:number|null;updatedAt:string};
type Plan={workerId:string;objectId:string;date:string;timeCode:string;kind:string|null};
type LinkRecord={id:string;workerId:string;objectId:string;status:"active"|"paused"|"revoked";lastOpenedAt:string|null;createdAt:string};
type Setting={objectId:string;scheduleOwner:"manager"|"worker";confirmationDeadline:string;managerPhone?:string|null;planningHorizonDays?:number};
type TimeUpdate={workerId:string;objectId:string;date:string;startTime:string;endTime:string;status:"proposed"|"accepted"|"rejected";appliesTo:"single"|"regular"};
type PatternChange={workerId:string;objectId:string;date:string;workDays:number;restDays:number;shiftKind:"day"|"night";floatingDaysOff:boolean;status:string};
type PlanningChange={workerId:string;objectId:string;date:string;kind:"day"|"night"|"off";status:string};
type Authority={workerId:string;objectId:string;scheduleOwner:"manager"|"worker"};
type DocumentUpdate={workerId:string;objectId:string;code:string;employeeReported:boolean;managerVerified:boolean};
type Payload={workers:Worker[];reports:Report[];links:LinkRecord[];settings:Setting[];plans?:Plan[];timeChanges?:TimeUpdate[];documents?:DocumentUpdate[];planningChanges?:PlanningChange[];workerAuthorities?:Authority[];patternChanges?:PatternChange[]};
const empty:Payload={workers:[],reports:[],links:[],settings:[]};
function tomorrow(){const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)}
function dateLabel(date:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"))}
export function WorkerConfirmationManager({objectId,workerId,canEdit,canReconcile=false,demo=false}:{objectId?:string;workerId?:string;canEdit:boolean;canReconcile?:boolean;demo?:boolean}){
 const [data,setData]=useState<Payload>(empty);
 const [loaded,setLoaded]=useState(false);
 const [error,setError]=useState("");
 const [info,setInfo]=useState("");
 const [mode,setMode]=useState<"answers"|"links"|"updates">("answers");
 const [search,setSearch]=useState("");
 const [contactNumber,setContactNumber]=useState("");
 const [patternWorker,setPatternWorker]=useState("");
 const [patternCode,setPatternCode]=useState("5/2");
 const [patternShift,setPatternShift]=useState<"day"|"night">("day");
 const [patternFloating,setPatternFloating]=useState(false);
 const [patternFrom,setPatternFrom]=useState(new Date().toISOString().slice(0,10));
 const [specialWorker,setSpecialWorker]=useState("");
 const [specialOwner,setSpecialOwner]=useState<"inherit"|"manager"|"worker">("inherit");

 const [relationType,setRelationType]=useState<"employment"|"gph"|"npd"|"custom">("gph");
 const [docCode,setDocCode]=useState("medical_book");
 const [docRequired,setDocRequired]=useState(true);
 const [onlyAttention,setOnlyAttention]=useState(false);
 const [filterObject,setFilterObject]=useState(objectId??"all");
 const [busy,setBusy]=useState("");
 const [day,setDay]=useState(tomorrow());
 const [fromDate,setFromDate]=useState(()=>{const d=new Date();d.setDate(d.getDate()-7);return d.toISOString().slice(0,10)});
 const [toDate,setToDate]=useState(()=>new Date().toISOString().slice(0,10));
 const load=useCallback(async()=>{
  try{
   const q=new URLSearchParams();if(objectId)q.set("objectId",objectId);if(workerId)q.set("workerId",workerId);
   const r=await fetch("/api/operations/worker-confirmations?"+q.toString(),{cache:"no-store"});
   const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось получить данные");
   setData(j);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка получения данных")}finally{setLoaded(true)}
 },[objectId,workerId]);
 useEffect(()=>{void Promise.resolve().then(()=>load())},[load]);
 const links=useMemo(()=>new Map(data.links.map(x=>[x.workerId+":"+x.objectId,x])),[data.links]);
 const reports=useMemo(()=>new Map(data.reports.map(x=>[x.workerId+":"+x.objectId+":"+x.date,x])),[data.reports]);
 const settings=useMemo(()=>new Map(data.settings.map(x=>[x.objectId,x])),[data.settings]);
 const plans=useMemo(()=>new Map((data.plans??[]).map(x=>[x.workerId+":"+x.objectId+":"+x.date,x])),[data.plans]);
 const options=useMemo(()=>[...new Map(data.workers.filter(x=>x.objectId).map(x=>[x.objectId!,x.object??"Объект"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[data.workers]);
 const scoped=data.workers.filter(w=>(filterObject==="all"||w.objectId===filterObject)&&(!search||((w.name+" "+w.object+" "+w.specialty).toLowerCase().includes(search.toLowerCase()))));
 const visible=scoped.filter(w=>!onlyAttention||(!reports.get(w.id+":"+w.objectId+":"+day)&&plans.get(w.id+":"+w.objectId+":"+day)?.timeCode!=="DAY_OFF"));
 const expected=scoped.filter(w=>plans.get(w.id+":"+w.objectId+":"+day)?.timeCode!=="DAY_OFF");
 const replies=expected.filter(w=>reports.get(w.id+":"+w.objectId+":"+day)).length;
 const missing=expected.length-replies;
 const activeLinks=data.links.filter(l=>l.status==="active").length;
 async function action(body:Record<string,string|number|boolean|null>){
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
  if(!r){if(plans.get(w.id+":"+w.objectId+":"+day)?.timeCode==="DAY_OFF")return <span className="worker-confirmation-status">Выходной по графику</span>;return <span className="worker-confirmation-status warn">Нет ответа</span>;}
  if(r.response==="cannot_work")return <span className="worker-confirmation-status bad">Не выйдет</span>;
  if(r.response==="day_off")return <span className="worker-confirmation-status">Выходной</span>;
  return <span className="worker-confirmation-status good">{r.shiftKind==="night"?"Выйдет ночью":"Выйдет днём"}</span>;
 }
 return <section className="worker-confirmation-manager">
  <div className="worker-confirmation-tabs">
   <button type="button" className={mode==="answers"?"active":""} onClick={()=>setMode("answers")}>Подтверждения</button>
   <button type="button" className={mode==="links"?"active":""} onClick={()=>setMode("links")}>Персональные ссылки</button>
    <button type="button" className={mode==="updates"?"active":""} onClick={()=>setMode("updates")}>Изменения сотрудников</button>
   {demo&&<span className="cell-sub">Демонстрационный режим</span>}
  </div>
  <div className="worker-confirmation-toolbar">
   {!objectId&&<select aria-label="Фильтр по объекту" value={filterObject} onChange={e=>setFilterObject(e.target.value)}><option value="all">Все объекты</option>{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>}
   <input aria-label="Поиск сотрудника" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Поиск по сотруднику"/>
   {mode==="answers"&&<><input type="date" value={day} onChange={e=>setDay(e.target.value)} aria-label="Дата подтверждений"/><label className="worker-confirmation-compact"><input type="checkbox" checked={onlyAttention} onChange={e=>setOnlyAttention(e.target.checked)}/> Только без ответа</label></>}
   <button type="button" className="button right" onClick={()=>void load()}><RefreshCw size={14}/> Обновить</button>
  </div>
  {error&&<div role="alert" className="worker-confirmation-manager-error">{error}</div>}
  {info&&<div role="status" className="worker-confirmation-note">{info}</div>}
  {!loaded?<p className="worker-confirmation-note">Загрузка данных…</p>:<>
   {mode==="answers"?<>
    <div className="worker-confirmation-summary"><span>На {dateLabel(day)}</span><span>Ответили: <b>{replies}</b></span><span>Нет ответа: <b>{missing}</b></span></div>
    <div className="worker-confirmation-note">Сведения сотрудников используются для оперативного планирования. Неответивший сотрудник не считается неявившимся.</div>
    {canReconcile&&(objectId||filterObject!=="all")&&<div className="worker-confirmation-toolbar"><span className="cell-sub">Промежуточная сверка с заказчиком:</span><input type="date" value={fromDate} onChange={e=>setFromDate(e.target.value)} aria-label="Сверить с"/><input type="date" value={toDate} onChange={e=>setToDate(e.target.value)} aria-label="Сверить по"/><button type="button" className="button" disabled={!!busy||toDate<fromDate} onClick={()=>{if(window.confirm("Вы сверили часы за этот период с заказчиком?"))void action({action:"reconcile",objectId:objectId??filterObject,fromDate,toDate})}}>Отметить период сверенным</button></div>}
    <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Сотрудник</th>{!objectId&&<th>Объект</th>}<th>Подтверждение</th><th>Часы</th><th>Последний ответ</th></tr></thead><tbody>
     {visible.map(w=>{const r=reports.get(w.id+":"+w.objectId+":"+day);return <tr key={w.id+":"+w.objectId}><td className="cell-title">{w.name}<span className="cell-sub">{w.specialty??"—"}</span></td>{!objectId&&<td>{w.object??"—"}</td>}<td>{reply(w)}{r?.reason&&<span className="cell-sub">{r.reason}</span>}</td><td className="num">{r?.hours!=null?String(r.hours).replace(".",",")+" ч":"—"}</td><td>{r?.updatedAt?new Date(r.updatedAt).toLocaleString("ru-RU"):"—"}</td></tr>})}
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
    <div className="worker-confirmation-summary"><span>Управление доступом к персональным табелям</span><span>Активных: <b>{activeLinks}</b></span></div>
    <div className="worker-confirmation-note">Ссылка действует постоянно, пока не приостановлена или аннулирована. Копирование не является подтверждением отправки через мессенджер.</div>
    {objectId&&canEdit&&<div className="worker-confirmation-toolbar"><label>График составляет: <select value={settings.get(objectId)?.scheduleOwner??"manager"} onChange={e=>void action({action:"settings",objectId,scheduleOwner:e.target.value})} disabled={!!busy}><option value="manager">Менеджер составляет график</option><option value="worker">Сотрудник составляет график</option></select></label></div>}
    <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Сотрудник</th>{!objectId&&<th>Объект</th>}<th>Ссылка</th><th>Последнее открытие</th><th>Действия</th></tr></thead><tbody>
     {visible.map(w=>{const l=links.get(w.id+":"+w.objectId),key=w.id+":"+w.objectId,params={objectId:w.objectId??"",workerId:w.id};return <tr key={key}><td className="cell-title">{w.name}<span className="cell-sub">{w.specialty??"—"}</span></td>{!objectId&&<td>{w.object??"—"}</td>}<td><span className={"worker-confirmation-status "+(l?.status==="active"?"good":l?.status==="paused"?"warn":"")}>{!l?"Не создана":l.status==="active"?"Активна":l.status==="paused"?"Приостановлена":"Аннулирована"}</span></td><td>{l?.lastOpenedAt?new Date(l.lastOpenedAt).toLocaleString("ru-RU"):"—"}</td><td><div className="worker-confirmation-actions">{canEdit&&(!l||l.status==="revoked")&&<button type="button" className="button" disabled={!!busy} onClick={()=>void action({action:"create",...params})}><Link2 size={13}/> Создать</button>}{canEdit&&l?.status==="active"&&<><button className="button" disabled={!!busy} onClick={()=>void action({action:"copy_mobile",...params})}><Copy size={13}/> Для телефона</button><button className="button" disabled={!!busy} onClick={()=>void action({action:"copy_desktop",...params})}><Copy size={13}/> Для компьютера</button><button className="button" disabled={!!busy} onClick={()=>void action({action:"pause",...params})}>Приостановить</button></>}{canEdit&&l?.status==="paused"&&<button className="button" disabled={!!busy} onClick={()=>void action({action:"resume",...params})}>Возобновить</button>}{canEdit&&l&&l.status!=="revoked"&&<><button className="button" disabled={!!busy} onClick={()=>{if(window.confirm("Старая ссылка перестанет действовать. Выпустить новую?"))void action({action:"rotate",...params})}}><RefreshCw size={13}/> Обновить</button><button className="button" disabled={!!busy} onClick={()=>{if(window.confirm("Аннулировать персональный доступ?"))void action({action:"revoke",...params})}}><ShieldOff size={13}/> Отозвать</button></>}{!l&&!canEdit&&"—"}</div></td></tr>})}
    </tbody></table>{!visible.length&&<div className="empty-inline">Нет сотрудников</div>}</div>
    {objectId&&canEdit&&<div className="worker-confirmation-toolbar"><label>Горизонт планирования (дни): <select value={settings.get(objectId)?.planningHorizonDays??7} onChange={e=>void action({action:"settings",objectId,scheduleOwner:settings.get(objectId)?.scheduleOwner??"manager",horizon:Number(e.target.value)})} disabled={!!busy}>{[3,5,7,10,14,21,31].map(n=><option key={n} value={n}>{n}</option>)}</select></label></div>}
     {objectId&&canEdit&&<details className="worker-confirmation-exceptions"><summary>Индивидуальные исключения из режима объекта</summary>
       <div className="worker-confirmation-toolbar"><select aria-label="Сотрудник с индивидуальным графиком" value={specialWorker} onChange={e=>{const next=e.target.value;setSpecialWorker(next);setSpecialOwner(data.workerAuthorities?.find(x=>x.workerId===next)?.scheduleOwner??"inherit")}}><option value="">Выберите сотрудника</option>{data.workers.filter(x=>x.objectId===objectId).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select>
        <select value={specialOwner} aria-label="Режим выбранного сотрудника" onChange={e=>setSpecialOwner(e.target.value as typeof specialOwner)}><option value="inherit">Как на объекте</option><option value="manager">Менеджер составляет график</option><option value="worker">Сотрудник составляет график</option></select>
        <button className="button" type="button" disabled={!specialWorker||!!busy} onClick={()=>void action({action:"worker_schedule_owner",objectId,workerId:specialWorker,scheduleOwner:specialOwner==="inherit"?null:specialOwner})}>Сохранить исключение</button></div>
       <p className="worker-confirmation-note">По умолчанию сотрудники используют режим своего объекта. Здесь можно назначить исключение без изменения графиков остальных.</p>
     </details>}
     {objectId&&canEdit&&<div className="worker-confirmation-toolbar"><label>Телефон менеджера <input value={contactNumber} onChange={e=>setContactNumber(e.target.value)} placeholder={settings.get(objectId)?.managerPhone??"+7…"} /></label><button className="button" disabled={!!busy} onClick={()=>void action({action:"manager_phone",objectId,phone:contactNumber||null})}>Сохранить</button></div>}
     {objectId&&canEdit&&<div className="worker-confirmation-toolbar"><span className="cell-sub">Перечень документов объекта:</span><select value={relationType} onChange={e=>setRelationType(e.target.value as typeof relationType)} aria-label="Тип оформления"><option value="gph">ГПХ</option><option value="employment">Трудовой договор</option><option value="npd">Самозанятый</option><option value="custom">Другое</option></select><select value={docCode} onChange={e=>setDocCode(e.target.value)} aria-label="Документ">{[["passport","Паспорт"],["snils","СНИЛС"],["inn","ИНН"],["bank_details","Реквизиты"],["military","Военный билет"],["medical_book","Медкнижка"],["photo","Фотография"],["application","Заявление"],["contract","Договор"]].map(([code,label])=><option key={code} value={code}>{label}</option>)}</select><label><input type="checkbox" checked={docRequired} onChange={e=>setDocRequired(e.target.checked)}/> Требуется</label><button className="button" disabled={!!busy} onClick={()=>void action({action:"document_requirement",objectId,relationType,code:docCode,required:docRequired})}>Применить</button></div>}
     <p className="worker-confirmation-note"><a href="/employee-timesheet/demo?layout=mobile" target="_blank" rel="noopener noreferrer"><ExternalLink size={13} style={{verticalAlign:"middle"}}/> Версия для телефона</a> · <a href="/employee-timesheet/demo?layout=desktop" target="_blank" rel="noopener noreferrer">Версия для компьютера</a></p>
   </>}
  </>}
 </section>;
}
