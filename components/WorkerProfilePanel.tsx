"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {Copy,Mail,MessageCircle,Pencil,Phone,Plus,Trash2} from "lucide-react";
import {useWorkerProfileName} from "@/components/WorkerProfileState";
import {RegistryDrawer} from "@/components/registry/RegistryDrawer";
import {PersonAvatar} from "@/components/registry/PersonAvatar";
import {workerContactLink} from "@/lib/operations/worker-contact-links.mjs";
import {workerProfileSchema,type WorkerContact,type WorkerProfile} from "@/lib/operations/worker-profile-schema";
const channels={phone:"Телефон",email:"Почта",telegram:"Telegram",whatsapp:"WhatsApp",max:"MAX",other:"Другое"};
export function WorkerProfilePanel({workerId,initialProfile,status,specialty,canEdit,demo}:{workerId:string;initialProfile:WorkerProfile;status:React.ReactNode;specialty:string;canEdit:boolean;demo:boolean}){
 const router=useRouter();const nameState=useWorkerProfileName();const [profile,setProfile]=useState(initialProfile),[draft,setDraft]=useState(initialProfile),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const contacts:WorkerContact[]=[...(profile.phone?[{channel:"phone" as const,value:profile.phone,label:"Для звонков"}]:[]),...(profile.email?[{channel:"email" as const,value:profile.email,label:""}]:[]),...profile.contacts];
 async function save(){
  const parsed=workerProfileSchema.safeParse({fullName:draft.fullName,phone:draft.phone?.trim()||null,email:draft.email?.trim()||null,...(profile.additionalContactsReady?{contacts:draft.contacts}:{}),revision:profile.revision});
  if(!parsed.success){setMessage(parsed.error.issues[0]?.message??"Проверьте поля");return}
  setBusy(true);setMessage("");try{
   if(demo){nameState?.setName(parsed.data.fullName);setProfile({...draft,fullName:parsed.data.fullName,phone:parsed.data.phone,email:parsed.data.email});setMessage("Демо: изменения действуют на текущем экране и исчезнут после перезагрузки.");setOpen(false);return}
   const response=await fetch(`/api/workers/${workerId}/profile`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(parsed.data)});const json=await response.json();if(!response.ok)throw new Error(json.error??"Не удалось сохранить");nameState?.setName(parsed.data.fullName);setProfile({...draft,fullName:parsed.data.fullName,phone:parsed.data.phone,email:parsed.data.email,revision:json.revision});setOpen(false);router.refresh();
  }catch(error){setMessage(error instanceof Error?error.message:"Не удалось сохранить")}finally{setBusy(false)}
 }
 function updateContact(index:number,patch:Partial<WorkerContact>){setDraft(current=>({...current,contacts:current.contacts.map((contact,i)=>i===index?{...contact,...patch}:contact)}))}
 return <>
  <div className="worker-profile-identity"><PersonAvatar size={88}/><p>{specialty}</p>{status}</div>
  <div className="worker-profile-contact-head"><h3>Связь</h3></div>
  <div className="worker-contact-list">{contacts.map((contact,index)=>{const href=workerContactLink(contact);const Icon=contact.channel==="phone"?Phone:contact.channel==="email"?Mail:MessageCircle;return <div className="worker-contact" key={index}><Icon size={15}/><div><span>{channels[contact.channel]}{contact.label?" · "+contact.label:""}</span>{href?<a href={href} target={href.startsWith("https:")?"_blank":undefined} rel={href.startsWith("https:")?"noopener noreferrer":undefined}>{contact.value}</a>:<strong>{contact.value}</strong>}</div><button className="icon-button" aria-label={`Скопировать ${channels[contact.channel]}: ${contact.value}`} onClick={()=>{void navigator.clipboard.writeText(contact.value).then(()=>setMessage("Контакт скопирован")).catch(()=>setMessage("Копирование недоступно. Выделите контакт вручную."))}}><Copy size={13}/></button></div>})}{!contacts.length&&<p className="worker-entity-note">Контакты пока не указаны.</p>}</div>
  {canEdit&&<button className="button worker-profile-edit" onClick={()=>{setDraft(profile);setMessage("");setOpen(true)}}><Pencil size={14}/> Редактировать профиль</button>}
  {message&&!open&&<p className="worker-profile-message" role="status">{message}</p>}
  {open&&<RegistryDrawer title="Редактировать сотрудника" subtitle="Личные данные и способы связи. Назначение и условия работы настраиваются отдельно." onClose={()=>{if(!busy)setOpen(false)}} footer={<><button className="button" disabled={busy} onClick={()=>setOpen(false)}>Отмена</button><button className="button primary" disabled={busy} onClick={()=>void save()}>{busy?"Сохраняю…":demo?"Применить в демо":"Сохранить"}</button></>}>
    <div className="worker-profile-form"><label>ФИО<input value={draft.fullName} maxLength={240} onChange={event=>setDraft({...draft,fullName:event.target.value})}/></label><div className="candidate-import-options"><label>Телефон для звонков<input type="tel" value={draft.phone??""} maxLength={60} onChange={event=>setDraft({...draft,phone:event.target.value})}/></label><label>Электронная почта<input type="email" value={draft.email??""} onChange={event=>setDraft({...draft,email:event.target.value})}/></label></div>
    <h3>Дополнительные контакты</h3><p className="worker-entity-note">Для переписки можно указать другой номер. Telegram — имя пользователя или ссылка; MAX — номер для копирования или ссылка на профиль.</p>
    {!profile.additionalContactsReady&&<p role="status" className="worker-entity-note">Дополнительные контакты ещё не подключены к базе. Основные данные доступны для редактирования.</p>}
    {draft.contacts.map((contact,index)=><div className="worker-contact-form-row" key={index}><label>Канал<select disabled={!profile.additionalContactsReady||busy} value={contact.channel} onChange={event=>updateContact(index,{channel:event.target.value as WorkerContact["channel"]})}>{Object.entries(channels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Контакт<input disabled={!profile.additionalContactsReady||busy} aria-label={`Контакт ${index+1}`} value={contact.value} maxLength={240} onChange={event=>updateContact(index,{value:event.target.value})}/></label><label>Примечание<input disabled={!profile.additionalContactsReady||busy} value={contact.label} maxLength={60} placeholder="Например, личный" onChange={event=>updateContact(index,{label:event.target.value})}/></label><button className="icon-button" disabled={!profile.additionalContactsReady||busy} aria-label={`Удалить контакт ${index+1}`} onClick={()=>setDraft({...draft,contacts:draft.contacts.filter((_,i)=>i!==index)})}><Trash2 size={15}/></button></div>)}
    <button className="button" disabled={!profile.additionalContactsReady||draft.contacts.length>=12} onClick={()=>setDraft({...draft,contacts:[...draft.contacts,{channel:"max",value:"",label:""}]})}><Plus size={14}/> Добавить способ связи</button>
    {message&&<p className="recruiting-error" role="alert">{message}</p>}
    {demo&&<p className="worker-entity-note">Демо-изменения не записываются в рабочую базу.</p>}
    </div>
  </RegistryDrawer>}
 </>;
}
