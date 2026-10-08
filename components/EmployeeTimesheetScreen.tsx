"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {CalendarDays,Check,CheckCircle2,ChevronDown,ChevronRight,ClipboardCheck,Clock3,FileCheck2,Info,LockKeyhole,Moon,Phone,Shirt,Sun,UserRound,AlertCircle} from "lucide-react";

type Kind="day"|"night"|"off";
type Reply={date:string;shiftKind:Kind|null;response:"working"|"day_off"|"cannot_work";reason:string|null;hours:number|null};
type Plan={date:string;kind:string;timeCode:string;hours:number};
type Window={date:string;startTime:string;endTime:string;endsNextDay:boolean};
type TimeChange=Window&{status:"proposed"|"accepted"|"rejected";appliesTo:"single"|"regular"};
type Doc={code:string;label:string;employeeReported:boolean;managerVerified:boolean};
type Details={clothingSize:string|null;shoeSize:string|null;employment:string;managerName:string|null;managerPhone:string|null;documents:Doc[];workwear:{name:string;state:"issued"|"needed";variant:string|null}[];shiftWindows:Window[];timeChanges:TimeChange[]};
type Portal={name:string;objectName:string;paidHours:number;owner:"manager"|"client";deadline:string;timezone?:string;today:string;reports:Reply[];plans:Plan[];details?:Details};
type Tab="schedule"|"documents"|"workwear"|"manager";
function addDays(iso:string,days:number){const d=new Date(iso+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function human(iso:string,weekday=true){return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",...(weekday?{weekday:"long"}:{}),timeZone:"UTC"}).format(new Date(iso+"T00:00:00Z"))}
function shortDate(iso:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(iso+"T00:00:00Z"))}
function numberString(v:number){return String(v).replace(".",",")}
function demoPortal():Portal{
 const today=new Date().toISOString().slice(0,10),start=today.slice(0,7)+"-01";
 const yesterday=addDays(today,-1),tomorrow=addDays(today,1);
 return {name:"Иванов Иван",objectName:"Склад «Можайское»",paidHours:11,owner:"client",deadline:"22:00",timezone:"Europe/Moscow",today,
  reports:[{date:yesterday,shiftKind:"night",response:"working",hours:null,reason:null}],
  plans:Array.from({length:Number(today.slice(-2))},(_,i)=>({date:addDays(start,i),kind:"night",timeCode:i===Number(today.slice(-2))-1?"PLANNED":"WORK",hours:i===Number(today.slice(-2))-1?0:11})),
  details:{clothingSize:"52–54",shoeSize:"43",employment:"gph",managerName:"Менеджер объекта",managerPhone:null,
   documents:[{code:"passport",label:"Паспорт",employeeReported:true,managerVerified:true},{code:"snils",label:"СНИЛС",employeeReported:true,managerVerified:true},{code:"inn",label:"ИНН",employeeReported:false,managerVerified:false},{code:"bank_details",label:"Реквизиты для выплат",employeeReported:true,managerVerified:false}],
   workwear:[{name:"Куртка рабочая",state:"issued",variant:"52–54"},{name:"Брюки рабочие",state:"issued",variant:"52–54"},{name:"Ботинки защитные",state:"needed",variant:null}],
   shiftWindows:[{date:yesterday,startTime:"20:00",endTime:"08:00",endsNextDay:true},{date:today,startTime:"20:00",endTime:"08:00",endsNextDay:true},{date:tomorrow,startTime:"20:00",endTime:"08:00",endsNextDay:true}],
   timeChanges:[]}};
}
const tabMeta:{key:Tab;label:string;icon:typeof CalendarDays}[]=[
 {key:"schedule",label:"График и табель",icon:CalendarDays},
 {key:"documents",label:"Документы",icon:FileCheck2},
 {key:"workwear",label:"Спецодежда",icon:Shirt},
 {key:"manager",label:"Менеджер",icon:UserRound}
];
const relationLabels:Record<string,string>={employment:"Трудовой договор",gph:"ГПХ",npd:"Самозанятость",custom:"Другое оформление"};
export function EmployeeTimesheetScreen({token,previewLayout}:{token:string;previewLayout?:"phone"|"desktop"}){
 const demo=token==="demo";
 const [data,setData]=useState<Portal|null>(demo?demoPortal():null);
 const [tab,setTab]=useState<Tab>("schedule");
 const [loading,setLoading]=useState(!demo);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [reason,setReason]=useState("");
 const [absenceDate,setAbsenceDate]=useState<string|null>(null);
 const [expandFuture,setExpandFuture]=useState(false);
 const [monthOpen,setMonthOpen]=useState(false);
 const [hoursOpen,setHoursOpen]=useState(false);
 const [hoursValue,setHoursValue]=useState("11");
 const [shiftDate,setShiftDate]=useState("");
 const [shiftStart,setShiftStart]=useState("20:00");
 const [shiftEnd,setShiftEnd]=useState("08:00");
 const [endsNextDay,setEndsNextDay]=useState(true);
 const [scope,setScope]=useState<"single"|"regular">("single");
 const [clothingSize,setClothingSize]=useState("");
 const [shoeSize,setShoeSize]=useState("");
 const [localClock,setLocalClock]=useState<number|null>(null);
 const fetchLatest=useCallback(async()=>{
  const r=await fetch("/api/public/worker-timesheet/"+encodeURIComponent(token),{cache:"no-store"});
  const json=await r.json();if(!r.ok)throw new Error(json.error??"Не удалось загрузить кабинет");
  setData(json);return json as Portal;
 },[token]);
 useEffect(()=>{if(demo)return;let active=true;
  void fetchLatest().catch(e=>{if(active)setError(e instanceof Error?e.message:"Не удалось открыть кабинет")}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false};
 },[demo,fetchLatest]);
 useEffect(()=>{if(data?.details){setClothingSize(data.details.clothingSize??"");setShoeSize(data.details.shoeSize??"")}},[data?.details]);
 useEffect(()=>{setLocalClock(Date.now())},[]);
 const reports=useMemo(()=>new Map((data?.reports??[]).map(x=>[x.date,x])),[data?.reports]);
 const plans=useMemo(()=>new Map((data?.plans??[]).map(x=>[x.date,x])),[data?.plans]);
 const windows=useMemo(()=>new Map((data?.details?.shiftWindows??[]).map(x=>[x.date,x])),[data?.details?.shiftWindows]);
 const overrides=useMemo(()=>new Map((data?.details?.timeChanges??[]).map(x=>[x.date,x])),[data?.details?.timeChanges]);
 const today=data?.today??new Date().toISOString().slice(0,10);
 const yesterday=addDays(today,-1),tomorrow=addDays(today,1),after=addDays(today,2);
 const monthDates=useMemo(()=>Array.from({length:Number(today.slice(-2))},(_,i)=>addDays(today.slice(0,7)+"-01",i)),[today]);
 const totals=useMemo(()=>monthDates.reduce((acc,date)=>{const reported=reports.get(date),p=plans.get(date);const h=reported?.hours??(p?.timeCode==="WORK"?Number(p.hours):0);return {hours:acc.hours+h,shifts:acc.shifts+(h>0?1:0)}},{hours:0,shifts:0}),[monthDates,reports,plans]);
 function kind(date:string):Kind|null{const report=reports.get(date);if(report?.response==="day_off")return"off";if(report?.shiftKind)return report.shiftKind;const p=plans.get(date);if(p?.timeCode==="DAY_OFF")return"off";if(p?.kind==="day"||p?.kind==="night")return p.kind;return null}
 function timing(date:string){const t=overrides.get(date);if(t?.status==="accepted")return t;return windows.get(date)??(demo?({date,startTime:"20:00",endTime:"08:00",endsNextDay:true} as Window):null)}
 function timingText(date:string){const t=timing(date);return t?${t.startTime}–${t.endTime}${t.endsNextDay?" (следующий день)":""}:"Время пока не указано"}
 function finished(date:string){const t=timing(date);if(!t)return date<today;const endDate=t.endsNextDay?addDays(date,1):date;
  if(demo)return date<today;
  if(!localClock)return false;
  const tz=data?.timezone||"Europe/Moscow";
  const parts=new Intl.DateTimeFormat("en-GB",{timeZone:tz,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(localClock));
  const v=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return (${v.year}-${v.month}-${v.day})+"T"+v.hour+":"+v.minute>=endDate+"T"+t.endTime;
 }
 async function send(body:Record<string,unknown>,message:string){
  if(!data)return false;setError("");setNotice("");setBusy(true);
  try{
   if(demo){
    if(typeof body.date==="string"&&("response" in body||"hours" in body)){
      const date=body.date as string,old=data.reports.find(x=>x.date===date);
      const next:Reply={date,shiftKind:(body.kind as Kind)??old?.shiftKind??kind(date),response:(body.response as Reply["response"])??old?.response??"working",reason:(body.reason as string)??old?.reason??null,hours:typeof body.hours==="number"?body.hours:"response" in body?null:old?.hours??null};
      setData(d=>d?{...d,reports:[...d.reports.filter(x=>x.date!==date),next]}:d);
    }else if(body.action==="document"){
      setData(d=>d&&d.details?{...d,details:{...d.details,documents:d.details.documents.map(x=>x.code===body.code?{...x,employeeReported:body.reported as boolean}:x)}}:d);
    }else if(body.action==="sizes"){
      setData(d=>d&&d.details?{...d,details:{...d.details,clothingSize:body.clothingSize as string,shoeSize:body.shoeSize as string}}:d);
    }else if(body.action==="shift_time"){
      const incoming:TimeChange={date:body.date as string,startTime:body.startTime as string,endTime:body.endTime as string,endsNextDay:body.endsNextDay as boolean,appliesTo:body.appliesTo as "single"|"regular",status:body.appliesTo==="single"&&data.owner==="client"?"accepted":"proposed"};
      setData(d=>d&&d.details?{...d,details:{...d.details,timeChanges:[...d.details.timeChanges.filter(x=>x.date!==incoming.date),incoming]}}:d);
    }
   }else{
    const r=await fetch("/api/public/worker-timesheet/"+encodeURIComponent(token),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
    const json=await r.json();if(!r.ok)throw new Error(json.error??"Не удалось сохранить");
    await fetchLatest();
   }
   setNotice(message);return true;
  }catch(e){setError(e instanceof Error?e.message:"Ошибка сохранения");return false}
  finally{setBusy(false)}
 }
 function startTimeEdit(date:string){const t=timing(date);setShiftDate(date);setShiftStart(t?.startTime??(kind(date)==="night"?"20:00":"08:00"));setShiftEnd(t?.endTime??(kind(date)==="night"?"08:00":"20:00"));setEndsNextDay(t?.endsNextDay??kind(date)==="night");setScope("single")}
 function shiftLabel(date:string){return kind(date)==="night"?"Ночная смена":kind(date)==="day"?"Дневная смена":kind(date)==="off"?"Выходной":"График не указан"}
 const nextReply=reports.get(tomorrow),completed=reports.get(yesterday);
 const yesterdayPending=kind(yesterday)!=="off"&&(completed?.hours==null);
 const nextNeedsAnswer=kind(tomorrow)!=="off"&&nextReply?.response==null;
 const firstTab=tab==="schedule";
 if(loading)return <main className="emp2"><section className="emp2-error">Загружаем личный кабинет…</section></main>;
 if(!data)return <main className="emp2"><section className="emp2-error"><LockKeyhole size={25}/><h1>Кабинет недоступен</h1><p>{error||"Ссылка недействительна или доступ приостановлен. Свяжитесь с менеджером."}</p></section></main>;
 return <main className={"emp2 "+(previewLayout?"emp2-preview-"+previewLayout:"")}>
  <div className="emp2-wrap">
   <header className="emp2-header">
    <div className="emp2-brand"><div className="emp2-brandmark">O</div><div><span>OPERIS · ДЛЯ СОТРУДНИКА</span><strong>Личный кабинет</strong></div></div>
    <div className="emp2-header-person"><UserRound size={16}/><div><strong>{data.name}</strong><span>{data.objectName}</span></div></div>
   </header>
   <div className="emp2-columns">
    <aside className="emp2-sidebar" aria-label="Разделы личного кабинета">
     <div className="emp2-sidebar-title">Рабочее пространство</div>
     {tabMeta.map(({key,label,icon:Icon})=><button key={key} className={"emp2-nav-button "+(tab===key?"is-active":"")} onClick={()=>{setTab(key);setError("");setNotice("")}}><Icon size={17}/><span>{label}</span>{key==="documents"&&data.details?.documents.some(x=>!x.managerVerified)&&<span className="emp2-nav-dot"/>}</button>)}
     <div className="emp2-sidebar-help"><Info size={15}/><span>Данные поступают вашему менеджеру. Отправка файлов не требуется.</span></div>
    </aside>
    <div className="emp2-content">
     <nav className="emp2-mobile-nav" aria-label="Разделы">{tabMeta.map(({key,label,icon:Icon})=><button key={key} className={tab===key?"is-active":""} onClick={()=>{setTab(key);setError("");setNotice("")}}><Icon size={16}/><span>{label}</span></button>)}</nav>
     {error&&<div className="emp2-alert" role="alert"><AlertCircle size={16}/>{error}</div>}
     {notice&&<div className="emp2-alert is-success" role="status"><CheckCircle2 size={16}/>{notice}{demo?" · Демонстрация":""}</div>}
     {firstTab&&<>
      <div className="emp2-section-title"><div><h1>График и табель</h1><p>Подтверждайте будущие смены и указывайте фактически отработанные часы.</p></div><div className="emp2-meta">Сегодня · {human(today,false)}</div></div>
      <div className="emp2-stats"><div><span>Учтено за месяц</span><strong>{numberString(totals.hours)} ч</strong></div><div><span>Отработано смен</span><strong>{totals.shifts}</strong></div><p>Итоги предварительные, до сверки с заказчиком.</p></div>
      <div className="emp2-workgrid">
       <section className={"emp2-module "+(nextNeedsAnswer?"is-attention":"")}>
        <div className="emp2-module-kicker"><CalendarDays size={17}/><span>01 · Ближайший выход</span><span className={"emp2-state "+(nextReply?.response==="working"?"is-good":nextNeedsAnswer?"is-warning":"")}>{nextReply?.response==="working"?"Подтверждено":nextReply?.response==="cannot_work"?"Не выйду":nextReply?.response==="day_off"||kind(tomorrow)==="off"?"Выходной":"Ожидается ответ"}</span></div>
        <h2>{human(tomorrow)}</h2><p className="emp2-shift-line"><MoonSun kind={kind(tomorrow)}/> {shiftLabel(tomorrow)} · {timingText(tomorrow)}</p>
        {kind(tomorrow)==="off"?<p className="emp2-subdued">Выходной по графику. Подтверждать его не нужно.</p>:<>
          {nextReply?.response==="working"?<div className="emp2-confirm"><CheckCircle2 size={18}/> Вы подтвердили выход. Если планы изменятся, сообщите до начала смены.</div>:nextReply?.response==="cannot_work"?<div className="emp2-confirm is-warning">Вы сообщили о невыходе{nextReply.reason?": "+nextReply.reason:""}. Менеджер увидит изменение.</div>:<p className="emp2-question">Выйдете на смену?</p>}
          {nextReply?.response!=="working"&&<button className="emp2-primary" disabled={busy} onClick={()=>void send({date:tomorrow,response:"working",kind:kind(tomorrow)==="night"?"night":"day"},"Выход подтверждён")}> <Check size={16}/> Да, выйду</button>}
          {nextReply?.response==="working"&&<button className="emp2-secondary" onClick={()=>setAbsenceDate(tomorrow)}>Изменились планы</button>}
          {nextReply?.response!=="working"&&<button className="emp2-secondary" onClick={()=>setAbsenceDate(absenceDate===tomorrow?null:tomorrow)}>Не смогу выйти</button>}
          {data.owner==="client"&&nextReply?.response!=="day_off"&&<button className="emp2-link" disabled={busy} onClick={()=>void send({date:tomorrow,response:"day_off",kind:"off"},"Выходной передан в планирование")}>У меня выходной по графику заказчика</button>}
          {absenceDate===tomorrow&&<div className="emp2-inline-form"><label>Причина изменения<textarea rows={2} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Например, заболел"/></label><button className="emp2-primary" disabled={busy||!reason.trim()} onClick={async()=>{if(await send({date:tomorrow,response:"cannot_work",kind:kind(tomorrow)==="night"?"night":"day",reason},"Менеджер получит изменение")){setAbsenceDate(null);setReason("")}}}>Сообщить о невыходе</button></div>}
          <div className="emp2-deadline"><Clock3 size={13}/> Подтвердить до {human(today,false)}, {data.deadline.slice(0,5)}. Изменения можно сообщить позже.</div>
        </>}
       </section>
       <section className={"emp2-module "+(yesterdayPending?"is-attention":"")}>
        <div className="emp2-module-kicker"><ClipboardCheck size={17}/><span>02 · Завершённая смена</span><span className={"emp2-state "+(completed?.hours!=null?"is-good":yesterdayPending?"is-warning":"")}>{completed?.hours!=null?"Часы указаны":kind(yesterday)==="off"?"Выходной":"Нужны часы"}</span></div>
        <h2>{human(yesterday)}</h2><p className="emp2-shift-line"><MoonSun kind={kind(yesterday)}/> {shiftLabel(yesterday)} · {timingText(yesterday)}</p>
        {kind(yesterday)==="off"?<p className="emp2-subdued">По графику выходной.</p>:completed?.hours!=null&&!hoursOpen?<><div className="emp2-confirm"><CheckCircle2 size={17}/> Вы указали {numberString(completed.hours)} ч</div><button className="emp2-secondary" onClick={()=>{setHoursOpen(true);setHoursValue(String(completed.hours))}}>Исправить часы</button></>:finished(yesterday)?<>
          {!hoursOpen?<p className="emp2-question">Сколько часов фактически отработали?</p>:<label className="emp2-field">Отработано часов<input type="number" min="0" max="24" step=".5" value={hoursValue} onChange={e=>setHoursValue(e.target.value)}/></label>}
          <button className="emp2-primary" disabled={busy||hoursOpen&&(!hoursValue||Number(hoursValue)<0||Number(hoursValue)>24)} onClick={async()=>{if(!reports.get(yesterday)?.response){const ok=await send({date:yesterday,response:"working",kind:kind(yesterday)==="night"?"night":"day"},"Смена отмечена");if(!ok)return;}await send({date:yesterday,hours:hoursOpen?Number(hoursValue):data.paidHours},"Отработанные часы переданы");setHoursOpen(false)}}>{hoursOpen?"Сохранить часы":${numberString(data.paidHours)} ч — верно}</button>
          {!hoursOpen&&<button className="emp2-secondary" onClick={()=>{setHoursOpen(true);setHoursValue(String(data.paidHours))}}>Указать другое количество</button>}
          {hoursOpen&&<button className="emp2-link" onClick={()=>setHoursOpen(false)}>Отмена</button>}
         </>:<p className="emp2-subdued">Указать часы можно после окончания смены.</p>}
        <div className="emp2-deadline"><Info size={13}/> Ночная смена относится к дате её начала. Часы указываются после окончания.</div>
       </section>
      </div>
      <section className="emp2-module emp2-additional">
       <div className="emp2-module-kicker"><CalendarDays size={17}/><span>Другие даты</span></div>
       {[today,after].map(date=><div className="emp2-other-day" key={date}><div><b>{human(date)}</b><span>{shiftLabel(date)} · {timingText(date)}</span></div><button onClick={()=>startTimeEdit(date)}>Уточнить время <ChevronRight size={14}/></button></div>)}
       <button className="emp2-row-toggle" onClick={()=>setExpandFuture(x=>!x)}> {expandFuture?"Скрыть ближайшие дни":"Другие даты и будущий график"} <ChevronDown size={15}/></button>
       {expandFuture&&[addDays(today,3),addDays(today,4)].map(date=><div className="emp2-other-day" key={date}><div><b>{human(date)}</b><span>{shiftLabel(date)} · {timingText(date)}</span></div><button onClick={()=>startTimeEdit(date)}>Изменить <ChevronRight size={14}/></button></div>)}
       {shiftDate&&<div className="emp2-inline-form"><div className="emp2-inline-head"><strong>Уточнить время · {human(shiftDate,false)}</strong><button className="emp2-link" onClick={()=>setShiftDate("")}>Закрыть</button></div><div className="emp2-time-fields"><label>Начало<input type="time" value={shiftStart} onChange={e=>setShiftStart(e.target.value)}/></label><label>Конец<input type="time" value={shiftEnd} onChange={e=>setShiftEnd(e.target.value)}/></label></div><label className="emp2-checkbox"><input type="checkbox" checked={endsNextDay} onChange={e=>setEndsNextDay(e.target.checked)}/> Конец смены на следующий день</label><label className="emp2-field">На какой срок?<select value={scope} onChange={e=>setScope(e.target.value as "single"|"regular")}><option value="single">Только эта смена</option><option value="regular">Мой постоянный график изменился</option></select></label><p className="emp2-subdued">{data.owner==="client"&&scope==="single"?"Информация обновится в плане объекта со слов сотрудника.":"Предложение отправится менеджеру на согласование."} Учёт оплачиваемых часов от этого не меняется.</p><button className="emp2-primary" disabled={busy} onClick={async()=>{if(await send({action:"shift_time",date:shiftDate,startTime:shiftStart,endTime:shiftEnd,endsNextDay,appliesTo:scope},"Новое время смены передано"))setShiftDate("")}}>Сохранить изменение</button></div>}
      </section>
      <section className="emp2-module emp2-month"><button className="emp2-month-toggle" onClick={()=>setMonthOpen(x=>!x)}><CalendarDays size={17}/> Табель за месяц <ChevronDown size={16}/></button>{monthOpen&&<div className="emp2-history">{monthDates.map(date=>{const r=reports.get(date),p=plans.get(date);const h=r?.hours??(p?.timeCode==="WORK"?p.hours:null);return <div key={date}><span>{shortDate(date)}</span><span>{r?.response==="day_off"||p?.timeCode==="DAY_OFF"?"Выходной":h!=null?numberString(h)+" ч":r?.response==="cannot_work"?"Сообщён невыход":r?.response==="working"?"Выход подтверждён":"Не заполнено"}</span></div>})}</div>}</section>
     </>}
     {tab==="documents"&&<>
      <div className="emp2-section-title"><div><h1>Документы</h1><p>Отмечайте, что уже передали. Менеджер подтвердит получение.</p></div></div>
      <section className="emp2-module"><div className="emp2-module-kicker"><FileCheck2 size={17}/><span>Чек-лист · {relationLabels[data.details?.employment??""]??"Оформление"}</span></div>
      <p className="emp2-subdued">Список зависит от способа оформления и требований вашего объекта. Загружать файлы здесь не нужно.</p>
      <div className="emp2-checklist">{(data.details?.documents??[]).map(doc=><div className="emp2-doc" key={doc.code}><span className={"emp2-doc-check "+(doc.managerVerified?"is-good":doc.employeeReported?"is-wait":"")}><Check size={14}/></span><div><strong>{doc.label}</strong><span>{doc.managerVerified?"Получен менеджером":doc.employeeReported?"Вы сообщили о передаче. Ожидается проверка.":"Требуется передать"}</span></div>{!doc.managerVerified&&<button disabled={busy} onClick={()=>void send({action:"document",code:doc.code,reported:!doc.employeeReported},doc.employeeReported?"Отметка снята":"Менеджер увидит отметку")}>{doc.employeeReported?"Отменить":"Передал"}</button>}</div>)}</div>
      {!data.details?.documents.length&&<div className="emp2-empty">Для этого назначения обязательных документов не указано.</div>}</section>
     </>}
     {tab==="workwear"&&<>
       <div className="emp2-section-title"><div><h1>Спецодежда и СИЗ</h1><p>Проверьте ваши размеры и то, что уже выдано на объекте.</p></div></div>
       <section className="emp2-module"><div className="emp2-module-kicker"><Shirt size={17}/><span>Мои размеры</span></div><div className="emp2-time-fields"><label>Размер одежды<input value={clothingSize} maxLength={40} onChange={e=>setClothingSize(e.target.value)} placeholder="Например, 52–54"/></label><label>Размер обуви<input value={shoeSize} maxLength={40} onChange={e=>setShoeSize(e.target.value)} placeholder="Например, 43"/></label></div><button className="emp2-primary" disabled={busy} onClick={()=>void send({action:"sizes",clothingSize:clothingSize.trim()||null,shoeSize:shoeSize.trim()||null},"Размеры сохранены в карточке сотрудника")}>Сохранить размеры</button><p className="emp2-subdued">Менеджер увидит изменения в карточке сотрудника и разделе обеспечения объекта.</p></section>
       <section className="emp2-module"><div className="emp2-module-kicker"><ClipboardCheck size={17}/><span>Выданное имущество</span></div><div className="emp2-checklist">{(data.details?.workwear??[]).map((x,i)=><div className="emp2-doc" key={x.name+i}><span className={"emp2-doc-check "+(x.state==="issued"?"is-good":"")}><Check size={14}/></span><div><strong>{x.name}</strong><span>{x.variant?x.variant+" · ":""}{x.state==="issued"?"Выдано":"Не выдано / требуется проверить"}</span></div></div>)}</div>{!data.details?.workwear.length&&<p className="emp2-subdued">По текущему назначению выдачи и норм обеспечения пока не указаны.</p>}<p className="emp2-subdued">Фактическую выдачу отмечает ответственный сотрудник склада или менеджер.</p></section>
     </>}
     {tab==="manager"&&<>
      <div className="emp2-section-title"><div><h1>Мой менеджер</h1><p>Свяжитесь с ответственным за ваш объект, если график изменился.</p></div></div>
      <section className="emp2-module"><div className="emp2-manager-person"><div className="emp2-manager-avatar"><UserRound size={22}/></div><div><strong>{data.details?.managerName??"Менеджер объекта"}</strong><span>{data.objectName}</span></div></div>{data.details?.managerPhone?<a className="emp2-primary emp2-call" href={"tel:"+data.details.managerPhone.replace(/[^+\d]/g,"")}><Phone size={17}/> Позвонить · {data.details.managerPhone}</a>:<p className="emp2-subdued">Телефон пока не указан. Уточните контакт у ответственного за объект.</p>}</section>
     </>}
     <footer className="emp2-footer">OPERIS · Кабинет сотрудника{demo?" · Демонстрационные данные, изменения не сохраняются в базе":""}</footer>
    </div>
   </div>
  </div>
 </main>;
}
function MoonSun({kind}:{kind:Kind|null}){return kind==="night"?<Moon size={15}/>:kind==="day"?<Sun size={15}/>:<CalendarDays size={15}/>}
