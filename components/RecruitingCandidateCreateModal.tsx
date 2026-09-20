"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import type { RecruitingApplicationRow, RecruitingNeedRow, RecruitingOptions } from "@/lib/recruiting/service";
import { recruitingStageLabels, type RecruitingStage } from "@/lib/recruiting/model";
import { saveDemoApplication } from "@/lib/recruiting/demo-client";

type ExtraContact={id:string;type:"email"|"telegram"|"whatsapp";value:string};
type Form={
  needId:string;fullName:string;phone:string;city:string;preferredChannel:string;
  source:string;sourceChannel:string;sourceCampaign:string;sourceReference:string;nextAction:string;
};

const sourceKindLabels:Record<string,string>={
  job_board:"Работный сайт",messenger:"Мессенджер",social:"Соцсеть",referral:"Рекомендация",
  partner:"Партнёр / агентство",offline:"Оффлайн",internal:"Внутренний",other:"Другое",
};

export function RecruitingCandidateCreateModal({
  needs,options,rows,initialNeed,demo,canConfigureSources,onClose,onCreated,
}:{needs:RecruitingNeedRow[];options:RecruitingOptions;rows:RecruitingApplicationRow[];initialNeed?:string|null;demo:boolean;canConfigureSources:boolean;onClose:()=>void;onCreated:()=>void}){
  const router=useRouter();
  const [form,setForm]=useState<Form>({needId:initialNeed??"",fullName:"",phone:"",city:"",preferredChannel:"phone",source:options.sourceCatalog[0]?.name??"Ручной ввод",sourceChannel:"",sourceCampaign:"",sourceReference:"",nextAction:""});
  const [contacts,setContacts]=useState<ExtraContact[]>([]);
  const [sourceCatalog,setSourceCatalog]=useState(options.sourceCatalog);
  const [showSourceCreate,setShowSourceCreate]=useState(false);
  const [newSource,setNewSource]=useState({name:"",kind:"other"});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const need=needs.find(item=>item.id===form.needId);
  const conditions=need?.conditions??{};
  const activeNeeds=useMemo(()=>needs.filter(item=>["open","in_progress"].includes(item.status)),[needs]);

  function addContact(){setContacts(current=>[...current,{id:crypto.randomUUID(),type:"telegram",value:""}]);}
  function conditionText(key:string){const value=conditions[key];return typeof value==="string"&&value.trim()?value:null;}
  function provided(key:string){return conditions[key]===true?"Предоставляется":conditions[key]===false?"Не предоставляется":null;}
  const documents=Array.isArray(conditions.documents)?conditions.documents.filter((item):item is string=>typeof item==="string"):[];

  async function createSource(){
    if(!newSource.name.trim())return;
    if(demo){
      const created={id:crypto.randomUUID(),name:newSource.name.trim(),kind:newSource.kind};
      setSourceCatalog(current=>[...current,created]);
      setForm(current=>({...current,source:created.name}));
      setShowSourceCreate(false);setNewSource({name:"",kind:"other"});return;
    }
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/recruiting/sources",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(newSource)});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error??"Не удалось добавить источник");
      setSourceCatalog(current=>[...current.filter(item=>item.id!==body.id),body]);
      setForm(current=>({...current,source:body.name}));
      setShowSourceCreate(false);setNewSource({name:"",kind:"other"});
    }catch(value){setError(value instanceof Error?value.message:"Не удалось добавить источник");}
    finally{setBusy(false);}
  }

  async function submit(event:React.FormEvent){
    event.preventDefault();setError("");
    if(!need){setError("Выберите потребность");return;}
    const email=contacts.find(item=>item.type==="email")?.value.trim()||null;
    const telegram=contacts.find(item=>item.type==="telegram")?.value.trim()||null;
    const whatsapp=contacts.find(item=>item.type==="whatsapp")?.value.trim()||null;
    if(!form.phone.trim()&&!email){setError("Укажите телефон или email кандидата");return;}
    setBusy(true);
    try{
      if(demo){
        const digits=form.phone.replace(/\D/g,"");
        const existing=rows.find(row=>(digits&&row.phone?.replace(/\D/g,"")===digits)||(email&&row.email?.toLowerCase()===email.toLowerCase()));
        if(existing&&rows.some(row=>row.candidateId===existing.candidateId&&row.needId===need.id))throw new Error("У кандидата уже есть заявка на эту потребность");
        const now=new Date().toISOString();const stage:RecruitingStage="new";
        const created:RecruitingApplicationRow={
          applicationId:crypto.randomUUID(),candidateId:existing?.candidateId??crypto.randomUUID(),organizationId:need.organizationId,
          fullName:form.fullName,phone:form.phone||null,email,preferredChannel:form.preferredChannel,telegram,whatsapp,city:form.city||null,
          source:form.source||"Ручной ввод",sourceChannel:form.sourceChannel||null,sourceCampaign:form.sourceCampaign||null,sourceReference:form.sourceReference||null,
          stage,stageLabel:recruitingStageLabels[stage],needId:need.id,need:need.title,objectId:need.objectId,object:need.object,regionId:need.regionId,clientId:need.clientId,
          ownerUserId:need.ownerUserId,owner:need.owner,managerUserId:need.managerUserId,manager:need.manager,responsibleUserId:need.ownerUserId,responsible:need.owner,
          assigneeUserIds:need.assigneeUserIds,createdAt:now,updatedAt:now,stageEnteredAt:now,nextActionAt:form.nextAction?new Date(form.nextAction).toISOString():null,
          nextAction:form.nextAction||null,plannedStartDate:null,actualStartAt:null,rejectionReason:null,rejectionReasonCode:null,conditions:need.conditions,
          workflow:{},stageEvents:[{toStage:"new",createdAt:now}],documentsReceived:0,documentsRequired:documents.length,
        };
        saveDemoApplication(created);
      }else{
        const response=await fetch("/api/candidates",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
          fullName:form.fullName,phone:form.phone||null,email,preferredChannel:form.preferredChannel,telegram,whatsapp,city:form.city||null,
          source:form.source||null,sourceChannel:form.sourceChannel||null,sourceCampaign:form.sourceCampaign||null,sourceReference:form.sourceReference||null,
          needId:form.needId,nextActionAt:form.nextAction?new Date(form.nextAction).toISOString():null,
        })});
        const body=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(body.error??"Не удалось добавить кандидата");
        router.refresh();
      }
      onCreated();onClose();
    }catch(value){setError(value instanceof Error?value.message:"Не удалось добавить кандидата");}
    finally{setBusy(false);}
  }

  return <div className="recruiting-modal" onMouseDown={event=>{if(event.currentTarget===event.target&&!busy)onClose()}}>
    <form className="recruiting-modal-card recruiting-candidate-create" onSubmit={submit}>
      <div className="recruiting-modal-head">
        <div><h2>Добавить кандидата</h2><p>Заполняйте карточку прямо во время звонка. Справа всегда видны условия выбранной потребности.</p></div>
        <button type="button" className="icon-button" onClick={onClose} disabled={busy}><X size={17}/></button>
      </div>
      {error&&<div className="recruiting-error">{error}</div>}
      <div className="candidate-create-layout">
        <div className="candidate-create-form">
          <label>Потребность
            <select required value={form.needId} onChange={event=>setForm(current=>({...current,needId:event.target.value}))}>
              <option value="">Выберите вакансию / потребность</option>
              {activeNeeds.map(item=><option key={item.id} value={item.id}>{item.title} · {item.object??item.region??"без объекта"} · найти {item.toRecruit}</option>)}
            </select>
          </label>
          <div className="candidate-create-row">
            <label>ФИО<input required autoFocus value={form.fullName} onChange={event=>setForm(current=>({...current,fullName:event.target.value}))} placeholder="Как представился кандидат"/></label>
            <label>Телефон<input value={form.phone} onChange={event=>setForm(current=>({...current,phone:event.target.value}))} placeholder="+7 ..."/></label>
          </div>
          <div className="candidate-create-row">
            <label>Город<input value={form.city} onChange={event=>setForm(current=>({...current,city:event.target.value}))}/></label>
            <label>Предпочтительная связь<select value={form.preferredChannel} onChange={event=>setForm(current=>({...current,preferredChannel:event.target.value}))}><option value="phone">Телефон</option><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="other">Другой</option></select></label>
          </div>
          <div className="candidate-extra-contacts">
            <div className="candidate-create-section-head"><strong>Дополнительные контакты</strong><button type="button" className="button" onClick={addContact}><Plus size={13}/> Добавить контакт</button></div>
            {contacts.length===0&&<span className="cell-sub">Telegram, WhatsApp и email добавляются только при необходимости.</span>}
            {contacts.map(contact=><div className="candidate-contact-row" key={contact.id}>
              <select value={contact.type} onChange={event=>setContacts(current=>current.map(item=>item.id===contact.id?{...item,type:event.target.value as ExtraContact["type"]}:item))}><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select>
              <input type={contact.type==="email"?"email":"text"} value={contact.value} onChange={event=>setContacts(current=>current.map(item=>item.id===contact.id?{...item,value:event.target.value}:item))} placeholder={contact.type==="telegram"?"@username или номер":"Ник / номер / адрес"}/>
              <button type="button" className="icon-button" onClick={()=>setContacts(current=>current.filter(item=>item.id!==contact.id))} aria-label="Удалить контакт"><Trash2 size={14}/></button>
            </div>)}
          </div>
          <div className="candidate-create-section">
            <div className="candidate-create-section-head"><strong>Источник</strong>{canConfigureSources&&<button type="button" className="button" onClick={()=>setShowSourceCreate(value=>!value)}><Plus size={13}/> Новый источник</button>}</div>
            <label>Источник<select value={form.source} onChange={event=>setForm(current=>({...current,source:event.target.value}))}>{sourceCatalog.map(item=><option key={item.id} value={item.name}>{item.name} · {sourceKindLabels[item.kind]??item.kind}</option>)}</select></label>
            {showSourceCreate&&<div className="candidate-source-create"><input value={newSource.name} onChange={event=>setNewSource(current=>({...current,name:event.target.value}))} placeholder="Например, ООО «Регион Персонал»"/><select value={newSource.kind} onChange={event=>setNewSource(current=>({...current,kind:event.target.value}))}>{Object.entries(sourceKindLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><button type="button" className="button" disabled={busy||!newSource.name.trim()} onClick={createSource}>Добавить</button></div>}
            <details><summary>Детали источника</summary><div className="candidate-create-row"><label>Канал / площадка<input value={form.sourceChannel} onChange={event=>setForm(current=>({...current,sourceChannel:event.target.value}))}/></label><label>Кампания / объявление<input value={form.sourceCampaign} onChange={event=>setForm(current=>({...current,sourceCampaign:event.target.value}))}/></label></div><label>Ссылка / идентификатор<input value={form.sourceReference} onChange={event=>setForm(current=>({...current,sourceReference:event.target.value}))}/></label></details>
          </div>
          <label>Следующее действие<input type="datetime-local" value={form.nextAction} onChange={event=>setForm(current=>({...current,nextAction:event.target.value}))}/></label>
        </div>

        <aside className="candidate-need-brief">
          {need?<><div className="candidate-need-brief-head"><span>УСЛОВИЯ ДЛЯ КАНДИДАТА</span><h3>{need.title}</h3><p>{need.object??need.region??"Локация не указана"}</p></div>
            <div className="candidate-need-pay"><span>Доход на руки</span><strong>{conditionText("workerPay")??"Уточняется"}</strong></div>
            <div className="candidate-need-facts">
              <Brief label="График" value={conditionText("schedule")}/>
              <Brief label="Смена" value={conditionText("shift")}/>
              <Brief label="Проживание" value={provided("housingProvided")??conditionText("housing")}/>
              <Brief label="Питание" value={provided("mealsProvided")??conditionText("meals")}/>
              <Brief label="Проезд" value={provided("travelProvided")??conditionText("travel")}/>
              <Brief label="Развозка" value={provided("shuttleProvided")??conditionText("shuttle")}/>
              <Brief label="СИЗ" value={provided("ppeProvided")??conditionText("ppe")}/>
              <Brief label="Медкомиссия" value={provided("medicalProvided")??conditionText("medical")}/>
            </div>
            <div className="candidate-need-staffing"><span>Нужно <strong>{need.required}</strong></span><span>Работают <strong>{need.working}</strong></span><span>Осталось найти <strong>{need.toRecruit}</strong></span></div>
            {conditionText("requirements")&&<div className="candidate-need-note"><strong>Требования</strong><p>{conditionText("requirements")}</p></div>}
            {documents.length>0&&<div className="candidate-need-note"><strong>Документы</strong><p>{documents.join(" · ")}</p></div>}
            {conditionText("comment")&&<div className="candidate-need-note"><strong>Комментарий рекрутеру</strong><p>{conditionText("comment")}</p></div>}
          </>:<div className="candidate-need-empty"><strong>Выберите потребность</strong><span>Здесь появятся зарплата, график, проживание, питание, проезд и другие условия для разговора.</span></div>}
        </aside>
      </div>
      <div className="recruiting-form-actions"><button type="button" className="button" onClick={onClose} disabled={busy}>Отмена</button><button className="button primary" disabled={busy}>{busy?"Сохраняю…":"Добавить кандидата"}</button></div>
    </form>
  </div>;
}

function Brief({label,value}:{label:string;value:string|null}){return <div><span>{label}</span><strong>{value??"—"}</strong></div>}
