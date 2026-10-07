"use client";

import {useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {Pencil,Plus,Trash2} from "lucide-react";
import {SalesDrawer} from "@/components/sales/SalesUI";
import type {ClientContactRow,ClientEditOptions,ClientRow} from "@/lib/data/service";

const statusOptions=[
  ["active","Активен"],
  ["inactive","Неактивен"],
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
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    const fd=new FormData(event.currentTarget);
    const status=String(fd.get("status")??"active");
    if(status==="archived"&&client.status!=="archived"&&!window.confirm("Переместить клиента в архив? Связанные заявки и объекты не удалятся."))return;
    setBusy(true);setError("");
    try{
      const response=await fetch(`/api/clients/${client.id}`,{
        method:"PATCH",headers:{"content-type":"application/json"},
        body:JSON.stringify({
          name:String(fd.get("name")??"").trim(),
          legalName:String(fd.get("legalName")??"").trim()||null,
          inn:String(fd.get("inn")??"").trim()||null,
          notes:String(fd.get("notes")??"").trim()||null,
          status,
          ...(options.canAssign?{
            ownerUserId:String(fd.get("ownerUserId")??"")||null,
            regionId:String(fd.get("regionId")??"")||null,
            teamId:String(fd.get("teamId")??"")||null,
          }:{})
        }),
      });
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось сохранить клиента");
      setOpen(false);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось сохранить клиента")}
    finally{setBusy(false)}
  }

  return <>
    <button className="button" type="button" onClick={()=>{setError("");setOpen(true)}}><Pencil size={15}/> Редактировать</button>
    {open&&<SalesDrawer title="Редактировать клиента" subtitle="Реквизиты и ответственность клиента. Связанные заявки, КП и объекты не переписываются." overline="Клиенты" onClose={()=>!busy&&setOpen(false)}
      footer={<><button className="button" type="button" disabled={busy} onClick={()=>setOpen(false)}>Отмена</button><button className="button primary" type="submit" form="client-edit-form" disabled={busy}>{busy?"Сохраняю…":"Сохранить"}</button></>}>
      <form id="client-edit-form" className="client-create-form client-create-form-unified client-edit-form" onSubmit={submit}>
        <section className="client-form-section">
          <div className="client-form-section-head"><strong>Основные данные</strong><span>Рабочие реквизиты карточки клиента.</span></div>
          <label><span>Рабочее название <b>*</b></span><input name="name" aria-label="Рабочее название *" required minLength={2} maxLength={160} defaultValue={client.name}/></label>
          <label><span>Юридическое наименование</span><input name="legalName" maxLength={240} defaultValue={client.legalName??""}/></label>
          <label><span>ИНН</span><input name="inn" maxLength={20} inputMode="numeric" defaultValue={client.inn??""}/></label>
          <label><span>Статус</span><select name="status" defaultValue={client.status}>{statusOptions.map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label>
          <label><span>Комментарий</span><textarea name="notes" maxLength={5000} defaultValue={client.notes??""} placeholder="Внутренние заметки по клиенту"/></label>
        </section>
        {options.canAssign&&<section className="client-form-section">
          <div className="client-form-section-head"><strong>Ответственность</strong><span>Изменение владельца и организационной привязки доступно только с расширенными правами.</span></div>
          <label><span>Ответственный</span><select name="ownerUserId" defaultValue={client.ownerUserId??""}><option value="">Не назначен</option>{options.members.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label><span>Регион</span><select name="regionId" defaultValue={client.regionId??""}><option value="">Не указан</option>{options.regions.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
          <label><span>Команда</span><select name="teamId" defaultValue={client.teamId??""}><option value="">Не назначена</option>{options.teams.map(item=><option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        </section>}
        {error&&<div className="form-error client-create-error" role="alert">{error}</div>}
      </form>
    </SalesDrawer>}
  </>;
}

export function ClientContactEditButton({clientId,contact}:{clientId:string;contact?:ClientContactRow}){
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const editing=Boolean(contact);

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
      const response=await fetch(editing?`/api/clients/${clientId}/contacts/${contact!.id}`:`/api/clients/${clientId}/contacts`,{
        method:editing?"PATCH":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload),
      });
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось сохранить контакт");
      setOpen(false);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось сохранить контакт")}
    finally{setBusy(false)}
  }

  async function remove(){
    if(!contact||busy||!window.confirm(`Удалить контакт «${contact.fullName}»?`))return;
    setBusy(true);setError("");
    try{
      const response=await fetch(`/api/clients/${clientId}/contacts/${contact.id}`,{method:"DELETE"});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось удалить контакт");
      setOpen(false);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось удалить контакт")}
    finally{setBusy(false)}
  }

  return <>
    {editing?<button className="icon-button client-contact-edit-trigger" type="button" aria-label={`Редактировать контакт: ${contact!.fullName}`} onClick={()=>{setError("");setOpen(true)}}><Pencil size={15}/></button>
      :<button className="button" type="button" onClick={()=>{setError("");setOpen(true)}}><Plus size={15}/> Добавить контакт</button>}
    {open&&<SalesDrawer title={editing?"Редактировать контакт":"Добавить контакт"} subtitle="Контакт хранится в карточке клиента и может использоваться в заявках и на объектах." overline="Контакты клиента" onClose={()=>!busy&&setOpen(false)}
      footer={<><button className="button" type="button" disabled={busy} onClick={()=>setOpen(false)}>Отмена</button>{editing&&<button className="button client-danger-button" type="button" disabled={busy} onClick={remove}><Trash2 size={14}/> Удалить</button>}<button className="button primary" type="submit" form="client-contact-form" disabled={busy}>{busy?"Сохраняю…":"Сохранить"}</button></>}>
      <form id="client-contact-form" className="client-create-form client-create-form-unified client-contact-edit-form" onSubmit={submit}>
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
