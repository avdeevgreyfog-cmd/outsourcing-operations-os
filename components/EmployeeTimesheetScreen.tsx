"use client";
import {useEffect,useMemo,useState} from "react";
import {CalendarDays,Check,ChevronLeft,ChevronRight,Clock3,Info,LockKeyhole,Sun,Moon} from "lucide-react";

type Kind="day"|"night"|"off";
type Reply={date:string;shiftKind:Kind|null;response:"working"|"day_off"|"cannot_work";reason:string|null;hours:number|null};
type Plan={date:string;kind:string;timeCode:string;hours:number};
type Portal={name:string;objectName:string;paidHours:number;owner:"manager"|"client";deadline:string;today:string;reports:Reply[];plans:Plan[]};
function step(date:string,n:number){const d=new Date(date+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function human(date:string){return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"long",weekday:"long",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"))}
function fmt(value:number){return String(value).replace(".",",")}
function demoData():Portal{
 const today=new Date().toISOString().slice(0,10);
 const start=today.slice(0,7)+"-01";
 return {name:"Иванов Иван",objectName:"Склад «Можайское»",paidHours:11,owner:"client",deadline:"22:00",today,
 reports:[{date:step(today,-1),shiftKind:"night",response:"working",reason:null,hours:null}],
 plans:Array.from({length:Math.max(1,Number(today.slice(-2))-1)},(_,i)=>({date:step(start,i),kind:i%6===5?"off":"day",timeCode:i%6===5?"DAY_OFF":"WORK",hours:i%6===5?0:11}))};
}
export function EmployeeTimesheetScreen({token}:{token:string}){
 const demo=token==="demo";
 const [data,setData]=useState<Portal|null>(demo?demoData():null);
 const [loading,setLoading]=useState(!demo);
 const [error,setError]=useState("");
 const [busy,setBusy]=useState("");
 const [reason,setReason]=useState("");
 const [hourInput,setHourInput]=useState("");
 const [editHours,setEditHours]=useState(false);
 const [calendarOpen,setCalendarOpen]=useState(false);
 const [selectedKind,setSelectedKind]=useState<Kind>("day");
 const [nowDate,setNowDate]=useState("");
 const [saved,setSaved]=useState("");
 useEffect(()=>{if(demo)return;let live=true;fetch("/api/public/worker-timesheet/"+encodeURIComponent(token),{cache:"no-store"})
   .then(async r=>{const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось открыть табель");if(live)setData(j)})
   .catch(e=>{if(live)setError(e instanceof Error?e.message:"Ошибка подключения")}).finally(()=>{if(live)setLoading(false)});
   return()=>{live=false};
 },[demo,token]);
 const reports=useMemo(()=>new Map((data?.reports??[]).map(r=>[r.date,r])),[data]);
 const plans=useMemo(()=>new Map((data?.plans??[]).map(r=>[r.date,r])),[data]);
 const dates=data?[step(data.today,-1),data.today,step(data.today,1),step(data.today,2)]:[];
 const monthRows=data?Array.from({length:Number(data.today.slice(-2))},(_,i)=>step(data.today.slice(0,7)+"-01",i)):[];
 const totals=useMemo(()=>{let hours=0,shifts=0;for(const day of monthRows){
   const report=reports.get(day),p=plans.get(day);
   const h=report?.hours??(p?.timeCode==="WORK"?p.hours:0);
   if(h>0){hours+=h;shifts++}
 }return {hours:fmt(hours),shifts}},[reports,plans,monthRows]);
 function getKind(day:string):Kind|null{
  const report=reports.get(day);if(report?.response==="day_off")return"off";if(report?.shiftKind)return report.shiftKind;
  const plan=plans.get(day);if(!plan)return null;
  if(plan.timeCode==="DAY_OFF")return"off";
  return plan.kind==="night"?"night":"day";
 }
 async function save(day:string,reply:{response?:"working"|"day_off"|"cannot_work";kind?:Kind;hours?:number;reason?:string}){
  if(!data)return;setBusy(day);setError("");setSaved("");
  try{
    if(demo){
      setData(prev=>{if(!prev)return prev;const existing=prev.reports.find(r=>r.date===day);
        const incoming:Reply={date:day,shiftKind:reply.kind??existing?.shiftKind??null,response:reply.response??existing?.response??"working",reason:reply.reason??existing?.reason??null,hours:reply.hours??(reply.response?null:existing?.hours??null)};
        return {...prev,reports:[...prev.reports.filter(r=>r.date!==day),incoming]};
      });
    }else{
      const call=async(p:typeof reply)=>{const r=await fetch("/api/public/worker-timesheet/"+encodeURIComponent(token),{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...p,date:day})});const j=await r.json();if(!r.ok)throw new Error(j.error??"Ошибка сохранения")};
      await call(reply);
      const r=await fetch("/api/public/worker-timesheet/"+encodeURIComponent(token),{cache:"no-store"});const j=await r.json();if(!r.ok)throw new Error(j.error??"Не удалось обновить табель");setData(j);
    }
    setEditHours(false);setReason("");setSaved("Ответ сохранён");
  }catch(e){setError(e instanceof Error?e.message:"Ошибка сохранения");}finally{setBusy("")}
 }
 if(loading)return <main className="employee-portal"><section className="employee-portal-panel"><p>Загружаем ваш табель…</p></section></main>;
 if(!data)return <main className="employee-portal"><section className="employee-portal-panel"><LockKeyhole size={24}/><h1>Табель недоступен</h1><p>{error||"Ссылка недействительна или доступ закрыт. Обратитесь к менеджеру объекта."}</p></section></main>;
 return <main className="employee-portal">
  <div className="employee-portal-inner">
   <header className="employee-portal-header"><div className="employee-portal-mark"><CalendarDays size={18}/></div><div><span className="employee-portal-brand">OPERIS</span><h1>Мой табель</h1></div></header>
   <section className="employee-portal-person"><strong>{data.name}</strong><span>{data.objectName}</span></section>
   <section className="employee-portal-stats"><div><span>Отработано в месяце</span><strong>{totals.hours} ч</strong></div><div><span>Отработано смен</span><strong>{totals.shifts}</strong></div></section>
   <p className="employee-portal-note"><Info size={14}/> Предварительные данные. После сверки с заказчиком часы могут уточняться.</p>
   <h2 className="employee-portal-title">Ваши ближайшие дни</h2>
   {dates.map((date,index)=>{
     const report=reports.get(date),plan=plans.get(date),kind=getKind(date),past=index===0,off=kind==="off";
     const hasHours=report ? report.hours!=null : plan?.timeCode==="WORK"&&Number(plan.hours)>0;
     const lockedPast=false; // A worker can request a correction; the server keeps reconciled facts protected.
     const label=index===0?"Вчера":index===1?"Сегодня":index===2?"Завтра":"Послезавтра";
     return <article key={date} className={"employee-portal-day"+(index===2?" employee-portal-focus":"")}>
      <div className="employee-portal-dayhead"><div><span>{label} · {human(date)}</span><strong>{kind==="night"?<><Moon size={15}/> Ночная смена</>:kind==="day"?<><Sun size={15}/> Дневная смена</>:off?"Выходной":"График не указан"}</strong></div>
        {report?.response==="cannot_work"?<span className="employee-portal-tag warn">Не выйду</span>:report?.response==="day_off"||off?<span className="employee-portal-tag">Выходной</span>:report?.hours!=null?<span className="employee-portal-tag ok">Часы указаны</span>:report?.response==="working"?<span className="employee-portal-tag ok">Подтверждено</span>:<span className="employee-portal-tag muted">Нет ответа</span>}
      </div>
      {past? <div className="employee-portal-answer">
       {hasHours&&!editHours?<div className="employee-portal-inline"><span>Учтено: <b>{fmt(Number(report?.hours??plan?.hours??0))} ч</b></span>{!lockedPast&&<button className="employee-portal-link" onClick={async()=>{if(!report)await save(date,{response:"working",kind:kind==="night"?"night":"day"});setEditHours(true);setNowDate(date);setHourInput(String(report?.hours??plan?.hours??data.paidHours))}}>Исправить</button>}</div>
       :editHours&&nowDate===date?<div className="employee-portal-hour-edit"><label>Сколько часов отработали?<input type="number" inputMode="decimal" min="0" max="24" step="0.5" value={hourInput} onChange={e=>setHourInput(e.target.value)}/></label><button className="employee-portal-main" disabled={busy===date||!hourInput||Number(hourInput)<0||Number(hourInput)>24} onClick={()=>void save(date,{hours:Number(hourInput)})}>Сохранить часы</button><button className="employee-portal-link" onClick={()=>setEditHours(false)}>Отмена</button></div>
       :report?.response==="working"?<div className="employee-portal-buttons"><p>Вы отработали {fmt(data.paidHours)} часов?</p><button className="employee-portal-main" disabled={busy===date} onClick={()=>void save(date,{hours:data.paidHours})}><Check size={17}/> Да, {fmt(data.paidHours)} ч</button><button className="employee-portal-secondary" disabled={busy===date} onClick={()=>{setNowDate(date);setEditHours(true);setHourInput(String(data.paidHours))}}>Указать другие часы</button></div>
       :<div className="employee-portal-buttons"><p>Укажите результат вчерашней смены</p><button className="employee-portal-main" disabled={busy===date} onClick={async()=>{await save(date,{response:"working",kind:kind==="night"?"night":"day"});setNowDate(date);setHourInput(String(data.paidHours));setEditHours(true)}}>Вышел на работу</button><button className="employee-portal-secondary" disabled={busy===date} onClick={()=>void save(date,{response:"cannot_work",reason:"Не вышел на смену",kind:kind??"day"})}>Не вышел</button></div>}
      </div>:off?<div className="employee-portal-buttons"><p>По графику выходной. Отвечать не нужно.</p>{report?.response==="day_off"&&data.owner==="client"&&<button className="employee-portal-secondary" disabled={busy===date} onClick={()=>void save(date,{response:"working",kind:selectedKind})}>Изменить на рабочую смену</button>}</div>
      :<div className="employee-portal-buttons">
       {report?.response==="working"&&<p>Вы подтвердили выход на смену.</p>}
       {report?.response==="cannot_work"&&<p>Менеджер получит информацию о невыходе.</p>}
       {data.owner==="client"&&<div className="employee-portal-shift-picker"><label>Смена по графику от начальника</label><div><button className={selectedKind==="day"?"selected":""} onClick={()=>setSelectedKind("day")}>День</button><button className={selectedKind==="night"?"selected":""} onClick={()=>setSelectedKind("night")}>Ночь</button></div></div>}
       {report?.response!=="working"&&<button className="employee-portal-main" disabled={busy===date} onClick={()=>void save(date,{response:"working",kind:data.owner==="client"?selectedKind:kind==="night"?"night":"day"})}><Check size={17}/> Выйду на работу</button>}
       {data.owner==="client"&&report?.response!=="day_off"&&<button className="employee-portal-secondary" disabled={busy===date} onClick={()=>void save(date,{response:"day_off",kind:"off"})}>У меня выходной</button>}
       {report?.response!=="cannot_work"&&<details className="employee-portal-absence"><summary>Не смогу выйти</summary><label>Причина<textarea value={reason} onChange={e=>setReason(e.target.value)} rows={2} placeholder="Например, заболел"/></label><button disabled={busy===date||!reason.trim()} onClick={()=>void save(date,{response:"cannot_work",kind:kind==="night"?"night":"day",reason})}>Сообщить менеджеру</button></details>}
       {report?.response&&<button className="employee-portal-link" onClick={()=>void save(date,{response:"working",kind:kind==="night"?"night":"day"})} disabled={busy===date}>Изменить ответ на «Выйду»</button>}
       {index>=1&&<p className="employee-portal-small"><Clock3 size={13}/> Подтверждение до {data.deadline.slice(0,5)}</p>}
      </div>}
     </article>;
   })}
   {error&&<p className="employee-portal-error" role="alert">{error}</p>}
   {saved&&<p className="employee-portal-success" role="status"><Check size={15}/>{saved}</p>}
   <button className="employee-portal-monthtoggle" onClick={()=>setCalendarOpen(v=>!v)}><CalendarDays size={16}/>{calendarOpen?"Свернуть табель":"Посмотреть весь месяц"} {calendarOpen?<ChevronLeft size={16}/>:<ChevronRight size={16}/>}</button>
   {calendarOpen&&<section className="employee-portal-month"><h2>{new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(data.today+"T00:00:00Z"))} · мой учёт</h2><div className="employee-portal-history">{monthRows.map(date=>{const r=reports.get(date),p=plans.get(date);return <div key={date}><span>{new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(date+"T00:00:00Z"))}</span><span>{r?.response==="day_off"||p?.timeCode==="DAY_OFF"?"Выходной":r?.response==="cannot_work"?"Не вышел":r?.hours!=null?fmt(r.hours)+" ч":p?.timeCode==="WORK"?fmt(p.hours)+" ч":r?.response==="working"?"Выход подтверждён":"Нет данных"}</span></div>})}</div></section>}
   <footer className="employee-portal-footer">{demo?"Демонстрационный режим. Изменения остаются только на этом экране.":"Ответы сохраняются в OPERIS. Если данные неверны, сообщите менеджеру."}</footer>
  </div>
 </main>;
}
