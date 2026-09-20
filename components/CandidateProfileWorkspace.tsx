"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BriefcaseBusiness, FileText, MessageCircle, Plus, Star, Trash2 } from "lucide-react";
import { KeyValue, Section, Status } from "@/components/UI";
import type { CandidateContact, CandidateDocumentRecord, CandidateProfile, RecruitingApplicationRow, RecruitingNeedRow, RecruitingOptions } from "@/lib/recruiting/service";
import { contactChannelLabels, recruitingStageLabels, type RecruitingStage } from "@/lib/recruiting/model";
import { RecruitingActionDrawer } from "./RecruitingActionDrawer";
import { mergeDemoApplications, readDemoApplications, recruitingEvent, saveDemoApplication } from "@/lib/recruiting/demo-client";
import { formatWorkDate, isActiveStage } from "@/lib/recruiting/workflow";

type Props={
  options:RecruitingOptions;
  needs:RecruitingNeedRow[];
  profile:CandidateProfile|null;
  candidateId:string;
  demo:boolean;
  canEdit:boolean;
  canConvert:boolean;
};
type Tab="overview"|"applications"|"documents"|"communications"|"history";
type ProfileForm={fullName:string;city:string;birthDate:string;notes:string;source:string;sourceChannel:string;sourceCampaign:string;sourceReference:string};
const profileStorage="operis.recruiting.profiles.v2";
const legacyProfileStorage="operis.recruiting.profiles.v1";
const commStorage="operis.recruiting.communications.v1";

