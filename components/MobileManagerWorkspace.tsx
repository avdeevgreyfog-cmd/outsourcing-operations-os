"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowLeft,ArrowRight,Bell,CalendarDays,Check,CheckCircle2,ChevronDown,ChevronRight,ClipboardCheck,Clock3,FileCheck2,Factory,MapPin,Menu,Phone,Search,Settings2,ShieldCheck,UserRoundPlus,UsersRound,X,AlertTriangle,Undo2,ClipboardList} from "lucide-react";
import type {MobileDesk,MobileWorker,FirstDayStep,MobileVisit} from "@/lib/operations/mobile-manager";

type Tab="today"|"newcomers"|"visits"|"decisions"|"more";
type Approval={workerId:string;objectId:string;date:string;status:string;kind?:string;workDays?:number;restDays?:number;startTime?:string;endTime?:string;floatingDaysOff?:boolean};
type ApprovalPayload={planningChanges?:Approval[];patternChanges?:Approval[];timeChanges?:Approval[];workers?:{id:string;name:string;object:string|null}[]};
type Draft={id:string;state:"absent"|"present"|"pending";reason:string};
const steps:{key:FirstDayStep;label:string;hint:string}[]=[
 {key:"met",label:"Встретили сотрудника",hint:"Прибытие и контакт на площадке"},
 {key:"pass_checked",label:"Проверили пропуск и допуск",hint:"Не заменяет официальное решение СБ"},
 {key:"documents_checked",label:"Проверили комплект документов",hint:"Документы сверяются с требованиями объекта"},
 {key:"briefing_checked",label:"Инструктаж проведён",hint:"Сведения подтвердил ответственный"},
 {key:"ppe_checked",label:"Проверили обеспечение",hint:"Одежда и необходимые СИЗ"},
 {key:"started",label:"Приступил к работе",hint:"После фактической отметки явки"}
];
const statusLabel={present:"На месте",absent:"Не явился",pending:"Не проверен"} as const;
const statusClass={present:"good",absent:"bad",pending:"pending"} as const;
function shortDate(date:string){return new Intl.DateTimeFormat("ru-RU",{weekday:"long",day:"numeric",month:"long",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"))}
function dateDelta(date:string,n:number){const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function phoneLink(raw:string|null){return raw?"tel:"+raw.replace(/[^\d+]/g,""):null}
function checkpointData(d:MobileDesk,worker:MobileWorker,key:FirstDayStep){return d.checks.find(x=>x.workerId===worker.id&&x.date===d.date&&x.checkpoint===key)}
function firstDayDone(d:MobileDesk,w:MobileWorker){return steps.filter(s=>checkpointData(d,w,s.key)?.state==="done").length}
const emptyApprovals:ApprovalPayload={planningChanges:[],patternChanges:[],timeChanges:[],workers:[]};

export function MobileManagerWorkspace({initial}:{initial:MobileDesk}){
 const [data,setData]=useState(initial);
 const [tab,setTab]=useState<Tab>("today");
 const [date,setDate]=useState(initial.date);
 const [objectId,setObjectId]=useState("all");
 const [kind,setKind]=useState<"day"|"night">("day");
 const [attentionOnly,setAttentionOnly]=useState(false);
 const [search,setSearch]=useState("");
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [draft,setDraft]=useState<Draft|null>(null);
 const [firstDay,setFirstDay]=useState<string|null>(null);
 const [checkEdit,setCheckEdit]=useState<FirstDayStep|null>(null);
 const [checkNote,setCheckNote]=useState("");
 const [mass,setMass]=useState<string[]>([]);
 const [visitId,setVisitId]=useState<string|null>(null);
 const [visitItem,setVisitItem]=useState<string|null>(null);
 const [visitValue,setVisitValue]=useState("");
 const [visitNote,setVisitNote]=useState("");
 const [approvals,setApprovals]=useState<ApprovalPayload>(emptyApprovals);
 const [approvalLoaded,setApprovalLoaded]=useState(false);
 const reload=useCallback(async(target:string)=>{
  if(initial.demo)return;
  const r=await fetch("/api/field-manager?date="+encodeURIComponent(target),{cache:"no-store"});
  const json=await r.json();if(!r.ok)throw new Error(json.error??"Не удалось обновить рабочий день");setData(json);
 },[initial.demo]);
 useEffect(()=>{if(date===initial.date)return;void Promise.resolve().then(()=>reload(date)).catch(e=>setError(String(e)))},[date,initial.date,reload]);
 useEffect(()=>{
  if(tab!=="decisions"||approvalLoaded||initial.demo)return;
  void Promise.resolve().then(async()=>{const r=await fetch("/api/operations/worker-confirmations",{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось получить запросы");setApprovals(j);setApprovalLoaded(true)}).catch(e=>setError(e instanceof Error?e.message:"Ошибка загрузки"));
 },[tab,approvalLoaded,initial.demo]);
 const workers=useMemo(()=>data.workers.filter(w=>(objectId==="all"||w.objectId===objectId)&&w.kind===kind&&(search===""||(w.name+" "+w.specialty+" "+w.objectName).toLowerCase().includes(search.toLowerCase()))),[data.workers,objectId,kind,search]);
 const inShift=workers.filter(w=>w.assignmentId);
 const hasAttention=(w:MobileWorker)=>w.attendance!=="present";
 const visible=workers.filter(w=>!attentionOnly||hasAttention(w));
 const futureNew=data.workers.filter(w=>w.firstDay&&(objectId==="all"||objectId===w.objectId));
 const planned=inShift.length,present=inShift.filter(w=>w.attendance==="present").length,missing=inShift.filter(w=>w.attendance==="absent").length,pending=inShift.filter(w=>w.attendance==="pending").length;
 const activeFirst=firstDay?data.workers.find(w=>w.id===firstDay):null;
 const activeVisit=visitId?data.visits.find(x=>x.id===visitId):null;
 const scopedVisits=data.visits.filter(v=>objectId==="all"||v.objectId===objectId);
 const updates=[
  ...(approvals.planningChanges??[]).filter(x=>x.status==="proposed").map(x=>({...x,type:"plan" as const})),
  ...(approvals.patternChanges??[]).filter(x=>x.status==="proposed").map(x=>({...x,type:"pattern" as const})),
  ...(approvals.timeChanges??[]).filter(x=>x.status==="proposed").map(x=>({...x,type:"time" as const}))
 ].filter(x=>objectId==="all"||x.objectId===objectId);
 const canWrite=data.canEdit;
 async function action(payload:Record<string,unknown>,message:string,localUpdate?:()=>void){
  setBusy(String(payload.action??"save"));setError("");setNotice("");
  try{
   if(data.demo){localUpdate?.();setNotice(message+" · пример");return}
   const r=await fetch("/api/field-manager",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
   const result=await r.json();if(!r.ok)throw new Error(result.error??"Не удалось сохранить");
   await reload(date);setNotice(message);
  }catch(e){setError(e instanceof Error?e.message:"Ошибка сохранения")}
  finally{setBusy("")}
 }
 function changeDemoAttendance(ids:string[],state:MobileWorker["attendance"],reason:string|null){
  setData(old=>({...old,workers:old.workers.map(w=>ids.includes(w.id)?{...w,attendance:state,reason}:w)}));
 }
 async function mark(ids:string[],state:MobileWorker["attendance"],reason:string|null){
  const picked=workers.filter(w=>ids.includes(w.id)&&w.assignmentId);
  if(!picked.length){setError("Для отметки явки сначала назначьте смену сотруднику");return}
  const first=picked[0];if(picked.some(w=>w.objectId!==first.objectId||w.kind!==first.kind)){setError("Выберите сотрудников одной смены одного объекта");return}
  await action({action:"attendance",date,objectId:first.objectId,kind:first.kind,workerIds:ids,state,reason},state==="present"?"Явка зафиксирована":state==="absent"?"Отмечена неявка":"Отметка возвращена на проверку",()=>changeDemoAttendance(ids,state,reason));
  setDraft(null);setMass([]);
 }
 async function applyCheckpoint(key:FirstDayStep,state:"done"|"issue"|null,note:string|null){
  if(!activeFirst)return;
  await action({action:"first_day",date,objectId:activeFirst.objectId,workerId:activeFirst.id,checkpoint:key,state,note},state==="done"?"Этап отмечен":state==="issue"?"Проблема зафиксирована":"Отметка сброшена",()=>{
   setData(old=>({...old,checks:[...old.checks.filter(x=>!(x.workerId===activeFirst.id&&x.date===date&&x.checkpoint===key)),...(state?[{workerId:activeFirst.id,date,checkpoint:key,state,note}]:[])]}));
  });
  setCheckEdit(null);setCheckNote("");
 }
 async function saveVisit(v:MobileVisit,itemId:string,status:"confirmed"|"issue"){
  const checklist=v.checklist.map(x=>x.id===itemId?{...x,status,value:visitValue,note:visitNote}:x);
  const update=()=>setData(old=>({...old,visits:old.visits.map(x=>x.id===v.id?{...x,checklist}:x)}));
  if(data.demo){update();setNotice("Ответ сохранён · пример");setVisitItem(null);return}
  setBusy("visit");setError("");
  try{const r=await fetch("/api/launches/"+encodeURIComponent(v.launchId)+"/visits/"+encodeURIComponent(v.id),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({itemUpdate:{id:itemId,status,value:visitValue,note:visitNote}})});const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось сохранить ответ");update();setNotice("Ответ сохранён в карточке выезда");setVisitItem(null)}
  catch(e){setError(e instanceof Error?e.message:"Ошибка сохранения")}finally{setBusy("")}
 }
 async function review(item:(typeof updates)[number],approve:boolean){
  const actionName=item.type==="plan"?"review_plan":item.type==="pattern"?"review_pattern":"review_shift_time";
  setBusy("review");setError("");
  try{
   if(!data.demo){const r=await fetch("/api/operations/worker-confirmations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:actionName,objectId:item.objectId,workerId:item.workerId,date:item.date,approve})});const j=await r.json();if(!r.ok)throw new Error(j.error??"Решение не сохранено")}
   const source=item.type==="plan"?"planningChanges":item.type==="pattern"?"patternChanges":"timeChanges";
   setApprovals(old=>({...old,[source]:(old[source]??[]).map(x=>x.workerId===item.workerId&&x.date===item.date?{...x,status:approve?"accepted":"rejected"}:x)}));
   setApprovalLoaded(false);setNotice(approve?"Изменение согласовано":"Изменение отклонено");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка решения")}finally{setBusy("")}
 }
 const selectTab=(next:Tab)=>{setTab(next);setDraft(null);setCheckEdit(null);setVisitItem(null);setNotice("");setError("")};
 return <div className="field-manager">
  <header className="field-head">
   <div className="field-brand"><span className="field-mark">O</span><span><small>OPERIS · ОПЕРАЦИИ</small><strong>Рабочий день</strong></span></div>
   <Link href="/" className="field-exit" aria-label="Полная версия"><Settings2 size={17}/><span>Полная версия</span></Link>
  </header>
  <div className="field-main">
   <div className="field-title"><div><h1>{tab==="today"?"Сегодня":tab==="newcomers"?"Новые сотрудники":tab==="visits"?"Выезды на объекты":tab==="decisions"?"Решения":"Дополнительно"}</h1><p>{tab==="today"?shortDate(date):"Оперативная работа на объектах"}</p></div><div className="field-head-symbol"><Bell size={19}/></div></div>
   {error&&<div className="field-alert error" role="alert"><AlertTriangle size={16}/>{error}<button onClick={()=>setError("")} aria-label="Закрыть"><X size={15}/></button></div>}
   {notice&&<div className="field-alert success" role="status"><CheckCircle2 size={16}/>{notice}<button onClick={()=>setNotice("")} aria-label="Закрыть"><X size={15}/></button></div>}
   {(tab==="today"||tab==="newcomers"||tab==="visits")&&<div className="field-filters">
    <label>Объект<select aria-label="Объект" value={objectId} onChange={e=>setObjectId(e.target.value)}><option value="all">Все мои объекты</option>{data.objects.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
    {tab!=="visits"&&<label>Дата<input type="date" value={date} onChange={e=>{setDate(e.target.value);setMass([])}}/></label>}
   </div>}
   {tab==="today"&&<>
    <div className="field-stats"><div><small>В смене</small><strong>{planned}</strong></div><div><small>На месте</small><strong>{present}</strong></div><div><small>Проверить</small><strong>{pending}</strong></div><div><small>Неявки</small><strong>{missing}</strong></div></div>
    <section className="field-block">
     <div className="field-section-bar"><h2>Контроль явки</h2><div className="field-segments"><button className={kind==="day"?"active":""} onClick={()=>{setKind("day");setMass([])}}>День</button><button className={kind==="night"?"active":""} onClick={()=>{setKind("night");setMass([])}}>Ночь</button></div></div>
     <div className="field-toolbar"><label className="field-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Найти сотрудника"/></label><label className="field-only"><input type="checkbox" checked={attentionOnly} onChange={e=>setAttentionOnly(e.target.checked)}/> Требуют внимания</label></div>
     {canWrite&&pending>0&&<div className="field-bulk"><span>Не проверены: <strong>{pending}</strong></span><button disabled={!!busy} onClick={()=>{const candidates=inShift.filter(w=>w.attendance==="pending");if(candidates.length>1){const first=candidates[0];const ids=candidates.filter(w=>w.objectId===first.objectId&&w.kind===first.kind).map(w=>w.id);if(window.confirm("Отметить присутствующими "+ids.length+" сотрудников? Убедитесь, что все они действительно на месте."))void mark(ids,"present",null)}else if(candidates.length===1)void mark([candidates[0].id],"present",null)}}>Отметить присутствующих <Check size={14}/></button></div>}
     <div className="field-workers">
      {visible.map(w=><article key={w.assignmentId??w.id} className="field-worker">
       <div className="field-worker-top"><div><strong>{w.name}</strong><p>{w.objectName} · {w.specialty??"Сотрудник"}{w.time?" · "+w.time:""}</p></div><span className={"field-state "+statusClass[w.attendance]}><span className="field-state-dot"/>{statusLabel[w.attendance]}</span></div>
       {w.firstDay&&<button className="field-new-label" onClick={()=>{setFirstDay(w.id);setTab("newcomers");setCheckEdit(null)}}><UserRoundPlus size={14}/> Первый выход · проверить подготовку <ChevronRight size={13}/></button>}
       {!w.assignmentId&&<p className="field-minor-warning">Смена ещё не назначена — отметка явки недоступна.</p>}
       <div className="field-worker-actions">{phoneLink(w.phone)?<a className="field-call" href={phoneLink(w.phone)!}><Phone size={15}/> Позвонить</a>:<span className="field-muted">Телефон не указан</span>}
        {canWrite&&w.assignmentId&&<><button disabled={!!busy} className={w.attendance==="present"?"field-active-present":""} onClick={()=>void mark([w.id],"present",null)}><Check size={15}/> На месте</button><button disabled={!!busy} onClick={()=>{setDraft({id:w.id,state:"absent",reason:""});setFirstDay(null)}}>Нет на месте</button></>}
       </div>
       {draft?.id===w.id&&<div className="field-inline"><label>Комментарий или причина<textarea rows={2} value={draft.reason} maxLength={500} onChange={e=>setDraft(old=>old?{...old,reason:e.target.value}:null)} placeholder="Например: не отвечает, задерживается"/></label><div><button onClick={()=>setDraft(null)}>Отмена</button><button disabled={!!busy} className="primary" onClick={()=>void mark([w.id],"absent",draft.reason.trim()||null)}>Зафиксировать</button></div></div>}
       {w.attendance!=="pending"&&canWrite&&w.assignmentId&&<button className="field-quiet" disabled={!!busy} onClick={()=>void mark([w.id],"pending","Повторная проверка менеджером")}><Undo2 size={12}/> Вернуть на проверку</button>}
      </article>)}
      {!visible.length&&<div className="field-empty">На эту смену нет сотрудников по выбранным условиям.</div>}
     </div>
    </section>
    {futureNew.length>0&&<section className="field-block"><div className="field-section-bar"><h2>Первые выходы</h2><button className="field-link" onClick={()=>selectTab("newcomers")}>Все <ArrowRight size={14}/></button></div>{futureNew.slice(0,3).map(w=><button className="field-compact-row" key={w.id} onClick={()=>{setFirstDay(w.id);setTab("newcomers")}}><UserRoundPlus size={17}/><span><strong>{w.name}</strong><small>{w.objectName} · {firstDayDone(data,w)} из {steps.length} проверок</small></span><ChevronRight size={16}/></button>)}</section>}
    <section className="field-block"><div className="field-section-bar"><h2>Быстрые переходы</h2></div><div className="field-quick-links"><button onClick={()=>selectTab("decisions")}><ClipboardCheck size={18}/> Запросы и согласования <ChevronRight size={15}/></button><button onClick={()=>selectTab("visits")}><Factory size={18}/> Первичный выезд <ChevronRight size={15}/></button><Link href="/shifts"><CalendarDays size={18}/> Планирование смен <ChevronRight size={15}/></Link></div></section>
   </>}
   {tab==="newcomers"&&<>
    <div className="field-section-bar"><h2>Первый день на объекте</h2><span className="field-muted">{futureNew.length} сотрудников</span></div>
    {futureNew.map(w=><article className="field-newcomer-card" key={w.id}><div><strong>{w.name}</strong><p>{w.objectName} · {w.specialty??"Специальность не указана"}</p><small>{firstDayDone(data,w)} из {steps.length} пунктов выполнено</small></div><button onClick={()=>{setFirstDay(w.id);setCheckEdit(null)}}>Открыть <ChevronRight size={14}/></button></article>)}
    {!futureNew.length&&<div className="field-empty">На выбранную дату первых выходов нет.</div>}
    {activeFirst&&<section className="field-block field-detail"><div className="field-section-bar"><h2>{activeFirst.name}</h2><button className="field-icon" aria-label="Закрыть" onClick={()=>setFirstDay(null)}><X size={17}/></button></div><p className="field-muted">{activeFirst.objectName} · {activeFirst.specialty??"Сотрудник"}</p>
     {!activeFirst.assignmentId&&<div className="field-alert error"><AlertTriangle size={15}/> Сначала назначьте сотруднику смену в планировании.</div>}
     <div className="field-checklist">{steps.map(step=>{const saved=checkpointData(data,activeFirst,step.key);return <div className="field-check-row" key={step.key}><button disabled={!canWrite||!!busy} onClick={()=>{setCheckEdit(checkEdit===step.key?null:step.key);setCheckNote(saved?.note??"")}}><span className={"field-check-icon "+(saved?.state==="done"?"done":saved?.state==="issue"?"issue":"")}><Check size={13}/></span><span><strong>{step.label}</strong><small>{saved?.state==="issue"?"Есть проблема":saved?.state==="done"?"Проверено":step.hint}</small></span><ChevronDown size={14}/></button>
      {checkEdit===step.key&&<div className="field-inline"><label>Комментарий<textarea rows={2} value={checkNote} maxLength={500} onChange={e=>setCheckNote(e.target.value)} placeholder="При необходимости"/></label><div><button disabled={!!busy} onClick={()=>void applyCheckpoint(step.key,null,null)}>Сбросить</button><button disabled={!!busy} onClick={()=>void applyCheckpoint(step.key,"issue",checkNote||null)}>Проблема</button><button className="primary" disabled={!!busy||step.key==="started"&&activeFirst.attendance!=="present"} onClick={()=>void applyCheckpoint(step.key,"done",checkNote||null)}>Проверено</button></div></div>}
     </div>})}</div>
     <div className="field-worker-actions">{phoneLink(activeFirst.phone)&&<a href={phoneLink(activeFirst.phone)!}><Phone size={15}/> Позвонить</a>}<Link href={"/workers/"+activeFirst.id}>Карточка сотрудника <ArrowRight size={14}/></Link></div>
    </section>}
   </>}
   {tab==="visits"&&<><div className="field-section-bar"><h2>Первичные и контрольные выезды</h2><Link className="field-link" href="/launches">Все запуски <ArrowRight size={14}/></Link></div>
    {scopedVisits.map(v=><article className="field-visit-card" key={v.id}><button onClick={()=>{setVisitId(visitId===v.id?null:v.id);setVisitItem(null)}}><Factory size={17}/><span><strong>{v.objectName}</strong><small>{v.scheduledDate??"Дата уточняется"} · {v.checklist.filter(x=>!x.hidden&&x.status==="confirmed").length} ответов</small></span><ChevronDown size={16}/></button>
     {activeVisit?.id===v.id&&<div className="field-visit-sections">{[...new Set(v.checklist.filter(x=>!x.hidden).map(x=>x.section))].map(section=><div key={section}><div className="field-visit-section-title">{section}</div>{v.checklist.filter(x=>!x.hidden&&x.section===section).map(item=><div className="field-visit-question" key={item.id}><button onClick={()=>{setVisitItem(visitItem===item.id?null:item.id);setVisitValue(item.value);setVisitNote(item.note)}}><span className={"field-check-icon "+(item.status==="confirmed"?"done":item.status==="issue"?"issue":"")}><Check size={12}/></span><span><strong>{item.label}</strong><small>{item.value||"Нужно уточнить"}</small></span><ChevronRight size={15}/></button>{visitItem===item.id&&<div className="field-inline"><label>Ответ{item.answerKind==="boolean"?<select value={visitValue} onChange={e=>setVisitValue(e.target.value)}><option value="">Выберите</option><option value="Да">Да</option><option value="Нет">Нет</option></select>:item.answerKind==="time"||item.answerKind==="number"?<input type={item.answerKind} value={visitValue} onChange={e=>setVisitValue(e.target.value)}/>:<textarea rows={2} value={visitValue} maxLength={2000} onChange={e=>setVisitValue(e.target.value)} placeholder="Введите ответ"/>}</label><label>Примечание<input value={visitNote} onChange={e=>setVisitNote(e.target.value)} maxLength={500}/></label><div><button onClick={()=>setVisitItem(null)}>Отмена</button><button disabled={!!busy||!data.canVisitEdit||!visitValue.trim()} onClick={()=>void saveVisit(v,item.id,"issue")}>Проблема</button><button className="primary" disabled={!!busy||!data.canVisitEdit||!visitValue.trim()} onClick={()=>void saveVisit(v,item.id,"confirmed")}>Сохранить</button></div></div>}</div>)}</div>)}
      <Link href={"/launches?object="+v.objectId+"&tab=visit"} className="field-link">Открыть план запуска <ArrowRight size={14}/></Link>
     </div>}
    </article>)}{!scopedVisits.length&&<div className="field-empty">В доступных объектах нет активных выездов.</div>}
   </>}
   {tab==="decisions"&&<><div className="field-section-bar"><h2>Запросы сотрудников</h2><button className="field-link" onClick={()=>{setApprovalLoaded(false);setNotice("")}}>Обновить</button></div>
    {initial.demo&&<div className="field-empty">В демонстрационных данных нет запросов на согласование.</div>}
    {!initial.demo&&(!approvalLoaded?<div className="field-empty">Загружаем согласования…</div>:updates.length?updates.map((x,i)=>{const worker=approvals.workers?.find(w=>w.id===x.workerId);const what=x.type==="plan"?"Изменение смены":x.type==="pattern"?"Изменение графика":"Изменение времени";return <article className="field-decision" key={x.workerId+":"+x.date+":"+x.type+":"+i}><span className="field-muted">{worker?.object??""} · {x.date}</span><strong>{worker?.name??"Сотрудник"}</strong><p>{what}{x.kind?" · "+(x.kind==="off"?"Выходной":x.kind==="night"?"Ночная":"Дневная"):""}{x.workDays?" · "+x.workDays+"/"+x.restDays:""}{x.startTime?" · "+x.startTime+"–"+x.endTime:""}</p><div><button disabled={!!busy} onClick={()=>void review(x,false)}>Отклонить</button><button className="primary" disabled={!!busy} onClick={()=>void review(x,true)}>Согласовать</button></div></article>}) : <div className="field-empty">Ожидающих решений нет.</div>)}
    <div className="field-quick-links"><Link href="/shifts">Все смены и подтверждения <ArrowRight size={15}/></Link><Link href="/timesheets">Табели и сверка часов <ArrowRight size={15}/></Link></div>
   </>}
   {tab==="more"&&<><div className="field-quick-links"><Link href="/objects"><Factory size={17}/> Все объекты <ChevronRight size={16}/></Link><Link href="/tasks"><ClipboardList size={17}/> Мои задачи <ChevronRight size={16}/></Link><Link href="/shifts"><CalendarDays size={17}/> Смены и выходы <ChevronRight size={16}/></Link><Link href="/workers"><UsersRound size={17}/> Сотрудники <ChevronRight size={16}/></Link><Link href="/launches"><MapPin size={17}/> План запусков <ChevronRight size={16}/></Link></div>
    {data.tasks.length>0&&<section className="field-block"><div className="field-section-bar"><h2>Ближайшие задачи</h2></div>{data.tasks.slice(0,5).map(t=><Link className="field-compact-row" href="/tasks" key={t.id}><ClipboardCheck size={15}/><span><strong>{t.title}</strong><small>{t.due??"Без срока"}</small></span><ChevronRight size={15}/></Link>)}</section>}
   </>}
   <p className="field-foot">OPERIS · Рабочий режим менеджера</p>
  </div>
  <nav className="field-bottom-nav" aria-label="Мобильная навигация">
   {([{key:"today",text:"Сегодня",icon:CalendarDays},{key:"newcomers",text:"Первый день",icon:UserRoundPlus},{key:"decisions",text:"Решения",icon:ClipboardCheck},{key:"visits",text:"Выезды",icon:Factory},{key:"more",text:"Ещё",icon:Menu}] as const).map(item=><button key={item.key} className={tab===item.key?"active":""} onClick={()=>selectTab(item.key)}><item.icon size={19}/><span>{item.text}</span></button>)}
  </nav>
 </div>;
}
