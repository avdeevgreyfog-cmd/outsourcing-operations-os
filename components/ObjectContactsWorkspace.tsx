"use client";

import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import type { ClientContactOption, ObjectContactRow } from "@/lib/operations/service";
import { Empty } from "@/components/UI";

const roleLabels:Record<string,string>={
  operations:"Операционные вопросы",
  timesheet:"Табель",
  security:"СБ / пропуска",
  warehouse_ppe:"Склад / СИЗ",
  documents:"Документы",
  finance:"Финансы",
  approval:"Согласования",
  contract_signer:"Подписание договора",
  closing_signer:"Подписание закрывающих",
  other:"Другое",
};
const roleOptions=Object.entries(roleLabels);

type FormState={
  contactId:string;fullName:string;position:string;phone:string;email:string;telegram:string;whatsapp:string;maxContact:string;
  preferredChannel:string;roles:string[];note:string;
};
const blank=():FormState=>({contactId:"",fullName:"",position:"",phone:"",email:"",telegram:"",whatsapp:"",maxContact:"",preferredChannel:"phone",roles:["operations"],note:""});

export function ObjectContactsWorkspace({
  objectId,assigned,contacts,canEdit,demo,
}:{
  objectId:string;assigned:ObjectContactRow[];contacts:ClientContactOption[];canEdit:boolean;demo:boolean;
}){
  const [rows,setRows]=useState(assigned);
  const [show,setShow]=useState(false);
  const [form,setForm]=useState<FormState>(blank);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const assignedIds=useMemo(()=>new Set(rows.map(row=>row.contactId)),[rows]);
  const available=contacts.filter(row=>!assignedIds.has(row.id));

  function selectContact(contactId:string){
    const contact=contacts.find(row=>row.id===contactId);
    if(!contact){setForm(current=>({...current,contactId:""}));return;}
    setForm(current=>({...current,contactId:contact.id,fullName:contact.fullName,position:contact.position??"",phone:contact.phone??"",email:contact.email??"",telegram:contact.telegram??"",whatsapp:contact.whatsapp??"",maxContact:contact.maxContact??"",preferredChannel:contact.preferredChannel??"phone"}));
  }
  function toggleRole(role:string){
    setForm(current=>({...current,roles:current.roles.includes(role)?current.roles.filter(item=>item!==role):[...current.roles,role]}));
  }
  async function save(){
    if(!form.roles.length){setError("Укажите хотя бы одну роль контакта.");return;}
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме контакты доступны только для просмотра.");return;}
      const response=await fetch("/api/objects/"+objectId+"/contacts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        contactId:form.contactId||null,fullName:form.fullName||null,position:form.position||null,phone:form.phone||null,email:form.email||null,
        telegram:form.telegram||null,whatsapp:form.whatsapp||null,maxContact:form.maxContact||null,preferredChannel:form.preferredChannel||null,
        roles:form.roles,note:form.note||null,
      })});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось сохранить контакт");
      window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить контакт");}
    finally{setBusy(false);}
  }
  async function remove(row:ObjectContactRow){
    if(demo)return;
    if(!window.confirm("Отвязать контакт от объекта? Сам контакт клиента останется в базе."))return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/objects/"+objectId+"/contacts",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({assignmentId:row.assignmentId})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось отвязать контакт");
      setRows(current=>current.filter(item=>item.assignmentId!==row.assignmentId));
    }catch(e){setError(e instanceof Error?e.message:"Не удалось отвязать контакт");}
    finally{setBusy(false);}
  }

  return <>
    <section className="section section-flush">
      <div className="section-head"><div><h2>Контакты объекта</h2><p>Контакты заказчика с конкретной зоной ответственности на этом объекте.</p></div>{canEdit&&<button className="button primary" onClick={()=>{setForm(blank());setError("");setShow(true)}}><Plus size={14}/> Добавить контакт</button>}</div>
      {error&&<div className="recruiting-error">{error}</div>}
      {rows.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Контакт</th><th>Роль на объекте</th><th>Связь</th><th>Комментарий</th>{canEdit&&<th aria-label="Действия"></th>}</tr></thead><tbody>{rows.map(row=><tr key={row.assignmentId}>
        <td><strong className="cell-title">{row.fullName}</strong><span className="cell-sub">{row.position??"Должность не указана"}</span></td>
        <td>{row.roles.map(role=>roleLabels[role]??role).join(" · ")}</td>
        <td><strong>{primaryContact(row)}</strong><span className="cell-sub">{secondaryContact(row)}</span></td>
        <td>{row.note??"—"}</td>
        {canEdit&&<td><button className="icon-button" type="button" aria-label={"Отвязать "+row.fullName} disabled={busy||demo} onClick={()=>void remove(row)}><Trash2 size={14}/></button></td>}
      </tr>)}</tbody></table></div>:<Empty title="Контакты не назначены" text="Добавьте контакт заказчика и укажите, за какие вопросы он отвечает на объекте."/>}
    </section>

    {show&&<Portal><div className="recruiting-modal" onMouseDown={event=>{if(event.currentTarget===event.target)setShow(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>Контакт объекта</h2><p>Можно выбрать существующий контакт клиента или создать новый. Один контакт может использоваться на нескольких объектах.</p></div><button className="icon-button" type="button" onClick={()=>setShow(false)}><X size={17}/></button></div>
      <div className="candidate-import-body">
        {error&&<div className="recruiting-error">{error}</div>}
        <div className="candidate-import-options">
          <label>Контакт клиента<select value={form.contactId} onChange={event=>selectContact(event.target.value)}><option value="">Новый контакт</option>{available.map(item=><option key={item.id} value={item.id}>{item.fullName}{item.position?" · "+item.position:""}</option>)}</select></label>
          <label>ФИО<input value={form.fullName} onChange={event=>setForm(current=>({...current,fullName:event.target.value}))} placeholder="Иванов Иван Иванович"/></label>
          <label>Должность<input value={form.position} onChange={event=>setForm(current=>({...current,position:event.target.value}))} placeholder="Начальник участка"/></label>
          <label>Телефон<input value={form.phone} onChange={event=>setForm(current=>({...current,phone:event.target.value}))} placeholder="+7 ..."/></label>
          <label>Email<input type="email" value={form.email} onChange={event=>setForm(current=>({...current,email:event.target.value}))}/></label>
          <label>Telegram<input value={form.telegram} onChange={event=>setForm(current=>({...current,telegram:event.target.value}))} placeholder="@username"/></label>
          <label>WhatsApp<input value={form.whatsapp} onChange={event=>setForm(current=>({...current,whatsapp:event.target.value}))}/></label>
          <label>MAX<input value={form.maxContact} onChange={event=>setForm(current=>({...current,maxContact:event.target.value}))}/></label>
          <label>Предпочтительный канал<select value={form.preferredChannel} onChange={event=>setForm(current=>({...current,preferredChannel:event.target.value}))}><option value="phone">Телефон</option><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="max">MAX</option><option value="email">Email</option><option value="other">Другой</option></select></label>
        </div>
        <fieldset style={{border:0,padding:0,margin:"14px 0"}}><legend style={{fontWeight:600,marginBottom:8}}>Зона ответственности на объекте</legend><div style={{display:"flex",flexWrap:"wrap",gap:"8px 14px"}}>{roleOptions.map(([value,label])=><label key={value} style={{display:"flex",gap:6,alignItems:"center"}}><input type="checkbox" checked={form.roles.includes(value)} onChange={()=>toggleRole(value)}/>{label}</label>)}</div></fieldset>
        <label>Комментарий<textarea value={form.note} onChange={event=>setForm(current=>({...current,note:event.target.value}))} placeholder="Например, присылает табель до 10:00, по пропускам писать в Telegram"/></label>
      </div>
      <div className="recruiting-modal-footer"><button className="button" type="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" type="button" disabled={busy||(!form.contactId&&!form.fullName.trim())||!form.roles.length} onClick={()=>void save()}>{busy?"Сохраняю…":"Сохранить"}</button></div>
    </div></div></Portal>}
  </>;
}

function primaryContact(row:ObjectContactRow){
  if(row.preferredChannel==="telegram"&&row.telegram)return "Telegram: "+row.telegram;
  if(row.preferredChannel==="whatsapp"&&row.whatsapp)return "WhatsApp: "+row.whatsapp;
  if(row.preferredChannel==="max"&&row.maxContact)return "MAX: "+row.maxContact;
  if(row.preferredChannel==="email"&&row.email)return row.email;
  return row.phone??row.telegram??row.whatsapp??row.email??row.maxContact??"—";
}
function secondaryContact(row:ObjectContactRow){
  const values=[row.phone,row.telegram,row.whatsapp,row.email,row.maxContact].filter(Boolean).filter(value=>!primaryContact(row).includes(String(value)));
  return values.slice(0,2).join(" · ");
}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
