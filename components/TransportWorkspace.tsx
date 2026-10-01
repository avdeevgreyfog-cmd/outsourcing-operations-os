"use client";

import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Status } from "@/components/UI";
import { SalesSearch } from "@/components/sales/SalesUI";
import type { OperationsReferenceData } from "@/lib/operations/service";
import type { SupplyPartnerRow, TransportOperationRow } from "@/lib/operations/supply-control";
import { rub } from "@/lib/ui/format";

type View="employee_trip"|"hired_transport"|"attention";
const kindLabels:Record<string,string>={train:"Поезд",plane:"Самолёт",bus:"Автобус",taxi:"Такси",transfer:"Трансфер",shuttle:"Развозка",cargo:"Грузовой",other:"Другое"};
const statusLabels:Record<string,string>={planned:"Планируется",booked:"Забронировано",in_transit:"В пути",completed:"Завершено",cancelled:"Отменено"};
const paymentLabels:Record<string,string>={ticket:"Билет",ride:"Рейс",day:"День",month:"Месяц",service:"Услуга",reimbursement:"Компенсация"};

function dateFromRu(value:string|null){if(!value)return null;const m=value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);return m?m[3]+"-"+m[2]+"-"+m[1]:null}
function overdue(row:TransportOperationRow){
  const due=dateFromRu(row.paymentDue),paid=dateFromRu(row.prepaidUntil);
  return Boolean(due&&due<new Date().toISOString().slice(0,10)&&row.status!=="cancelled"&&(!paid||paid<due));
}
function needsAttention(row:TransportOperationRow){return overdue(row)||(["planned","booked"].includes(row.status)&&row.operationType==="employee_trip"&&!row.departureIso)||Boolean(row.paymentDue&&!row.lastPaymentDate&&row.amount);}
function statusTone(status:string){return status==="completed"?"good" as const:status==="cancelled"?"neutral" as const:status==="in_transit"?"info" as const:"warn" as const}