export function CandidateProfileWorkspace({profile,candidateId,demo,canEdit,canConvert,options,needs}:Props){
  const router=useRouter();
  const [tab,setTab]=useState<Tab>("overview");
  const [current,setCurrent]=useState<CandidateProfile|null>(profile);
  const [selected,setSelected]=useState<RecruitingApplicationRow|null>(null);
  const [editing,setEditing]=useState(false);
  const [profileForm,setProfileForm]=useState<ProfileForm>(()=>formFromProfile(profile));
  const [contactDraft,setContactDraft]=useState<CandidateContact[]>(profile?.contacts??[]);
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [comm,setComm]=useState({applicationId:"",channel:"phone",direction:"outbound",summary:""});

  useEffect(()=>{
    if(!demo){const frame=requestAnimationFrame(()=>{setCurrent(profile);setProfileForm(formFromProfile(profile));setContactDraft(profile?.contacts??[])});return()=>cancelAnimationFrame(frame)}
    let frame=0;
    try{
      const allOverrides=JSON.parse(localStorage.getItem(profileStorage)||localStorage.getItem(legacyProfileStorage)||"{}") as Record<string,Partial<CandidateProfile>>;
      const custom=allOverrides[candidateId];
      const candidateApps=readDemoApplications().filter(x=>x.candidateId===candidateId);
      const applications=mergeDemoApplications(profile?.applications??[],candidateApps);
      const first=applications[0]??profile?.applications[0];
      if(!first&&!profile)return;
      const localComms=(JSON.parse(localStorage.getItem(commStorage)||"[]") as Array<CandidateProfile["communications"][number]&{candidateId:string}>).filter(x=>x.candidateId===candidateId);
      const hydrated:CandidateProfile={
        id:candidateId,
        fullName:custom?.fullName??profile?.fullName??first?.fullName??"Кандидат",
        phone:custom?.phone??profile?.phone??first?.phone??null,
        email:custom?.email??profile?.email??first?.email??null,
        preferredChannel:custom?.preferredChannel??profile?.preferredChannel??first?.preferredChannel??null,
        telegram:custom?.telegram??profile?.telegram??first?.telegram??null,
        whatsapp:custom?.whatsapp??profile?.whatsapp??first?.whatsapp??null,
        city:custom?.city??profile?.city??first?.city??null,
        birthDate:custom?.birthDate??profile?.birthDate??null,
        source:custom?.source??profile?.source??first?.source??null,
        sourceChannel:custom?.sourceChannel??profile?.sourceChannel??first?.sourceChannel??null,
        sourceCampaign:custom?.sourceCampaign??profile?.sourceCampaign??first?.sourceCampaign??null,
        sourceReference:custom?.sourceReference??profile?.sourceReference??first?.sourceReference??null,
        notes:custom?.notes??profile?.notes??null,
        status:profile?.status??(applications.some(x=>["first_shift","retention_7","retention_30"].includes(x.stage))?"worker":"active"),
        workerId:custom?.workerId??profile?.workerId??null,
        contacts:custom?.contacts??profile?.contacts??[],
        documents:custom?.documents??profile?.documents??[],
        applications,
        communications:[...localComms,...(profile?.communications??[]).filter(x=>!localComms.some(y=>y.id===x.id))],
        history:applications.flatMap(a=>(a.stageEvents??[]).map((h,i)=>({id:a.applicationId+"-"+i,applicationId:a.applicationId,fromStage:h.fromStage??null,toStage:h.toStage,changedAt:formatWorkDate(h.createdAt),changedBy:"Учебная история",reason:h.reason??null,reasonCode:h.reasonCode??null}))),
      };
      frame=requestAnimationFrame(()=>{setCurrent(hydrated);setProfileForm(formFromProfile(hydrated));setContactDraft(hydrated.contacts)});
    }catch{}
    return()=>{if(frame)cancelAnimationFrame(frame)};
  },[candidateId,demo,profile]);

  const sortedApplications=useMemo(()=>[...(current?.applications??[])].sort((a,b)=>{
    const active=Number(isActiveStage(b.stage))-Number(isActiveStage(a.stage));if(active)return active;
    return (b.updatedAt??"").localeCompare(a.updatedAt??"");
  }),[current?.applications]);
  const latest=sortedApplications[0]??null;
  const preferredContact=current?.contacts.find(item=>item.isPreferred)??current?.contacts.find(item=>item.kind===current.preferredChannel)??current?.contacts[0]??null;
  const tabs:[Tab,string][]=[["overview","Обзор"],["applications","Заявки"],["documents","Документы"],["communications","Коммуникации"],["history","История"]];

  function startEdit(){
    if(!current)return;
    setProfileForm(formFromProfile(current));setContactDraft(current.contacts.map(item=>({...item})));setEditing(true);setError("");
  }

  async function saveProfile(event:React.FormEvent){
    event.preventDefault();if(!current)return;setBusy("profile");setError("");
    const normalizedContacts=normalizeContacts(contactDraft.filter(item=>item.value.trim()));
    if(!normalizedContacts.length){setBusy("");setError("Добавьте хотя бы один контакт кандидата.");return}
    const preferred=normalizedContacts.find(item=>item.isPreferred)??normalizedContacts[0];
    const byKind=(kind:CandidateContact["kind"])=>normalizedContacts.find(item=>item.kind===kind&&item.isPrimary)??normalizedContacts.find(item=>item.kind===kind);
    const next:CandidateProfile={...current,...profileForm,
      phone:byKind("phone")?.value??null,email:byKind("email")?.value??null,telegram:byKind("telegram")?.value??null,whatsapp:byKind("whatsapp")?.value??null,
      preferredChannel:preferred.kind,contacts:normalizedContacts};
    try{
      if(demo){
        const all=JSON.parse(localStorage.getItem(profileStorage)||"{}");
        all[candidateId]={fullName:next.fullName,phone:next.phone,email:next.email,preferredChannel:next.preferredChannel,telegram:next.telegram,whatsapp:next.whatsapp,city:next.city,birthDate:next.birthDate,source:next.source,sourceChannel:next.sourceChannel,sourceCampaign:next.sourceCampaign,sourceReference:next.sourceReference,notes:next.notes,contacts:next.contacts,documents:next.documents};
        localStorage.setItem(profileStorage,JSON.stringify(all));
        current.applications.forEach(app=>saveDemoApplication({...app,fullName:next.fullName,phone:next.phone,email:next.email,preferredChannel:next.preferredChannel,telegram:next.telegram,whatsapp:next.whatsapp,city:next.city}));
        window.dispatchEvent(new Event(recruitingEvent));setCurrent(next);
      }else{
        const response=await fetch("/api/candidates/"+candidateId,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
          fullName:next.fullName,phone:next.phone,email:next.email,preferredChannel:next.preferredChannel,telegram:next.telegram,whatsapp:next.whatsapp,city:next.city,birthDate:next.birthDate,
          source:next.source,sourceChannel:next.sourceChannel,sourceCampaign:next.sourceCampaign,sourceReference:next.sourceReference,notes:next.notes,
        })});
        const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить карточку");
        const contactsResponse=await fetch("/api/candidates/"+candidateId+"/contacts",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({contacts:normalizedContacts.map(({id:_id,...item})=>item)})});
        const contactsJson=await contactsResponse.json().catch(()=>({}));if(!contactsResponse.ok)throw new Error(contactsJson.error??"Не удалось сохранить контакты");
        setCurrent(next);router.refresh();
      }
      setEditing(false);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить карточку")}
    finally{setBusy("")}
  }

  async function addCommunication(event:React.FormEvent){
    event.preventDefault();if(!current||!comm.summary.trim())return;setBusy("communication");setError("");
    try{
      if(demo){
        const row={id:crypto.randomUUID(),candidateId,applicationId:comm.applicationId||null,channel:comm.channel,direction:comm.direction,summary:comm.summary,happenedAt:new Date().toLocaleString("ru-RU"),author:"Текущий пользователь"};
        const all=JSON.parse(localStorage.getItem(commStorage)||"[]");all.unshift(row);localStorage.setItem(commStorage,JSON.stringify(all));setCurrent(x=>x?{...x,communications:[row,...x.communications]}:x);
      }else{
        const response=await fetch("/api/candidates/"+candidateId+"/communications",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({applicationId:comm.applicationId||null,channel:comm.channel,direction:comm.direction,summary:comm.summary})});
        const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось добавить коммуникацию");router.refresh();
      }
      setComm(x=>({...x,summary:""}));
    }catch(e){setError(e instanceof Error?e.message:"Не удалось добавить коммуникацию")}
    finally{setBusy("")}
  }

  async function updateDocument(document:CandidateDocumentRecord,status:string){
    if(!current)return;setBusy("document-"+document.id);setError("");
    try{
      const updated=current.documents.map(item=>item.id===document.id?{...item,status}:item);
      if(demo){
        const next={...current,documents:updated};const all=JSON.parse(localStorage.getItem(profileStorage)||"{}");all[candidateId]={...(all[candidateId]??{}),documents:updated};localStorage.setItem(profileStorage,JSON.stringify(all));setCurrent(next);
      }else{
        const applicationId=document.applicationId??latest?.applicationId;
        if(!applicationId)throw new Error("Для изменения документа нужна хотя бы одна заявка кандидата.");
        const response=await fetch("/api/candidates/"+candidateId+"/documents",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({applicationId,documentTypeId:document.documentTypeId,status,note:document.note})});
        const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось обновить документ");
        setCurrent({...current,documents:updated});router.refresh();
      }
    }catch(e){setError(e instanceof Error?e.message:"Не удалось обновить документ")}
    finally{setBusy("")}
  }

  if(!current)return <div className="empty"><strong>Кандидат не найден</strong><span>Карточка недоступна в вашем контуре.</span><Link className="button" href="/candidates">Вернуться к кандидатам</Link></div>;

  const activeApplications=sortedApplications.filter(item=>isActiveStage(item.stage));
  const statusLabel=current.workerId||current.status==="worker"?"Сотрудник":activeApplications.length?"В подборе":latest?.stage==="reserve"?"Резерв":"В базе";
  const statusTone=current.workerId||current.status==="worker"?"good":activeApplications.length?"info":latest?.stage==="reserve"?"warn":"neutral";

  return <div className="recruiting-workspace candidate-dossier">
    {error&&<div className="recruiting-error">{error}</div>}

    <section className="candidate-dossier-head">
      <div className="candidate-dossier-person"><div><span>Карточка человека</span><h2>{current.fullName}</h2><div className="candidate-dossier-tags"><Status tone={statusTone}>{statusLabel}</Status>{latest&&<span>{latest.stageLabel}</span>}{current.workerId&&<Link href={"/workers/"+current.workerId}>Карточка сотрудника →</Link>}</div></div></div>
      <div className="candidate-dossier-contact"><span>Предпочтительная связь</span><strong>{preferredContact?.value??current.phone??current.email??"Не указана"}</strong><small>{preferredContact?contactLabel(preferredContact.kind):contactChannelLabels[current.preferredChannel??""]??""}</small></div>
      <div className="candidate-dossier-actions">{(canEdit||demo)&&<button className="button" onClick={startEdit}>Редактировать</button>}{current.workerId&&<Link className="button primary" href={"/workers/"+current.workerId}><BriefcaseBusiness size={14}/> Сотрудник</Link>}</div>
    </section>

    <nav className="entity-tabs candidate-dossier-tabs" aria-label="Разделы карточки кандидата">{tabs.map(([key,label])=><button type="button" key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}{key==="applications"&&<span>{current.applications.length}</span>}{key==="documents"&&<span>{current.documents.length}</span>}{key==="communications"&&<span>{current.communications.length}</span>}</button>)}</nav>

    {tab==="overview"&&<div className="candidate-dossier-overview">
      <div className="candidate-dossier-main">
        <Section title="Контакты" note="Способ связи хранится на уровне человека и не зависит от конкретной вакансии">
          <div className="candidate-contact-cards">{current.contacts.length?current.contacts.map(contact=><div className={"candidate-contact-card "+(contact.isPreferred?"preferred":"")} key={contact.id}><div><strong>{contactLabel(contact.kind)}</strong>{contact.isPreferred&&<span><Star size={11}/> Предпочтительный</span>}</div><b>{contact.value}</b>{contact.label&&<small>{contact.label}</small>}</div>):<div className="empty-inline">Контакты не заполнены</div>}</div>
        </Section>
        <Section title="Текущая работа с кандидатом" note={activeApplications.length?"Активные заявки и ближайшие действия":"Активных заявок сейчас нет"}>
          <div className="candidate-current-apps">{activeApplications.length?activeApplications.map(app=><button key={app.applicationId} className="candidate-current-app" onClick={()=>setSelected(app)}><div><strong>{app.need}</strong><span>{app.object??"Без объекта"}</span></div><Status tone="info">{app.stageLabel}</Status><div><span>Ответственный</span><strong>{app.owner??"Не назначен"}</strong></div><div><span>Следующее</span><strong>{actionSummary(app)}</strong><small>{formatWorkDate(app.nextActionAt)}</small></div></button>):<div className="empty-inline">Человек остаётся в базе. Ему можно предложить новую потребность из воронки.</div>}</div>
        </Section>
        <Section title="Последние события" note="Коммуникации и изменения по человеку">
          <div className="candidate-history">{current.communications.slice(0,5).map(row=><div className="candidate-history-item" key={row.id}><time>{row.happenedAt}</time><div><strong>{row.author} · {communicationLabel(row.channel)}</strong><p>{row.summary}</p></div></div>)}{!current.communications.length&&<div className="empty-inline">Событий пока нет</div>}</div>
        </Section>
      </div>
      <aside className="candidate-dossier-side">
        <Section title="Основные данные"><div className="candidate-identity"><KeyValue label="Город" value={current.city??"—"}/><KeyValue label="Дата рождения" value={current.birthDate??"—"}/><KeyValue label="Статус" value={statusLabel}/><KeyValue label="Заявок всего" value={String(current.applications.length)}/></div></Section>
        <Section title="Источник" note="Атрибуция хранится для аналитики, но не занимает рабочую шапку"><div className="candidate-dossier-source"><KeyValue label="Источник" value={current.source??"—"}/><KeyValue label="Канал / площадка" value={current.sourceChannel??"—"}/><KeyValue label="Кампания" value={current.sourceCampaign??"—"}/><KeyValue label="Ссылка / ID" value={current.sourceReference??"—"}/></div></Section>
        <Section title="Комментарий"><div className="candidate-dossier-note">{current.notes??"Комментарий не добавлен"}</div></Section>
      </aside>
    </div>}

    {tab==="applications"&&<Section title="Заявки на потребности" note="Один человек может проходить несколько вакансий. Отказы и переводы остаются в истории.">
      <div className="candidate-application-timeline">{sortedApplications.map(application=><div className="candidate-application-card" key={application.applicationId}>
        <div className="candidate-application-main"><div><strong>{application.need}</strong><span>{application.object??"Без объекта"}</span></div><Status tone={["first_shift","retention_7","retention_30"].includes(application.stage)?"good":["rejected","no_show"].includes(application.stage)?"bad":application.stage==="reserve"?"warn":"info"}>{application.stageLabel}</Status></div>
        <div className="candidate-application-meta"><span><b>Ответственный</b>{application.owner??"—"}</span><span><b>Источник заявки</b>{application.source??"—"}</span><span><b>Следующее действие</b>{actionSummary(application)} {formatWorkDate(application.nextActionAt)}</span></div>
        {(application.rejectionReason||application.rejectionReasonCode==="alternative_need")&&<div className="candidate-application-result">{application.rejectionReasonCode==="alternative_need"?"Переведён на альтернативную вакансию":application.rejectionReason}</div>}
        <div className="candidate-application-actions"><button className="button" onClick={()=>setSelected(application)}>Открыть этап</button></div>
      </div>)}</div>
    </Section>}

    {tab==="documents"&&<CandidateDocuments documents={current.documents} applications={current.applications} busy={busy} canEdit={canEdit||demo} onChange={updateDocument}/>}

    {tab==="communications"&&<div className="candidate-profile-grid"><Section title="Хронология коммуникаций" note="Звонки, Telegram, MAX, WhatsApp, встречи и внутренние заметки"><div className="candidate-history">{current.communications.length?current.communications.map(row=><div className="candidate-history-item" key={row.id}><time>{row.happenedAt}</time><div><strong>{row.author} · {communicationLabel(row.channel)}</strong><p>{row.summary}</p></div></div>):<div className="empty-inline">Коммуникаций пока нет</div>}</div></Section><Section title="Добавить запись"><form className="recruiting-form candidate-communication-form" onSubmit={addCommunication}><label>Заявка<select value={comm.applicationId} onChange={e=>setComm(x=>({...x,applicationId:e.target.value}))}><option value="">Общая по кандидату</option>{current.applications.map(x=><option key={x.applicationId} value={x.applicationId}>{x.need} · {x.object??"без объекта"}</option>)}</select></label><label>Канал<select value={comm.channel} onChange={e=>setComm(x=>({...x,channel:e.target.value}))}><option value="phone">Телефон</option><option value="telegram">Telegram</option><option value="max">MAX</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="meeting">Встреча</option><option value="note">Заметка</option></select></label><label>Направление<select value={comm.direction} onChange={e=>setComm(x=>({...x,direction:e.target.value}))}><option value="outbound">Исходящая</option><option value="inbound">Входящая</option><option value="internal">Внутренняя</option></select></label><label>Результат / заметка<textarea required value={comm.summary} onChange={e=>setComm(x=>({...x,summary:e.target.value}))}/></label><button className="button primary" disabled={busy==="communication"||(!canEdit&&!demo)}>Добавить запись</button></form></Section></div>}

    {tab==="history"&&<Section title="Системная история" note="Переходы, возвраты, отказы и переводы — отдельно от человеческих комментариев"><div className="candidate-history">{current.history.length?current.history.map(row=><div className="candidate-history-item" key={row.id}><time>{row.changedAt}</time><div><strong>{row.changedBy}: {stageLabel(row.fromStage)} → {stageLabel(row.toStage)}</strong>{row.reason&&<p>{row.reason}</p>}</div></div>):<div className="empty-inline">Изменений этапов пока нет</div>}</div></Section>}

    {editing&&<div className="recruiting-modal candidate-profile-edit-modal" onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)setEditing(false)}}>
      <form className="recruiting-modal-card candidate-profile-edit-card" onSubmit={saveProfile}>
        <div className="recruiting-modal-head"><div><h2>Редактирование кандидата</h2><p>Контакты принадлежат человеку, а не отдельной вакансии. Один контакт можно отметить предпочтительным.</p></div><button type="button" className="icon-button" onClick={()=>setEditing(false)}>×</button></div>
        <div className="candidate-profile-edit-body">
          <div className="recruiting-form-grid"><label>ФИО<input value={profileForm.fullName} required onChange={e=>setProfileForm(x=>({...x,fullName:e.target.value}))}/></label><label>Город<input value={profileForm.city} onChange={e=>setProfileForm(x=>({...x,city:e.target.value}))}/></label><label>Дата рождения<input type="date" value={profileForm.birthDate} onChange={e=>setProfileForm(x=>({...x,birthDate:e.target.value}))}/></label><label className="wide">Комментарий<textarea value={profileForm.notes} onChange={e=>setProfileForm(x=>({...x,notes:e.target.value}))}/></label></div>
          <section className="candidate-contact-editor"><header><div><strong>Контакты</strong><span>Телефон, Telegram, MAX, WhatsApp, Email или другой способ связи.</span></div><button className="button" type="button" onClick={()=>setContactDraft(rows=>[...rows,{id:"draft-"+crypto.randomUUID(),kind:"telegram",value:"",label:null,isPrimary:false,isPreferred:rows.length===0}])}><Plus size={13}/> Контакт</button></header><div>{contactDraft.map((contact,index)=><div className="candidate-contact-edit-row" key={contact.id}><select value={contact.kind} onChange={e=>setContactDraft(rows=>rows.map((item,i)=>i===index?{...item,kind:e.target.value as CandidateContact["kind"]}:item))}><option value="phone">Телефон</option><option value="telegram">Telegram</option><option value="max">MAX</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="other">Другой</option></select><input value={contact.value} onChange={e=>setContactDraft(rows=>rows.map((item,i)=>i===index?{...item,value:e.target.value}:item))} placeholder={contact.kind==="telegram"?"@username или номер":"Контакт"}/><input value={contact.label??""} onChange={e=>setContactDraft(rows=>rows.map((item,i)=>i===index?{...item,label:e.target.value}:item))} placeholder="Пометка"/><button type="button" className={"candidate-preferred-contact "+(contact.isPreferred?"active":"")} title="Предпочтительный контакт" onClick={()=>setContactDraft(rows=>rows.map((item,i)=>({...item,isPreferred:i===index})))}><Star size={14}/></button><button type="button" className="icon-button" title="Удалить" onClick={()=>setContactDraft(rows=>rows.filter((_,i)=>i!==index))}><Trash2 size={13}/></button></div>)}</div></section>
          <details className="candidate-attribution-editor"><summary>Источник и атрибуция</summary><div className="recruiting-form-grid"><label>Источник<input value={profileForm.source} onChange={e=>setProfileForm(x=>({...x,source:e.target.value}))}/></label><label>Канал / площадка<input value={profileForm.sourceChannel} onChange={e=>setProfileForm(x=>({...x,sourceChannel:e.target.value}))}/></label><label>Кампания / объявление<input value={profileForm.sourceCampaign} onChange={e=>setProfileForm(x=>({...x,sourceCampaign:e.target.value}))}/></label><label>Ссылка / ID<input value={profileForm.sourceReference} onChange={e=>setProfileForm(x=>({...x,sourceReference:e.target.value}))}/></label></div></details>
        </div>
        <div className="recruiting-modal-footer"><button type="button" className="button" onClick={()=>setEditing(false)}>Отмена</button><button className="button primary" disabled={busy==="profile"}>{busy==="profile"?"Сохраняю…":"Сохранить карточку"}</button></div>
      </form>
    </div>}

    {selected&&<RecruitingActionDrawer row={selected} need={needs.find(item=>item.id===selected.needId)??null} needs={needs} stages={options.funnelStages} recruiters={options.recruiters} demo={demo} canEdit={canEdit} canConvert={canConvert} exitReasons={options.exitReasons} onClose={()=>setSelected(null)} onSaved={()=>{if(demo){const apps=mergeDemoApplications(current.applications,readDemoApplications().filter(x=>x.candidateId===candidateId));setCurrent(x=>x?{...x,applications:apps,status:apps.some(a=>["first_shift","retention_7","retention_30"].includes(a.stage))?"worker":x.status,history:apps.flatMap(a=>(a.stageEvents??[]).map((h,i)=>({id:a.applicationId+"-"+i,applicationId:a.applicationId,fromStage:h.fromStage??null,toStage:h.toStage,changedAt:formatWorkDate(h.createdAt),changedBy:"Текущий пользователь",reason:h.reason??null,reasonCode:h.reasonCode??null})))}:x)}}}/>}
  </div>;
}

