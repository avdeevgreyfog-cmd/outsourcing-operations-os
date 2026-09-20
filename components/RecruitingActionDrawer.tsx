"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BriefcaseBusiness, FileCheck2, MessageSquarePlus, Phone, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { SalesDrawer } from "@/components/sales/SalesUI";
import type {
  CandidateDocumentChecklistItem,
  CandidateProfile,
  RecruitingApplicationRow,
  RecruitingNeedRow,
  RecruitingOptions,
  RecruitingPipelineStage,
} from "@/lib/recruiting/service";
import { contactChannelLabels, recruitingStageLabels, recruitingTerminalStages, type RecruitingStage } from "@/lib/recruiting/model";
import { reserveReasons, workRisks } from "@/lib/recruiting/workflow";
import { saveApplicationChange } from "@/lib/recruiting/client-actions";

type Props={
  row:RecruitingApplicationRow;
  need?:RecruitingNeedRow;
  pipeline?:RecruitingPipelineStage[];
  options?:RecruitingOptions;
  exitReasons?:RecruitingOptions["exitReasons"];
  initialStage?:RecruitingStage;
  demo:boolean;
  canEdit:boolean;
  canConvert:boolean;
  showResponsible?:boolean;
  onClose:()=>void;
  onSaved?:()=>void;
};

const documentStatusLabels:Record<CandidateDocumentChecklistItem["status"],string>={
  missing:"Не получен",requested:"Запрошен",received:"Получен",verified:"Проверен",not_required:"Не требуется",
};

const outcomeLabels=[
  ["interested","Заинтересован"],
  ["no_answer","Не дозвонился"],
  ["callback","Перезвонить"],
  ["documents_requested","Документы запрошены"],
] as const;

const defaultPipeline:RecruitingPipelineStage[]=[
  {stageCode:"new",label:"Новый контакт",stageKind:"new_contact",sortOrder:10,active:true,virtual:false,isSystem:true},
  {stageCode:"contact",label:"Интервью",stageKind:"interview",sortOrder:20,active:true,virtual:false,isSystem:true},
  {stageCode:"interview",label:"Документы",stageKind:"documents",sortOrder:30,active:true,virtual:false,isSystem:true},
  {stageCode:"preparation",label:"Подготовка к выходу",stageKind:"preparation",sortOrder:40,active:true,virtual:false,isSystem:true},
  {stageCode:"ready",label:"Готов к выходу",stageKind:"preparation",sortOrder:45,active:false,virtual:false,isSystem:true},
  {stageCode:"started",label:"Первый выход",stageKind:"first_shift",sortOrder:50,active:true,virtual:false,isSystem:true},
];

function defaultCallbackDate(){
  const date=new Date(Date.now()+86400000);
  date.setHours(10,0,0,0);
  return localDate(date.toISOString());
}

