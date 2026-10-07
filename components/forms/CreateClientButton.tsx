"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserPlus } from "lucide-react";
import { SalesDrawer } from "@/components/sales/SalesUI";

export type DemoClientDraft={
  name:string;
  legalName:string|null;
  inn:string|null;
  contactName:string|null;
  contactPhone:string|null;
  contactEmail:string|null;
};

export function CreateClientButton({demo=false,onDemoCreate}:{demo?:boolean;onDemoCreate?:(draft:DemoClientDraft)=>void}) {
  const [open,setOpen]=useState(false);
  const [contactOpen,setContactOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const router=useRouter();

  function close(){if(busy)return;setOpen(false);setContactOpen(false);setError("")}

  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    const fd=new FormData(event.currentTarget);
    const name=String(fd.get("name")??"").trim();
    const legalName=String(fd.get("legalName")??"").trim()||null;
    const inn=String(fd.get("inn")??"").trim()||null;
    const contactName=contactOpen?String(fd.get("contactName")??"").trim()||null:null;
    const contactPhone=contactOpen?String(fd.get("contactPhone")??"").trim()||null:null;
    const contactEmail=contactOpen?String(fd.get("contactEmail")??"").trim()||null:null;
    if(name.length<2){setError("Укажите рабочее название клиента.");return}
    if(contactOpen&&!contactName){setError("Укажите имя первого контакта или уберите блок контакта.");return}
    setBusy(true);setError("");
    try{
      if(demo){
        onDemoCreate?.({name,legalName,inn,contactName,contactPhone,contactEmail});
        close();
        return;
      }
      const response=await fetch("/api/clients",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        name,legalName:legalName??undefined,inn:inn??undefined,
        contact:contactOpen&&contactName?{name:contactName,phone:contactPhone??undefined,email:contactEmail??undefined}:undefined,
      })});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось создать клиента");
      setOpen(false);setContactOpen(false);
      router.push(`/clients/${json.id}`);router.refresh();
    }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось создать клиента")}
    finally{setBusy(false)}
  }

  return <>
    <button className="button primary" type="button" onClick={()=>setOpen(true)}><Plus size={16}/> Добавить клиента</button>
    {open&&<SalesDrawer
      title="Добавить клиента"
      overline="Клиенты"
      subtitle="Создайте карточку компании. Подробные контакты, заявки и объекты можно заполнить после регистрации."
      onClose={close}
      footer={<><button className="button" type="button" disabled={busy} onClick={close}>Отмена</button><button className="button primary" type="submit" form="client-create-form" disabled={busy}>{busy?"Создание…":"Создать клиента"}</button></>}
    >
      <form id="client-create-form" className="client-create-form client-create-form-unified" onSubmit={submit}>
        <section className="client-form-section">
          <div className="client-form-section-head"><strong>Основные данные</strong><span>Минимум, необходимый для создания карточки.</span></div>
          <label><span>Рабочее название <b>*</b></span><input name="name" required minLength={2} maxLength={160} autoFocus placeholder="Например, НордЛог"/><small>Так клиент будет отображаться в реестре и связях.</small></label>
          <label><span>Юридическое наименование</span><input name="legalName" maxLength={240} placeholder="ООО «НордЛог»"/></label>
          <label><span>ИНН</span><input name="inn" inputMode="numeric" maxLength={20} autoComplete="off" placeholder="7701234567"/></label>
        </section>

        <section className="client-form-section client-contact-section">
          <div className="client-form-section-head client-contact-head">
            <div><strong>Первый контакт</strong><span>Необязательно. Полный список ведётся в карточке клиента.</span></div>
            {!contactOpen&&<button className="button" type="button" onClick={()=>setContactOpen(true)}><UserPlus size={14}/> Добавить контакт</button>}
          </div>
          {contactOpen&&<div className="client-contact-fields">
            <label><span>Контактное лицо <b>*</b></span><input name="contactName" required placeholder="Имя и фамилия"/></label>
            <label><span>Телефон</span><input name="contactPhone" type="tel" placeholder="+7 999 000-00-00"/></label>
            <label><span>Эл. почта</span><input name="contactEmail" type="email" placeholder="name@company.ru"/></label>
            <button className="client-contact-remove" type="button" onClick={()=>setContactOpen(false)}>Убрать контакт</button>
          </div>}
        </section>
        {demo&&<p className="client-demo-note">Демонстрационный клиент появится только в текущем реестре и исчезнет после перезагрузки.</p>}
        {error&&<div className="form-error client-create-error" role="alert">{error}</div>}
      </form>
    </SalesDrawer>}
  </>;
}