function CandidateDocuments({documents,applications,busy,canEdit,onChange}:{documents:CandidateDocumentRecord[];applications:RecruitingApplicationRow[];busy:string;canEdit:boolean;onChange:(doc:CandidateDocumentRecord,status:string)=>void}){
  const employment=documents.filter(item=>item.groupType==="employment");
  const additional=documents.filter(item=>item.groupType==="clearance");
  const groups=[...new Set(additional.map(item=>item.applicationId).filter((id):id is string=>Boolean(id)))];
  return <div className="candidate-doc-dossier">
    <Section title="Документы для оформления" note="Единый пакет человека. Полученный документ переиспользуется при последующих вакансиях."><div className="candidate-document-table">{employment.map(doc=><DocumentRow key={doc.id} doc={doc} busy={busy} canEdit={canEdit} onChange={onChange}/>)}</div>{!employment.length&&<div className="empty-inline">Основные документы ещё не настроены</div>}</Section>
    <Section title="Дополнительные документы и допуски" note="Требования зависят от конкретной потребности и могут быть обязательны до выхода, позже или не блокировать работу.">
      <div className="candidate-extra-doc-groups">{groups.map(applicationId=>{const app=applications.find(item=>item.applicationId===applicationId);const rows=additional.filter(item=>item.applicationId===applicationId);return <details key={applicationId} open={Boolean(app&&isActiveStage(app.stage))}><summary><span><strong>{app?.need??rows[0]?.need??"Заявка"}</strong><small>{app?.object??""}</small></span><Status tone={app&&isActiveStage(app.stage)?"info":"neutral"}>{app?.stageLabel??"История"}</Status></summary><div>{rows.map(doc=><DocumentRow key={doc.id} doc={doc} busy={busy} canEdit={canEdit} onChange={onChange}/>)}</div></details>})}</div>{!additional.length&&<div className="empty-inline">Для заявок кандидата нет дополнительных требований</div>}
    </Section>
  </div>;
}

