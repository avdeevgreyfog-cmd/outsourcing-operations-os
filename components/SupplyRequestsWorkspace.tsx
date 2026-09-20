"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Metric, Status } from "@/components/UI";
import type { InventorySnapshot, OperationsReferenceData, SupplyRequestRow } from "@/lib/operations/service";
import { rub } from "@/lib/ui/format";

const typeLabels:Record<string,string>={purchase:"Закупка",payment:"Оплата",compensation:"Компенсация",service:"Услуга"};
const statusLabels:Record<string,string>={draft:"Черновик",submitted:"Подана",approved:"Согласована",rejected:"Отклонена",in_progress:"В работе",received:"Исполнено",closed:"Закрыта"};

export function SupplyRequestsWorkspace({rows,options,inventory,canManage,demo,initialItemId,initialLocationId}:{rows:SupplyRequestRow[];options:OperationsReferenceData;inventory:InventorySnapshot;canManage:boolean;demo:boolean;initialItemId?:string|null;initialLocationId?:string|null}){
  const [show,setShow]=useState(Boolean(initialItemId||initialLocationId));
  const [requestType,setRequestType]=useState<"purchase"|"payment"|"compensation"|"service">("purchase");
  const [objectId,setObjectId]=useState(options.objects[0]?.id??"");
  const [title,setTitle]=useState(initialItemId?("Пополнить "+(inventory.items.find(x=>x.id===initialItemId)?.name??"запас")):"");
  const [description,setDescription]=useState("");
  const [itemId,setItemId]=useState(initialItemId??"");
  const [locationId,setLocationId]=useState(initialLocationId??"");
  const [quantity,setQuantity]=useState("");
  const [unit,setUnit]=useState(inventory.items.find(x=>x.id===initialItemId)?.unit??"шт");
  const [amount,setAmount]=useState("");
  const [vendor,setVendor]=useState("");
  const [neededBy,setNeededBy]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const open=rows.filter(row=>!["closed","rejected"].includes(row.status));
  const submitted=rows.filter(row=>row.status==="submitted").length;
  const inProgress=rows.filter(row=>["approved","in_progress","received"].includes(row.status)).length;
  const plannedAmount=rows.reduce((sum,row)=>sum+Number(row.amount??0),0);

  async function sendApproval(id:string){
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме согласование не создаётся");return;}
      const response=await fetch("/api/approvals",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({subjectType:"supply_request",subjectId:id})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось отправить на согласование");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось отправить на согласование");}finally{setBusy(false);}
  }

  async function transition(id:string,status:"in_progress"|"received"|"closed"){
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме статус не сохраняется");return;}
      const response=await fetch("/api/procurement",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,status})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось изменить статус");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить статус");}finally{setBusy(false);}
  }

  async function save(){
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме заявка не сохраняется");return;}
      const response=await fetch("/api/procurement",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        objectId:objectId||null,requestType,title,description:description||null,itemId:itemId||null,locationId:locationId||null,
        quantity:quantity?Number(quantity):null,unit:unit||null,amount:amount?Number(amount):null,vendor:vendor||null,neededBy:neededBy||null,
      })});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось создать заявку");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать заявку");}finally{setBusy(false);}
  }

  return <div>
    <div className="metrics-grid"><Metric label="Открытые заявки" value={open.length}/><Metric label="Ожидают обработки" value={submitted} tone={submitted?"warn":undefined}/><Metric label="В работе" value={inProgress}/><Metric label="Сумма в заявках" value={rub(plannedAmount)}/></div>
    <div className="candidate-directory-viewbar"><div className="summary-strip"><span>Менеджер создаёт потребность здесь; дальнейшая закупка, оплата или компенсация обрабатывается общей очередью.</span></div>{canManage&&<button className="button primary" onClick={()=>setShow(true)}><Plus size={14}/> Создать заявку</button>}</div>
    <section className="section section-flush"><div className="request-table-wrap"><table className="data-table">
      <thead><tr><th>Заявка</th><th>Тип</th><th>Объект</th><th>Позиция</th><th>Количество</th><th>Сумма</th><th>Нужно до</th><th>Инициатор</th><th>Статус</th>{canManage&&<th>Действие</th>}</tr></thead>
      <tbody>{rows.map(row=><tr key={row.id}><td><strong className="cell-title">{row.title}</strong><span className="cell-sub">{row.description??row.vendor??row.createdAt}</span></td><td>{typeLabels[row.requestType]}</td><td>{row.object??"—"}</td><td>{row.item??"—"}</td><td className="num">{row.quantity==null?"—":row.quantity+" "+(row.unit??"")}</td><td className="num">{row.amount==null?"—":rub(row.amount)}</td><td>{row.neededBy??"—"}</td><td>{row.createdBy}</td><td><Status tone={row.status==="rejected"?"bad":row.status==="closed"?"good":row.status==="submitted"?"warn":"info"}>{row.approvalStatus==="pending"?"На согласовании":statusLabels[row.status]??"В работе"}</Status></td>{canManage&&<td>{row.approvalStatus==="pending"?<span className="cell-sub">Ожидает решения</span>:(row.status==="submitted"||row.status==="rejected")?<button className="button" disabled={busy} onClick={()=>void sendApproval(row.id)}>На согласование</button>:row.status==="approved"?<button className="button" disabled={busy} onClick={()=>void transition(row.id,"in_progress")}>В работу</button>:row.status==="in_progress"?<button className="button" disabled={busy} onClick={()=>void transition(row.id,"received")}>Исполнено</button>:row.status==="received"?<button className="button" disabled={busy} onClick={()=>void transition(row.id,"closed")}>Закрыть</button>:"—"}</td>}</tr>)}</tbody>
    </table>{!rows.length&&<div className="empty-inline">Заявок пока нет</div>}</div>{error&&<div className="recruiting-error" style={{margin:12}}>{error}</div>}</section>

    {show&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShow(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Новая заявка</h2><p>Закупка, оплата, компенсация или услуга с привязкой к объекту.</p></div><button className="icon-button" onClick={()=>setShow(false)}><X size={17}/></button></div>
      <div className="candidate-import-body"><div className="candidate-import-options">
        <label>Тип<select value={requestType} onChange={e=>setRequestType(e.target.value as typeof requestType)}>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Объект<select value={objectId} onChange={e=>setObjectId(e.target.value)}><option value="">Без объекта</option>{options.objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Название<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Купить рабочую обувь"/></label>
        <label>Позиция<select value={itemId} onChange={e=>{setItemId(e.target.value);const item=inventory.items.find(x=>x.id===e.target.value);if(item)setUnit(item.unit)}}><option value="">Не связана</option>{inventory.items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Место получения<select value={locationId} onChange={e=>setLocationId(e.target.value)}><option value="">Не указано</option>{inventory.locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Количество<input type="number" min="0" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label>
        <label>Единица<input value={unit} onChange={e=>setUnit(e.target.value)}/></label>
        <label>Сумма / лимит<input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
        <label>Поставщик<input value={vendor} onChange={e=>setVendor(e.target.value)}/></label>
        <label>Нужно до<input type="date" value={neededBy} onChange={e=>setNeededBy(e.target.value)}/></label>
      </div><label>Комментарий<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label>{error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" disabled={busy||!title} onClick={()=>void save()}>{busy?"Отправляю…":"Подать заявку"}</button></div>
    </div></div></Portal>}
  </div>;
}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