export function TransportWorkspace({rows,options,partners,canManage,demo}:{rows:TransportOperationRow[];options:OperationsReferenceData;partners:SupplyPartnerRow[];canManage:boolean;demo:boolean}){
  const [view,setView]=useState<View>("employee_trip");
  const [query,setQuery]=useState("");
  const [manager,setManager]=useState("all");
  const [objectId,setObjectId]=useState("all");
  const [show,setShow]=useState(false);
  const [operationType,setOperationType]=useState<"employee_trip"|"hired_transport">("employee_trip");
  const [formObject,setFormObject]=useState(options.objects[0]?.id??"");
  const [workerId,setWorkerId]=useState("");
  const [partnerId,setPartnerId]=useState("");
  const [transportKind,setTransportKind]=useState("train");
  const [routeFrom,setRouteFrom]=useState("");
  const [routeTo,setRouteTo]=useState("");
  const [departureAt,setDepartureAt]=useState("");
  const [arrivalAt,setArrivalAt]=useState("");
  const [scheduleText,setScheduleText]=useState("");
  const [capacity,setCapacity]=useState("");
  const [paymentModel,setPaymentModel]=useState("ticket");
  const [amount,setAmount]=useState("");
  const [paymentDue,setPaymentDue]=useState("");
  const [notes,setNotes]=useState("");
  const [paymentRow,setPaymentRow]=useState<TransportOperationRow|null>(null);
  const [paymentAmount,setPaymentAmount]=useState("");
  const [paymentDate,setPaymentDate]=useState(new Date().toISOString().slice(0,10));
  const [paymentPrepaidUntil,setPaymentPrepaidUntil]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const managers=useMemo(()=>[...new Map(options.objects.map(row=>[row.ownerUserId??"unassigned",row.ownerName??"Менеджер не назначен"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[options.objects]);
  const visibleObjects=useMemo(()=>options.objects.filter(row=>manager==="all"||(row.ownerUserId??"unassigned")===manager),[options.objects,manager]);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase("ru");
    return rows.filter(row=>{
      if(view==="attention"&&!needsAttention(row))return false;
      if(view!=="attention"&&row.operationType!==view)return false;
      if(manager!=="all"&&(row.managerId??"unassigned")!==manager)return false;
      if(objectId!=="all"&&row.objectId!==objectId)return false;
      if(needle&&![row.worker,row.object,row.partner,row.routeFrom,row.routeTo,row.scheduleText].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(needle))return false;
      return true;
    });
  },[rows,view,manager,objectId,query]);
  const trips=rows.filter(row=>row.operationType==="employee_trip"&&!["completed","cancelled"].includes(row.status)).length;
  const hired=rows.filter(row=>row.operationType==="hired_transport"&&!["completed","cancelled"].includes(row.status)).length;
  const attention=rows.filter(needsAttention).length;
  const monthly=rows.filter(row=>row.paymentModel==="month"&&row.status!=="cancelled").reduce((sum,row)=>sum+Number(row.amount??0),0);

  async function save(){
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме транспорт не сохраняется");return;}
      const response=await fetch("/api/supply/transport",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        operationType,objectId:formObject||null,workerId:operationType==="employee_trip"?workerId||null:null,partnerId:partnerId||null,transportKind,
        routeFrom:routeFrom||null,routeTo:routeTo||null,departureAt:departureAt?new Date(departureAt).toISOString():null,arrivalAt:arrivalAt?new Date(arrivalAt).toISOString():null,
        scheduleText:scheduleText||null,capacity:capacity?Number(capacity):null,paymentModel:paymentModel||null,amount:amount?Number(amount):null,paymentDue:paymentDue||null,notes:notes||null,
      })});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить транспорт");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить транспорт");}finally{setBusy(false);}
  }
  async function patch(body:unknown){
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме изменения не сохраняются");return;}
      const response=await fetch("/api/supply/transport",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось изменить транспорт");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить транспорт");}finally{setBusy(false);}
  }
  function openCreate(type:"employee_trip"|"hired_transport"){setOperationType(type);setView(type);setShow(true)}
  function openPayment(row:TransportOperationRow){setPaymentRow(row);setPaymentAmount(String(row.amount??""));setPaymentPrepaidUntil("");}
  function nextStatus(row:TransportOperationRow){
    if(row.status==="planned")return {status:"booked" as const,label:"Забронировано"};
    if(row.status==="booked")return {status:"in_transit" as const,label:"В пути"};
    if(row.status==="in_transit")return {status:"completed" as const,label:"Завершить"};
    return null;
  }

  return <div className="transport-workspace">
    <div className="metrics-grid supply-portfolio-metrics">
      <div className="metric"><span>Поездки сотрудников</span><strong>{trips}</strong><small>планируются или забронированы</small></div>
      <div className="metric"><span>Заказной транспорт</span><strong>{hired}</strong><small>активные маршруты и рейсы</small></div>
      <div className={"metric "+(attention?"tone-warn":"tone-good")}><span>Требуют внимания</span><strong>{attention}</strong><small>оплаты, даты и бронирования</small></div>
      <div className="metric"><span>Регулярно / месяц</span><strong>{rub(monthly)}</strong><small>по месячной модели оплаты</small></div>
    </div>
    <div className="object-local-tabs supply-portfolio-tabs" role="tablist" aria-label="Транспорт">
      <button className={view==="employee_trip"?"active":""} onClick={()=>setView("employee_trip")}>Поездки сотрудников</button>
      <button className={view==="hired_transport"?"active":""} onClick={()=>setView("hired_transport")}>Заказной транспорт</button>
      <button className={view==="attention"?"active":""} onClick={()=>setView("attention")}>Требует внимания <span>{attention}</span></button>
    </div>
    <div className="personnel-portfolio-toolbar supply-portfolio-toolbar">
      <div className="personnel-portfolio-filters"><SalesSearch value={query} onChange={setQuery} placeholder="Сотрудник, объект, маршрут, подрядчик"/><select value={manager} onChange={e=>{setManager(e.target.value);setObjectId("all")}}><option value="all">Все менеджеры</option>{managers.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select><select value={objectId} onChange={e=>setObjectId(e.target.value)}><option value="all">Все объекты</option>{visibleObjects.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
      {canManage&&<div className="candidate-directory-buttons"><button className="button" onClick={()=>openCreate("employee_trip")}><Plus size={14}/> Поездка сотрудника</button><button className="button primary" onClick={()=>openCreate("hired_transport")}><Plus size={14}/> Заказной транспорт</button></div>}
    </div>
    <section className="section section-flush"><div className="request-table-wrap"><table className="data-table transport-portfolio-table">
      <thead><tr><th>{view==="hired_transport"?"Маршрут / услуга":"Сотрудник / маршрут"}</th><th>Менеджер</th><th>Объект</th><th>Подрядчик</th><th>Когда / график</th><th>Оплата</th><th>Оплачено / до</th><th>Статус</th>{canManage&&<th>Действия</th>}</tr></thead>
      <tbody>{filtered.map(row=><tr key={row.id} className={needsAttention(row)?"row-attention":""}>
        <td><strong className="cell-title">{row.operationType==="employee_trip"?(row.worker??"Сотрудник не указан"):(kindLabels[row.transportKind]??row.transportKind)}</strong><span className="cell-sub">{[row.routeFrom,row.routeTo].filter(Boolean).join(" → ")||"Маршрут не указан"}</span></td>
        <td>{row.manager??"—"}</td><td>{row.object??"—"}</td><td>{row.partner??"—"}</td>
        <td>{row.departureAt??row.scheduleText??"—"}{row.arrivalAt&&<span className="cell-sub">прибытие {row.arrivalAt}</span>}</td>
        <td>{row.amount==null?"—":rub(row.amount)}<span className="cell-sub">{row.paymentModel?paymentLabels[row.paymentModel]??row.paymentModel:""}</span>{row.paymentDue&&<span className="cell-sub">срок {row.paymentDue}</span>}</td>
        <td>{row.lastPaymentAmount!=null?rub(row.lastPaymentAmount):"—"}{row.lastPaymentDate&&<span className="cell-sub">{row.lastPaymentDate}</span>}{row.prepaidUntil&&<span className="cell-sub">оплачено до {row.prepaidUntil}</span>}</td>
        <td><Status tone={needsAttention(row)?"warn":statusTone(row.status)}>{needsAttention(row)?"Проверить":statusLabels[row.status]??row.status}</Status></td>
        {canManage&&<td><div className="page-actions">{nextStatus(row)&&<button className="button" disabled={busy} onClick={()=>void patch({action:"status",id:row.id,status:nextStatus(row)!.status})}>{nextStatus(row)!.label}</button>}{row.objectId&&row.amount!=null&&row.status!=="cancelled"&&<button className="button" disabled={busy} onClick={()=>openPayment(row)}>Оплата</button>}</div></td>}
      </tr>)}</tbody>
    </table>{!filtered.length&&<div className="empty-inline">Транспортных операций по выбранным фильтрам нет.</div>}</div></section>

    {paymentRow&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setPaymentRow(null)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Оплата транспорта</h2><p>{[paymentRow.partner,paymentRow.routeFrom&&paymentRow.routeTo?paymentRow.routeFrom+" → "+paymentRow.routeTo:null].filter(Boolean).join(" · ")}. Расход будет связан с объектом.</p></div><button className="icon-button" onClick={()=>setPaymentRow(null)}><X size={17}/></button></div>
      <div className="candidate-import-body"><div className="candidate-import-options"><label>Сумма<input type="number" min="0.01" value={paymentAmount} onChange={e=>setPaymentAmount(e.target.value)}/></label><label>Дата оплаты<input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)}/></label><label>Оплачено до<input type="date" value={paymentPrepaidUntil} onChange={e=>setPaymentPrepaidUntil(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setPaymentRow(null)}>Отмена</button><button className="button primary" disabled={busy||!paymentAmount||!paymentDate} onClick={()=>void patch({action:"record_payment",id:paymentRow.id,amount:Number(paymentAmount),paymentDate,prepaidUntil:paymentPrepaidUntil||null})}>{busy?"Сохраняю…":"Зафиксировать оплату"}</button></div>
    </div></div></Portal>}

    {show&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShow(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>{operationType==="employee_trip"?"Поездка сотрудника":"Заказной транспорт"}</h2><p>{operationType==="employee_trip"?"Билет, компенсация или трансфер сотрудника.":"Регулярная развозка, автобус, такси или грузовая перевозка."}</p></div><button className="icon-button" onClick={()=>setShow(false)}><X size={17}/></button></div>
      <div className="candidate-import-body"><div className="candidate-import-options">
        <label>Объект<select value={formObject} onChange={e=>setFormObject(e.target.value)}><option value="">Не указан</option>{options.objects.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        {operationType==="employee_trip"&&<label>Сотрудник<select value={workerId} onChange={e=>setWorkerId(e.target.value)}><option value="">Выберите</option>{options.workers.map(row=><option key={row.id} value={row.id}>{row.fullName}{row.object?" · "+row.object:""}</option>)}</select></label>}
        <label>Подрядчик<select value={partnerId} onChange={e=>setPartnerId(e.target.value)}><option value="">Не указан</option>{partners.filter(row=>row.categories.some(value=>["transport","travel_tickets"].includes(value))).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label>Тип<select value={transportKind} onChange={e=>setTransportKind(e.target.value)}>{Object.entries(kindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Откуда<input value={routeFrom} onChange={e=>setRouteFrom(e.target.value)}/></label><label>Куда<input value={routeTo} onChange={e=>setRouteTo(e.target.value)}/></label>
        {operationType==="employee_trip"?<><label>Отправление<input type="datetime-local" value={departureAt} onChange={e=>setDepartureAt(e.target.value)}/></label><label>Прибытие<input type="datetime-local" value={arrivalAt} onChange={e=>setArrivalAt(e.target.value)}/></label></>:<><label>График<input value={scheduleText} onChange={e=>setScheduleText(e.target.value)} placeholder="Ежедневно 06:45 / 20:15"/></label><label>Мест<input type="number" min="1" value={capacity} onChange={e=>setCapacity(e.target.value)}/></label></>}
        <label>Модель оплаты<select value={paymentModel} onChange={e=>setPaymentModel(e.target.value)}>{Object.entries(paymentLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        <label>Стоимость<input type="number" min="0" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Оплатить до<input type="date" value={paymentDue} onChange={e=>setPaymentDue(e.target.value)}/></label>
      </div><label>Комментарий<textarea value={notes} onChange={e=>setNotes(e.target.value)}/></label>{error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" disabled={busy||(operationType==="employee_trip"&&!workerId)||(operationType==="hired_transport"&&!formObject)} onClick={()=>void save()}>{busy?"Сохраняю…":"Создать"}</button></div>
    </div></div></Portal>}
  </div>;
}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
