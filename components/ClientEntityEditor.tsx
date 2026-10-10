"use client";

import {useState,useId,type FormEvent,type ReactNode} from "react";
import {useRouter} from "next/navigation";
import {Pencil,Plus,Trash2} from "lucide-react";
import {SalesEditSection,useUnsavedChanges} from "@/components/sales/SalesEditSection";
import {loadDemoClientSnapshot,saveDemoClientSnapshot} from "@/components/sales/DemoClientPreview";
import {SalesDrawer} from "@/components/sales/SalesUI";
import type {ClientContactRow,ClientEditOptions,ClientRow} from "@/lib/data/service";

const statusOptions=[
  ["active","Активен"],
  ["inactive","Неактивен"],
  ["blocked","Заблокирован"],
  ["archived","Архив"],
] as const;
const channelOptions=[
  ["","Не выбран"],
  ["phone","Телефон"],
  ["email","Эл. почта"],
  ["telegram","Telegram"],
  ["whatsapp","WhatsApp"],
  ["max","MAX"],
] as const;

export function ClientEditButton({client,options}:{client:ClientRow;options:ClientEditOptions}){
  const [open,setOpen]=useState(false);
  return <>
    <button className="button" type="button" onClick={()=>setOpen(true)}><Pencil size={15}/> Редактировать</button>
    {open&&<ClientEditDrawer client={client} options={options} onClose={()=>setOpen(false)}/>}
  </>;
}

