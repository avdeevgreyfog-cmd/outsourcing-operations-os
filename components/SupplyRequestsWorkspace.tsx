"use client";

import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Status } from "@/components/UI";
import { SalesSearch } from "@/components/sales/SalesUI";
import type { InventorySnapshot, OperationsReferenceData, SupplyRequestRow } from "@/lib/operations/service";
import type { SupplyPartnerRow } from "@/lib/operations/supply-control";
import { rub } from "@/lib/ui/format";

type View="all"|"approval"|"work"|"execution"|"overdue";
const typeLabels:Record<string,string>={purchase:"Закупка",payment:"Оплата",compensation:"Компенсация",service:"Услуга"};
const statusLabels:Record<string,string>={draft:"Черновик",submitted:"Подана",approved:"Согласована",rejected:"Отклонена",in_progress:"В работе",received:"Исполнено",closed:"Закрыта"};

function ruToIso(value:string|null){if(!value)return null;const m=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?m[3]+"-"+m[2]+"-"+m[1]:null}
function isOverdue(row:SupplyRequestRow){const due=ruToIso(row.neededBy);return Boolean(due&&due<new Date().toISOString().slice(0,10)&&!["closed","rejected","received"].includes(row.status))}
function requestStage(row:SupplyRequestRow){
  if(row.approvalStatus==="pending")return "approval";
  if(row.status==="approved")return "work";
  if(row.status==="in_progress")return "execution";
  if(row.status==="received")return "received";
  if(row.status==="closed")return "closed";
  if(row.status==="rejected")return "rejected";
  return "submitted";
}
function stageLabel(row:SupplyRequestRow){
  const stage=requestStage(row);
  return stage==="approval"?"На согласовании":stage==="work"?"Согласована":stage==="execution"?"Исполняется":stage==="received"?"Получено / исполнено":stage==="closed"?"Закрыта":stage==="rejected"?"Отклонена":"Подана";
}
function stageTone(row:SupplyRequestRow){
  if(isOverdue(row)||row.status==="rejected")return "bad" as const;
  if(["closed","received"].includes(row.status))return "good" as const;
  if(row.approvalStatus==="pending"||row.status==="submitted")return "warn" as const;
  return "info" as const;
}

