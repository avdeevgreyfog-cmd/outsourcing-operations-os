"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {CalendarDays,ClipboardCheck,Check,CheckCircle2,Clock3,ChevronDown,ChevronRight,Phone,FileText,Shirt,Settings2,LockKeyhole,Moon,Sun,AlertTriangle,MoreHorizontal,ArrowLeft,Info} from "lucide-react";

type Kind="day"|"night"|"off";
type Reply={date:string;shiftKind:Kind|null;response:"working"|"day_off"|"cannot_work";reason:string|null;hours:number|null;reconciledAt?:string|null};
type PlanDay={date:string;kind:Kind|null;source:"assigned"|"manual"|"cycle"|"worker"|"none";proposal:Kind|null;proposalStatus:"proposed"|"rejected"|null;startTime:string|null;endTime:string|null;endsNextDay:boolean};
type Planning={owner:"manager"|"worker";horizon:number;workDays:number|null;restDays:number|null;defaultKind:"day"|"night"|null;floatingDaysOff:boolean;patternFrom:string;days:PlanDay[]};
type Document={code:string;label:string;employeeReported:boolean;managerVerified:boolean};
type Details={clothingSize:string|null;shoeSize:string|null;employment:string;managerName:string|null;managerPhone:string|null;visibility?:{documents:boolean;workwear:boolean};documents:Document[];workwear:{name:string;state:"issued"|"needed";variant:string|null}[];shiftWindows:unknown[];timeChanges:unknown[]};
type Portal={name:string;objectName:string;paidHours:number;deadline:string;today:string;timezone:string;selectedMonth?:string;reports:Reply[];plans:{date:string;timeCode:string;hours:number;kind:string;source?:string}[];details?:Details;planning:Planning};
type Tab="shifts"|"timesheet"|"more";
type More="overview"|"documents"|"workwear"|"contact"|"settings";
function move(d:string,n:number){const x=new Date(d+"T00:00:00Z");x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)}
function format(d:string){return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",weekday:"long",timeZone:"UTC"}).format(new Date(d+"T00:00:00Z"))}
function smallDate(d:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(d+"T00:00:00Z"))}
function clockNow(timezone:string){const f=new Intl.DateTimeFormat("en-GB",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date());const o=Object.fromEntries(f.map(x=>[x.type,x.value]));return `${o.year}-${o.month}-${o.day}T${o.hour}:${o.minute}`}
function demo():Portal{
 const today=new Date().toISOString().slice(0,10);
 const days=Array.from({length:19},(_,i)=>{const date=move(today,i-7),weekday=new Date(date+"T00:00:00Z").getUTCDay(),kind:Kind=weekday===0||weekday===6?"off":"night";return{date,kind,source:"cycle" as const,proposal:null,proposalStatus:null,startTime:"20:00",endTime:"08:00",endsNextDay:true}});
 return {name:"Иванов Иван",objectName:"Можайское · Комплектовщик",paidHours:11,deadline:"22:00",today,timezone:"Europe/Moscow",
  selectedMonth:today.slice(0,7),reports:[],plans:Array.from({length:42},(_,i)=>({date:move(today,-i-1),timeCode:"WORK",hours:i%7<5?11:0,kind:"night",source:"worker_report"})),planning:{owner:"worker",horizon:12,workDays:5,restDays:2,defaultKind:"night",floatingDaysOff:false,patternFrom:move(today,-30),days},
  details:{clothingSize:"52–54",shoeSize:"43",employment:"gph",managerName:"Менеджер объекта",managerPhone:null,visibility:{documents:true,workwear:true},
   documents:[{code:"passport",label:"Паспорт",employeeReported:true,managerVerified:true},{code:"snils",label:"СНИЛС",employeeReported:true,managerVerified:true},{code:"inn",label:"ИНН",employeeReported:false,managerVerified:false},{code:"bank_details",label:"Реквизиты для выплаты",employeeReported:true,managerVerified:false}],
   workwear:[{name:"Рабочая куртка",state:"issued",variant:"52–54"},{name:"Рабочие брюки",state:"issued",variant:"52–54"},{name:"Защитная обувь",state:"needed",variant:"43"}],shiftWindows:[],timeChanges:[]}};
}
const employmentLabel:Record<string,string>={gph:"ГПХ",employment:"Трудовой договор",npd:"Самозанятость",custom:"Иной договор"};
const kindLabel=(kind:Kind|null)=>kind==="day"?"Дневная смена":kind==="night"?"Ночная смена":kind==="off"?"Выходной":"Не запланировано";
const kindShort=(kind:Kind|null)=>kind==="day"?"День":kind==="night"?"Ночь":kind==="off"?"Выходной":"Нет плана";
export function EmployeeTimesheetScreen({token,previewLayout}:{token:string;previewLayout?:"phone"|"desktop"}){
 const isDemo=token==="demo";
 const [data,setData]=useState<Portal|null>(isDemo?demo():null);
 const [monthOverride,setMonthOverride]=useState<string|null>(null);
 const [tab,setTab]=useState<Tab>("shifts");
 const [more,setMore]=useState<More>("overview");
 const [error,setError]=useState("");const [notice,setNotice]=useState("");const [loading,setLoading]=useState(!isDemo);
 const [busy,setBusy]=useState(false);const [showReason,setShowReason]=useState(false);const [reason,setReason]=useState("");
 const [hourEdit,setHourEdit]=useState(false);const [hours,setHours]=useState("11");
 const [editingDay,setEditingDay]=useState<string|null>(null);const [kindChoice,setKindChoice]=useState<Kind>("night");
 const [showAll,setShowAll]=useState(false);
 const [weekEditing,setWeekEditing]=useState(false);
 const [restDates,setRestDates]=useState<string[]>([]);
 const [settingsEditing,setSettingsEditing]=useState(false);
 const [effectiveFrom,setEffectiveFrom]=useState("");
 const [workPattern,setWorkPattern]=useState("5/2");
 const [patternFloating,setPatternFloating]=useState(false);
 const [clothingDraft,setClothingDraft]=useState<string|null>(null);const [shoeDraft,setShoeDraft]=useState<string|null>(null);
 const [settingKind,setSettingKind]=useState<"day"|"night">("night");
 const [startTime,setStartTime]=useState("20:00");const [endTime,setEndTime]=useState("08:00");const [nextDay,setNextDay]=useState(true);
 
 const reload=useCallback(async()=>{
  const r=await fetch("/api/public/worker-timesheet/"+encodeURIComponent(token)+(monthOverride?"?month="+encodeURIComponent(monthOverride):""),{cache:"no-store"});
  const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось загрузить кабинет");
  setData(j as Portal);return j as Portal;
 },[token,monthOverride]);
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
 const nextMonday=move(today,((8-new Date(today+"T00:00:00Z").getUTCDay())%7)||7);
 const fullWeek=Array.from({length:7},(_,i)=>move(nextMonday,i));
 const canEditWeek=Boolean(data?.planning.floatingDaysOff&&fullWeek[6]<=move(today,data.planning.horizon));
 const currentMonth=monthOverride??data?.selectedMonth??today.slice(0,7);
 const dateMonth=new Date(currentMonth+"-01T00:00:00Z");
 const monthLabel=new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(dateMonth);
 const adjacentMonth=(offset:number)=>new Date(Date.UTC(Number(currentMonth.slice(0,4)),Number(currentMonth.slice(5))-1+offset,1)).toISOString().slice(0,7);
 const currentEnd=currentMonth===today.slice(0,7)?Number(today.slice(8)):new Date(Date.UTC(Number(currentMonth.slice(0,4)),Number(currentMonth.slice(5)),0)).getUTCDate();
 const dateRows=Array.from({length:currentEnd},(_,i)=>currentMonth+"-"+String(i+1).padStart(2,"0")).reverse();
 const counted=useMemo(()=>{let total=0,shifts=0;const distinct=new Set<string>();const dayEntries=new Map((data?.plans??[]).filter(p=>p.timeCode==="WORK"&&p.date<=today).map(p=>[p.date,p]));
   for(const date of new Set([...dayEntries.keys(),...answers.keys()])){
    if(!date.startsWith(currentMonth)||date>today||distinct.has(date))continue;
    const entry=dayEntries.get(date),reply=answers.get(date);
    const worked=reply?.reconciledAt?entry?.hours??reply?.hours:reply?.hours??entry?.hours;
    if(worked!=null&&worked>0&&(entry?.timeCode==="WORK"||reply?.hours!=null)){total+=worked;shifts++;distinct.add(date)}
   }return{total,shifts}},[today,currentMonth,data?.plans,answers]);
 
 const timeText=(p:PlanDay|null)=>p?.kind==="off"?"":p?.startTime&&p.endTime?`${p.startTime}–${p.endTime}${p.endsNextDay?" · до следующего дня":""}`:"Время смены уточняется";
 async function save(payload:Record<string,unknown>,message:string){
  if(!data)return false;setError("");setNotice("");setBusy(true);
  try{
   if(isDemo){
    const date=String(payload.date??"");
    if(payload.action==="plan_week"){
      const off=new Set(payload.offDates as string[]),begin=String(payload.weekStart);
      setData(d=>d?{...d,planning:{...d.planning,days:d.planning.days.map(p=>p.date>=begin&&p.date<=move(begin,6)?{...p,kind:off.has(p.date)?"off":d.planning.defaultKind??"day",source:"worker" as const}:p)}}:d);
     }else if(payload.action==="pattern_change"){setNotice("Запрос на изменение постоянного графика отправлен");
     }else if(payload.action==="plan_day"){
     const newKind=payload.kind as Kind;setData(d=>{if(!d)return d;const direct=d.planning.owner==="worker"&&d.planning.floatingDaysOff;return {...d,planning:{...d.planning,days:d.planning.days.map(x=>x.date===date?{...x,kind:direct?newKind:x.kind,source:direct?"worker" as const:x.source,proposal:direct?null:newKind,proposalStatus:direct?null:"proposed" as const}:x)}}});
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
 async function planDay(date:string,kind:Kind){if(busy)return;const direct=data?.planning.owner==="worker"&&data?.planning.floatingDaysOff;const ok=await save({action:"plan_day",date,kind},direct?"График обновлён":"Предложение передано менеджеру");if(ok)setEditingDay(null)}
 async function saveWeek(){if(!data)return;const expected=data.planning.restDays??0;if(restDates.length!==expected){setError("По вашему графику на неделе "+expected+" выходных. Выберите именно столько.");return}if(await save({action:"plan_week",weekStart:nextMonday,offDates:restDates},data.planning.owner==="worker"?"Выходные на неделю сохранены":"Предложение по выходным отправлено"))setWeekEditing(false)}
 function openSettings(){setTab("more");setMore("settings");setSettingsEditing(false);setWorkPattern((data?.planning.workDays??5)+"/"+(data?.planning.restDays??2));setPatternFloating(Boolean(data?.planning.floatingDaysOff));setEffectiveFrom(tomorrow);setSettingKind(data?.planning.defaultKind??"night");const d=records.get(tomorrow);setStartTime(d?.startTime??(d?.kind==="day"?"08:00":"20:00"));setEndTime(d?.endTime??"08:00");setNextDay(d?.endsNextDay??true)}
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
      <div className="worker-self-page-title"><div><h1>Мои смены</h1><p>{data.objectName}</p></div><button className="worker-self-quiet" onClick={openSettings}><Settings2 size={15}/> Мой график</button></div>
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
       <div className="worker-self-panel-head"><span><CalendarDays size={17}/> Ближайшие дни</span><button className="worker-self-quiet" onClick={()=>setShowAll(x=>!x)}>{showAll?"Свернуть":"Весь график"} <ChevronDown size={14}/></button></div>
       <p className="worker-self-muted">График заполняется автоматически. Нажмите на дату, только если планы изменились.</p>
       <div className="worker-self-days">
        {future.slice(0,showAll?future.length:5).map(p=><button className="worker-self-date-row" key={p.date} onClick={()=>{setEditingDay(p.date);setKindChoice(p.kind??data.planning.defaultKind??"day")}}>
         <span className="worker-self-date-info"><strong>{format(p.date)}</strong><small>{p.kind==="off"?"Выходной по графику":p.kind?"Запланирована "+(p.kind==="night"?"ночная":"дневная")+" смена":"Смена пока не назначена"}</small></span>
         <span className="worker-self-date-right"><span className={p.kind==="off"?"worker-self-day-off":""}>{kindShort(p.kind)}</span><ChevronRight size={17}/></span>
        </button>)}
       </div>
       {canEditWeek&&<div className="worker-self-week-tool">
        <div><strong>Плавающие выходные</strong><p className="worker-self-muted">Выберите {(data.planning.restDays??0)===1?"один день отдыха":"два дня отдыха"} на следующую неделю. Рабочие смены выставятся автоматически.</p></div>
        <button className="worker-self-light-button" onClick={()=>{setWeekEditing(x=>!x);setRestDates(fullWeek.filter(d=>records.get(d)?.kind==="off"))}}>{weekEditing?"Свернуть":"Выбрать дни отдыха"}</button>
        {weekEditing&&<div className="worker-self-week-editor">
         <div className="worker-self-week-label">Неделя {smallDate(fullWeek[0])}–{smallDate(fullWeek[6])} · {restDates.length} из {data.planning.restDays??0} выходных</div>
         <div className="worker-self-week-grid">{fullWeek.map(date=><button key={date} className={restDates.includes(date)?"off":""} onClick={()=>setRestDates(old=>old.includes(date)?old.filter(x=>x!==date):old.length<(data.planning.restDays??0)?[...old,date]:old)}><strong>{new Intl.DateTimeFormat("ru-RU",{weekday:"short",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"))}</strong><span>{date.slice(8)}</span>{restDates.includes(date)?"Вых.":"Раб."}</button>)}</div>
         <button className="worker-self-main-button" disabled={busy||restDates.length!==(data.planning.restDays??0)} onClick={()=>void saveWeek()}>Сохранить неделю</button>
        </div>}
       </div>}
       {editingDay&&<div className="worker-self-edit">
        <div className="worker-self-edit-title"><strong>{format(editingDay)}</strong><button className="worker-self-quiet" onClick={()=>setEditingDay(null)}>Закрыть</button></div>
        <p>Выберите желаемый вариант. Для фиксированного графика изменение отправится на согласование.</p>
        <div className="worker-self-choices">{(["day","night","off"] as Kind[]).map(k=><button key={k} className={kindChoice===k?"selected":""} onClick={()=>setKindChoice(k)}>{kindShort(k)}</button>)}</div>
        <button className="worker-self-main-button" disabled={busy} onClick={()=>void planDay(editingDay,kindChoice)}>Отправить изменение</button>
       </div>}
      </section>
     </>}
     {tab==="timesheet"&&<>
      <div className="worker-self-page-title"><div><h1>Мой табель</h1></div></div>
      <div className="worker-self-month-nav">
       <button aria-label="Предыдущий месяц" onClick={()=>setMonthOverride(adjacentMonth(-1))} disabled={currentMonth<="2020-01"}><ChevronRight size={18} style={{transform:"rotate(180deg)"}}/></button>
       <strong>{monthLabel}</strong>
       <button aria-label="Следующий месяц" onClick={()=>setMonthOverride(adjacentMonth(1))} disabled={currentMonth>=today.slice(0,7)}><ChevronRight size={18}/></button>
      </div>
      <div className="worker-self-totals"><div><small>Часы</small><strong>{counted.total}</strong></div><div><small>Смены</small><strong>{counted.shifts}</strong></div></div>
      <section className="worker-self-panel worker-self-timesheet-panel">
       <div className="worker-self-panel-head"><span><ClipboardCheck size={17}/> {monthLabel}</span></div>
       <div className="worker-self-ledger-header"><span>Дата</span><span>Часы</span></div>
       {dateRows.map((date,i)=>{
        const reply=answers.get(date),fact=data.plans.find(x=>x.date===date&&x.timeCode==="WORK"&&Number(x.hours)>0);
        const approved=Boolean(reply?.reconciledAt);
        const h=approved?fact?.hours??reply?.hours??null:reply?.hours??fact?.hours??null;
        const plan=records.get(date),off=plan?.kind==="off";
        return <div key={date}>
         {i>0&&new Date(date+"T00:00:00Z").getUTCDay()===0&&<div className="worker-self-ledger-separator"/>}
         <div className="worker-self-ledger-row">
          <div className="worker-self-ledger-date"><strong>{smallDate(date)}</strong><small>{plan?.kind==="night"||fact?.kind==="night"?"Ночная смена":plan?.kind==="day"||fact?.kind==="day"?"Дневная смена":off?"Выходной":"—"}</small></div>
          <div className="worker-self-ledger-result">
           <strong className={h!=null&&Number(h)>0?"actual":""}>{h!=null&&Number(h)>0?String(h)+" ч":off?"Выходной":"—"}</strong>
           {h!=null&&Number(h)>0&&<small className={approved?"worker-self-agreed":""}>{approved?"Согласовано":"Передано"}</small>}
          </div>
         </div>
        </div>;
       })}
       {counted.shifts===0&&<p className="worker-self-muted">За этот месяц пока нет отработанных смен.</p>}
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
       {more==="settings"&&<>
        <div className="worker-self-page-title"><div><h1>Мой график</h1><p>Основные условия уже установлены в OPERIS. Здесь можно предложить изменение.</p></div></div>
        <section className="worker-self-panel worker-self-schedule-summary">
         <div className="worker-self-panel-head"><span><CalendarDays size={17}/> Действующий график</span></div>
         <div className="worker-self-schedule-attributes">
          <div><small>Режим работы</small><strong>{data.planning.workDays!==null?String(data.planning.workDays)+"/"+String(data.planning.restDays):"Индивидуальный"}</strong></div>
          <div><small>Обычная смена</small><strong>{kindLabel(data.planning.defaultKind)}</strong></div>
          <div><small>Выходные</small><strong>{data.planning.floatingDaysOff?"Плавающие":data.planning.workDays===5&&data.planning.restDays===2?"Сб, вс":data.planning.workDays===6&&data.planning.restDays===1?"Вс":"По циклу"}</strong></div>
          <div><small>Время смены</small><strong>{timeText(records.get(tomorrow)??null)||"Уточняется"}</strong></div>
         </div>
         <p className="worker-self-muted">Если график не изменился, ничего заполнять не нужно. Он автоматически отображается в будущих сменах.</p>
         <button className="worker-self-light-button full" onClick={()=>setSettingsEditing(x=>!x)}>{settingsEditing?"Закрыть форму":"Предложить изменение"}</button>
        </section>
        {settingsEditing&&<section className="worker-self-panel worker-self-additional">
         <div className="worker-self-panel-head"><span><Settings2 size={17}/> Запрос на изменение</span></div>
         <p className="worker-self-muted">Менеджер получит запрос и примет решение. Прежний график сохранится до согласования.</p>
         <label className="worker-self-setting-date">Изменения действуют с <input type="date" min={tomorrow} value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></label>
         <div className="worker-self-setting-section">
          <strong>1. Режим работы</strong>
          <div className="worker-self-fields">
           <label>График <select value={workPattern} onChange={e=>{setWorkPattern(e.target.value);if(!["5/2","6/1"].includes(e.target.value))setPatternFloating(false)}}>{["5/2","6/1","2/2","3/3","4/2","7/7"].map(x=><option key={x}>{x}</option>)}</select></label>
           <label>Тип смены <select value={settingKind} onChange={e=>setSettingKind(e.target.value as "day"|"night")}><option value="day">Дневная</option><option value="night">Ночная</option></select></label>
          </div>
          <label className="worker-self-check"><input type="checkbox" disabled={!["5/2","6/1"].includes(workPattern)} checked={patternFloating} onChange={e=>setPatternFloating(e.target.checked)}/> Плавающие выходные</label>
          <button className="worker-self-light-button full" disabled={busy||!effectiveFrom} onClick={()=>void save({action:"pattern_change",effectiveFrom,workDays:Number(workPattern.split("/")[0]),restDays:Number(workPattern.split("/")[1]),shiftKind:settingKind,floatingDaysOff:patternFloating},"Запрос об изменении режима работы отправлен")}>Запросить новый график</button>
         </div>
         <div className="worker-self-setting-section">
          <strong>2. Рабочее время</strong>
          <div className="worker-self-fields"><label>Начало смены<input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)}/></label><label>Окончание<input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)}/></label></div>
          <label className="worker-self-check"><input type="checkbox" checked={nextDay} onChange={e=>setNextDay(e.target.checked)}/> Заканчивается на следующий день</label>
          <button className="worker-self-light-button full" disabled={busy||!effectiveFrom} onClick={()=>void save({action:"shift_time",date:effectiveFrom,kind:settingKind,startTime,endTime,endsNextDay:nextDay,appliesTo:"regular"},"Запрос об изменении рабочего времени отправлен")}>Запросить новое время</button>
         </div>
        </section>}
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
