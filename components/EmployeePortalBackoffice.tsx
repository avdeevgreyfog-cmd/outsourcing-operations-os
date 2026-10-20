"use client";
import {useState} from "react";
type Worker={id:string;name:string;objectId:string|null};
type SizeRequest={id:string;workerId:string;objectId:string;clothingSize:string|null;shoeSize:string|null;gloveSize:string|null;comment:string|null;createdAt:string};
type Onboarding={workerId:string;objectId:string;stage:string;comment:string|null;showAfterCompleted:boolean};
type Dispute={id:string;workerId:string;objectId:string;date:string;reason:string;comment:string;status:string};
type Adjustment={id:string;workerId:string;objectId:string;amount:number;periodStart:string;periodEnd:string;status:string;reason:string;description:string};
type AdjustmentQuestion={id:string;workerId:string;objectId:string;adjustmentId:string;question:string;status:string;createdAt:string};
const adjustmentStatus:Record<string,string>={draft:"Черновик",review:"На проверке",accounted:"Учтено в расчёте",cancelled:"Отменено",confirmed:"Подтверждено менеджером"};
export type EmployeeBackofficePayload={workers:Worker[];sizeRequests?:SizeRequest[];onboarding?:Onboarding[];hourDisputes?:Dispute[];adjustments?:Adjustment[];adjustmentQuestions?:AdjustmentQuestion[];canManageAdjustments?:boolean};
const stages:[string,string][]=[["not_started","Не начато"],["requested","Документы запрошены"],["partial","Часть получена"],["review","На проверке"],["completed","Оформлен"],["correction","Требуется исправление"]];
const documents:[string,string][]=[["passport","Паспорт"],["snils","СНИЛС"],["inn","ИНН"],["bank_details","Реквизиты"],["military","Военный билет"],["medical_book","Медкнижка"],["photo","Фото"],["application","Заявление"],["contract","Договор"]];
export function EmployeePortalBackoffice({data,objectId,canEdit,onRefresh}:{data:EmployeeBackofficePayload;objectId:string;canEdit:boolean;onRefresh:()=>Promise<void>}){
 const people=data.workers.filter(x=>x.objectId===objectId);
 const [workerId,setWorkerId]=useState("");
 const worker=people.find(x=>x.id===workerId)??people[0];
 const current=data.onboarding?.find(x=>x.workerId===worker?.id&&x.objectId===objectId);
 const [stageDraft,setStageDraft]=useState<{id:string;stage:string;comment:string;show:boolean}|null>(null);
 const draft=stageDraft?.id===worker?.id?stageDraft:{id:worker?.id??"",stage:current?.stage??"completed",comment:current?.comment??"",show:current?.showAfterCompleted??false};
 const [document,setDocument]=useState("passport"),[documentStatus,setDocumentStatus]=useState("awaiting");
 const [periodStart,setPeriodStart]=useState(""),[periodEnd,setPeriodEnd]=useState(""),[amount,setAmount]=useState(""),[reason,setReason]=useState(""),[description,setDescription]=useState("");
 const [adjType,setAdjType]=useState<"deduction"|"damage"|"advance"|"other">("deduction");
 const [message,setMessage]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function action(payload:Record<string,unknown>,success:string){
  if(busy)return;setBusy(true);setError("");setMessage("");
  try{
   const res=await fetch("/api/operations/worker-confirmations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
   const body=await res.json();if(!res.ok)throw Error(body.error??"Не удалось сохранить");
   await onRefresh();setMessage(success);
  }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить")}
  finally{setBusy(false)}
 }
 if(!objectId||!people.length)return null;
 return <section className="worker-confirmation-settings" aria-label="Оформление и обращения сотрудников">
  <div className="section-head"><div><h2>Оформление и обращения сотрудников</h2><p>Сведения применяются к существующим сотрудникам и объектам; ответы и история не перезаписываются.</p></div></div>
  {message&&<p role="status" className="worker-confirmation-note">{message}</p>}
  {error&&<p role="alert" className="worker-confirmation-manager-error">{error}</p>}
  <div className="worker-confirmation-toolbar"><label>Сотрудник <select value={worker?.id??""} onChange={e=>{setWorkerId(e.target.value);setStageDraft(null)}}>{people.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label></div>
  {worker&&<>
   <div className="worker-confirmation-configuration">
    <h3>Оформление и документы</h3>
    <div className="worker-confirmation-toolbar">
     <label>Этап оформления <select value={draft.stage} onChange={e=>setStageDraft({...draft,stage:e.target.value})}>{stages.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
     <label><input type="checkbox" checked={draft.show} onChange={e=>setStageDraft({...draft,show:e.target.checked})}/> Показывать после оформления</label>
    </div>
    <label>Комментарий сотруднику<textarea value={draft.comment} maxLength={1200} rows={2} onChange={e=>setStageDraft({...draft,comment:e.target.value})}/></label>
    {canEdit&&<button className="button" disabled={busy} onClick={()=>void action({action:"set_onboarding",objectId,workerId:worker.id,stage:draft.stage,comment:draft.comment||null,showAfterCompleted:draft.show},"Этап оформления обновлён")}>Сохранить этап</button>}
    <div className="worker-confirmation-toolbar" style={{marginTop:12}}>
     <label>Документ <select value={document} onChange={e=>setDocument(e.target.value)}>{documents.map(([code,label])=><option key={code} value={code}>{label}</option>)}</select></label>
     <label>Состояние <select value={documentStatus} onChange={e=>setDocumentStatus(e.target.value)}><option value="not_requested">Не запрошен</option><option value="awaiting">Ожидается</option><option value="received">Получен</option><option value="accepted">Принят</option><option value="resubmit">Требуется повторно</option></select></label>
     {canEdit&&<button className="button" disabled={busy} onClick={()=>void action({action:"set_document_status",objectId,workerId:worker.id,code:document,status:documentStatus},"Статус документа обновлён")}>Сохранить документ</button>}
    </div>
    <p className="worker-confirmation-note">Паспортные данные, реквизиты и сканы в кабинет по персональной ссылке не передаются.</p>
   </div>
   {(data.sizeRequests??[]).filter(x=>x.workerId===worker.id&&x.objectId===objectId).map(x=><div className="worker-confirmation-configuration" key={x.id}><h3>Размеры на подтверждении</h3>
    <p>Одежда: {x.clothingSize??"—"} · Обувь: {x.shoeSize??"—"} · Перчатки: {x.gloveSize??"—"}</p>{x.comment&&<p>{x.comment}</p>}
    {canEdit&&<div className="worker-confirmation-actions"><button className="button primary" disabled={busy} onClick={()=>void action({action:"review_sizes",objectId,workerId:worker.id,requestId:x.id,approve:true},"Размеры подтверждены")}>Подтвердить размеры</button><button className="button" disabled={busy} onClick={()=>void action({action:"review_sizes",objectId,workerId:worker.id,requestId:x.id,approve:false},"Запрос размеров отклонён")}>Отклонить</button></div>}
   </div>)}
   {(data.hourDisputes??[]).filter(x=>x.workerId===worker.id&&x.objectId===objectId).map(x=><div className="worker-confirmation-configuration" key={x.id}><h3>Обращение по табелю · {x.date}</h3>
    <p>{x.comment}</p><small>{x.reason==="hours"?"Расхождение по часам":x.reason==="missing_shift"?"Не учтена смена":x.reason==="wrong_shift"?"Не та смена":"Другое"} · {x.status==="in_review"?"Проверяется":"Ожидает ответа"}</small>
    {canEdit&&<div className="worker-confirmation-actions"><button className="button" disabled={busy} onClick={()=>void action({action:"resolve_hours_dispute",objectId,workerId:worker.id,disputeId:x.id,status:"in_review"},"Обращение взято в работу")}>В работу</button><button className="button" disabled={busy} onClick={()=>void action({action:"resolve_hours_dispute",objectId,workerId:worker.id,disputeId:x.id,status:"resolved"},"Обращение закрыто")}>Решено</button></div>}
   </div>)}
   {data.canManageAdjustments&&<div className="worker-confirmation-configuration"><h3>Удержания и корректировки</h3><p className="worker-confirmation-note">Только информационная запись. Она не создаёт начислений и не изменяет утверждённые табели.</p>
    {(data.adjustments??[]).filter(x=>x.workerId===worker.id&&x.objectId===objectId).map(x=><div key={x.id} className="worker-confirmation-configuration" style={{marginBottom:8}}>
      <p><strong>{x.periodStart} — {x.periodEnd}</strong> · {x.amount.toLocaleString("ru-RU")} ₽</p><p>{x.description}</p>
      <p className="worker-confirmation-note">Основание: {x.reason}. Статус: {adjustmentStatus[x.status]??"Не определён"}</p>
      {canEdit&&<div className="worker-confirmation-actions">
       {(["draft","review","accounted","cancelled"] as const).filter(status=>status!==x.status).map(status=><button key={status} type="button" className="button" disabled={busy} onClick={()=>void action({action:"update_adjustment_status",objectId,workerId:worker.id,adjustmentId:x.id,status},"Статус корректировки обновлён")}>{adjustmentStatus[status]}</button>)}
      </div>}
     </div>)}
    {(data.adjustmentQuestions??[]).filter(x=>x.workerId===worker.id&&x.objectId===objectId).map(x=><div key={x.id} className="worker-confirmation-configuration" style={{marginBottom:8}}>
      <h4>Вопрос сотрудника по корректировке</h4><p>{x.question}</p>
      <p className="worker-confirmation-note">{new Date(x.createdAt).toLocaleString("ru-RU")}</p>
      {canEdit&&<button className="button" disabled={busy} onClick={()=>void action({action:"answer_adjustment_question",objectId,workerId:worker.id,questionId:x.id},"Вопрос отмечен обработанным")}>Отметить обработанным</button>}
     </div>)}
    <div className="worker-confirmation-toolbar">
     <label>Начало периода <input type="date" value={periodStart} onChange={e=>setPeriodStart(e.target.value)}/></label><label>Конец периода <input type="date" value={periodEnd} onChange={e=>setPeriodEnd(e.target.value)}/></label>
     <label>Тип <select value={adjType} onChange={e=>setAdjType(e.target.value as typeof adjType)}><option value="deduction">Удержание</option><option value="damage">Компенсация ущерба</option><option value="advance">Аванс</option><option value="other">Иная корректировка</option></select></label>
     <label>Сумма, ₽ <input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    </div><div className="worker-confirmation-toolbar"><label>Основание <input maxLength={1200} value={reason} onChange={e=>setReason(e.target.value)}/></label><label>Описание сотруднику <input maxLength={1200} value={description} onChange={e=>setDescription(e.target.value)}/></label></div>
    <button className="button" disabled={busy||!periodStart||!periodEnd||!amount||!reason.trim()||!description.trim()} onClick={()=>void action({action:"upsert_adjustment",objectId,workerId:worker.id,periodStart,periodEnd,amount:Number(amount),adjustmentType:adjType,reason,description,status:"draft"},"Корректировка сохранена как черновик")}>Сохранить черновик</button>
   </div>}
  </>}
 </section>;
}
