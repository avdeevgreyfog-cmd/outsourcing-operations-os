"use client";

import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { ExternalLink, Plus, X } from "lucide-react";
import { Status } from "@/components/UI";
import { SalesSearch } from "@/components/sales/SalesUI";
import type { InternalRequestReferenceData, InventorySnapshot, OperationsReferenceData, SupplyRequestRow } from "@/lib/operations/service";
import type { SupplyPartnerRow } from "@/lib/operations/supply-control";
import { rub } from "@/lib/ui/format";

type View="all"|"approval"|"payment"|"work"|"overdue"|"done";
type RequestType="purchase"|"payment"|"compensation"|"service";
type Priority="normal"|"urgent"|"critical";

const typeLabels:Record<RequestType,string>={purchase:"Закупка",payment:"Оплата",compensation:"Компенсация",service:"Услуга"};
const categoryLabels:Record<string,string>={
  workwear_ppe:"СИЗ и спецодежда",tools_equipment:"Инструмент и оборудование",housing:"Проживание",transport:"Транспорт",
  recruiting_advertising:"Реклама и подбор",software_subscriptions:"ПО и подписки",communications:"Связь",medical:"Медосмотры",
  training:"Обучение",office_household:"Офис и хозрасходы",rent:"Аренда",services:"Услуги",other:"Прочее",
};
const priorityLabels:Record<Priority,string>={normal:"Обычный",urgent:"Срочно",critical:"Критично"};
const paymentLabels:Record<string,string>={not_required:"Не требуется",pending:"К оплате",paid:"Оплачено",cancelled:"Отменено"};

function ruToIso(value:string|null){if(!value)return null;const m=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?m[3]+"-"+m[2]+"-"+m[1]:null}
function isOverdue(row:SupplyRequestRow){const due=ruToIso(row.neededBy);return Boolean(due&&due<new Date().toISOString().slice(0,10)&&!["closed","rejected","received"].includes(row.status))}
function isDone(row:SupplyRequestRow){return ["closed","received","rejected"].includes(row.status)}
function stageLabel(row:SupplyRequestRow){
  if(row.approvalStatus==="pending")return "На согласовании";
  if(row.paymentStatus==="pending")return "К оплате";
  if(row.paymentStatus==="paid"&&(row.requestType==="payment"||row.requestType==="compensation"))return "Оплачено";
  if(row.status==="approved")return "Согласована";
  if(row.status==="in_progress")return "В работе";
  if(row.status==="received")return "Исполнено";
  if(row.status==="closed")return "Закрыта";
  if(row.status==="rejected")return "Отклонена";
  return "Подана";
}
function stageTone(row:SupplyRequestRow){
  if(isOverdue(row)||row.status==="rejected")return "bad" as const;
  if(row.paymentStatus==="paid"||["closed","received"].includes(row.status))return "good" as const;
  if(row.paymentStatus==="pending"||row.approvalStatus==="pending"||row.status==="submitted")return "warn" as const;
  return "info" as const;
}
function requestAmount(row:SupplyRequestRow){return row.actualAmount??row.approvedAmount??row.amount}

