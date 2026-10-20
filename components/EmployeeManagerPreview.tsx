"use client";
import {useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
type Worker={id:string;name:string;objectId:string|null;object:string|null;specialty:string|null;paidHours:number|null;workDays:number|null;restDays:number|null};
type Report={workerId:string;objectId:string;date:string;hours:number|null;reviewStatus?:string};
type Plan={workerId:string;objectId:string;date:string;timeCode:string;kind:string|null};
type Response={workers:Worker[];reports:Report[];plans:Plan[]};
export function EmployeeManagerPreview(){
 const params=useSearchParams(),objectId=params.get("objectId"),workerId=params.get("workerId");
 const [data,setData]=useState<Response|null>(null),[error,setError]=useState("");
 useEffect(()=>{
  if(!objectId||!workerId){return}
  const abort=new AbortController();
  (async()=>{
   const get=await fetch("/api/operations/worker-confirmations?objectId="+encodeURIComponent(objectId)+"&workerId="+encodeURIComponent(workerId),{signal:abort.signal,credentials:"same-origin",cache:"no-store"});
   if(!get.ok)throw Error("Не удалось получить доступ к предпросмотру");
   const json=await get.json() as Response;
   if(!json.workers.some(x=>x.id===workerId&&x.objectId===objectId))throw Error("Нет доступа к этому сотруднику");
   const logged=await fetch("/api/operations/employee-preview",{method:"POST",headers:{"content-type":"application/json"},credentials:"same-origin",body:JSON.stringify({objectId,workerId}),signal:abort.signal});
   if(!logged.ok)throw Error("Не удалось зафиксировать предпросмотр менеджера");
   setData(json);
  })().catch(err=>{if(!abort.signal.aborted)setError(err instanceof Error?err.message:"Не удалось загрузить предпросмотр")});
  return()=>abort.abort();
 },[objectId,workerId]);
 const w=data?.workers.find(x=>x.id===workerId),reports=data?.reports.filter(x=>x.workerId===workerId)??[],plans=data?.plans.filter(x=>x.workerId===workerId)??[];
 return <main className="worker-self"><div className="worker-self-frame">
  <header className="worker-self-header"><div className="worker-self-brand"><span className="worker-self-logo">O</span><div><small>OPERIS · СОТРУДНИК</small><strong>Предпросмотр</strong></div></div><div className="worker-self-identity"><strong>{w?.name??"Сотрудник"}</strong><span>{w?.object??""}</span></div></header>
  <div className="worker-self-main" style={{maxWidth:960,width:"100%",margin:"0 auto",padding:20}}>
   <div role="status" className="worker-self-warning" style={{padding:16,marginBottom:16,fontWeight:700}}>Режим предпросмотра менеджера. Действия сотрудника недоступны и не сохраняются.</div>
   {error&&<p role="alert" className="worker-self-alert">{error}</p>}
   {!data&&!error&&<p>Загружаем доступный вам план и ответы…</p>}
   {w&&<>
    <section className="worker-self-panel"><div className="worker-self-panel-head"><span>Рабочая информация</span></div><h2>{w.name}</h2><p>{w.object}</p><p className="worker-self-muted">{w.specialty??"Специальность не указана"} · {w.workDays??"—"}/{w.restDays??"—"} · {w.paidHours!=null?w.paidHours+" плановых оплачиваемых часов":"Норма часов уточняется"}</p></section>
    <section className="worker-self-panel"><div className="worker-self-panel-head"><span>Смены и выходы</span></div>
     {plans.length?plans.map(p=><div className="worker-self-asset-row" key={p.date}><strong>{p.date}</strong><span>{p.timeCode==="WORK"?"Рабочая смена":p.timeCode==="OFF"?"Выходной":"Запланировано"}</span></div>):<p className="worker-self-muted">Смены в текущем диапазоне не указаны.</p>}
    </section>
    <section className="worker-self-panel"><div className="worker-self-panel-head"><span>Ответы и согласование часов</span></div>
     {reports.length?reports.map(r=><div className="worker-self-asset-row" key={r.date}><span>{r.date} · {r.hours!=null?r.hours+" ч":"Часы не переданы"}</span><span>{r.reviewStatus==="approved"?"Согласовано":r.reviewStatus==="rejected"?"Есть расхождение":r.hours!=null?"Проверяется менеджером":"Ожидается ответ"}</span></div>):<p className="worker-self-muted">Ответов сотрудника пока нет.</p>}
    </section>
    <p className="worker-self-muted">Этот экран содержит только данные, доступные менеджеру. Реальная персональная ссылка для предпросмотра не используется.</p>
   </>}
  </div></div></main>;
}