export type ClientEditSection="quick"|"details"|"notes"|"responsibility"|"all";
export function ClientEditDrawer({client,options,onClose,onSaved,section="quick",inline=false,demoScope}:{client:ClientRow;options:ClientEditOptions;onClose:()=>void;onSaved?:()=>void;section?:ClientEditSection;inline?:boolean;demoScope?:string}){
  const router=useRouter();const formId=useId();const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [dirty,setDirty]=useState(false);const canLeave=useUnsavedChanges(dirty);
  const show=(...sections:ClientEditSection[])=>section==="all"||sections.includes(section);
  function cancel(){if(!busy&&canLeave())onClose();}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;const fd=new FormData(event.currentTarget);
    const value=(key:string,previous:string|null|undefined)=>fd.has(key)?String(fd.get(key)??"").trim()||null:previous??null;
    const body={name:value("name",client.name)??"",status:value("status",client.status)??"active",legalName:value("legalName",client.legalName),inn:value("inn",client.inn),notes:value("notes",client.notes),...(options.canAssign?{ownerUserId:value("ownerUserId",client.ownerUserId),regionId:value("regionId",client.regionId),teamId:value("teamId",client.teamId)}:{}),expectedUpdatedAt:client.updatedAt};
    if(body.status==="archived"&&client.status!=="archived"&&!window.confirm("Переместить клиента в архив? Связанные заявки и объекты сохранятся."))return;
    setBusy(true);setError("");
    try{
      if(demoScope){const previous=loadDemoClientSnapshot(demoScope,client.id);if(previous?.updatedAt&&previous.updatedAt!==client.updatedAt)throw new Error("Клиент уже изменён. Обновите карточку перед сохранением.");const next={...client,...body,ownerUserId:options.canAssign?body.ownerUserId??undefined:client.ownerUserId,regionId:options.canAssign?body.regionId??undefined:client.regionId,teamId:options.canAssign?body.teamId??undefined:client.teamId,updatedAt:new Date().toISOString(),ownerName:options.canAssign&&body.ownerUserId===null?null:options.members.find(x=>x.id===body.ownerUserId)?.name??client.ownerName,region:options.canAssign&&body.regionId===null?null:options.regions.find(x=>x.id===body.regionId)?.name??client.region,teamName:options.canAssign&&body.teamId===null?null:options.teams.find(x=>x.id===body.teamId)?.name??client.teamName};if(!saveDemoClientSnapshot(demoScope,next,true))throw new Error("Не удалось сохранить изменения в браузере");}
      else{const response=await fetch(`/api/clients/${client.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(body)});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить клиента");}
      setDirty(false);(onSaved??onClose)();router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось сохранить клиента");}finally{setBusy(false);}
  }
  const footer=<><button className="button" type="button" disabled={busy} onClick={cancel}>Отмена</button><button className="button primary" type="submit" form={formId} disabled={busy||!dirty}>{busy?"Сохраняю…":"Сохранить изменения"}</button></>;
  const form=<form id={formId} className="client-create-form client-create-form-unified client-edit-form" onSubmit={submit} onChange={()=>setDirty(true)}><fieldset disabled={busy} className="sales-edit-fieldset">
    {show("quick","details")&&<section className="client-form-section">
      <label><span>Рабочее название <b>*</b></span><input name="name" required minLength={2} maxLength={160} defaultValue={client.name}/></label>
      {show("details")&&<><label><span>Юридическое наименование</span><input name="legalName" maxLength={240} defaultValue={client.legalName??""}/></label><label><span>ИНН</span><input name="inn" maxLength={20} inputMode="numeric" defaultValue={client.inn??""}/></label></>}
      <label><span>Статус</span><select name="status" defaultValue={client.status}>{statusOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
    </section>}
    {show("notes")&&<label><span>Внутренние заметки</span><textarea name="notes" maxLength={5000} defaultValue={client.notes??""}/></label>}
    {options.canAssign&&show("quick","responsibility")&&<section className="client-form-section"><label><span>Ответственный</span><select name="ownerUserId" defaultValue={client.ownerUserId??""}><option value="">Не назначен</option>{client.ownerUserId&&!options.members.some(x=>x.id===client.ownerUserId)&&<option value={client.ownerUserId}>{client.ownerName??"Текущий ответственный"}</option>}{options.members.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label><label><span>Регион</span><select name="regionId" defaultValue={client.regionId??""}><option value="">Не указан</option>{client.regionId&&!options.regions.some(x=>x.id===client.regionId)&&<option value={client.regionId}>{client.region??"Текущий регион"}</option>}{options.regions.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>{show("responsibility")&&<label><span>Команда</span><select name="teamId" defaultValue={client.teamId??""}><option value="">Не назначена</option>{client.teamId&&!options.teams.some(x=>x.id===client.teamId)&&<option value={client.teamId}>{client.teamName??"Текущая команда"}</option>}{options.teams.map(x=><option value={x.id} key={x.id}>{x.name}</option>)}</select></label>}</section>}
    {error&&<div className="form-error" role="alert">{error}</div>}
  </fieldset>{inline&&<div className="sales-edit-footer">{footer}</div>}</form>;
  return inline?form:<SalesDrawer overline="Редактирование" title="Быстрое редактирование клиента" subtitle={client.name} onClose={()=>!busy&&onClose()} footer={footer}>{form}</SalesDrawer>;
}

export function ClientDataSection({title,children,client,options,section,demoScope,canEdit}:{title:string;children:ReactNode;client:ClientRow;options:ClientEditOptions;section:ClientEditSection;demoScope?:string;canEdit:boolean}){
  return <SalesEditSection title={title} canEdit={canEdit} editor={(done,cancel)=><ClientEditDrawer client={client} options={options} section={section} inline demoScope={demoScope} onClose={cancel} onSaved={done}/>}>{children}</SalesEditSection>;
}
export function ClientContactEditButton({clientId,contact,demoClient,demoScope,contacts=[]}:{clientId:string;contact?:ClientContactRow;demoClient?:ClientRow;demoScope?:string;contacts?:ClientContactRow[]}){
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const editing=Boolean(contact);
  const [dirty,setDirty]=useState(false);const canLeave=useUnsavedChanges(open&&dirty);
  function cancel(){if(!busy&&canLeave()){setDirty(false);setOpen(false);}}
  function saveDemoContacts(next:ClientContactRow[]){if(!demoScope||!demoClient)return;const current=loadDemoClientSnapshot(demoScope,clientId)??demoClient;const first=next[0];if(!saveDemoClientSnapshot(demoScope,{...current,contactRows:next,contacts:next.length,primaryContactName:first?.fullName??null,primaryContactPhone:first?.phone??null,primaryContactEmail:first?.email??null,updatedAt:new Date().toISOString()} as ClientRow,true))throw new Error("Не удалось сохранить контакт в браузере");}


  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;
    const fd=new FormData(event.currentTarget);
    const payload={
      fullName:String(fd.get("fullName")??"").trim(),
      position:String(fd.get("position")??"").trim()||null,
      phone:String(fd.get("phone")??"").trim()||null,
      email:String(fd.get("email")??"").trim()||null,
      telegram:String(fd.get("telegram")??"").trim()||null,
      whatsapp:String(fd.get("whatsapp")??"").trim()||null,
      maxContact:String(fd.get("maxContact")??"").trim()||null,
      preferredChannel:String(fd.get("preferredChannel")??"")||null,
    };
    setBusy(true);setError("");
    try{
      if(demoScope&&demoClient){const updated:ClientContactRow={...(contact??{...demoClient,id:crypto.randomUUID(),clientId,objectAssignments:[]}),...payload};saveDemoContacts(editing?contacts.map(x=>x.id===contact!.id?updated:x):[...contacts,updated]);setDirty(false);setOpen(false);return;}
      const response=await fetch(editing?`/api/clients/${clientId}/contacts/${contact!.id}`:`/api/clients/${clientId}/contacts`,{
        method:editing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),
      });
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось сохранить контакт");
      setDirty(false);setOpen(false);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось сохранить контакт")}
    finally{setBusy(false)}
  }

  async function remove(){
    if(!contact||busy||!window.confirm(`Удалить контакт «${contact.fullName}»?`))return;
    setBusy(true);setError("");
    try{
      if(demoScope&&demoClient){if(contact.objectAssignments.length)throw new Error("Контакт связан с объектами. Сначала измените назначения.");saveDemoContacts(contacts.filter(x=>x.id!==contact.id));setDirty(false);setOpen(false);return;}
      const response=await fetch(`/api/clients/${clientId}/contacts/${contact.id}`,{method:"DELETE"});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось удалить контакт");
      setOpen(false);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось удалить контакт")}
    finally{setBusy(false)}
  }

  return <>
    {editing?<button className="icon-button client-contact-edit-trigger" type="button" aria-label={`Редактировать контакт: ${contact!.fullName}`} onClick={()=>{setDirty(false);setError("");setOpen(true)}}><Pencil size={15}/></button>
      :<button className="button" type="button" onClick={()=>{setDirty(false);setError("");setOpen(true)}}><Plus size={15}/> Добавить контакт</button>}
    {open&&<SalesDrawer title={editing?"Редактировать контакт":"Добавить контакт"} subtitle="Контакт хранится в карточке клиента и может использоваться в заявках и на объектах." overline="Контакты клиента" onClose={()=>!busy&&setOpen(false)}
      footer={<><button className="button" type="button" disabled={busy} onClick={cancel}>Отмена</button>{editing&&<button className="button client-danger-button" type="button" disabled={busy} onClick={remove}><Trash2 size={14}/> Удалить</button>}<button className="button primary" type="submit" form="client-contact-form" disabled={busy}>{busy?"Сохраняю…":"Сохранить"}</button></>}>
      <form id="client-contact-form" className="client-create-form client-create-form-unified client-contact-edit-form" onSubmit={submit} onChange={()=>setDirty(true)}>
        <section className="client-form-section">
          <div className="client-form-section-head"><strong>Контактные данные</strong><span>Назначение контакта на объекты меняется в карточке объекта.</span></div>
          <label><span>ФИО <b>*</b></span><input name="fullName" aria-label="ФИО *" required minLength={2} maxLength={180} defaultValue={contact?.fullName??""}/></label>
          <label><span>Должность</span><input name="position" maxLength={180} defaultValue={contact?.position??""}/></label>
          <label><span>Телефон</span><input name="phone" type="tel" maxLength={80} defaultValue={contact?.phone??""}/></label>
          <label><span>Эл. почта</span><input name="email" type="email" maxLength={240} defaultValue={contact?.email??""}/></label>
          <label><span>Telegram</span><input name="telegram" maxLength={120} defaultValue={contact?.telegram??""}/></label>
          <label><span>WhatsApp</span><input name="whatsapp" maxLength={120} defaultValue={contact?.whatsapp??""}/></label>
          <label><span>MAX</span><input name="maxContact" maxLength={120} defaultValue={contact?.maxContact??""}/></label>
          <label><span>Предпочтительный канал</span><select name="preferredChannel" defaultValue={contact?.preferredChannel??""}>{channelOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
        </section>
        {contact?.objectAssignments.length?<p className="client-demo-note">Контакт связан с объектами: {contact.objectAssignments.map(item=>item.object).join(", ")}. Удаление будет недоступно, пока связи активны.</p>:null}
        {error&&<div className="form-error client-create-error" role="alert">{error}</div>}
      </form>
    </SalesDrawer>}
  </>;
}
