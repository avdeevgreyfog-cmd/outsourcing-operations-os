import Link from "next/link";
import {getCurrentActor} from "@/lib/auth/server";
import {managerPortalData} from "@/lib/operations/worker-timesheet-portal";
import {withTenant} from "@/lib/db/client";
import "@/app/worker-self.css";

export const dynamic="force-dynamic";
const idPattern=/^[a-f0-9-]{36}$/i;
export default async function ManagerEmployeePreview({searchParams}:{searchParams:Promise<{objectId?:string;workerId?:string}>}){
 const actor=await getCurrentActor({ignorePreview:true});
 const {objectId,workerId}=await searchParams;
 if(!actor||actor.demo||!objectId||!workerId||!idPattern.test(objectId)||!idPattern.test(workerId)){
  return <main className="worker-self"><div className="worker-self-loading">Режим предпросмотра доступен только авторизованному менеджеру.</div></main>;
 }
 let data;
 try{data=await managerPortalData(actor,objectId,workerId);}catch{
  return <main className="worker-self"><div className="worker-self-loading">Недостаточно прав для просмотра сотрудника.</div></main>;
 }
 const worker=data.workers.find(w=>w.id===workerId&&w.objectId===objectId);
 if(!worker)return <main className="worker-self"><div className="worker-self-loading">Сотрудник не найден или недоступен.</div></main>;
 const activeLink=data.links.find(l=>l.workerId===workerId&&l.objectId===objectId);
 await withTenant(actor.organizationId,actor.userId,async sql=>{
  if(activeLink)await sql`UPDATE worker_timesheet_links SET last_manager_preview_at=now() WHERE id=${activeLink.id}::uuid`;
  await sql`INSERT INTO worker_portal_events(organization_id,worker_id,object_id,link_id,actor_user_id,event_type)
   VALUES(${actor.organizationId}::uuid,${workerId}::uuid,${objectId}::uuid,${activeLink?.id??null}::uuid,${actor.userId}::uuid,'previewed_by_manager')`;
 });
 const reports=data.reports.filter(x=>x.workerId===workerId&&x.objectId===objectId);
 const plans=data.plans.filter(x=>x.workerId===workerId&&x.objectId===objectId);
 const latest=reports.slice().sort((a,b)=>b.date.localeCompare(a.date)).slice(0,10);
 const fmt=(d:string)=>new Date(d+"T00:00:00Z").toLocaleDateString("ru-RU");
 return <main className="worker-self"><div className="worker-self-frame">
  <header className="worker-self-header"><div className="worker-self-brand"><span className="worker-self-logo">O</span><div><small>OPERIS · СОТРУДНИК</small><strong>Предпросмотр</strong></div></div>
    <div className="worker-self-identity"><strong>{worker.name}</strong><span>{worker.object??"Объект"}</span></div></header>
  <div className="worker-self-main" style={{width:"100%",maxWidth:960,margin:"0 auto",padding:24}}>
   <div role="status" className="worker-self-warning" style={{padding:16,marginBottom:18,fontWeight:700}}>Режим предпросмотра менеджера. Действия сотрудника недоступны и не сохраняются.</div>
   <section className="worker-self-panel"><div className="worker-self-panel-head"><span>Рабочая информация</span></div>
     <h2>{worker.name}</h2><p>{worker.object??"Объект не указан"}</p>
     <p className="worker-self-muted">{worker.specialty??"Специальность не указана"} · {worker.workDays??"—"}/{worker.restDays??"—"} · {worker.paidHours??"Норма уточняется"} ч плановых оплачиваемых часов</p>
     <p className="worker-self-muted">Предпросмотр показывает фактический план и ответы, доступные менеджеру, без предъявления персонального токена.</p>
   </section>
   <section className="worker-self-panel"><div className="worker-self-panel-head"><span>Мои смены · последние и предстоящие дни</span></div>
    {plans.length?plans.map(p=><div className="worker-self-asset-row" key={p.date}><strong>{fmt(p.date)}</strong><span>{p.timeCode==="WORK"?"Рабочая смена":p.timeCode==="OFF"?"Выходной":"В плане"} · {p.kind==="night"?"Ночная":"Дневная"}</span></div>):<p className="worker-self-muted">Смены для выбранного диапазона не запланированы.</p>}
   </section>
   <section className="worker-self-panel"><div className="worker-self-panel-head"><span>Ответы и часы</span></div>
    {latest.length?latest.map(p=><div className="worker-self-asset-row" key={p.date}><span><strong>{fmt(p.date)}</strong><small>{p.hours===null?"Часы не переданы":p.hours+" ч"}</small></span><span>{p.reviewStatus==="approved"?"Согласовано":p.reviewStatus==="rejected"?"Есть расхождение":p.hours!==null?"Проверяется менеджером":"Ожидается ответ"}</span></div>):<p className="worker-self-muted">Ответов сотрудника в этом диапазоне нет.</p>}
   </section>
   <p className="worker-self-muted">В этом режиме отсутствуют кнопки подтверждения, редактирования, выдачи персонального токена и передачи часов.</p>
   <Link className="worker-self-light-button full" href={"/workers/"+workerId}>Вернуться к карточке сотрудника</Link>
  </div>
 </div></main>;
}
