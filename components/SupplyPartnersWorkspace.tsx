"use client";

import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { Status } from "@/components/UI";
import { SalesSearch } from "@/components/sales/SalesUI";
import type { SupplyPartnerRow } from "@/lib/operations/supply-control";
import { rub } from "@/lib/ui/format";

const categoryLabels:Record<string,string>={housing:"Жильё",transport:"Транспорт",workwear_ppe:"Спецодежда и СИЗ",tools_equipment:"Инструмент и оборудование",medicine:"Медицина",travel_tickets:"Проезд и билеты",food:"Питание",services:"Услуги",other:"Другое"};

export function SupplyPartnersWorkspace({rows,canManage,demo}:{rows:SupplyPartnerRow[];canManage:boolean;demo:boolean}){
  const [query,setQuery]=useState("");
  const [category,setCategory]=useState("all");
  const [show,setShow]=useState(false);
  const [name,setName]=useState("");
  const [legalName,setLegalName]=useState("");
  const [contactName,setContactName]=useState("");
  const [phone,setPhone]=useState("");
  const [email,setEmail]=useState("");
  const [paymentTerms,setPaymentTerms]=useState("");
  const [categories,setCategories]=useState<string[]>(["services"]);
  const [servicePartner,setServicePartner]=useState<SupplyPartnerRow|null>(null);
  const [serviceName,setServiceName]=useState("");
  const [serviceCategory,setServiceCategory]=useState("services");
  const [serviceUnit,setServiceUnit]=useState("");
  const [servicePrice,setServicePrice]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase("ru");
    return rows.filter(row=>(category==="all"||row.categories.includes(category))&&(!needle||[row.name,row.legalName,row.contactName,row.phone,row.email,row.paymentTerms,...row.services.map(item=>item.serviceName)].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(needle)));
  },[rows,query,category]);
  const active=rows.filter(row=>row.status==="active").length;
  const services=rows.reduce((sum,row)=>sum+row.services.length,0);
  const withContracts=rows.filter(row=>row.paymentTerms).length;

  async function save(){
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме организация не сохраняется");return;}
      const response=await fetch("/api/suppliers",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,legalName:legalName||null,categories,contactName:contactName||null,phone:phone||null,email:email||null,paymentTerms:paymentTerms||null})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось создать организацию");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось создать организацию");}finally{setBusy(false);}
  }
  async function saveService(){
    if(!servicePartner)return;
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме услуга не сохраняется");return;}
      const response=await fetch("/api/suppliers",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({partnerId:servicePartner.id,category:serviceCategory,serviceName,unit:serviceUnit||null,price:servicePrice?Number(servicePrice):null})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось добавить услугу");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось добавить услугу");}finally{setBusy(false);}
  }
  function toggleCategory(value:string){setCategories(current=>current.includes(value)?current.filter(item=>item!==value):[...current,value])}

  return <div className="supply-partners-workspace">
    <div className="metrics-grid supply-portfolio-metrics">
      <div className="metric"><span>Активные организации</span><strong>{active}</strong><small>поставщики и подрядчики</small></div>
      <div className="metric"><span>Услуги и позиции</span><strong>{services}</strong><small>зафиксировано в справочнике</small></div>
      <div className="metric"><span>С условиями оплаты</span><strong>{withContracts}</strong><small>условия внесены в карточку</small></div>
      <div className="metric"><span>Категорий</span><strong>{new Set(rows.flatMap(row=>row.categories)).size}</strong><small>направлений обеспечения</small></div>
    </div>
    <div className="personnel-portfolio-toolbar supply-portfolio-toolbar">
      <div className="personnel-portfolio-filters">
        <SalesSearch value={query} onChange={setQuery} placeholder="Организация, контакт, услуга"/>
        <select value={category} onChange={e=>setCategory(e.target.value)} aria-label="Категория"><option value="all">Все категории</option>{Object.entries(categoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      </div>
      {canManage&&<button className="button primary" type="button" onClick={()=>setShow(true)}><Plus size={14}/> Добавить организацию</button>}
    </div>
    <section className="section section-flush"><div className="request-table-wrap"><table className="data-table supply-partners-table">
      <thead><tr><th>Организация</th><th>Категории</th><th>Услуги / цены</th><th>Контакт</th><th>Условия оплаты</th><th>Ответственный</th><th>Статус</th>{canManage&&<th>Действие</th>}</tr></thead>
      <tbody>{filtered.map(row=><tr key={row.id}>
        <td><strong className="cell-title">{row.name}</strong><span className="cell-sub">{row.legalName??row.taxId??"Юр. данные не заполнены"}</span></td>
        <td><div className="supply-chip-list">{row.categories.map(value=><Status key={value} tone="neutral">{categoryLabels[value]??value}</Status>)}</div></td>
        <td>{row.services.length?<div className="supply-services-cell">{row.services.slice(0,3).map(item=><span key={item.id}><strong>{item.serviceName}</strong>{item.price!=null&&<small>{rub(item.price)}{item.unit?" / "+item.unit:""}</small>}</span>)}{row.services.length>3&&<small>ещё {row.services.length-3}</small>}</div>:<span className="cell-sub">Не заполнено</span>}</td>
        <td>{row.contactName??"—"}<span className="cell-sub">{[row.phone,row.email].filter(Boolean).join(" · ")||"Контакты не указаны"}</span></td>
        <td>{row.paymentTerms??"—"}</td><td>{row.owner??"—"}</td><td><Status tone={row.status==="active"?"good":"neutral"}>{row.status==="active"?"Активен":"Приостановлен"}</Status></td>{canManage&&<td><button className="button" onClick={()=>{setServicePartner(row);setServiceCategory(row.categories[0]??"services");setServiceName("");setServiceUnit("");setServicePrice("")}}>Добавить услугу</button></td>}
      </tr>)}</tbody>
    </table>{!filtered.length&&<div className="empty-inline">Организации по выбранным фильтрам не найдены.</div>}</div></section>

    {servicePartner&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setServicePartner(null)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Услуга подрядчика</h2><p>{servicePartner.name}. Фиксируем, что предоставляет организация и по какой ориентировочной цене.</p></div><button className="icon-button" onClick={()=>setServicePartner(null)}><X size={17}/></button></div>
      <div className="candidate-import-body"><div className="candidate-import-options"><label>Категория<select value={serviceCategory} onChange={e=>setServiceCategory(e.target.value)}>{Object.entries(categoryLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Услуга / позиция<input value={serviceName} onChange={e=>setServiceName(e.target.value)} placeholder="Медосмотр / автобус 20 мест / койко-место"/></label><label>Единица<input value={serviceUnit} onChange={e=>setServiceUnit(e.target.value)} placeholder="чел., рейс, месяц"/></label><label>Цена<input type="number" min="0" value={servicePrice} onChange={e=>setServicePrice(e.target.value)}/></label></div>{error&&<div className="recruiting-error">{error}</div>}</div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setServicePartner(null)}>Отмена</button><button className="button primary" disabled={busy||!serviceName} onClick={()=>void saveService()}>{busy?"Сохраняю…":"Добавить услугу"}</button></div>
    </div></div></Portal>}

    {show&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShow(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Новая организация</h2><p>Поставщик или подрядчик, который обслуживает контур обеспечения.</p></div><button className="icon-button" onClick={()=>setShow(false)}><X size={17}/></button></div>
      <div className="candidate-import-body">
        <div className="candidate-import-options"><label>Название<input value={name} onChange={e=>setName(e.target.value)}/></label><label>Юридическое название<input value={legalName} onChange={e=>setLegalName(e.target.value)}/></label><label>Контакт<input value={contactName} onChange={e=>setContactName(e.target.value)}/></label><label>Телефон<input value={phone} onChange={e=>setPhone(e.target.value)}/></label><label>Email<input value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Условия оплаты<input value={paymentTerms} onChange={e=>setPaymentTerms(e.target.value)} placeholder="Например: предоплата до 25 числа"/></label></div>
        <div className="supply-category-picker"><span>Категории</span>{Object.entries(categoryLabels).map(([value,label])=><label key={value} className="operations-check"><input type="checkbox" checked={categories.includes(value)} onChange={()=>toggleCategory(value)}/>{label}</label>)}</div>
        {error&&<div className="recruiting-error">{error}</div>}
      </div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" disabled={busy||!name||!categories.length} onClick={()=>void save()}>{busy?"Сохраняю…":"Создать"}</button></div>
    </div></div></Portal>}
  </div>;
}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
