"use client";

import {createPortal} from "react-dom";
import {useMemo,useState} from "react";
import {Plus,Trash2,X} from "lucide-react";
import type {ClientContactOption,ObjectContactRow} from "@/lib/operations/service";
import {Empty} from "@/components/UI";

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
type Channel="phone"|"email"|"telegram"|"whatsapp"|"max";
const channelLabels:Record<Channel,string>={phone:"Телефон",email:"Email",telegram:"Telegram",whatsapp:"WhatsApp",max:"MAX"};
type Method={id:string;channel:Channel;value:string};

export function ObjectContactsWorkspace({
  objectId,assigned,contacts,canEdit,demo,
}:{
  objectId:string;assigned:ObjectContactRow[];contacts:ClientContactOption[];canEdit:boolean;demo:boolean;
}){
  const [rows,setRows]=useState(assigned);
  const [show,setShow]=useState(false);
  const [mode,setMode]=useState<"existing"|"new">("existing");
  const [contactId,setContactId]=useState("");
  const [fullName,setFullName]=useState("");
  const [position,setPosition]=useState("");
  const [methods,setMethods]=useState<Method[]>([{id:"phone",channel:"phone",value:""}]);
  const [preferred,setPreferred]=useState<Channel>("phone");
  const [roles,setRoles]=useState<string[]>(["operations"]);
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const assignedIds=useMemo(()=>new Set(rows.map(row=>row.contactId)),[rows]);
  const available=contacts.filter(row=>!assignedIds.has(row.id));
  const selected=contacts.find(row=>row.id===contactId)??null;
  const filledMethods=methods.filter(item=>item.value.trim());

  function open(){
    setMode(available.length?"existing":"new");setContactId(available[0]?.id??"");
    setFullName("");setPosition("");setMethods([{id:crypto.randomUUID(),channel:"phone",value:""}]);setPreferred("phone");
    setRoles(["operations"]);setNote("");setError("");setShow(true);
  }
  function switchMode(value:"existing"|"new"){setMode(value);setError("");if(value==="existing")setContactId(available[0]?.id??"")}
  function toggleRole(role:string){setRoles(current=>current.includes(role)?current.filter(item=>item!==role):[...current,role])}
  function addMethod(){
    const used=new Set(methods.map(item=>item.channel));
    const channel=(Object.keys(channelLabels) as Channel[]).find(item=>!used.has(item))??"phone";
    setMethods(current=>[...current,{id:crypto.randomUUID(),channel,value:""}]);
  }
  function patchMethod(id:string,patch:Partial<Method>){
    setMethods(current=>current.map(item=>item.id===id?{...item,...patch}:item));
  }
  function removeMethod(id:string){
    setMethods(current=>{const next=current.filter(item=>item.id!==id);if(!next.some(item=>item.channel===preferred&&item.value.trim()))setPreferred(next.find(item=>item.value.trim())?.channel??"phone");return next});
  }
  async function save(){
    if(!roles.length){setError("Укажите хотя бы одну зону ответственности.");return;}
    if(mode==="existing"&&!contactId){setError("Выберите контакт клиента.");return;}
    if(mode==="new"&&!fullName.trim()){setError("Укажите ФИО.");return;}
    if(mode==="new"&&!filledMethods.length){setError("Добавьте хотя бы один способ связи.");return;}
    setBusy(true);setError("");
    try{
      if(demo){setError("Демо: форма доступна для проверки, сохранение отключено.");return;}
      const values=Object.fromEntries(filledMethods.map(item=>[item.channel,item.value.trim()])) as Partial<Record<Channel,string>>;
      const preferredChannel=filledMethods.some(item=>item.channel===preferred)?preferred:filledMethods[0]?.channel??null;
      const response=await fetch("/api/objects/"+objectId+"/contacts",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(mode==="existing"?{
        contactId,roles,note:note||null,
      }:{
        contactId:null,fullName:fullName.trim(),position:position.trim()||null,
        phone:values.phone??null,email:values.email??null,telegram:values.telegram??null,whatsapp:values.whatsapp??null,maxContact:values.max??null,
        preferredChannel,roles,note:note||null,
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
      <div className="section-head"><div><h2>Контакты объекта</h2><p>Контакты заказчика и их зона ответственности именно на этом объекте.</p></div>{canEdit&&<button className="button primary" onClick={open}><Plus size={14}/> Добавить контакт</button>}</div>
      {error&&!show&&<div className="recruiting-error">{error}</div>}
      {rows.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Контакт</th><th>Роль на объекте</th><th>Связь</th><th>Комментарий</th>{canEdit&&<th aria-label="Действия"></th>}</tr></thead><tbody>{rows.map(row=><tr key={row.assignmentId}>
        <td><strong className="cell-title">{row.fullName}</strong><span className="cell-sub">{row.position??"Должность не указана"}</span></td>
        <td>{row.roles.map(role=>roleLabels[role]??role).join(" · ")}</td>
        <td><strong>{primaryContact(row)}</strong><span className="cell-sub">{secondaryContact(row)}</span></td>
        <td>{row.note??"—"}</td>
        {canEdit&&<td><button className="icon-button" type="button" aria-label={"Отвязать "+row.fullName} disabled={busy||demo} onClick={()=>void remove(row)}><Trash2 size={14}/></button></td>}
      </tr>)}</tbody></table></div>:<Empty title="Контакты не назначены" text="Добавьте контакт заказчика и укажите, за какие вопросы он отвечает на объекте."/>}
    </section>

    {show&&<Portal><div className="object-contact-drawer-overlay" onMouseDown={event=>{if(event.currentTarget===event.target)setShow(false)}}>
      <aside className="object-contact-drawer" role="dialog" aria-modal="true" aria-label="Контакт объекта">
        <header className="object-contact-drawer-head"><div><h2>Контакт объекта</h2><p>Контакт клиента хранится один раз; здесь задаётся только его роль на объекте.</p></div><button className="icon-button" type="button" onClick={()=>setShow(false)}><X size={17}/></button></header>
        <div className="object-contact-drawer-body">
          <div className="object-action-choice object-contact-mode"><button type="button" className={mode==="existing"?"active":""} onClick={()=>switchMode("existing")} disabled={!available.length}>Выбрать существующий</button><button type="button" className={mode==="new"?"active":""} onClick={()=>switchMode("new")}>Создать новый</button></div>

          {mode==="existing"?<section className="object-contact-form-section">
            <label>Контакт клиента<select value={contactId} onChange={event=>setContactId(event.target.value)}><option value="">Выберите</option>{available.map(item=><option key={item.id} value={item.id}>{item.fullName}{item.position?" · "+item.position:""}</option>)}</select></label>
            {selected&&<div className="object-contact-preview"><strong>{selected.fullName}</strong><span>{selected.position??"Должность не указана"}</span><div>{contactValues(selected).map(value=><small key={value}>{value}</small>)}</div></div>}
          </section>:<section className="object-contact-form-section">
            <div className="candidate-import-options object-contact-identity"><label>ФИО<input value={fullName} onChange={event=>setFullName(event.target.value)} placeholder="Иванов Иван Иванович"/></label><label>Должность<input value={position} onChange={event=>setPosition(event.target.value)} placeholder="Начальник участка"/></label></div>
            <div className="object-contact-methods">
              <div className="object-contact-methods-head"><div><strong>Способы связи</strong><span>Добавляйте только те каналы, которыми контакт реально пользуется.</span></div><button className="button" type="button" onClick={addMethod}><Plus size={14}/> Добавить</button></div>
              {methods.map(method=><div className="object-contact-method-row" key={method.id}>
                <select value={method.channel} onChange={event=>patchMethod(method.id,{channel:event.target.value as Channel})}>{Object.entries(channelLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
                <input type={method.channel==="email"?"email":"text"} value={method.value} onChange={event=>patchMethod(method.id,{value:event.target.value})} placeholder={method.channel==="phone"?"+7 ...":method.channel==="email"?"mail@company.ru":method.channel==="telegram"?"@username":"Номер / контакт"}/>
                <button className="icon-button" type="button" aria-label="Удалить способ связи" onClick={()=>removeMethod(method.id)}><Trash2 size={14}/></button>
              </div>)}
              {filledMethods.length>0&&<label>Предпочтительный канал<select value={preferred} onChange={event=>setPreferred(event.target.value as Channel)}>{filledMethods.map(method=><option key={method.id} value={method.channel}>{channelLabels[method.channel]}</option>)}</select></label>}
            </div>
          </section>}

          <section className="object-contact-form-section"><div className="object-contact-section-title"><strong>Зона ответственности на объекте</strong><span>Можно выбрать несколько направлений.</span></div><div className="object-contact-role-grid">{roleOptions.map(([value,label])=><label className={roles.includes(value)?"active":""} key={value}><input type="checkbox" checked={roles.includes(value)} onChange={()=>toggleRole(value)}/><span>{label}</span></label>)}</div></section>
          <section className="object-contact-form-section"><label>Комментарий<textarea value={note} onChange={event=>setNote(event.target.value)} placeholder="Например: табель присылает до 10:00, по пропускам писать в Telegram"/></label></section>
          {error&&<div className="recruiting-error">{error}</div>}
        </div>
        <footer className="object-contact-drawer-footer"><button className="button" type="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" type="button" disabled={busy||!roles.length||(mode==="existing"?!contactId:!fullName.trim()||!filledMethods.length)} onClick={()=>void save()}>{busy?"Сохраняю…":"Добавить контакт"}</button></footer>
      </aside>
    </div></Portal>}
  </>;
}

function contactValues(contact:ClientContactOption){
  return [contact.phone,contact.email,contact.telegram,contact.whatsapp,contact.maxContact].filter((value):value is string=>Boolean(value));
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