export function SupplyRequestsWorkspace({
  rows,options,inventory,partners,references,canCreate,canManage,canFinance,demo,
  initialItemId,initialLocationId,initialObjectId,initialQuantity,openInitially=false,
}:{
  rows:SupplyRequestRow[];
  options:OperationsReferenceData;
  inventory:InventorySnapshot;
  partners:SupplyPartnerRow[];
  references:InternalRequestReferenceData;
  canCreate:boolean;
  canManage:boolean;
  canFinance:boolean;
  demo:boolean;
  initialItemId?:string|null;
  initialLocationId?:string|null;
  initialObjectId?:string|null;
  initialQuantity?:string|null;
  openInitially?:boolean;
}){
  const [view,setView]=useState<View>("all");
  const [query,setQuery]=useState("");
  const [typeFilter,setTypeFilter]=useState("all");
  const [categoryFilter,setCategoryFilter]=useState("all");
  const [legalFilter,setLegalFilter]=useState("all");
  const [objectFilter,setObjectFilter]=useState(initialObjectId??"all");
  const [show,setShow]=useState(Boolean(openInitially||initialItemId||initialLocationId||initialQuantity));
  const [requestType,setRequestType]=useState<RequestType>("purchase");
  const [categoryCode,setCategoryCode]=useState("workwear_ppe");
  const [priority,setPriority]=useState<Priority>("normal");
  const [urgencyReason,setUrgencyReason]=useState("");
  const [legalEntityId,setLegalEntityId]=useState(references.legalEntities.find(row=>row.primary)?.id??references.legalEntities[0]?.id??"");
  const [orgUnitId,setOrgUnitId]=useState(references.orgUnits[0]?.id??"");
  const [objectId,setObjectId]=useState(initialObjectId??"");
  const [title,setTitle]=useState(initialItemId?("Пополнить "+(inventory.items.find(x=>x.id===initialItemId)?.name??"запас")):"");
  const [description,setDescription]=useState("");
  const [itemId,setItemId]=useState(initialItemId??"");
  const [locationId,setLocationId]=useState(initialLocationId??"");
  const [quantity,setQuantity]=useState(initialQuantity??"");
  const [unit,setUnit]=useState(inventory.items.find(x=>x.id===initialItemId)?.unit??"шт");
  const [amount,setAmount]=useState("");
  const [vendor,setVendor]=useState("");
  const [partnerId,setPartnerId]=useState("");
  const [sourceName,setSourceName]=useState("");
  const [sourceUrl,setSourceUrl]=useState("");
  const [neededBy,setNeededBy]=useState("");
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase("ru");
    return rows.filter(row=>{
      if(typeFilter!=="all"&&row.requestType!==typeFilter)return false;
      if(categoryFilter!=="all"&&row.categoryCode!==categoryFilter)return false;
      if(legalFilter!=="all"&&row.legalEntityId!==legalFilter)return false;
      if(objectFilter!=="all"&&row.objectId!==objectFilter)return false;
      if(view==="approval"&&row.approvalStatus!=="pending")return false;
      if(view==="payment"&&row.paymentStatus!=="pending")return false;
      if(view==="work"&&!["approved","in_progress"].includes(row.status))return false;
      if(view==="overdue"&&!isOverdue(row))return false;
      if(view==="done"&&!isDone(row))return false;
      if(needle&&![row.title,row.description,row.object,row.orgUnit,row.legalEntity,row.createdBy,row.assignedTo,row.vendor,row.partner,row.sourceName,categoryLabels[row.categoryCode]].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(needle))return false;
      return true;
    });
  },[rows,query,typeFilter,categoryFilter,legalFilter,objectFilter,view]);

  const open=rows.filter(row=>!isDone(row)).length;
  const approval=rows.filter(row=>row.approvalStatus==="pending").length;
  const payment=rows.filter(row=>row.paymentStatus==="pending").length;
  const overdue=rows.filter(isOverdue).length;
  const openAmount=rows.filter(row=>!isDone(row)).reduce((sum,row)=>sum+Number(requestAmount(row)??0),0);

  async function sendApproval(id:string){
    setBusy("approval:"+id);setError("");
    try{
      if(demo){setError("В демо-режиме изменения не сохраняются");return;}
      const response=await fetch("/api/approvals",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subjectType:"supply_request",subjectId:id})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось отправить на согласование");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось отправить на согласование");}finally{setBusy("");}
  }
  async function transition(id:string,status:"in_progress"|"received"|"closed"){
    setBusy("status:"+id);setError("");
    try{
      if(demo){setError("В демо-режиме изменения не сохраняются");return;}
      const response=await fetch("/api/procurement",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,status})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось изменить статус");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить статус");}finally{setBusy("");}
  }
  async function queuePayment(row:SupplyRequestRow){
    setBusy("queue:"+row.id);setError("");
    try{
      if(demo){setError("В демо-режиме изменения не сохраняются");return;}
      const response=await fetch("/api/procurement",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:row.id,paymentAction:"queue",approvedAmount:row.approvedAmount??row.amount})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось передать на оплату");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось передать на оплату");}finally{setBusy("");}
  }
  async function markPaid(row:SupplyRequestRow){
    const suggested=Number(row.approvedAmount??row.amount??0);
    const raw=window.prompt("Фактически оплаченная сумма, ₽",suggested?String(suggested):"");
    if(raw===null)return;
    const actual=Number(raw.replace(",","."));
    if(!Number.isFinite(actual)||actual<=0){setError("Укажите корректную сумму оплаты");return;}
    const reference=window.prompt("Номер платёжного документа / комментарий (необязательно)","")??"";
    setBusy("paid:"+row.id);setError("");
    try{
      if(demo){setError("В демо-режиме изменения не сохраняются");return;}
      const response=await fetch("/api/procurement",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:row.id,paymentAction:"paid",actualAmount:actual,paymentReference:reference||null})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось подтвердить оплату");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось подтвердить оплату");}finally{setBusy("");}
  }
  async function save(){
    setBusy("create");setError("");
    try{
      if(demo){setError("В демо-режиме изменения не сохраняются");return;}
      const response=await fetch("/api/procurement",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        objectId:objectId||null,legalEntityId:legalEntityId||null,orgUnitId:orgUnitId||null,requestType,categoryCode,priority,
        urgencyReason:priority==="normal"?null:(urgencyReason||null),title,description:description||null,itemId:itemId||null,locationId:locationId||null,
        quantity:quantity?Number(quantity):null,unit:unit||null,amount:amount?Number(amount):null,vendor:vendor||null,partnerId:partnerId||null,
        sourceName:sourceName||null,sourceUrl:sourceUrl||null,neededBy:neededBy||null,
      })});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось создать заявку");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать заявку");}finally{setBusy("");}
  }

  const hasInventory=inventory.items.length>0;
  return <div className="supply-requests-workspace">
    <div className="metrics-grid supply-portfolio-metrics">
      <div className="metric"><span>Открытые заявки</span><strong>{open}</strong><small>{rub(openAmount)} в открытой очереди</small></div>
      <div className={"metric "+(approval?"tone-warn":"tone-good")}><span>На согласовании</span><strong>{approval}</strong><small>ожидают решения</small></div>
      <div className={"metric "+(payment?"tone-warn":"tone-good")}><span>К оплате</span><strong>{payment}</strong><small>согласованные обязательства</small></div>
      <div className={"metric "+(overdue?"tone-bad":"tone-good")}><span>Просрочено</span><strong>{overdue}</strong><small>срок уже наступил</small></div>
    </div>

    <div className="object-local-tabs supply-portfolio-tabs" role="tablist" aria-label="Внутренние заявки">
      <button className={view==="all"?"active":""} onClick={()=>setView("all")}>Все</button>
      <button className={view==="approval"?"active":""} onClick={()=>setView("approval")}>На согласовании <span>{approval}</span></button>
      <button className={view==="payment"?"active":""} onClick={()=>setView("payment")}>К оплате <span>{payment}</span></button>
      <button className={view==="work"?"active":""} onClick={()=>setView("work")}>В работе</button>
      <button className={view==="overdue"?"active":""} onClick={()=>setView("overdue")}>Просроченные <span>{overdue}</span></button>
      <button className={view==="done"?"active":""} onClick={()=>setView("done")}>Завершённые</button>
    </div>

    <div className="personnel-portfolio-toolbar supply-portfolio-toolbar">
      <div className="personnel-portfolio-filters">
        <SalesSearch value={query} onChange={setQuery} placeholder="Заявка, инициатор, объект, поставщик"/>
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}><option value="all">Все типы</option>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="all">Все категории</option>{Object.entries(categoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
        {references.legalEntities.length>1&&<select value={legalFilter} onChange={e=>setLegalFilter(e.target.value)}><option value="all">Все юрлица</option>{references.legalEntities.map(row=><option key={row.id} value={row.id}>{row.shortName??row.name}</option>)}</select>}
        {options.objects.length>0&&<select value={objectFilter} onChange={e=>setObjectFilter(e.target.value)}><option value="all">Все объекты</option>{options.objects.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select>}
      </div>
      {canCreate&&<button className="button primary" onClick={()=>setShow(true)}><Plus size={14}/> Создать заявку</button>}
    </div>

    <div className="request-table-wrap"><table className="data-table supply-requests-table">
      <thead><tr><th>Заявка</th><th>Контекст</th><th>Тип / категория</th><th>Сумма</th><th>Нужно до</th><th>Инициатор / ответственный</th><th>Оплата</th><th>Этап</th>{(canCreate||canManage||canFinance)&&<th>Действие</th>}</tr></thead>
      <tbody>{filtered.map(row=><tr key={row.id} className={isOverdue(row)?"row-attention":""}>
        <td><strong className="cell-title">{row.title}</strong><span className="cell-sub">{row.description??row.item??row.sourceName??row.createdAt}</span>{row.sourceUrl&&<a className="cell-sub" href={row.sourceUrl} target="_blank" rel="noreferrer">Открыть источник <ExternalLink size={11}/></a>}</td>
        <td><strong>{row.object??row.orgUnit??"Общекорпоративная"}</strong><span className="cell-sub">{row.legalEntity??"Юрлицо не указано"}{row.object&&row.orgUnit?" · "+row.orgUnit:""}</span></td>
        <td>{typeLabels[row.requestType]}<span className="cell-sub">{categoryLabels[row.categoryCode]??"Прочее"}{row.priority!=="normal"?" · "+priorityLabels[row.priority]:""}</span></td>
        <td className="num"><strong>{requestAmount(row)==null?"—":rub(Number(requestAmount(row)))}</strong>{row.actualAmount!=null&&<span className="cell-sub">факт</span>}</td>
        <td>{row.neededBy??"—"}{isOverdue(row)&&<span className="cell-sub supply-overdue">Срок прошёл</span>}</td>
        <td>{row.createdBy}<span className="cell-sub">{row.assignedTo?"ответственный: "+row.assignedTo:"ответственный не назначен"}</span></td>
        <td><Status tone={row.paymentStatus==="paid"?"good":row.paymentStatus==="pending"?"warn":"neutral"}>{paymentLabels[row.paymentStatus]??"—"}</Status>{row.paymentReference&&<span className="cell-sub">{row.paymentReference}</span>}</td>
        <td><Status tone={stageTone(row)}>{stageLabel(row)}</Status>{row.quantity!=null&&row.fulfilledQuantity!=null&&row.fulfilledQuantity<row.quantity&&<span className="cell-sub">{"исполнено "+row.fulfilledQuantity+" из "+row.quantity+" "+(row.unit??"")}</span>}</td>
        {(canCreate||canManage||canFinance)&&<td><div className="table-row-actions">
          {canCreate&&["submitted","rejected"].includes(row.status)&&row.approvalStatus!=="pending"&&<button className="button" disabled={Boolean(busy)} onClick={()=>void sendApproval(row.id)}>На согласование</button>}
          {canManage&&row.status==="approved"&&<button className="button" disabled={Boolean(busy)} onClick={()=>void transition(row.id,"in_progress")}>В работу</button>}
          {canManage&&["approved","in_progress","received"].includes(row.status)&&row.paymentStatus==="not_required"&&requestAmount(row)!=null&&<button className="button ghost" disabled={Boolean(busy)} onClick={()=>void queuePayment(row)}>На оплату</button>}
          {canFinance&&row.paymentStatus==="pending"&&<button className="button primary" disabled={Boolean(busy)} onClick={()=>void markPaid(row)}>Оплачено</button>}
          {canManage&&row.status==="in_progress"&&<button className="button" disabled={Boolean(busy)} onClick={()=>void transition(row.id,"received")}>Исполнено</button>}
          {canManage&&row.status==="received"&&<button className="button ghost" disabled={Boolean(busy)} onClick={()=>void transition(row.id,"closed")}>Закрыть</button>}
        </div></td>}
      </tr>)}{!filtered.length&&<tr><td colSpan={(canCreate||canManage||canFinance)?9:8}><div className="empty-inline">Заявок по выбранным фильтрам нет.</div></td></tr>}</tbody>
    </table></div>
    {error&&<div className="recruiting-error operations-inline-error">{error}</div>}

    {show&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShow(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Новая внутренняя заявка</h2><p>Опишите потребность один раз: система сохранит бизнес-контекст и проведёт её через согласование, исполнение и оплату.</p></div><button className="icon-button" onClick={()=>setShow(false)} aria-label="Закрыть"><X size={17}/></button></div>
      <div className="candidate-import-body"><div className="candidate-import-options">
        <label>Тип<select value={requestType} onChange={e=>setRequestType(e.target.value as RequestType)}>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Категория<select value={categoryCode} onChange={e=>setCategoryCode(e.target.value)}>{Object.entries(categoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Юрлицо / плательщик<select value={legalEntityId} onChange={e=>setLegalEntityId(e.target.value)}>{references.legalEntities.map(row=><option key={row.id} value={row.id}>{row.shortName??row.name}</option>)}</select></label>
        <label>Подразделение / центр затрат<select value={orgUnitId} onChange={e=>setOrgUnitId(e.target.value)}><option value="">Не указано</option>{references.orgUnits.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        {options.objects.length>0&&<label>Объект<select value={objectId} onChange={e=>setObjectId(e.target.value)}><option value="">Без объекта</option>{options.objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        <label>Название<input value={title} onChange={e=>setTitle(e.target.value)} placeholder={requestType==="payment"?"Например, пополнить рекламный кабинет Avito":"Что необходимо обеспечить"}/></label>
        <label>Плановая сумма, ₽<input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <label>Нужно до<input type="date" value={neededBy} onChange={e=>setNeededBy(e.target.value)}/></label>
        <label>Приоритет<select value={priority} onChange={e=>setPriority(e.target.value as Priority)}>{Object.entries(priorityLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        {priority!=="normal"&&<label>Причина срочности<input value={urgencyReason} onChange={e=>setUrgencyReason(e.target.value)} placeholder="Почему нельзя выполнить в обычный срок"/></label>}
        {requestType==="purchase"&&hasInventory&&<label>Позиция имущества<select value={itemId} onChange={e=>{setItemId(e.target.value);const item=inventory.items.find(x=>x.id===e.target.value);if(item)setUnit(item.unit)}}><option value="">Новая / не из справочника</option>{inventory.items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {requestType==="purchase"&&inventory.locations.length>0&&<label>Куда получить<select value={locationId} onChange={e=>setLocationId(e.target.value)}><option value="">Не указано</option>{inventory.locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>}
        {(requestType==="purchase"||categoryCode==="housing"||categoryCode==="transport")&&<><label>Количество<input type="number" min="0" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>Единица<input value={unit} onChange={e=>setUnit(e.target.value)} placeholder="шт, пар, мест"/></label></>}
        {partners.length>0&&<label>Поставщик / подрядчик<select value={partnerId} onChange={e=>setPartnerId(e.target.value)}><option value="">Не выбран</option>{partners.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>}
        {!partnerId&&<label>Поставщик текстом<input value={vendor} onChange={e=>setVendor(e.target.value)} placeholder="Avito, Ozon, общежитие, арендодатель"/></label>}
        <label>Где найдено<input value={sourceName} onChange={e=>setSourceName(e.target.value)} placeholder="Wildberries, Ozon, Avito, сайт поставщика"/></label>
        <label>Ссылка<input type="url" value={sourceUrl} onChange={e=>setSourceUrl(e.target.value)} placeholder="https://..."/></label>
      </div>
      <label>Комментарий<textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Для чего нужна заявка, период, получатель и другие важные детали"/></label>
      {error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" disabled={Boolean(busy)||!title||!legalEntityId||(priority!=="normal"&&!urgencyReason.trim())} onClick={()=>void save()}>{busy==="create"?"Отправляю…":"Создать заявку"}</button></div>
    </div></div></Portal>}
  </div>;
}

function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