function DocumentRow({doc,busy,canEdit,onChange}:{doc:CandidateDocumentRecord;busy:string;canEdit:boolean;onChange:(doc:CandidateDocumentRecord,status:string)=>void}){
  const statuses=doc.groupType==="employment"||doc.provider==="candidate"?["missing","requested","received","verified","not_required"]:["to_prepare","in_progress","ready","not_required"];
  return <div className="candidate-document-dossier-row"><div><strong>{doc.name}</strong><span>{doc.groupType==="clearance"?providerLabel(doc.provider):"Документ кандидата"} · {milestoneLabel(doc.requiredBy)}</span></div><select value={doc.status} disabled={!canEdit||busy==="document-"+doc.id} onChange={e=>void onChange(doc,e.target.value)}>{statuses.map(status=><option key={status} value={status}>{documentStatus(status)}</option>)}</select>{doc.note&&<small>{doc.note}</small>}</div>;
}

function normalizeContacts(rows:CandidateContact[]){
  const firstByKind=new Set<string>();
  let hasPreferred=rows.some(item=>item.isPreferred);
  return rows.map((item,index)=>{
    const primary=!firstByKind.has(item.kind);firstByKind.add(item.kind);
    const preferred=hasPreferred?item.isPreferred:index===0;if(preferred)hasPreferred=true;
    return {...item,value:item.value.trim(),label:item.label?.trim()||null,isPrimary:primary,isPreferred:preferred};
  });
}
function formFromProfile(profile:CandidateProfile|null):ProfileForm{return {fullName:profile?.fullName??"",city:profile?.city??"",birthDate:profile?.birthDate??"",notes:profile?.notes??"",source:profile?.source??"",sourceChannel:profile?.sourceChannel??"",sourceCampaign:profile?.sourceCampaign??"",sourceReference:profile?.sourceReference??""}}
function actionSummary(row:RecruitingApplicationRow){if(row.workflow?.nextActionText)return row.workflow.nextActionText;if(row.stage==="new")return"Взять контакт в работу";if(row.stage==="interview")return"Получить решение";if(row.stage==="documents")return"Документы для оформления";if(row.stage==="clearance")return"Допуски и оформление";if(row.stage==="preparation")return"Подготовить к выходу";if(row.stage==="first_shift")return"Подтвердить выход";return"—"}
function stageLabel(value:string|null){if(!value)return"Создан";return recruitingStageLabels[value as RecruitingStage]??value}
function communicationLabel(value:string){return value==="meeting"?"Встреча":value==="note"?"Заметка":contactChannelLabels[value]??value}
function contactLabel(value:string){return contactChannelLabels[value]??(value==="max"?"MAX":"Другой")}
function providerLabel(value:string){return value==="company"?"Оформляет компания":value==="client"?"Оформляет заказчик":"Предоставляет кандидат"}
function milestoneLabel(value:string){return value==="employment"?"до оформления":value==="first_shift"?"до первого выхода":value==="day7"?"до 7-го дня":value==="day30"?"до 30-го дня":"не блокирует выход"}
function documentStatus(value:string){return value==="missing"?"Не получен":value==="requested"?"Запрошен":value==="received"?"Получен":value==="verified"?"Проверен":value==="not_required"?"Не требуется":value==="to_prepare"?"Нужно оформить":value==="in_progress"?"В работе":value==="ready"?"Готов":value}