export function SupplyRequestsWorkspace({rows,options,inventory,partners,canManage,demo,initialItemId,initialLocationId,initialObjectId,initialQuantity,openInitially=false}:{rows:SupplyRequestRow[];options:OperationsReferenceData;inventory:InventorySnapshot;partners:SupplyPartnerRow[];canManage:boolean;demo:boolean;initialItemId?:string|null;initialLocationId?:string|null;initialObjectId?:string|null;initialQuantity?:string|null;openInitially?:boolean}){
  const [view,setView]=useState<View>("all");
  const [query,setQuery]=useState("");
  const [manager,setManager]=useState("all");
  const [objectFilter,setObjectFilter]=useState(initialObjectId??"all");
  const [show,setShow]=useState(Boolean(openInitially||initialItemId||initialLocationId||initialQuantity));
  const [requestType,setRequestType]=useState<"purchase"|"payment"|"compensation"|"service">("purchase");
  const [objectId,setObjectId]=useState(initialObjectId??options.objects[0]?.id??"");
  const [title,setTitle]=useState(initialItemId?("Пополнить "+(inventory.items.find(x=>x.id===initialItemId)?.name??"запас")):"");
  const [description,setDescription]=useState("");
  const [itemId,setItemId]=useState(initialItemId??"");
  const [locationId,setLocationId]=useState(initialLocationId??"");
  const [quantity,setQuantity]=useState(initialQuantity??"");
  const [unit,setUnit]=useState(inventory.items.find(x=>x.id===initialItemId)?.unit??"шт");
  const [amount,setAmount]=useState("");
  const [vendor,setVendor]=useState("");
  const [partnerId,setPartnerId]=useState("");
  const [neededBy,setNeededBy]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const objectMap=useMemo(()=>new Map(options.objects.map(row=>[row.id,row])),[options.objects]);
  const managers=useMemo(()=>[...new Map(options.objects.map(row=>[row.ownerUserId??"unassigned",row.ownerName??"Менеджер не назначен"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[options.objects]);
  const visibleObjects=useMemo(()=>options.objects.filter(row=>manager==="all"||(row.ownerUserId??"unassigned")===manager),[options.objects,manager]);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase("ru");
    return rows.filter(row=>{
      const object=row.objectId?objectMap.get(row.objectId):null;
      if(manager!=="all"&&(object?.ownerUserId??"unassigned")!==manager)return false;
      if(objectFilter!=="all"&&row.objectId!==objectFilter)return false;
      if(view==="approval"&&row.approvalStatus!=="pending")return false;
      if(view==="work"&&row.status!=="approved")return false;
      if(view==="execution"&&row.status!=="in_progress")return false;
      if(view==="overdue"&&!isOverdue(row))return false;
      if(needle&&![row.title,row.description,row.object,row.item,row.vendor,row.createdBy,row.assignedTo].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(needle))return false;
      return true;
    });
  },[rows,view,manager,objectFilter,query,objectMap]);
  const groups=useMemo(()=>{
    const map=new Map<string,{id:string;name:string;rows:SupplyRequestRow[]}>();
    for(const row of filtered){
      const object=row.objectId?objectMap.get(row.objectId):null;const id=object?.ownerUserId??"unassigned",name=object?.ownerName??"Без менеджера";
      const group=map.get(id)??{id,name,rows:[]};group.rows.push(row);map.set(id,group);
    }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  },[filtered,objectMap]);
  const open=rows.filter(row=>!["closed","rejected"].includes(row.status)).length;
  const approval=rows.filter(row=>row.approvalStatus==="pending").length;
  const overdue=rows.filter(isOverdue).length;
  const execution=rows.filter(row=>["approved","in_progress"].includes(row.status)).length;
  const plannedAmount=rows.filter(row=>!["closed","rejected"].includes(row.status)).reduce((sum,row)=>sum+Number(row.amount??0),0);

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
      const response=await fetch("/api/procurement",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({objectId:objectId||null,requestType,title,description:description||null,itemId:itemId||null,locationId:locationId||null,quantity:quantity?Number(quantity):null,unit:unit||null,amount:amount?Number(amount):null,vendor:vendor||null,partnerId:partnerId||null,neededBy:neededBy||null})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось создать заявку");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать заявку");}finally{setBusy(false);}
  }

  return <div className="supply-requests-workspace">
    <div className="metrics-grid supply-portfolio-metrics">
      <div className="metric"><span>Открытые заявки</span><strong>{open}</strong><small>{rub(plannedAmount)} в открытой очереди</small></div>
      <div className={"metric "+(approval?"tone-warn":"tone-good")}><span>На согласовании</span><strong>{approval}</strong><small>ожидают решения</small></div>
      <div className={"metric "+(execution?"tone-warn":"")}><span>В работе</span><strong>{execution}</strong><small>согласовано или исполняется</small></div>
      <div className={"metric "+(overdue?"tone-bad":"tone-good")}><span>Просрочено</span><strong>{overdue}</strong><small>срок потребности уже наступил</small></div>
    </div>
    <div className="object-local-tabs supply-portfolio-tabs" role="tablist" aria-label="Заявки на обеспечение"><button className={view==="all"?"active":""} onClick={()=>setView("all")}>Все</button><button className={view==="approval"?"active":""} onClick={()=>setView("approval")}>На согласовании <span>{approval}</span></button><button className={view==="work"?"active":""} onClick={()=>setView("work")}>Согласовано</button><button className={view==="execution"?"active":""} onClick={()=>setView("execution")}>К исполнению</button><button className={view==="overdue"?"active":""} onClick={()=>setView("overdue")}>Просроченные <span>{overdue}</span></button></div>
    <div className="personnel-portfolio-toolbar supply-portfolio-toolbar"><div className="personnel-portfolio-filters"><SalesSearch value={query} onChange={setQuery} placeholder="Заявка, объект, позиция, инициатор"/><select value={manager} onChange={e=>{setManager(e.target.value);setObjectFilter("all")}}><option value="all">Все менеджеры</option>{managers.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><select value={objectFilter} onChange={e=>setObjectFilter(e.target.value)}><option value="all">Все объекты</option>{visibleObjects.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></div>{canManage&&<button className="button primary" onClick={()=>setShow(true)}><Plus size={14}/> Создать заявку</button>}</div>

    <div className="personnel-portfolio-groups">{groups.map(group=><section className="section personnel-manager-group" key={group.id}><div className="personnel-manager-head"><div><strong>{group.name}</strong><span>{group.rows.length} заявок · {new Set(group.rows.map(row=>row.objectId).filter(Boolean)).size} объектов</span></div><div>{group.rows.some(isOverdue)?<Status tone="warn">Просрочено: {group.rows.filter(isOverdue).length}</Status>:<Status tone="good">Без просрочки</Status>}</div></div><div className="request-table-wrap"><table className="data-table supply-requests-table">
      <thead><tr><th>Заявка</th><th>Объект</th><th>Тип</th><th>Позиция / количество</th><th>Сумма</th><th>Нужно до</th><th>Инициатор / исполнитель</th><th>Этап</th>{canManage&&<th>Действие</th>}</tr></thead>
      <tbody>{group.rows.map(row=><tr key={row.id} className={isOverdue(row)?"row-attention":""}><td><strong className="cell-title">{row.title}</strong><span className="cell-sub">{row.description??row.partner??row.vendor??row.createdAt}</span></td><td>{row.object??"Без объекта"}</td><td>{typeLabels[row.requestType]}</td><td>{row.item??"—"}<span className="cell-sub">{row.quantity==null?"":row.quantity+" "+(row.unit??"")}</span></td><td className="num">{row.amount==null?"—":rub(row.amount)}</td><td>{row.neededBy??"—"}{isOverdue(row)&&<span className="cell-sub supply-overdue">Срок прошёл</span>}</td><td>{row.createdBy}<span className="cell-sub">{row.assignedTo?"исполнитель: "+row.assignedTo:"исполнитель не назначен"}</span></td><td><Status tone={stageTone(row)}>{isOverdue(row)?"Просрочено":stageLabel(row)}</Status></td>{canManage&&<td>{row.approvalStatus==="pending"?<span className="cell-sub">Ожидает решения</span>:(row.status==="submitted"||row.status==="rejected")?<button className="button" disabled={busy} onClick={()=>void sendApproval(row.id)}>На согласование</button>:row.status==="approved"?<button className="button" disabled={busy} onClick={()=>void transition(row.id,"in_progress")}>В работу</button>:row.status==="in_progress"?<button className="button" disabled={busy} onClick={()=>void transition(row.id,"received")}>Исполнено</button>:row.status==="received"?<button className="button" disabled={busy} onClick={()=>void transition(row.id,"closed")}>Закрыть</button>:"—"}</td>}</tr>)}</tbody>
    </table></div></section>)}{!groups.length&&<div className="empty-inline">Заявок по выбранным фильтрам нет.</div>}</div>{error&&<div className="recruiting-error operations-inline-error">{error}</div>}

    {show&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShow(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Новая заявка</h2><p>Закупка, оплата, компенсация или услуга с привязкой к объекту.</p></div><button className="icon-button" onClick={()=>setShow(false)}><X size={17}/></button></div>
      <div className="candidate-import-body"><div className="candidate-import-options">
        <label>Тип<select value={requestType} onChange={e=>setRequestType(e.target.value as typeof requestType)}>{Object.entries(typeLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Объект<select value={objectId} onChange={e=>setObjectId(e.target.value)}><option value="">Без объекта</option>{options.objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Название<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Купить рабочую обувь"/></label>
        <label>Позиция<select value={itemId} onChange={e=>{setItemId(e.target.value);const item=inventory.items.find(x=>x.id===e.target.value);if(item)setUnit(item.unit)}}><option value="">Не связана</option>{inventory.items.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Место получения<select value={locationId} onChange={e=>setLocationId(e.target.value)}><option value="">Не указано</option>{inventory.locations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label>Количество<input type="number" min="0" value={quantity} onChange={e=>setQuantity(e.target.value)}/></label><label>Единица<input value={unit} onChange={e=>setUnit(e.target.value)}/></label>
        <label>Сумма / лимит<input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Поставщик / подрядчик<select value={partnerId} onChange={e=>setPartnerId(e.target.value)}><option value="">Не выбран</option>{partners.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>{!partnerId&&<label>Поставщик текстом<input value={vendor} onChange={e=>setVendor(e.target.value)} placeholder="Для старых/разовых контрагентов"/></label>}<label>Нужно до<input type="date" value={neededBy} onChange={e=>setNeededBy(e.target.value)}/></label>
      </div><label>Комментарий<textarea value={description} onChange={e=>setDescription(e.target.value)}/></label>{error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" disabled={busy||!title} onClick={()=>void save()}>{busy?"Отправляю…":"Подать заявку"}</button></div>
    </div></div></Portal>}
  </div>;
}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
