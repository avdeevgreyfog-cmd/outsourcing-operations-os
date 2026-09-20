"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {MessageCircle,Phone,Plus,UserCheck,X} from "lucide-react";
import {KeyValue,Section,Status} from "@/components/UI";
import type {CandidateContactMethod,CandidateProfile,RecruitingApplicationRow,RecruitingNeedRow,RecruitingOptions} from "@/lib/recruiting/service";
import {contactChannelLabels,recruitingStageLabels,type RecruitingStage} from "@/lib/recruiting/model";
import {RecruitingActionDrawer} from "./RecruitingActionDrawer";
import {mergeDemoApplications,readDemoApplications,recruitingEvent,saveDemoApplication} from "@/lib/recruiting/demo-client";
import {formatWorkDate,isActiveStage} from "@/lib/recruiting/workflow";

type Props={
  profile:CandidateProfile|null;
  candidateId:string;
  options:RecruitingOptions;
  needs:RecruitingNeedRow[];
  exitReasons:RecruitingOptions["exitReasons"];
  demo:boolean;
  canEdit:boolean;
  canConvert:boolean;
};
type Tab="overview"|"applications"|"documents"|"communications"|"history";
const profileStorage="operis.recruiting.profiles.v2";
const commStorage="operis.recruiting.communications.v1";

