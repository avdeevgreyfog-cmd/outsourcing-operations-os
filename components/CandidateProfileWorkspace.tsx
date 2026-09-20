"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyValue, Section, Status } from "@/components/UI";
import type { CandidateProfile, RecruitingApplicationRow } from "@/lib/recruiting/service";
import { contactChannelLabels, recruitingStageLabels, type RecruitingStage } from "@/lib/recruiting/model";

import { RecruitingActionDrawer } from "./RecruitingActionDrawer";
import { mergeDemoApplications, readDemoApplications, recruitingEvent, saveDemoApplication } from "@/lib/recruiting/demo-client";
import {formatWorkDate} from "@/lib/recruiting/workflow";
import type {RecruitingOptions} from "@/lib/recruiting/service";

type Props={exitReasons:RecruitingOptions["exitReasons"];profile:CandidateProfile|null;candidateId:string;demo:boolean;canEdit:boolean;canConvert:boolean};
type Tab="overview"|"applications"|"communications"|"history";
const appStorage="operis.recruiting.applications.v1";
const profileStorage="operis.recruiting.profiles.v1";
const commStorage="operis.recruiting.communications.v1";

export function CandidateProfileWorkspace({profile,candidateId,demo,canEdit,canConvert,exitReasons}:Props){
 const router=useRouter();
 const [tab,setTab]=useState<Tab>("overview");
 const [current,setCurrent]=useState<CandidateProfile|null>(profile);
 const [selected,setSelected]=useState<RecruitingApplicationRow|null>(null);
 const [editing,setEditing]=useState(false);
 const [busy,setBusy]=useState("");
 const [error,setError]=useState("");
 const [comm,setComm]=useState({applicationId:"",channel:"phone",direction:"outbound",summary:""});

 useEffect(()=>{
  if(!demo){const frame=requestAnimationFrame(()=>setCurrent(profile));return()=>cancelAnimationFrame(frame);}
  let frame=0;
  try{
   const custom=(JSON.parse(localStorage.getItem(profileStorage)||"{}") as Record<string,Partial<CandidateProfile>>)[candidateId];
   const apps=JSON.parse(localStorage.getItem(appStorage)||"[]") as RecruitingApplicationRow[];
   const candidateApps=apps.filter(x=>x.candidateId===candidateId);
   const first=profile?.applications[0]??candidateApps[0];
   if(!first&&!profile)return;
   const localComms=(JSON.parse(localStorage.getItem(commStorage)||"[]") as Array<CandidateProfile["communications"][number]&{candidateId:string}>).filter(x=>x.candidateId===candidateId);
   const applications=mergeDemoApplications(profile?.applications??[],candidateApps);
   const hydrated:CandidateProfile={
    id:candidateId,fullName:custom?.fullName??profile?.fullName??first?.fullName??"Кандидат",phone:custom?.phone??profile?.phone??first?.phone??null,
    email:custom?.email??profile?.email??first?.email??null,preferredChannel:custom?.preferredChannel??profile?.preferredChannel??first?.preferredChannel??null,
    telegram:custom?.telegram??profile?.telegram??first?.telegram??null,whatsapp:custom?.whatsapp??profile?.whatsapp??first?.whatsapp??null,
    city:custom?.city??profile?.city??first?.city??null,birthDate:custom?.birthDate??profile?.birthDate??null,source:custom?.source??profile?.source??first?.source??null,
    sourceChannel:custom?.sourceChannel??profile?.sourceChannel??first?.sourceChannel??null,sourceCampaign:custom?.sourceCampaign??profile?.sourceCampaign??first?.sourceCampaign??null,
    sourceReference:custom?.sourceReference??profile?.sourceReference??first?.sourceReference??null,notes:custom?.notes??profile?.notes??null,
    status:profile?.status??(applications.some(x=>x.stage==="started")?"worker":"active"),applications,
    communications:[...localComms,...(profile?.communications??[]).filter(x=>!localComms.some(y=>y.id===x.id))],history:applications.flatMap(a=>(a.stageEvents??[]).map((h,i)=>({id:`${a.applicationId}-${i}`,applicationId:a.applicationId,fromStage:h.fromStage??null,toStage:h.toStage,changedAt:formatWorkDate(h.createdAt),changedBy:"Учебная история",reason:h.reason??null,reasonCode:h.reasonCode??null}))),
    documents:profile?.documents??[],
   };
   frame=requestAnimationFrame(()=>setCurrent(hydrated));
  }catch{}
  return()=>{if(frame)cancelAnimationFrame(frame)};
 },[candidateId,demo,profile]);

 const latest=current?.applications[0]??null;
 const tabs:[Tab,string][]=[["overview","Обзор"],["applications","Заявки"],["communications","Коммуникации"],["history","История"]];

 async function saveProfile(event:React.FormEvent<HTMLFormElement>){
  event.preventDefault();if(!current)return;setBusy("profile");setError("");
  const data=new FormData(event.currentTarget);
  const payload={fullName:String(data.get("fullName")||""),phone:value(data,"phone"),email:value(data,"email"),preferredChannel:value(data,"preferredChannel"),telegram:value(data,"telegram"),whatsapp:value(data,"whatsapp"),city:value(data,"city"),birthDate:value(data,"birthDate"),source:value(data,"source"),sourceChannel:value(data,"sourceChannel"),sourceCampaign:value(data,"sourceCampaign"),sourceReference:value(data,"sourceReference"),notes:value(data,"notes")};
  try{
   if(demo){const all=JSON.parse(localStorage.getItem(profileStorage)||"{}");all[candidateId]=payload;localStorage.setItem(profileStorage,JSON.stringify(all));current.applications.forEach(app=>{const {source: _source,sourceChannel:_channel,sourceCampaign:_campaign,sourceReference:_reference,...identity}=payload;void _source;void _channel;void _campaign;void _reference;saveDemoApplication({...app,...identity});});window.dispatchEvent(new Event(recruitingEvent));setCurrent(x=>x?{...x,...payload}:x);}
   else{const response=await fetch(`/api/candidates/${candidateId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить карточку");router.refresh();}
   setEditing(false);
  }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить карточку");}finally{setBusy("");}
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
  }catch(e){setError(e instanceof Error?e.message:"Не удалось добавить коммуникацию");}finally{setBusy("");}
 }

 if(!current)return <div className="empty"><strong>Кандидат не найден</strong><span>Карточка недоступна в вашем контуре.</span><Link className="button" href="/candidates">Вернуться к кандидатам</Link></div>;
 return <div className="recruiting-workspace">
  {error&&<div className="recruiting-error">{error}</div>}
  <nav className="entity-tabs" aria-label="Разделы карточки кандидата">{tabs.map(([key,label])=><button type="button" key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}{key==="applications"&&<span>{current.applications.length}</span>}{key==="communications"&&<span>{current.communications.length}</span>}</button>)}</nav>
  {tab==="overview"&&<div className="candidate-profile-grid"><div>
   {editing?<Section title="Редактирование карточки" note="Единые данные человека для всех его заявок"><form className="recruiting-form" onSubmit={saveProfile}><div className="recruiting-form-grid"><Field name="fullName" label="ФИО" value={current.fullName} required/><Field name="phone" label="Телефон" value={current.phone}/><Field name="email" label="Email" value={current.email} type="email"/><label>Предпочтительный канал<select name="preferredChannel" defaultValue={current.preferredChannel??"phone"}><option value="phone">Телефон</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option><option value="email">Email</option><option value="other">Другой</option></select></label><Field name="telegram" label="Telegram" value={current.telegram}/><Field name="whatsapp" label="WhatsApp" value={current.whatsapp}/><Field name="city" label="Город" value={current.city}/><Field name="birthDate" label="Дата рождения" value={current.birthDate} type="date"/><Field name="source" label="Источник" value={current.source}/><Field name="sourceChannel" label="Канал / площадка" value={current.sourceChannel}/><Field name="sourceCampaign" label="Кампания / объявление" value={current.sourceCampaign}/><Field name="sourceReference" label="Ссылка / ID источника" value={current.sourceReference}/><label className="wide">Комментарий<textarea name="notes" defaultValue={current.notes??""}/></label></div><div className="recruiting-form-actions"><button type="button" className="button" onClick={()=>setEditing(false)}>Отмена</button><button className="button primary" disabled={busy==="profile"}>Сохранить</button></div></form></Section>
   :<Section title="Основные данные" note="Одна карточка человека независимо от количества объектов" actions={canEdit||demo?<button type="button" className="button" onClick={()=>setEditing(true)}>Редактировать</button>:undefined}><div className="candidate-identity"><KeyValue label="Телефон" value={current.phone??"—"}/><KeyValue label="Email" value={current.email??"—"}/><KeyValue label="Предпочтительный канал" value={contactChannelLabels[current.preferredChannel??""]??"—"}/><KeyValue label="Telegram" value={current.telegram??"—"}/><KeyValue label="WhatsApp" value={current.whatsapp??"—"}/><KeyValue label="Город" value={current.city??"—"}/><KeyValue label="Дата рождения" value={current.birthDate??"—"}/><KeyValue label="Статус" value={current.status==="worker"?"Переведён в сотрудники":"Кандидат"}/></div></Section>}
   <Section title="Атрибуция" note="Для аналитики источников и рекламных кампаний"><div className="candidate-identity"><KeyValue label="Источник" value={current.source??"—"}/><KeyValue label="Канал" value={current.sourceChannel??"—"}/><KeyValue label="Кампания / объявление" value={current.sourceCampaign??"—"}/><KeyValue label="Ссылка / ID" value={current.sourceReference??"—"}/></div></Section>
  </div><div><Section title="Текущий статус"><div style={{padding:"6px 15px 14px"}}>{latest?<><KeyValue label="Потребность" value={latest.need}/><KeyValue label="Объект" value={latest.object??"—"}/><KeyValue label="Этап" value={<Status tone={latest.stage==="started"?"good":"info"}>{latest.stageLabel}</Status>}/><KeyValue label="Рекрутер" value={latest.owner??"—"}/><KeyValue label="Менеджер / мастер" value={latest.manager??"—"}/><KeyValue label="Следующее действие" value={`${latest.workflow?.nextActionText??""} ${formatWorkDate(latest.nextActionAt)}`}/></>:<span>Нет активных заявок</span>}</div></Section><Section title="Комментарий"><div style={{padding:"6px 15px 14px",fontSize:12,lineHeight:1.5}}>{current.notes??"Комментарий не добавлен"}</div></Section></div></div>}
  {tab==="applications"&&<Section title="Заявки кандидата" note="Один человек может участвовать в нескольких потребностях, история не теряется"><div className="candidate-applications">{current.applications.map(application=><div className="candidate-application-row" key={application.applicationId}><div><strong>{application.need}</strong><span>{application.object??"Без объекта"}</span></div><div><Status tone={application.stage==="started"?"good":["rejected","no_show"].includes(application.stage)?"bad":"info"}>{application.stageLabel}</Status><span>{application.rejectionReason??""}</span></div><div><strong>{application.owner??"Без рекрутера"}</strong><span>{formatWorkDate(application.nextActionAt)}</span></div><div><button className="button" onClick={()=>setSelected(application)}>Этап и действия</button></div></div>)}</div></Section>}
  {tab==="communications"&&<div className="candidate-profile-grid"><Section title="Хронология коммуникаций" note="Звонки, мессенджеры, встречи и внутренние заметки"><div className="candidate-history">{current.communications.length?current.communications.map(row=><div className="candidate-history-item" key={row.id}><time>{row.happenedAt}</time><div><strong>{row.author} · {communicationLabel(row.channel)}</strong><p>{row.summary}</p></div></div>):<div className="empty-inline">Коммуникаций пока нет</div>}</div></Section><Section title="Добавить запись"><form className="recruiting-form" onSubmit={addCommunication}><label>Заявка<select value={comm.applicationId} onChange={e=>setComm(x=>({...x,applicationId:e.target.value}))}><option value="">Общая по кандидату</option>{current.applications.map(x=><option key={x.applicationId} value={x.applicationId}>{x.need} · {x.object??"без объекта"}</option>)}</select></label><label>Канал<select value={comm.channel} onChange={e=>setComm(x=>({...x,channel:e.target.value}))}><option value="phone">Телефон</option><option value="whatsapp">WhatsApp</option><option value="telegram">Telegram</option><option value="email">Email</option><option value="meeting">Встреча</option><option value="note">Заметка</option></select></label><label>Направление<select value={comm.direction} onChange={e=>setComm(x=>({...x,direction:e.target.value}))}><option value="outbound">Исходящая</option><option value="inbound">Входящая</option><option value="internal">Внутренняя</option></select></label><label>Результат / заметка<textarea required value={comm.summary} onChange={e=>setComm(x=>({...x,summary:e.target.value}))}/></label><button className="button primary" disabled={busy==="communication"||(!canEdit&&!demo)}>Добавить запись</button></form></Section></div>}
  {tab==="history"&&<Section title="Системная история этапов" note="Отдельно от человеческих комментариев и коммуникаций"><div className="candidate-history">{current.history.length?current.history.map(row=><div className="candidate-history-item" key={row.id}><time>{row.changedAt}</time><div><strong>{row.changedBy}: {stageLabel(row.fromStage)} → {stageLabel(row.toStage)}</strong>{row.reason&&<p>{row.reason}</p>}</div></div>):<div className="empty-inline">Изменений этапов пока нет</div>}</div></Section>}
 {selected&&<RecruitingActionDrawer row={selected} demo={demo} canEdit={canEdit} canConvert={canConvert} exitReasons={exitReasons} onClose={()=>setSelected(null)} onSaved={()=>{if(demo){const apps=mergeDemoApplications(current.applications,readDemoApplications().filter(x=>x.candidateId===candidateId));setCurrent(x=>x?{...x,applications:apps,status:apps.some(a=>a.stage==='started')?'worker':x.status,history:apps.flatMap(a=>(a.stageEvents??[]).map((h,i)=>({id:`${a.applicationId}-${i}`,applicationId:a.applicationId,fromStage:h.fromStage??null,toStage:h.toStage,changedAt:formatWorkDate(h.createdAt),changedBy:'Текущий пользователь',reason:h.reason??null,reasonCode:h.reasonCode??null})))}:x);}}}/>}
 </div>;
}

function Field({name,label,value,type="text",required=false}:{name:string;label:string;value:string|null;type?:string;required?:boolean}){return <label>{label}<input name={name} type={type} defaultValue={value??""} required={required}/></label>}
function value(data:FormData,key:string){const result=String(data.get(key)??"").trim();return result||null}
function stageLabel(value:string|null){if(!value)return "Создан";return recruitingStageLabels[value as RecruitingStage]??(value==="call"?"Контакт":value==="documents"?"Подготовка":value==="first_shift"?"Вышел":value)}
function communicationLabel(value:string){return value==="meeting"?"Встреча":value==="note"?"Заметка":contactChannelLabels[value]??value}
