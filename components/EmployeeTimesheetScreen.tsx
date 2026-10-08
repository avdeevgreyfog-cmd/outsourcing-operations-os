"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {CalendarDays,ClipboardCheck,Check,CheckCircle2,Clock3,ChevronDown,ChevronRight,Phone,FileText,Shirt,Settings2,LockKeyhole,Moon,Sun,AlertTriangle,MoreHorizontal,ArrowLeft,Info} from "lucide-react";

type Kind="day"|"night"|"off";
type Reply={date:string;shiftKind:Kind|null;response:"working"|"day_off"|"cannot_work";reason:string|null;hours:number|null};
type PlanDay={date:string;kind:Kind|null;source:"assigned"|"manual"|"cycle"|"worker"|"none";proposal:Kind|null;proposalStatus:"proposed"|"rejected"|null;startTime:string|null;endTime:string|null;endsNextDay:boolean};
type Planning={owner:"manager"|"worker";horizon:number;workDays:number|null;restDays:number|null;defaultKind:"day"|"night"|null;days:PlanDay[]};
type Document={code:string;label:string;employeeReported:boolean;managerVerified:boolean};
type Details={clothingSize:string|null;shoeSize:string|null;employment:string;managerName:string|null;managerPhone:string|null;documents:Document[];workwear:{name:string;state:"issued"|"needed";variant:string|null}[];shiftWindows:unknown[];timeChanges:unknown[]};
type Portal={name:string;objectName:string;paidHours:number;deadline:string;today:string;timezone:string;reports:Reply[];plans:{date:string;timeCode:string;hours:number;kind:string}[];details?:Details;planning:Planning};
type Tab="shifts"|"timesheet"|"more";
type More="overview"|"documents"|"workwear"|"contact"|"settings";
function move(d:string,n:number){const x=new Date(d+"T00:00:00Z");x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)}
function format(d:string){return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",weekday:"long",timeZone:"UTC"}).format(new Date(d+"T00:00:00Z"))}
function smallDate(d:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(d+"T00:00:00Z"))}
function clockNow(timezone:string){const f=new Intl.DateTimeFormat("en-GB",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());const o=Object.fromEntries(f.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`}
function demo():Portal{
 const today=new Date().toISOString().slice(0,10);
 const days=Array.from({length:16},(_,i)=>{const date=move(today,i-3),kind:Kind=(i===5||i===8)?"off":"night";return{date,kind,source:"cycle" as const,proposal:null,proposalStatus:null,startTime:"20:00",endTime:"08:00",endsNextDay:true}});
 return {name:"Иванов Иван",objectName:"Можайское · Комплектовщик",paidHours:11,deadline:"22:00",today,timezone:"Europe/Moscow",
  reports:[],plans:[],planning:{owner:"worker",horizon:12,workDays:5,restDays:2,defaultKind:"night",days},
  details:{clothingSize:"52–54",shoeSize:"43",employment:"gph",managerName:"Менеджер объекта",managerPhone:null,
   documents:[{code:"passport",label:"Паспорт",employeeReported:true,managerVerified:true},{code:"snils",label:"СНИЛС",employeeReported:true,managerVerified:true},{code:"inn",label:"ИНН",employeeReported:false,managerVerified:false},{code:"bank_details",label:"Реквизиты для выплаты",employeeReported:true,managerVerified:false}],
   workwear:[{name:"Рабочая куртка",state:"issued",variant:"52–54"},{name:"Рабочие брюки",state:"issued",variant:"52–54"},{name:"Защитная обувь",state:"needed",variant:"43"}],shiftWindows:[],timeChanges:[]}};
}
const employmentLabel:Record<string,string>={gph:"ГПХ",employment:"Трудовой договор",npd:"Самозанятость",custom:"Иной договор"};
const kindLabel=(kind:Kind|null)=>kind==="day"?"Дневная смена":kind==="night"?"Ночная смена":kind==="off"?"Выходной":"Не запланировано";
const kindShort=(kind:Kind|null)=>kind==="day"?"День":kind==="night"?"Ночь":kind==="off"?"Выходной":"Нет плана";
export function EmployeeTimesheetScreen({token,previewLayout}:{token:string;previewLayout?:"phone"|"desktop"}){
 const isDemo=token==="demo";
 const [data,setData]=useState<Portal|null>(isDemo?demo():null);
 const [tab,setTab]=useState<Tab>("shifts");
 const [more,setMore]=useState<More>("overview");
 const [error,setError]=useState("");const [notice,setNotice]=useState("");const [loading,setLoading]=useState(!isDemo);
 const [busy,setBusy]=useState(false);const [showReason,setShowReason]=useState(false);const [reason,setReason]=useState("");
 const [hourEdit,setHourEdit]=useState(false);const [hours,setHours]=useState("11");
 const [editingDay,setEditingDay]=useState<string|null>(null);const [kindChoice,setKindChoice]=useState<Kind>("night");
 const [selectedDays,setSelectedDays]=useState<string[]>([]);const [showAll,setShowAll]=useState(false);
 const [clothingDraft,setClothingDraft]=useState<string|null>(null);const [shoeDraft,setShoeDraft]=useState<string|null>(null);
 const [settingKind,setSettingKind]=useState<"day"|"night">("night");
 const [startTime,setStartTime]=useState("20:00");const [endTime,setEndTime]=useState("08:00");const [nextDay,setNextDay]=useState(true);
 
 const reload=useCallback(async()=>{
  const r=await fetch("/api/public/worker-timesheet/"+encodeURIComponent(token),{cache:"no-store"});
  const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось загрузить кабинет");
  setData(j as Portal);return j as Portal;
 },[token]);
 useEffect(()=>{if(isDemo)return;let alive=true;void Promise.resolve().then(()=>reload()).catch(e=>{if(alive)setError(e instanceof Error?e.message:"Ошибка подключения")}).finally(()=>{if(alive)setLoading(false)});return()=>{alive=false}},[reload,isDemo]);

 const clothing=clothingDraft??data?.details?.clothingSize??"";
 const shoe=shoeDraft??data?.details?.shoeSize??"";
 const checkedAt=clockNow(data?.timezone??"Europe/Moscow");
 const today=data?.today??new Date().toISOString().slice(0,10),tomorrow=move(today,1);
 const records=useMemo(()=>new Map((data?.planning?.days??[]).map(x=>[x.date,x])),[data?.planning?.days]);
 const answers=useMemo(()=>new Map((data?.reports??[]).map(x=>[x.date,x])),[data?.reports]);
 const schedule=(date:string)=>records.get(date)??null;
 const canFinish=(p:PlanDay)=>{if(p.kind==="off"||!p.kind)return false;
  const end=move(p.date,p.endsNextDay?1:0)+"T"+(p.endTime??(p.kind==="night"?"08:00":"20:00"));
  return checkedAt>=end;
 };
 const completed=useMemo(()=>[0,-1,-2,-3].map(i=>schedule(move(today,i))).find(p=>p&&canFinish(p))??null,[today,records,checkedAt]);
 const next=schedule(tomorrow),nextAnswer=answers.get(tomorrow),completedAnswer=completed?answers.get(completed.date):null;
 const future=(data?.planning?.days??[]).filter(x=>x.date>=tomorrow&&x.date<=move(today,data?.planning?.horizon??7));
 const counted=useMemo(()=>{const month=today.slice(0,7);let total=0,shifts=0;for(const x of data?.plans??[]){if(!x.date.startsWith(month))continue;const answer=answers.get(x.date);const hours=answer?answer.hours:(x.timeCode==="WORK"?Number(x.hours):null);if(hours!=null&&hours>0){total+=hours;shifts++}}return{total,shifts}},[today,data?.plans,answers]);
 
 const timeText=(p:PlanDay|null)=>p?.kind==="off"?"":p?.startTime&&p.endTime?`${p.startTime}–${p.endTime}${p.endsNextDay?" · до следующего дня":""}`:"Время смены уточняется";
 async function save(payload:Record<string,unknown>,message:string){
  if(!data)return false;setError("");setNotice("");setBusy(true);
  try{
   if(isDemo){
    const date=String(payload.date??"");
    if(payload.action==="plan_day"){
     const newKind=payload.kind as Kind;setData(d=>d?{...d,planning:{...d.planning,days:d.planning.days.map(x=>x.date===date?{...x,kind:d.planning.owner==="worker"?newKind:x.kind,source:d.planning.owner==="worker"?"worker" as const:x.source,proposal:d.planning.owner==="manager"?newKind:null,proposalStatus:d.planning.owner==="manager"?"proposed" as const:null}:x)}}:d);
    }else if("hours" in payload||"response" in payload){
     setData(d=>{if(!d)return d;const old=d.reports.find(x=>x.date===date);const r:Reply={date,shiftKind:(payload.kind as Kind)??old?.shiftKind??records.get(date)?.kind??null,
      response:(payload.response as Reply["response"])??old?.response??"working",reason:(payload.reason as string)??old?.reason??null,
      hours:typeof payload.hours==="number"?payload.hours:("response" in payload?null:old?.hours??null)};
      return {...d,reports:[...d.reports.filter(x=>x.date!==date),r]};});
    }else if(payload.action==="sizes"){
     setData(d=>d?.details?{...d,details:{...d.details,clothingSize:payload.clothingSize as string,shoeSize:payload.shoeSize as string}}:d);
    }else if(payload.action==="document"){
     setData(d=>d?.details?{...d,details:{...d.details,documents:d.details.documents.map(x=>x.code===payload.code?{...x,employeeReported:Boolean(payload.reported)}:x)}}:d);
    }else if(payload.action==="shift_time"){setNotice("Изменение графика передано менеджеру (демонстрация)");}
   }else{
    const r=await fetch("/api/public/worker-timesheet/"+encodeURIComponent(token),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const j=await r.json();if(!r.ok)throw new Error(j.error??"Ошибка сохранения");await reload();
   }
   setNotice(message);return true;
  }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить");return false}
  finally{setBusy(false)}
 }
 async function confirmExit(){const kind=next?.kind;if(!kind||kind==="off")return;const ok=await save({date:tomorrow,response:"working",kind},"Выход подтверждён");if(ok)setShowReason(false)}
 async function confirmHours(){if(!completed)return;
   if(completedAnswer?.response!=="working"){const ok=await save({date:completed.date,response:"working",kind:completed.kind},"Смена отмечена");if(!ok)return}
   const ok=await save({date:completed.date,hours:hourEdit?Number(hours):data?.paidHours??11},"Часы переданы для сверки");if(ok)setHourEdit(false);
 }
 async function planDay(date:string,kind:Kind){if(busy)return;const ok=await save({action:"plan_day",date,kind},data?.planning.owner==="manager"?"Предложение передано менеджеру":"График обновлён");if(ok)setEditingDay(null)}
 async function markSelectedOff(){let count=0;for(const date of selectedDays){if(await save({action:"plan_day",date,kind:"off"},"Выходной отмечен"))count++;else break}setSelectedDays([]);if(count>0)setNotice(data?.planning.owner==="worker"?`${count} выходных сохранено`:`${count} изменений передано на согласование`)}
 function openSettings(){setTab("more");setMore("settings");setSettingKind(data?.planning.defaultKind??"night");const d=records.get(tomorrow);setStartTime(d?.startTime??"20:00");setEndTime(d?.endTime??"08:00");setNextDay(d?.endsNextDay??true)}
 const managerCall=data?.details?.managerPhone?.replace(/[^+\d]/g,"");
 if(loading)return <main className="worker-self"><div className="worker-self-loading">Загружаем личный кабинет…</div></main>;
 if(!data)return <main className="worker-self"><div className="worker-self-loading"><LockKeyhole/> Кабинет недоступен. {error}</div></main>;
 return <main className={"worker-self "+(previewLayout==="phone"?"worker-self-phone":"")+(previewLayout==="desktop"?" worker-self-desktop":"")}>
  <div className="worker-self-frame">
   <header className="worker-self-header">
    <div className="worker-self-brand"><span className="worker-self-logo">O</span><div><small>OPERIS · СОТРУДНИК</small><strong>Личный кабинет</strong></div></div>
    <div className="worker-self-identity"><strong>{data.name}</strong><span>{data.objectName}</span></div>
    <div className="worker-self-header-actions">
      {managerCall?<a href={"tel:"+managerCall} className="worker-self-icon-button" aria-label="Позвонить менеджеру"><Phone size={17}/></a>:<button className="worker-self-icon-button" onClick={()=>{setTab("more");setMore("contact")}} aria-label="Контакты менеджера"><Phone size={17}/></button>}
    </div>
   </header>
   <div className="worker-self-layout">
    <aside className="worker-self-sidebar">
     <p>РАБОЧЕЕ ПРОСТРАНСТВО</p>
     <button className={tab==="shifts"?"active":""} onClick={()=>setTab("shifts")}><CalendarDays size={17}/> Мои смены</button>
     <button className={tab==="timesheet"?"active":""} onClick={()=>setTab("timesheet")}><ClipboardCheck size={17}/> Табель</button>
     <button className={tab==="more"?"active":""} onClick={()=>{setTab("more");setMore("overview")}}><MoreHorizontal size={17}/> Ещё</button>
     <div className="worker-self-sidebar-foot">{data.name}<small>{data.objectName}</small></div>
    </aside>
    <div className="worker-self-main">
     {error&&<div role="alert" className="worker-self-alert"><AlertTriangle size={16}/>{error}</div>}
     {notice&&<div role="status" className="worker-self-alert success"><CheckCircle2 size={16}/>{notice}{isDemo?" · демонстрация":""}</div>}
     {tab==="shifts"&&<>
      <div className="worker-self-page-title"><div><h1>Мои смены</h1><p>{data.objectName} · {data.planning.owner==="manager"?"График составляет менеджер":"График составляете вы"}</p></div><button className="worker-self-light-button" onClick={openSettings}><Settings2 size={15}/> Настройки графика</button></div>
      <div className="worker-self-primary-grid">
       <section className="worker-self-panel worker-self-priority">
        <div className="worker-self-panel-head"><span><CalendarDays size={17}/> Ближайший день</span><span className={"worker-self-dot "+(nextAnswer?.response==="working"?"good":"")}>{nextAnswer?.response==="working"?"Подтверждено":nextAnswer?.response==="cannot_work"?"Не выйду":next?.proposalStatus==="proposed"?"Изменение на проверке":"Требует внимания"}</span></div>
        <h2>{format(tomorrow)}</h2>
        <p className="worker-self-shift"><ShiftIcon kind={next?.kind??null}/><strong>{kindLabel(next?.kind??null)}</strong><span>{timeText(next)}</span></p>
        {next?.proposalStatus==="proposed"&&<p className="worker-self-hint">Запрошено изменение: {kindShort(next.proposal)}. Ожидается решение менеджера.</p>}
        {!next?.kind?<><p className="worker-self-muted">На завтра пока нет установленной смены. Укажите рабочий день или выходной.</p><button className="worker-self-main-button" onClick={()=>setEditingDay(tomorrow)}>Запланировать день</button></>:
        next.kind==="off"?<><p className="worker-self-muted">Выходной уже стоит в вашем графике. Подтверждать его не нужно.</p><button className="worker-self-light-button full" onClick={()=>setEditingDay(tomorrow)}>{data.planning.owner==="manager"?"Запросить рабочий день":"Изменить на рабочий день"}</button></>:
        <>
         {nextAnswer?.response==="working"?<div className="worker-self-done"><CheckCircle2 size={17}/> Вы подтвердили выход на эту смену.</div>:nextAnswer?.response==="cannot_work"?<p className="worker-self-warning">Вы сообщили о невыходе. Причина: {nextAnswer.reason??"не указана"}.</p>:<p className="worker-self-question">Вы выйдете на смену?</p>}
         {nextAnswer?.response!=="working"&&<button className="worker-self-main-button" disabled={busy} onClick={()=>void confirmExit()}><Check size={17}/> Подтвердить выход</button>}
         <button className="worker-self-light-button full" disabled={busy} onClick={()=>setShowReason(x=>!x)}>{nextAnswer?.response==="working"?"Изменились планы":"Не смогу выйти"}</button>
         {showReason&&<div className="worker-self-edit"><label>Почему не сможете выйти?<textarea rows={2} maxLength={250} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Например, заболел"/></label><button className="worker-self-main-button" disabled={busy||!reason.trim()} onClick={async()=>{if(await save({date:tomorrow,response:"cannot_work",kind:next.kind,reason},"Изменение передано менеджеру")){setShowReason(false);setReason("")}}}>Сообщить менеджеру</button></div>}
         <button className="worker-self-quiet" onClick={()=>setEditingDay(tomorrow)}>Предложить изменение графика</button>
        </>}
        <div className="worker-self-deadline"><Clock3 size={13}/> Подтверждение до {format(today)}, {data.deadline.slice(0,5)}. О важных изменениях сообщайте сразу.</div>
       </section>
       <section className="worker-self-panel">
        <div className="worker-self-panel-head"><span><ClipboardCheck size={17}/> Последняя завершённая смена</span><span className={"worker-self-dot "+(completedAnswer?.hours!=null?"good":"")}>{completedAnswer?.hours!=null?"Часы переданы":"Не заполнено"}</span></div>
        {completed?<><h2>{format(completed.date)}</h2><p className="worker-self-shift"><ShiftIcon kind={completed.kind}/><strong>{kindLabel(completed.kind)}</strong><span>{timeText(completed)}</span></p>
         {completedAnswer?.hours!=null&&!hourEdit?<><div className="worker-self-done"><CheckCircle2 size={17}/> Вы указали {completedAnswer.hours} ч.</div><button className="worker-self-light-button full" onClick={()=>{setHourEdit(true);setHours(String(completedAnswer.hours))}}>Исправить часы</button></>:
          <><p className="worker-self-question">Сколько часов вы отработали?</p>{hourEdit&&<label className="worker-self-hours">Отработано часов<input type="number" min={0} max={24} step={0.5} inputMode="decimal" value={hours} onChange={e=>setHours(e.target.value)}/></label>}
           <button className="worker-self-main-button" disabled={busy||(hourEdit&&(!hours.trim()||Number(hours)<0||Number(hours)>24))} onClick={()=>void confirmHours()}><Check size={17}/>{hourEdit?"Сохранить часы":`${data.paidHours} ч — верно`}</button>
           <button className="worker-self-light-button full" onClick={()=>{setHourEdit(x=>!x);setHours(String(data.paidHours))}}>{hourEdit?"Отмена":"Указать другие часы"}</button></>}
         <div className="worker-self-deadline"><Info size={13}/> Ночная смена учитывается по дате начала. Данные поступают на сверку менеджеру.</div>
        </>:<p className="worker-self-muted">Нет завершённых смен за ближайшие дни.</p>}
       </section>
      </div>
      <section className="worker-self-panel worker-self-future">
       <div className="worker-self-panel-head"><span><CalendarDays size={17}/> Ближайшие дни</span><button className="worker-self-quiet" onClick={()=>setShowAll(x=>!x)}>{showAll?"Свернуть":"Весь период"} <ChevronDown size={14}/></button></div>
       <p className="worker-self-muted">{data.planning.owner==="worker"?"Отмечайте выходные и рабочие дни заранее.":"Видите график менеджера. Изменения отправляются ему на согласование."} Можно выбрать несколько дат и отметить выходные разом.</p>
       <div className="worker-self-days">
        {future.slice(0,showAll?future.length:5).map(p=><div className="worker-self-day" key={p.date}>
         <input type="checkbox" aria-label={"Выбрать "+format(p.date)} checked={selectedDays.includes(p.date)} onChange={e=>setSelectedDays(v=>e.target.checked?[...v,p.date]:v.filter(x=>x!==p.date))}/>
         <button className="worker-self-day-content" onClick={()=>setEditingDay(p.date)}><strong>{format(p.date)}</strong><span>{kindShort(p.kind)}{p.proposalStatus==="proposed"?" · Изменение на проверке":""}</span></button>
         <button className="worker-self-day-action" onClick={()=>setEditingDay(p.date)}><ChevronRight size={18}/></button>
        </div>)}
       </div>
       {selectedDays.length>0&&<div className="worker-self-selected"><span>Выбрано дат: {selectedDays.length}</span><button disabled={busy} onClick={()=>void markSelectedOff()}>{data.planning.owner==="worker"?"Отметить выходными":"Запросить выходные"}</button><button className="worker-self-quiet" onClick={()=>setSelectedDays([])}>Снять выбор</button></div>}
       {editingDay&&<div className="worker-self-edit"><div className="worker-self-edit-title"><strong>{format(editingDay)}</strong><button className="worker-self-quiet" onClick={()=>setEditingDay(null)}>Закрыть</button></div>
        <p>{data.planning.owner==="manager"?"Изменения будут направлены менеджеру.":"Выберите рабочую смену либо выходной."}</p>
        <div className="worker-self-choices">{(["day","night","off"] as Kind[]).map(k=><button key={k} className={kindChoice===k?"selected":""} onClick={()=>setKindChoice(k)}>{kindShort(k)}</button>)}</div>
        <button className="worker-self-main-button" disabled={busy} onClick={()=>void planDay(editingDay,kindChoice)}>{data.planning.owner==="manager"?"Отправить на согласование":"Сохранить день"}</button>
       </div>}
      </section>
     </>}
     {tab==="timesheet"&&<>
      <div className="worker-self-page-title"><div><h1>Мой табель</h1><p>Отработанные часы за текущий месяц. Суммы предварительные до сверки.</p></div></div>
      <div className="worker-self-totals"><div><small>Часы</small><strong>{counted.total}</strong></div><div><small>Смены</small><strong>{counted.shifts}</strong></div></div>
      <section className="worker-self-panel"><div className="worker-self-panel-head"><span>Дата и результат</span><span>Статус</span></div>
       {(data.planning.days??[]).filter(x=>x.date.startsWith(today.slice(0,7))&&x.date<=today).slice().reverse().map(p=>{
        const report=answers.get(p.date),legacy=data.plans.find(x=>x.date===p.date),h=report?.hours??(legacy?.timeCode==="WORK"?legacy.hours:null);
        return <div className="worker-self-timesheet-row" key={p.date}><div><strong>{smallDate(p.date)}</strong><span>{kindLabel(p.kind)}</span></div><div>{p.kind==="off"?"В":h!=null?`${h} ч`:report?.response==="working"?"Подтверждено":"План"}</div></div>;
       })}
      </section>
     </>}
     {tab==="more"&&<>
      {more==="overview"?<><div className="worker-self-page-title"><div><h1>Дополнительно</h1><p>Документы, обеспечение, контакты и настройки графика.</p></div></div>
       <div className="worker-self-extra-list">{([{key:"documents",label:"Документы",sub:"Что необходимо передать",icon:FileText},{key:"workwear",label:"Спецодежда и СИЗ",sub:"Размеры и выдача",icon:Shirt},{key:"contact",label:"Важные контакты",sub:"Ваш менеджер объекта",icon:Phone},{key:"settings",label:"Настройки графика",sub:"Обычная смена и рабочее время",icon:Settings2}] as const).map(x=><button key={x.key} onClick={()=>x.key==="settings"?openSettings():setMore(x.key)}><x.icon size={19}/><span><strong>{x.label}</strong><small>{x.sub}</small></span><ChevronRight size={16}/></button>)}</div>
      </>:<>
       <button className="worker-self-back" onClick={()=>setMore("overview")}><ArrowLeft size={15}/> Все разделы</button>
       {more==="documents"&&<><div className="worker-self-page-title"><div><h1>Мои документы</h1><p>{employmentLabel[data.details?.employment??""]??"Оформление"} · Что требуется для работы на объекте.</p></div></div>
        <section className="worker-self-panel"><div className="worker-self-panel-head"><span><FileText size={17}/> Чек-лист документов</span></div><p className="worker-self-muted">Отметьте, что передали. Получение подтвердит менеджер. Загружать файлы не нужно.</p>
         <div className="worker-self-doc-list">{(data.details?.documents??[]).map(d=><div className="worker-self-doc-row" key={d.code}>
          <span className={"worker-self-doc-icon "+(d.managerVerified?"verified":d.employeeReported?"reported":"")}><Check size={14}/></span>
          <div><strong>{d.label}</strong><small>{d.managerVerified?"Получено менеджером":d.employeeReported?"Вы отметили передачу · ожидается проверка":"Требуется передать"}</small></div>
          {!d.managerVerified&&<button disabled={busy} onClick={()=>void save({action:"document",code:d.code,reported:!d.employeeReported},"Статус документа обновлён")}>{d.employeeReported?"Отменить":"Передал"}</button>}
         </div>)}</div>
        </section>
       </>}
       {more==="workwear"&&<><div className="worker-self-page-title"><div><h1>Спецодежда и СИЗ</h1><p>Укажите размеры и проверьте, что уже выдано на объекте.</p></div></div>
        <section className="worker-self-panel"><div className="worker-self-panel-head"><span><Shirt size={17}/> Мои размеры</span></div><div className="worker-self-fields"><label>Размер одежды<input value={clothing} onChange={e=>setClothingDraft(e.target.value)} maxLength={40} placeholder="Например, 52–54"/></label><label>Размер обуви<input value={shoe} onChange={e=>setShoeDraft(e.target.value)} maxLength={40} placeholder="Например, 43"/></label></div><button className="worker-self-main-button" disabled={busy} onClick={()=>void save({action:"sizes",clothingSize:clothing.trim()||null,shoeSize:shoe.trim()||null},"Размеры сохранены")}>Сохранить размеры</button></section>
        <section className="worker-self-panel worker-self-additional"><div className="worker-self-panel-head"><span>Выдача по объекту</span></div>
         {(data.details?.workwear??[]).map((x,i)=><div className="worker-self-asset-row" key={i}><span><strong>{x.name}</strong>{x.variant&&<small>Размер: {x.variant}</small>}</span><span className={"worker-self-asset-tag "+(x.state==="issued"?"issued":"")}>{x.state==="issued"?"Выдано":"Не выдано"}</span></div>)}
         <p className="worker-self-muted">Выдачу подтверждает склад или менеджер. Сведения берутся из общего учёта OPERIS.</p>
        </section>
       </>}
       {more==="contact"&&<><div className="worker-self-page-title"><div><h1>Важные контакты</h1><p>Ответственный за вашу работу на объекте.</p></div></div>
        <section className="worker-self-panel worker-self-contact"><small>МЕНЕДЖЕР ОБЪЕКТА</small><h2>{data.details?.managerName??"Менеджер объекта"}</h2><p>{data.objectName}</p>
         {managerCall?<a className="worker-self-main-button" href={"tel:"+managerCall}><Phone size={17}/> Позвонить · {data.details?.managerPhone}</a>:<p className="worker-self-muted">Контактный телефон пока не указан. Менеджер добавит рабочий номер в настройках объекта.</p>}
        </section>
       </>}
       {more==="settings"&&<><div className="worker-self-page-title"><div><h1>Настройки графика</h1><p>Проверьте, какое время и тип смены используются обычно.</p></div></div>
        <section className="worker-self-panel"><div className="worker-self-panel-head"><span><Settings2 size={17}/> Моя обычная смена</span></div><p className="worker-self-muted">Текущий тип: {kindLabel(data.planning.defaultKind)}. Повторение: {data.planning.workDays!==null?`${data.planning.workDays}/${data.planning.restDays}`:"Индивидуальный график"}.</p>
          <div className="worker-self-choices">{(["day","night"] as const).map(k=><button className={settingKind===k?"selected":""} key={k} onClick={()=>{setSettingKind(k);setNextDay(k==="night")}}>{kindShort(k)}</button>)}</div>
          <div className="worker-self-fields"><label>Начало смены<input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label><label>Окончание<input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label></div>
          <label className="worker-self-check"><input type="checkbox" checked={nextDay} onChange={e=>setNextDay(e.target.checked)}/> Окончание на следующий день</label>
          <p className="worker-self-muted">Изменение постоянного времени отправится менеджеру на согласование. До решения будет действовать прежний график.</p>
          <button className="worker-self-main-button" disabled={busy} onClick={()=>void save({action:"shift_time",date:tomorrow,kind:settingKind,startTime,endTime,endsNextDay:nextDay,appliesTo:"regular"},"Предложение по графику отправлено")}>Предложить изменение</button>
        </section>
       </>}
      </>}
     </>}
     <footer className="worker-self-footer">OPERIS · Кабинет сотрудника{isDemo?" · Демонстрация без записи в базу":""}</footer>
    </div>
   </div>
   <nav className="worker-self-bottom-nav" aria-label="Главная навигация">
    <button className={tab==="shifts"?"active":""} onClick={()=>setTab("shifts")}><CalendarDays size={20}/>Смены</button>
    <button className={tab==="timesheet"?"active":""} onClick={()=>setTab("timesheet")}><ClipboardCheck size={20}/>Табель</button>
    <button className={tab==="more"?"active":""} onClick={()=>{setTab("more");setMore("overview")}}><MoreHorizontal size={20}/>Ещё</button>
   </nav>
  </div>
 </main>;
}
function ShiftIcon({kind}:{kind:Kind|null}){return kind==="night"?<Moon size={16}/>:kind==="day"?<Sun size={16}/>:<CalendarDays size={16}/>}