export function RecruitingActionDrawer({row,need,pipeline,options,exitReasons,initialStage,demo,canEdit,canConvert,showResponsible=false,onClose,onSaved}:Props){
  const router=useRouter();
  const effectivePipeline=pipeline??defaultPipeline;
  const effectiveOptions=options??{
    specialties:[],regions:[],objects:[],recruiters:[],responsibles:row.responsibleUserId&&row.responsible?[{id:row.responsibleUserId,name:row.responsible}]:[],
    sources:[],sourceCatalog:[],exitReasons:exitReasons??[],
  };
  const [profile,setProfile]=useState<CandidateProfile|null>(null);
  const [stage,setStage]=useState<RecruitingStage>(initialStage??row.stage);
  const [workflow,setWorkflow]=useState(row.workflow??{});
  const [next,setNext]=useState(localDate(row.nextActionAt));
  const [planned,setPlanned]=useState(row.plannedStartDate??"");
  const [actual,setActual]=useState("");
  const [reason,setReason]=useState("");
  const [code,setCode]=useState(row.rejectionReasonCode??"");
  const [responsibleUserId,setResponsibleUserId]=useState(row.responsibleUserId??row.ownerUserId??"");
  const [identity,setIdentity]=useState({
    phone:row.phone??"",email:row.email??"",telegram:row.telegram??"",whatsapp:row.whatsapp??"",city:row.city??"",preferredChannel:row.preferredChannel??"phone",
  });
  const [documents,setDocuments]=useState<CandidateDocumentChecklistItem[]>([]);
  const [comment,setComment]=useState("");
  const [commentChannel,setCommentChannel]=useState("note");
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");

  useEffect(()=>{
    if(demo)return;
    let active=true;
    fetch(`/api/candidates/${row.candidateId}`)
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error??"Не удалось загрузить карточку");return body as CandidateProfile})
      .then(body=>{
        if(!active)return;
        setProfile(body);
        setIdentity({
          phone:body.phone??"",email:body.email??"",telegram:body.telegram??"",whatsapp:body.whatsapp??"",city:body.city??"",preferredChannel:body.preferredChannel??"phone",
        });
        setDocuments(body.documents.filter(item=>item.applicationId===row.applicationId));
      })
      .catch(value=>{if(active)setError(value instanceof Error?value.message:"Не удалось загрузить карточку")});
    return()=>{active=false};
  },[demo,row.applicationId,row.candidateId]);

  useEffect(()=>{
    if(!demo||documents.length)return;
    const configured=Array.isArray(row.conditions.documents)?row.conditions.documents.filter((value):value is string=>typeof value==="string"):[];
    if(!configured.length)return;
    const timer=window.setTimeout(()=>setDocuments(configured.map((name,index)=>({id:`demo-${index}`,applicationId:row.applicationId,documentName:name,status:"missing",required:true,note:null,sortOrder:index*10,updatedAt:""}))),0);
    return()=>window.clearTimeout(timer);
  },[demo,documents.length,row.applicationId,row.conditions.documents]);

  const risks=workRisks(row);
  const realStages=useMemo(()=>{
    const stageCodes=effectivePipeline.filter(item=>!item.virtual&&(item.active||item.stageCode===row.stage)).map(item=>item.stageCode);
    for(const terminal of recruitingTerminalStages)if(!stageCodes.includes(terminal))stageCodes.push(terminal);
    return stageCodes as RecruitingStage[];
  },[effectivePipeline,row.stage]);
  const stageLabel=useCallback((value:string)=>effectivePipeline.find(item=>item.stageCode===value)?.label??recruitingStageLabels[value as RecruitingStage]??value,[effectivePipeline]);
  const conditions=need?.conditions??row.conditions;
  const c=(key:string)=>typeof conditions[key]==="string"&&String(conditions[key]).trim()?String(conditions[key]):null;
  const provided=(key:string)=>conditions[key]===true?"Да":conditions[key]===false?"Нет":null;

  const timeline=useMemo(()=>{
    const communications=(profile?.communications??[]).filter(item=>!item.applicationId||item.applicationId===row.applicationId).map(item=>({kind:"comment" as const,date:item.happenedAt,author:item.author,title:item.channel==="note"?"Комментарий":contactChannelLabels[item.channel]??item.channel,text:item.summary}));
    const history=(profile?.history??[]).filter(item=>item.applicationId===row.applicationId).map(item=>({kind:"system" as const,date:item.changedAt,author:item.changedBy,title:`${item.fromStage?stageLabel(item.fromStage)+" → ":""}${stageLabel(item.toStage)}`,text:item.reason??""}));
    return [...communications,...history].sort((a,b)=>parseRuDate(b.date)-parseRuDate(a.date)).slice(0,6);
  },[profile,row.applicationId,stageLabel]);

  function setOutcome(value:typeof outcomeLabels[number][0]){
    const messages:Record<typeof value,{last:string;next:string}>={
      interested:{last:"Кандидат заинтересован, условия обсудили",next:"Продолжить обработку кандидата"},
      no_answer:{last:"Не дозвонился",next:"Повторно связаться"},
      callback:{last:"Договорились созвониться позже",next:"Перезвонить кандидату"},
      documents_requested:{last:"Документы запрошены",next:"Проверить получение документов"},
    };
    setWorkflow(current=>({...current,contactOutcome:value,lastContact:messages[value].last,nextActionText:messages[value].next}));
    if(value==="no_answer"||value==="callback")setNext(defaultCallbackDate());
    if(value==="documents_requested"&&stage==="contact")setStage("interview");
  }

  async function saveIdentity(){
    if(demo||!canEdit)return;
    const base=profile;
    const response=await fetch(`/api/candidates/${row.candidateId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
      fullName:base?.fullName??row.fullName,
      phone:identity.phone||null,email:identity.email||null,preferredChannel:identity.preferredChannel||null,
      telegram:identity.telegram||null,whatsapp:identity.whatsapp||null,city:identity.city||null,birthDate:base?.birthDate??null,
      source:base?.source??row.source??null,sourceChannel:base?.sourceChannel??row.sourceChannel??null,
      sourceCampaign:base?.sourceCampaign??row.sourceCampaign??null,sourceReference:base?.sourceReference??row.sourceReference??null,
      notes:base?.notes??null,
    })});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error??"Не удалось обновить данные кандидата");
  }

  async function saveDocuments(){
    if(!documents.length||demo||!canEdit)return;
    const response=await fetch(`/api/candidates/${row.candidateId}/documents`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({
      applicationId:row.applicationId,
      items:documents.map(item=>({documentName:item.documentName,status:item.status,required:item.required,note:item.note,sortOrder:item.sortOrder})),
    })});
    const body=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(body.error??"Не удалось обновить документы");
  }

  async function save(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();
    const fields=new FormData(event.currentTarget);
    const nextValue=String(fields.get("nextActionAt")??"");
    const plannedValue=String(fields.get("plannedStartDate")??planned);
    const actualValue=String(fields.get("actualStartAt")??"");
    const reviewValue=String(fields.get("reviewDueAt")??"");
    setBusy("save");setError("");
    try{
      await saveIdentity();
      await saveDocuments();
      await saveApplicationChange(row,{
        stage,
        responsibleUserId:responsibleUserId||null,
        workflow:{...workflow,...(stage==="manager_review"?{reviewDueAt:reviewValue?new Date(reviewValue).toISOString():undefined}:{})},
        nextActionAt:nextValue?new Date(nextValue).toISOString():null,
        plannedStartDate:plannedValue||null,
        actualStartAt:actualValue?new Date(actualValue).toISOString():null,
        reason,reasonCode:code||undefined,
      },demo);
      router.refresh();onSaved?.();onClose();
    }catch(value){setError(value instanceof Error?value.message:"Не удалось сохранить");}
    finally{setBusy("");}
  }

  async function addComment(){
    if(!comment.trim())return;
    if(demo){
      setProfile(current=>current?{...current,communications:[{id:crypto.randomUUID(),applicationId:row.applicationId,channel:commentChannel,direction:"internal",summary:comment,happenedAt:new Date().toLocaleString("ru-RU"),author:"Текущий пользователь"},...current.communications]}:current);
      setComment("");return;
    }
    setBusy("comment");setError("");
    try{
      const response=await fetch(`/api/candidates/${row.candidateId}/communications`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({applicationId:row.applicationId,channel:commentChannel,direction:commentChannel==="note"?"internal":"outbound",summary:comment})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error??"Не удалось добавить запись");
      const refresh=await fetch(`/api/candidates/${row.candidateId}`);
      if(refresh.ok)setProfile(await refresh.json());
      setComment("");
    }catch(value){setError(value instanceof Error?value.message:"Не удалось добавить запись");}
    finally{setBusy("");}
  }

  return <SalesDrawer title={row.fullName} subtitle={`${row.need} · ${row.object??"Без объекта"}`} onClose={()=>{if(!busy)onClose()}}>
    <form onSubmit={save} className="candidate-work-drawer">
      <section className="candidate-work-summary">
        <div className="candidate-work-contact"><Phone size={14}/><strong>{identity.phone||identity.email||"Контакт не указан"}</strong><span>{identity.city||"Город не указан"}</span></div>
        <span className="candidate-work-stage">{stageLabel(row.stage)}</span>
        {risks.length>0&&<span className="needs-overdue">{risks[0]}</span>}
      </section>

      {error&&<div role="alert" className="recruiting-error">{error}</div>}

      <section className="candidate-work-section">
        <header><div><h3>Кандидат</h3><p>Основные данные для разговора и связи.</p></div><UserRound size={16}/></header>
        <div className="candidate-work-grid">
          <label>Телефон<input value={identity.phone} disabled={!canEdit} onChange={event=>setIdentity(current=>({...current,phone:event.target.value}))}/></label>
          <label>Город<input value={identity.city} disabled={!canEdit} onChange={event=>setIdentity(current=>({...current,city:event.target.value}))}/></label>
          <label>Предпочтительная связь<select value={identity.preferredChannel} disabled={!canEdit} onChange={event=>setIdentity(current=>({...current,preferredChannel:event.target.value}))}><option value="phone">Телефон</option><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="other">Другой</option></select></label>
          <label>Email<input type="email" value={identity.email} disabled={!canEdit} onChange={event=>setIdentity(current=>({...current,email:event.target.value}))}/></label>
          <label>Telegram<input value={identity.telegram} disabled={!canEdit} onChange={event=>setIdentity(current=>({...current,telegram:event.target.value}))}/></label>
          <label>WhatsApp<input value={identity.whatsapp} disabled={!canEdit} onChange={event=>setIdentity(current=>({...current,whatsapp:event.target.value}))}/></label>
        </div>
        <div className="candidate-work-source"><span>Источник</span><strong>{[row.source,row.sourceChannel,row.sourceCampaign].filter(Boolean).join(" · ")||"Не указан"}</strong></div>
      </section>

      <section className="candidate-work-section candidate-vacancy-brief">
        <header><div><h3>Условия вакансии</h3><p>То, что менеджер должен видеть во время разговора.</p></div><BriefcaseBusiness size={16}/></header>
        <div className="candidate-vacancy-pay"><span>Доход на руки</span><strong>{c("workerPay")??"Уточняется"}</strong></div>
        <div className="candidate-vacancy-grid">
          <Fact label="График" value={c("schedule")}/>
          <Fact label="Смена" value={c("shift")}/>
          <Fact label="Проживание" value={provided("housingProvided")??c("housing")}/>
          <Fact label="Питание" value={provided("mealsProvided")??c("meals")}/>
          <Fact label="Проезд" value={provided("travelProvided")??c("travel")}/>
          <Fact label="Развозка" value={provided("shuttleProvided")??c("shuttle")}/>
        </div>
        {c("requirements")&&<p className="candidate-vacancy-requirements"><strong>Требования:</strong> {c("requirements")}</p>}
      </section>

      <section className="candidate-work-section">
        <header><div><h3>История работы с кандидатом</h3><p>Комментарии людей и системные переходы в одной хронологии.</p></div><MessageSquarePlus size={16}/></header>
        <div className="candidate-timeline">
          {timeline.length?timeline.map((item,index)=><div className={`candidate-timeline-item ${item.kind}`} key={`${item.kind}-${item.date}-${index}`}><span>{item.date}</span><div><strong>{item.title}</strong><small>{item.author}</small>{item.text&&<p>{item.text}</p>}</div></div>):<div className="empty-inline">История пока пуста</div>}
        </div>
        {canEdit&&<div className="candidate-comment-box"><select value={commentChannel} onChange={event=>setCommentChannel(event.target.value)}><option value="note">Комментарий</option><option value="phone">Телефон</option><option value="telegram">Telegram</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option><option value="meeting">Личная встреча</option></select><textarea value={comment} onChange={event=>setComment(event.target.value)} placeholder="Что обсудили, что уточнить, важный комментарий по кандидату"/><button type="button" className="button" onClick={addComment} disabled={busy==="comment"||!comment.trim()}>Добавить запись</button></div>}
      </section>

      <fieldset disabled={busy==="save"||!canEdit} className="candidate-work-section candidate-work-actions">
        <header><div><h3>Текущее действие</h3><p>Зафиксируйте результат и следующий шаг.</p></div></header>
        <div className="candidate-outcomes">{outcomeLabels.map(([value,label])=><button type="button" className={workflow.contactOutcome===value?"button active":"button"} key={value} onClick={()=>setOutcome(value)}>{label}</button>)}<button type="button" className="button" onClick={()=>setStage("rejected")}>Отказ кандидата</button></div>
        <label>Последний результат общения<textarea value={workflow.lastContact??""} onChange={event=>setWorkflow(current=>({...current,lastContact:event.target.value}))}/></label>
        <div className="candidate-work-grid">
          <label>Следующее действие<input value={workflow.nextActionText??""} onChange={event=>setWorkflow(current=>({...current,nextActionText:event.target.value}))}/></label>
          <label>Срок следующего действия<input name="nextActionAt" type="datetime-local" value={next} onChange={event=>setNext(event.target.value)}/></label>
          {showResponsible&&<label>Текущий ответственный<select value={responsibleUserId} onChange={event=>setResponsibleUserId(event.target.value)}><option value="">Не назначен</option>{effectiveOptions.responsibles.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
          <label>Этап<select value={stage} onChange={event=>setStage(event.target.value as RecruitingStage)}>{realStages.map(value=><option key={value} value={value} disabled={value==="started"&&!canConvert}>{stageLabel(value)}</option>)}</select></label>
        </div>

        {stage==="interview"&&<DocumentChecklist items={documents} onChange={setDocuments}/>}
        {["preparation","ready","started"].includes(stage)&&<>
          <div className="candidate-work-grid">
            <label>Плановая дата выхода<input name="plannedStartDate" type="date" value={planned} onChange={event=>setPlanned(event.target.value)}/></label>
            <label>Смена<input value={workflow.plannedShift??""} onChange={event=>setWorkflow(current=>({...current,plannedShift:event.target.value}))} placeholder="Дневная · 08:00–20:00"/></label>
            <label>Логистика<select value={workflow.travelStatus??"planning"} onChange={event=>setWorkflow(current=>({...current,travelStatus:event.target.value as typeof current.travelStatus}))}><option value="not_required">Не требуется</option><option value="planning">Планируется</option><option value="ticket_required">Нужно купить билет</option><option value="ticket_purchased">Билет куплен</option><option value="travelling">В пути</option><option value="arrived">Прибыл</option></select></label>
            <label>Прибытие / комментарий<input value={workflow.arrivalDetails??""} onChange={event=>setWorkflow(current=>({...current,arrivalDetails:event.target.value}))} placeholder="Поезд, время прибытия, встреча"/></label>
          </div>
          <label className="candidate-work-check"><input type="checkbox" checked={workflow.confirmed??false} onChange={event=>setWorkflow(current=>({...current,confirmed:event.target.checked}))}/> Кандидат подтвердил дату и смену</label>
          <label className="candidate-work-check"><input type="checkbox" checked={workflow.readiness??false} onChange={event=>setWorkflow(current=>({...current,readiness:event.target.checked}))}/> Документы, допуски и логистика готовы</label>
        </>}
        {stage==="started"&&row.stage!=="started"&&<label>Фактическое время первого выхода<input required name="actualStartAt" type="datetime-local" value={actual} onChange={event=>setActual(event.target.value)}/></label>}
        {stage==="manager_review"&&<div className="candidate-work-grid"><label>Кто принимает решение<input required value={workflow.reviewRecipient??""} onChange={event=>setWorkflow(current=>({...current,reviewRecipient:event.target.value}))}/></label><label>Срок решения<input required name="reviewDueAt" type="datetime-local" value={localDate(workflow.reviewDueAt)} onChange={event=>setWorkflow(current=>({...current,reviewDueAt:event.target.value?new Date(event.target.value).toISOString():undefined}))}/></label></div>}
        {stage==="reserve"&&<label>Причина резерва<select required value={workflow.reserveReason??""} onChange={event=>setWorkflow(current=>({...current,reserveReason:event.target.value}))}><option value="">Выберите причину</option>{reserveReasons.map(item=><option key={item}>{item}</option>)}</select></label>}
        {["rejected","no_show"].includes(stage)&&<label>Причина завершения<select required value={code} onChange={event=>setCode(event.target.value)}><option value="">Выберите причину</option>{effectiveOptions.exitReasons.filter(item=>item.kind===stage||item.kind==="both").map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></label>}
        {stage!==row.stage&&<label>Комментарий к переходу<textarea value={reason} onChange={event=>setReason(event.target.value)} placeholder={stage==="rejected"||stage==="no_show"?"Что произошло":"При необходимости уточните причину перехода"}/></label>}
      </fieldset>

      <div className="recruiting-form-actions candidate-drawer-footer">
        <Link className="button" href={`/candidates/${row.candidateId}`}>Полная карточка</Link>
        {canEdit&&<button className="button primary" disabled={Boolean(busy)}>{busy==="save"?"Сохраняю…":"Сохранить"}</button>}
      </div>
    </form>
  </SalesDrawer>;
}

function DocumentChecklist({items,onChange}:{items:CandidateDocumentChecklistItem[];onChange:(items:CandidateDocumentChecklistItem[])=>void}){
  return <div className="candidate-documents">
    <div className="candidate-documents-head"><FileCheck2 size={15}/><div><strong>Документы</strong><span>{items.filter(item=>item.required&&["received","verified"].includes(item.status)).length} / {items.filter(item=>item.required&&item.status!=="not_required").length} получено</span></div></div>
    {items.length?items.map(item=><div className="candidate-document-row" key={item.id}><span>{item.documentName}</span><select value={item.status} onChange={event=>onChange(items.map(current=>current.id===item.id?{...current,status:event.target.value as CandidateDocumentChecklistItem["status"]}:current))}>{Object.entries(documentStatusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></div>):<span className="cell-sub">Для этой потребности обязательные документы не настроены.</span>}
  </div>;
}

function Fact({label,value}:{label:string;value:string|null}){return <div><span>{label}</span><strong>{value??"—"}</strong></div>}
function localDate(value?:string|null){if(!value||!Number.isFinite(Date.parse(value)))return "";const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function parseRuDate(value:string){const match=value.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})/);if(!match)return 0;return new Date(Number(match[3]),Number(match[2])-1,Number(match[1]),Number(match[4]),Number(match[5])).getTime()}