export function CandidateProfileWorkspace({profile,candidateId,options,needs,demo,canEdit,canConvert,exitReasons}:Props){
 const router=useRouter();
 const [tab,setTab]=useState<Tab>("overview");
 const [current,setCurrent]=useState<CandidateProfile|null>(profile);
 const [selected,setSelected]=useState<RecruitingApplicationRow|null>(null);
 const [editing,setEditing]=useState(false);
 const [draftContacts,setDraftContacts]=useState<CandidateContactMethod[]>(profile?.contacts??[]);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [comm,setComm]=useState({applicationId:"",channel:"phone",direction:"outbound",summary:""});

 useEffect(()=>{
  if(!demo){const frame=requestAnimationFrame(()=>{setCurrent(profile);setDraftContacts(profile?.contacts??[])});return()=>cancelAnimationFrame(frame);}
  let frame=0;
  try{
   const custom=(JSON.parse(localStorage.getItem(profileStorage)||"{}") as Record<string,Partial<CandidateProfile>>)[candidateId];
   const apps=mergeDemoApplications(profile?.applications??[],readDemoApplications().filter(x=>x.candidateId===candidateId));
   const first=profile?.applications[0]??apps[0];
   if(!first&&!profile)return;
   const localComms=(JSON.parse(localStorage.getItem(commStorage)||"[]") as Array<CandidateProfile["communications"][number]&{candidateId:string}>).filter(x=>x.candidateId===candidateId);
   const hydrated:CandidateProfile={
    ...(profile??{
      id:candidateId,fullName:first?.fullName??"Кандидат",phone:first?.phone??null,email:first?.email??null,preferredChannel:first?.preferredChannel??null,
      telegram:first?.telegram??null,whatsapp:first?.whatsapp??null,contacts:[],city:first?.city??null,birthDate:null,source:first?.source??null,sourceChannel:first?.sourceChannel??null,
      sourceCampaign:first?.sourceCampaign??null,sourceReference:first?.sourceReference??null,notes:null,status:"active",workerId:null,workerStatus:null,documents:[],applications:[],communications:[],history:[],
    }),
    ...custom,
    applications:apps,
    contacts:(custom?.contacts as CandidateContactMethod[]|undefined)??profile?.contacts??[],
    communications:[...localComms,...(profile?.communications??[]).filter(x=>!localComms.some(y=>y.id===x.id))],
    history:apps.flatMap(a=>(a.stageEvents??[]).map((h,i)=>({id:`${a.applicationId}-${i}`,applicationId:a.applicationId,fromStage:h.fromStage??null,toStage:h.toStage,changedAt:formatWorkDate(h.createdAt),changedBy:"Учебная история",reason:h.reason??null,reasonCode:h.reasonCode??null}))),
   };
   frame=requestAnimationFrame(()=>{setCurrent(hydrated);setDraftContacts(hydrated.contacts)});
  }catch{}
  return()=>{if(frame)cancelAnimationFrame(frame)};
 },[candidateId,demo,profile]);

 const latest=useMemo(()=>current?.applications.find(app=>isActiveStage(app.stage))??current?.applications[0]??null,[current]);
 const tabs:[Tab,string][]=[["overview","Обзор"],["applications","Заявки"],["documents","Документы"],["communications","Коммуникации"],["history","История"]];
 const preferred=current?current.contacts.find(item=>item.isPreferred&&item.active)??current.contacts.find(item=>item.active)??null:null;

 async function saveProfile(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!current)return;setBusy("profile");setError("");
  const data=new FormData(event.currentTarget);
  const payload={
    fullName:String(data.get("fullName")||""),
    phone:value(data,"phone"),
    email:value(data,"email"),
    preferredChannel:preferredChannelFromContacts(draftContacts)??value(data,"preferredChannel"),
    telegram:firstContact(draftContacts,"telegram"),
    whatsapp:firstContact(draftContacts,"whatsapp"),
    city:value(data,"city"),birthDate:value(data,"birthDate"),
    source:value(data,"source"),sourceChannel:value(data,"sourceChannel"),sourceCampaign:value(data,"sourceCampaign"),sourceReference:value(data,"sourceReference"),
    notes:value(data,"notes"),
    contacts:draftContacts.filter(item=>item.value.trim()).map(item=>({...item,id:item.id.startsWith("draft-")?undefined:item.id})),
  };
  try{
   if(demo){
    const all=JSON.parse(localStorage.getItem(profileStorage)||"{}");all[candidateId]=payload;localStorage.setItem(profileStorage,JSON.stringify(all));
    current.applications.forEach(app=>saveDemoApplication({...app,fullName:payload.fullName,phone:payload.phone,email:payload.email,preferredChannel:payload.preferredChannel,telegram:payload.telegram,whatsapp:payload.whatsapp,city:payload.city}));
    window.dispatchEvent(new Event(recruitingEvent));setCurrent(x=>x?{...x,...payload,contacts:draftContacts}:x);
   }else{
    const response=await fetch(`/api/candidates/${candidateId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
    const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить карточку");router.refresh();
   }
   setEditing(false);
  }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить карточку");}
  finally{setBusy("")}
 }

 async function addCommunication(event:React.FormEvent){
  event.preventDefault();if(!current||!comm.summary.trim())return;setBusy("communication");setError("");
  try{
   if(demo){
    const row={id:crypto.randomUUID(),candidateId,applicationId:comm.applicationId||null,channel:comm.channel,direction:comm.direction,summary:comm.summary,happenedAt:new Date().toLocaleString("ru-RU"),author:"Текущий пользователь"};
    const all=JSON.parse(localStorage.getItem(commStorage)||"[]");all.unshift(row);localStorage.setItem(commStorage,JSON.stringify(all));setCurrent(x=>x?{...x,communications:[row,...x.communications]}:x);
   }else{
    const response=await fetch(`/api/candidates/${candidateId}/communications`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({applicationId:comm.applicationId||null,channel:comm.channel,direction:comm.direction,summary:comm.summary})});
    const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось добавить коммуникацию");router.refresh();
   }
   setComm(x=>({...x,summary:""}));
  }catch(e){setError(e instanceof Error?e.message:"Не удалось добавить коммуникацию");}
  finally{setBusy("")}
 }

 if(!current)return <div className="empty"><strong>Кандидат не найден</strong><span>Карточка недоступна в вашем контуре.</span><Link className="button" href="/candidates">Вернуться к кандидатам</Link></div>;

 return <div className="recruiting-workspace candidate-profile-v2">
  {error&&<div className="recruiting-error">{error}</div>}
  <section className="candidate-profile-hero">
   <div className="candidate-profile-person"><div className="candidate-profile-avatar">{initials(current.fullName)}</div><div><div className="candidate-profile-titleline"><h2>{current.fullName}</h2><Status tone={current.workerId?"good":current.status==="inactive"?"neutral":"info"}>{current.workerId?"Сотрудник":current.status==="inactive"?"Архив":"Кандидат"}</Status></div><p>{[current.city,latest?.need,latest?.object].filter(Boolean).join(" · ")||"Контакт в базе"}</p></div></div>
   <div className="candidate-profile-quick">
    {preferred&&<ContactPill item={preferred} primary/>}
    {current.contacts.filter(item=>item.active&&item.id!==preferred?.id).slice(0,3).map(item=><ContactPill key={item.id} item={item}/>)}
    {current.workerId&&!demo&&<Link className="button primary" href={`/workers/${current.workerId}`}><UserCheck size={14}/> Открыть сотрудника</Link>}
   </div>
  </section>

  <nav className="entity-tabs" aria-label="Разделы карточки кандидата">{tabs.map(([key,label])=><button type="button" key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}{key==="applications"&&<span>{current.applications.length}</span>}{key==="documents"&&<span>{current.documents.length}</span>}{key==="communications"&&<span>{current.communications.length}</span>}</button>)}</nav>

  {tab==="overview"&&<div className="candidate-profile-grid candidate-profile-overview"><div>
   {editing?<Section title="Редактирование карточки" note="Единые данные человека для всех вакансий и последующей карточки сотрудника"><form className="recruiting-form" onSubmit={saveProfile}>
    <div className="recruiting-form-grid"><Field name="fullName" label="ФИО" value={current.fullName} required/><Field name="phone" label="Основной телефон" value={current.phone}/><Field name="email" label="Email" value={current.email} type="email"/><Field name="city" label="Город" value={current.city}/><Field name="birthDate" label="Дата рождения" value={current.birthDate} type="date"/><label className="wide">Комментарий<textarea name="notes" defaultValue={current.notes??""}/></label></div>
    <div className="candidate-contact-editor"><header><div><strong>Способы связи</strong><span>Можно хранить разные номера и логины. Один канал отметьте предпочтительным.</span></div><button className="button" type="button" onClick={()=>setDraftContacts(list=>[...list,{id:`draft-${crypto.randomUUID()}`,channel:"telegram",value:"",label:null,isPreferred:false,active:true}])}><Plus size={13}/> Добавить контакт</button></header>
     <div>{draftContacts.map((item,index)=><div className="candidate-contact-edit-row" key={item.id}><select value={item.channel} onChange={e=>setDraftContacts(list=>list.map((row,i)=>i===index?{...row,channel:e.target.value as CandidateContactMethod["channel"]}:row))}><option value="phone">Телефон</option><option value="telegram">Telegram</option><option value="max">MAX</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="other">Другой</option></select><input value={item.value} onChange={e=>setDraftContacts(list=>list.map((row,i)=>i===index?{...row,value:e.target.value}:row))} placeholder={item.channel==="telegram"?"@username или номер":"Контакт"}/><input value={item.label??""} onChange={e=>setDraftContacts(list=>list.map((row,i)=>i===index?{...row,label:e.target.value||null}:row))} placeholder="Подпись, необязательно"/><label><input type="radio" name="preferredContact" checked={item.isPreferred} onChange={()=>setDraftContacts(list=>list.map((row,i)=>({...row,isPreferred:i===index})))}/> Основной</label><button className="icon-button" type="button" onClick={()=>setDraftContacts(list=>list.filter((_,i)=>i!==index))}><X size={14}/></button></div>)}</div>
    </div>
    <details className="candidate-profile-source-edit"><summary>Источник и атрибуция</summary><div className="recruiting-form-grid"><Field name="source" label="Источник" value={current.source}/><Field name="sourceChannel" label="Канал / площадка" value={current.sourceChannel}/><Field name="sourceCampaign" label="Кампания / объявление" value={current.sourceCampaign}/><Field name="sourceReference" label="Ссылка / ID" value={current.sourceReference}/></div></details>
    <div className="recruiting-form-actions"><button type="button" className="button" onClick={()=>{setEditing(false);setDraftContacts(current.contacts)}}>Отмена</button><button className="button primary" disabled={busy==="profile"}>Сохранить</button></div>
   </form></Section>
   :<Section title="Контакты и данные" note="Постоянная карточка человека независимо от количества вакансий" actions={canEdit||demo?<button type="button" className="button" onClick={()=>{setDraftContacts(current.contacts);setEditing(true)}}>Редактировать</button>:undefined}>
    <div className="candidate-profile-contact-grid"><KeyValue label="Основной телефон" value={current.phone??"—"}/><KeyValue label="Город" value={current.city??"—"}/><KeyValue label="Дата рождения" value={current.birthDate??"—"}/><KeyValue label="Предпочтительная связь" value={preferred?<>{contactChannelLabels[preferred.channel]??preferred.channel} · <strong>{preferred.value}</strong></>:"—"}/></div>
    <div className="candidate-contact-pills">{current.contacts.filter(item=>item.active).map(item=><ContactPill item={item} key={item.id} primary={item.isPreferred}/>)}</div>
   </Section>}

   <Section title="Последние события" note="Коммуникации и системные события по человеку"><div className="candidate-history candidate-profile-recent">{current.communications.slice(0,5).map(row=><div className="candidate-history-item" key={row.id}><time>{row.happenedAt}</time><div><strong>{row.author} · {communicationLabel(row.channel)}</strong><p>{row.summary}</p></div></div>)}{!current.communications.length&&<div className="empty-inline">Событий пока нет</div>}</div></Section>
  </div><div>
   <Section title="Текущая работа с кандидатом"><div className="candidate-current-state">{latest?<><KeyValue label="Потребность" value={latest.need}/><KeyValue label="Объект" value={latest.object??"—"}/><KeyValue label="Этап" value={<Status tone={["first_shift","retention_7","retention_30"].includes(latest.stage)?"good":"info"}>{latest.stageLabel}</Status>}/><KeyValue label="Ответственный" value={latest.owner??"—"}/><KeyValue label="Следующее действие" value={nextActionDisplay(latest)}/><button className="button" onClick={()=>setSelected(latest)}>Открыть рабочий этап</button></>:<><strong>Нет активной заявки</strong><span>Человек находится в базе кандидатов и может быть добавлен в новую потребность.</span><Link className="button" href="/recruiting">Добавить в подбор</Link></>}</div></Section>
   <Section title="Источник" note="Атрибуция хранится в карточке, но не мешает текущей работе"><div className="candidate-current-state"><KeyValue label="Источник" value={current.source??"—"}/><KeyValue label="Канал" value={current.sourceChannel??"—"}/><KeyValue label="Кампания / объявление" value={current.sourceCampaign??"—"}/></div></Section>
   {current.workerId&&<Section title="Связь с сотрудником" note="Рекрутинговая история остаётся в этой карточке"><div className="candidate-worker-link"><UserCheck size={18}/><div><strong>Создана карточка сотрудника</strong><span>Дальше рабочая история ведётся в контуре сотрудника: назначения, смены, табели, начисления и выплаты.</span></div>{!demo&&<Link className="button primary" href={`/workers/${current.workerId}`}>Открыть</Link>}</div></Section>}
  </div></div>}

  {tab==="applications"&&<Section title="Заявки на потребности" note="Один человек может проходить несколько вакансий; переводы и отказы сохраняются в истории"><div className="candidate-applications candidate-application-timeline">{current.applications.map((application,index)=><div className="candidate-application-row" key={application.applicationId}><div><strong>{application.need}</strong><span>{application.object??"Без объекта"}</span>{application.rejectionReasonCode==="alternative_need"&&<small className="candidate-transfer-note">Переведён на альтернативную вакансию</small>}</div><div><Status tone={["first_shift","retention_7","retention_30"].includes(application.stage)?"good":["rejected","no_show"].includes(application.stage)?"bad":application.stage==="reserve"?"warn":"info"}>{application.stageLabel}</Status><span>{application.rejectionReason??""}</span></div><div><strong>{application.owner??"Без ответственного"}</strong><span>{application.nextActionAt?formatWorkDate(application.nextActionAt):"Нет запланированного действия"}</span></div><div><button className="button" onClick={()=>setSelected(application)}>Открыть</button></div>{index<current.applications.length-1&&application.rejectionReasonCode==="alternative_need"&&<div className="candidate-transfer-arrow">→ новая заявка</div>}</div>)}</div>{!current.applications.length&&<div className="empty-inline">Заявок пока нет. Кандидат находится только в общей базе.</div>}</Section>}

  {tab==="documents"&&<CandidateDocuments profile={current}/>}

  {tab==="communications"&&<div className="candidate-profile-grid"><Section title="Хронология коммуникаций" note="Звонки, Telegram, MAX, WhatsApp, встречи и внутренние заметки"><div className="candidate-history">{current.communications.length?current.communications.map(row=><div className="candidate-history-item" key={row.id}><time>{row.happenedAt}</time><div><strong>{row.author} · {communicationLabel(row.channel)}</strong><p>{row.summary}</p></div></div>):<div className="empty-inline">Коммуникаций пока нет</div>}</div></Section><Section title="Добавить запись"><form className="recruiting-form" onSubmit={addCommunication}><label>Заявка<select value={comm.applicationId} onChange={e=>setComm(x=>({...x,applicationId:e.target.value}))}><option value="">Общая по кандидату</option>{current.applications.map(x=><option key={x.applicationId} value={x.applicationId}>{x.need} · {x.object??"без объекта"}</option>)}</select></label><label>Канал<select value={comm.channel} onChange={e=>setComm(x=>({...x,channel:e.target.value}))}><option value="phone">Телефон</option><option value="telegram">Telegram</option><option value="max">MAX</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="meeting">Встреча</option><option value="note">Заметка</option></select></label><label>Направление<select value={comm.direction} onChange={e=>setComm(x=>({...x,direction:e.target.value}))}><option value="outbound">Исходящая</option><option value="inbound">Входящая</option><option value="internal">Внутренняя</option></select></label><label>Комментарий / результат<textarea required value={comm.summary} onChange={e=>setComm(x=>({...x,summary:e.target.value}))}/></label><button className="button primary" disabled={busy==="communication"||(!canEdit&&!demo)}>Добавить запись</button></form></Section></div>}

  {tab==="history"&&<Section title="Системная история" note="Переходы этапов, переводы на другие вакансии и завершения отдельно от комментариев"><div className="candidate-history">{current.history.length?current.history.map(row=><div className="candidate-history-item" key={row.id}><time>{row.changedAt}</time><div><strong>{row.changedBy}: {stageLabel(row.fromStage)} → {stageLabel(row.toStage)}</strong>{row.reason&&<p>{row.reason}</p>}</div></div>):<div className="empty-inline">Изменений этапов пока нет</div>}</div></Section>}

  {selected&&<RecruitingActionDrawer row={selected} need={needs.find(row=>row.id===selected.needId)??null} needs={needs} stages={options.funnelStages.filter(row=>row.active)} recruiters={options.recruiters} demo={demo} canEdit={canEdit} canConvert={canConvert} exitReasons={exitReasons} onClose={()=>setSelected(null)} onSaved={()=>{if(demo){const apps=mergeDemoApplications(current.applications,readDemoApplications().filter(x=>x.candidateId===candidateId));setCurrent(x=>x?{...x,applications:apps,status:apps.some(a=>['first_shift','retention_7','retention_30'].includes(a.stage))?'worker':x.status,history:apps.flatMap(a=>(a.stageEvents??[]).map((h,i)=>({id:`${a.applicationId}-${i}`,applicationId:a.applicationId,fromStage:h.fromStage??null,toStage:h.toStage,changedAt:formatWorkDate(h.createdAt),changedBy:'Текущий пользователь',reason:h.reason??null,reasonCode:h.reasonCode??null})))}:x);}}}/>}
 </div>;
}

function CandidateDocuments({profile}:{profile:CandidateProfile}){
 const employment=dedupeDocuments(profile.documents.filter(row=>row.groupType==="employment"));
 const additional=profile.documents.filter(row=>row.groupType==="clearance");
 return <div className="candidate-documents-page">
  <Section title="Документы для трудоустройства" note="Единый пакет человека. Сохраняется при переводе на другую вакансию и остаётся связан с карточкой сотрудника."><div className="candidate-dossier-list">{employment.map(row=><DocumentDossierRow key={row.documentTypeId} row={row}/>)}</div>{!employment.length&&<div className="empty-inline">Базовые документы ещё не настроены</div>}</Section>
  <Section title="Дополнительные документы и допуски" note="Требования конкретных объектов. У каждого требования есть ответственный, срок готовности и правило блокировки."><div className="candidate-dossier-list">{additional.map((row,index)=><DocumentDossierRow key={`${row.documentTypeId}-${row.needId}-${index}`} row={row}/>)}</div>{!additional.length&&<div className="empty-inline">Дополнительных требований нет</div>}</Section>
 </div>;
}

function DocumentDossierRow({row}:{row:CandidateProfile["documents"][number]}){
 return <div className="candidate-dossier-row"><div><strong>{row.name}</strong><span>{row.groupType==="employment"?"Базовый документ":[row.need,row.object].filter(Boolean).join(" · ")||"Требование объекта"}</span></div><div><span>{providerLabel(row.provider)}</span><small>{deadlineLabel(row.requiredByStage)}{row.blocksProgress?" · блокирует":" · не блокирует"}</small></div><Status tone={["received","verified","ready"].includes(row.status)?"good":["missing","rejected"].includes(row.status)?"warn":"info"}>{documentStatusLabel(row.status)}</Status></div>;
}

function ContactPill({item,primary=false}:{item:CandidateContactMethod;primary?:boolean}){
 const href=item.channel==="phone"?`tel:${item.value}`:item.channel==="email"?`mailto:${item.value}`:item.channel==="telegram"&&item.value.startsWith("@")?`https://t.me/${item.value.slice(1)}`:undefined;
 const body=<><span>{contactChannelLabels[item.channel]??item.channel}{primary?" · основной":""}</span><strong>{item.value}</strong></>;
 return href?<a className={`candidate-contact-pill${primary?" primary":""}`} href={href}>{item.channel==="phone"?<Phone size={13}/>:<MessageCircle size={13}/>}<span>{body}</span></a>:<span className={`candidate-contact-pill${primary?" primary":""}`}><MessageCircle size={13}/><span>{body}</span></span>;
}
function dedupeDocuments(rows:CandidateProfile["documents"]){return rows.filter((row,index)=>rows.findIndex(item=>item.documentTypeId===row.documentTypeId)===index)}
function providerLabel(value:string){return value==="candidate"?"Предоставляет кандидат":value==="company"?"Оформляет компания":value==="client"?"Оформляет заказчик":value}
function deadlineLabel(value:string){return value==="documents"?"До оформления":value==="preparation"?"До подготовки к выходу":value==="first_shift"?"До первого выхода":value==="retention_7"?"До 7-го дня":value==="retention_30"?"До 30-го дня":"Без жёсткого срока"}
function documentStatusLabel(value:string){return value==="missing"?"Не получен":value==="requested"?"Запрошен":value==="received"?"Получен":value==="verified"?"Проверен":value==="to_prepare"?"Нужно оформить":value==="in_progress"?"В работе":value==="ready"?"Готов":value==="not_required"?"Не требуется":value==="rejected"?"Отклонён":value}
function nextActionDisplay(row:RecruitingApplicationRow){if(row.nextActionAt)return formatWorkDate(row.nextActionAt);const code=row.workflow?.actionCode;return code==="manager_interview"?"Ожидает интервью мастера":code==="documents_wait"?"Ожидаем документы":code==="clearance_progress"?"Оформляются допуски":code==="preparation_save"?"Подготовка к выходу":"Не запланировано"}
function preferredChannelFromContacts(rows:CandidateContactMethod[]){return rows.find(row=>row.isPreferred&&row.active)?.channel??null}
function firstContact(rows:CandidateContactMethod[],channel:CandidateContactMethod["channel"]){return rows.find(row=>row.channel===channel&&row.active)?.value??null}
function Field({name,label,value,type="text",required=false}:{name:string;label:string;value:string|null;type?:string;required?:boolean}){return <label>{label}<input name={name} type={type} defaultValue={value??""} required={required}/></label>}
function value(data:FormData,key:string){const result=String(data.get(key)??"").trim();return result||null}
function stageLabel(value:string|null){if(!value)return "Создан";return recruitingStageLabels[value as RecruitingStage]??value}
function communicationLabel(value:string){return value==="meeting"?"Встреча":value==="note"?"Заметка":contactChannelLabels[value]??value}
function initials(name:string){return name.split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase()}
