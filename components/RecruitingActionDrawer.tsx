"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, PhoneCall, PhoneOff, UserRound, X } from "lucide-react";
import { SalesDrawer } from "@/components/sales/SalesUI";
import type { RecruitingApplicationRow, RecruitingFunnelStageSetting, RecruitingNeedRow, RecruitingOptions } from "@/lib/recruiting/service";
import type { RecruitingStage } from "@/lib/recruiting/model";
import { recruitingStageLabels } from "@/lib/recruiting/model";
import { formatWorkDate, reserveReasons, workRisks } from "@/lib/recruiting/workflow";
import { saveApplicationChange } from "@/lib/recruiting/client-actions";

type DocumentRow={documentTypeId:string;name:string;status:string;note:string|null};

export function RecruitingActionDrawer({
  row,need=null,stages,initialStage,exitReasons,demo,canEdit,canConvert,onClose,onSaved,
}:{
  row:RecruitingApplicationRow;
  need?:RecruitingNeedRow|null;
  stages?:RecruitingFunnelStageSetting[];
  initialStage?:RecruitingStage;
  exitReasons:RecruitingOptions["exitReasons"];
  demo:boolean;
  canEdit:boolean;
  canConvert:boolean;
  onClose:()=>void;
  onSaved?:()=>void;
}){
  const router=useRouter();
  const [stage,setStage]=useState<RecruitingStage>(initialStage??row.stage);
  const [workflow,setWorkflow]=useState(row.workflow??{});
  const [next,setNext]=useState(localDate(row.nextActionAt));
  const [planned,setPlanned]=useState(row.plannedStartDate??"");
  const [actual,setActual]=useState("");
  const [reason,setReason]=useState("");
  const [code,setCode]=useState(row.rejectionReasonCode??"");
  const [busy,setBusy]=useState("");
  const [error,setError]=useState("");
  const [documents,setDocuments]=useState<DocumentRow[]|null>(null);
  const risks=workRisks(row);
  const orderedStages=useMemo(()=>(stages?.length?stages:[
    {code:"new",label:"Новый контакт",sortOrder:10,active:true,systemType:"intake"},
    {code:"interview",label:"Интервью",sortOrder:20,active:true,systemType:"qualification"},
    {code:"documents",label:"Документы",sortOrder:30,active:true,systemType:"documents"},
    {code:"preparation",label:"Подготовка к выходу",sortOrder:40,active:true,systemType:"preparation"},
    {code:"first_shift",label:"Первый выход",sortOrder:50,active:true,systemType:"start"},
    {code:"retention_7",label:"7 дней",sortOrder:60,active:true,systemType:"retention"},
    {code:"retention_30",label:"30 дней",sortOrder:70,active:true,systemType:"retention_final"},
  ] as RecruitingFunnelStageSetting[]).filter(x=>x.active).sort((a,b)=>a.sortOrder-b.sortOrder),[stages]);
  const stageLabel=(value:RecruitingStage)=>orderedStages.find(x=>x.code===value)?.label??recruitingStageLabels[value];
  const nextStage=orderedStages[Math.min(Math.max(orderedStages.findIndex(x=>x.code===row.stage)+1,0),orderedStages.length-1)]?.code;

  useEffect(()=>{
    if(demo||!["documents","preparation"].includes(row.stage))return;
    let active=true;
    fetch(`/api/candidates/${row.candidateId}/documents?applicationId=${row.applicationId}`)
      .then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error);if(active)setDocuments(body.items);})
      .catch(()=>{if(active)setDocuments([]);});
    return()=>{active=false};
  },[demo,row.applicationId,row.candidateId,row.stage]);

  async function save(event?:React.FormEvent){
    event?.preventDefault();
    const nextValue=next;
    setBusy("save");setError("");
    try{
      await saveApplicationChange(row,{
        stage,
        workflow,
        nextActionAt:nextValue?new Date(nextValue).toISOString():null,
        plannedStartDate:planned||null,
        actualStartAt:actual?new Date(actual).toISOString():null,
        reason:reason||undefined,
        reasonCode:code||undefined,
      },demo);
      router.refresh();onSaved?.();onClose();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить");}
    finally{setBusy("");}
  }

  async function markNoAnswer(){
    const date=new Date(Date.now()+2*60*60*1000);
    const value=toLocalInput(date);
    setWorkflow(current=>({...current,lastContact:"Не дозвонились",contactAttempts:(current.contactAttempts??0)+1,nextActionText:"Повторить звонок"}));
    setNext(value);
    setError("");
  }

  function moveForward(){
    if(!nextStage||nextStage===row.stage)return;
    setStage(nextStage);
    if(nextStage==="documents")setWorkflow(current=>({...current,nextActionText:"Собрать необходимые документы"}));
    if(nextStage==="preparation")setWorkflow(current=>({...current,nextActionText:"Подтвердить дату выхода и логистику"}));
  }

  async function updateDocument(document:DocumentRow,status:string){
    if(demo){
      setDocuments(current=>(current??[]).map(x=>x.documentTypeId===document.documentTypeId?{...x,status}:x));
      return;
    }
    setBusy(document.documentTypeId);setError("");
    try{
      const response=await fetch(`/api/candidates/${row.candidateId}/documents`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({applicationId:row.applicationId,documentTypeId:document.documentTypeId,status})});
      const body=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(body.error??"Не удалось обновить документ");
      setDocuments(current=>(current??[]).map(x=>x.documentTypeId===document.documentTypeId?{...x,status}:x));
    }catch(e){setError(e instanceof Error?e.message:"Не удалось обновить документ");}
    finally{setBusy("");}
  }

  return <SalesDrawer title={row.fullName} subtitle={`${row.need} · ${row.object??"Без объекта"}`} onClose={()=>{if(!busy)onClose();}}>
    <div className="candidate-work-drawer">
      <section className="candidate-work-identity">
        <div><span>Телефон</span><strong>{row.phone??"Не указан"}</strong></div>
        <div><span>Город</span><strong>{row.city??"Не указан"}</strong></div>
        <div><span>Источник</span><strong>{[row.source,row.sourceChannel].filter(Boolean).join(" · ")||"Не указан"}</strong></div>
        <div><span>Ответственный</span><strong>{row.owner??"Не назначен"}</strong></div>
      </section>

      <NeedSummary need={need} row={row}/>

      <section className="candidate-work-history">
        <header><div><h3>Последние события</h3><p>Что уже происходило с кандидатом</p></div><Link href={`/candidates/${row.candidateId}`}>Полная история</Link></header>
        <div className="candidate-work-history-list">
          {(row.recentCommunications??[]).slice(0,4).map(item=><div key={item.id}><time>{item.happenedAt}</time><span><strong>{item.author}</strong><small>{item.summary}</small></span></div>)}
          {row.stageEvents?.slice(-2).reverse().map((item,index)=><div key={`stage-${index}`}><time>{formatWorkDate(item.createdAt)}</time><span><strong>Система</strong><small>Этап: {stageLabel(item.toStage as RecruitingStage)}{item.reason?` · ${item.reason}`:""}</small></span></div>)}
          {!(row.recentCommunications?.length||row.stageEvents?.length)&&<p className="cell-sub">История пока пустая.</p>}
        </div>
      </section>

      {documents!==null&&<section className="candidate-documents">
        <header><div><h3>Документы</h3><p>{documents.length?`Получено ${documents.filter(x=>["received","verified"].includes(x.status)).length} из ${documents.length}`:"Для потребности список документов не настроен"}</p></div></header>
        <div>{documents.map(document=><label key={document.documentTypeId}><input type="checkbox" checked={["received","verified"].includes(document.status)} disabled={!canEdit||busy===document.documentTypeId} onChange={e=>updateDocument(document,e.target.checked?"received":"requested")}/><span>{document.name}</span><small>{document.status==="verified"?"Проверен":document.status==="received"?"Получен":document.status==="requested"?"Запрошен":"Ожидается"}</small></label>)}</div>
      </section>}

      {error&&<div role="alert" className="recruiting-error">{error}</div>}

      <form onSubmit={save} className="recruiting-form candidate-action-form">
        <div className="candidate-quick-actions">
          <button className="button" type="button" disabled={!canEdit} onClick={markNoAnswer}><PhoneOff size={14}/> Не дозвонился</button>
          {nextStage&&nextStage!==row.stage&&<button className="button" type="button" disabled={!canEdit} onClick={moveForward}><Check size={14}/> Всё хорошо → дальше</button>}
          <button className="button" type="button" disabled={!canEdit} onClick={()=>setStage("rejected")}><X size={14}/> Отказ</button>
        </div>

        <fieldset disabled={busy==="save"||!canEdit} className="recruiting-action-fields">
          <label>Этап<select value={stage} onChange={e=>setStage(e.target.value as RecruitingStage)}>
            {orderedStages.map(item=><option key={item.code} value={item.code} disabled={item.code==="first_shift"&&!canConvert}>{item.label}</option>)}
            <option value="reserve">Резерв</option><option value="rejected">Отказ</option><option value="no_show">Не вышел</option>
          </select></label>
          <label>Результат общения<textarea value={workflow.lastContact??""} onChange={e=>setWorkflow(x=>({...x,lastContact:e.target.value}))} placeholder="Коротко: что обсудили, что подтвердил кандидат"/></label>
          <label>Следующее действие<input value={workflow.nextActionText??""} onChange={e=>setWorkflow(x=>({...x,nextActionText:e.target.value}))} placeholder="Например: повторить звонок / запросить паспорт"/></label>
          <label>Срок следующего действия<input type="datetime-local" value={next} onChange={e=>setNext(e.target.value)}/></label>

          {stage==="preparation"&&<>
            <label>Плановая дата выхода<input type="date" value={planned} onChange={e=>setPlanned(e.target.value)}/></label>
            <label>Логистика<select value={workflow.travelState??"not_required"} onChange={e=>setWorkflow(x=>({...x,travelState:e.target.value as NonNullable<typeof workflow.travelState>}))}><option value="not_required">Не требуется</option><option value="self">Добирается самостоятельно</option><option value="company">Организует компания</option><option value="ticket_required">Нужно купить билет</option><option value="ticket_bought">Билет куплен</option></select></label>
            <label>Комментарий по проезду<input value={workflow.travelNote??""} onChange={e=>setWorkflow(x=>({...x,travelNote:e.target.value}))}/></label>
            <label><input type="checkbox" checked={workflow.confirmed??false} onChange={e=>setWorkflow(x=>({...x,confirmed:e.target.checked}))}/> Кандидат подтвердил дату</label>
          </>}

          {stage==="first_shift"&&row.stage!=="first_shift"&&<><label>Фактическое время первого выхода<input required type="datetime-local" value={actual} onChange={e=>setActual(e.target.value)}/></label><label>Смена<input value={workflow.plannedShift??""} onChange={e=>setWorkflow(x=>({...x,plannedShift:e.target.value}))} placeholder="Дневная · 08:00–20:00"/></label></>}

          {stage==="reserve"&&<><label>Причина резерва<select required value={workflow.reserveReason??""} onChange={e=>setWorkflow(x=>({...x,reserveReason:e.target.value}))}><option value="">Выберите причину</option>{reserveReasons.map(item=><option key={item}>{item}</option>)}</select></label></>}
          {["rejected","no_show"].includes(stage)&&<label>Причина завершения<select required value={code} onChange={e=>setCode(e.target.value)}><option value="">Выберите причину</option>{exitReasons.filter(x=>x.kind===stage||x.kind==="both").map(x=><option key={x.code} value={x.code}>{x.name}</option>)}</select></label>}
          {stage!==row.stage&&<label>Комментарий к переходу<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="При необходимости добавьте пояснение"/></label>}
        </fieldset>

        {risks.length>0&&<p className="needs-overdue">{risks.join(" · ")}</p>}
        <div className="recruiting-form-actions"><Link className="button" href={`/candidates/${row.candidateId}`}><UserRound size={14}/> Полная карточка</Link>{row.phone&&<a className="button" href={`tel:${row.phone}`}><PhoneCall size={14}/> Позвонить</a>}{canEdit&&<button className="button primary" disabled={busy==="save"}>{busy==="save"?"Сохраняю…":"Сохранить"}</button>}</div>
      </form>
    </div>
  </SalesDrawer>;
}

function NeedSummary({need,row}:{need:RecruitingNeedRow|null;row:RecruitingApplicationRow}){
  const c=need?.conditions??row.conditions;
  return <section className="candidate-work-need">
    <header><div><h3>Условия вакансии</h3><p>{need?.title??row.need} · {need?.object??row.object??need?.region??"Без локации"}</p></div><Link href="/needs?view=needs">Потребность</Link></header>
    <div className="candidate-work-pay"><span>На руки</span><strong>{display(c.workerPay)}</strong></div>
    <dl><div><dt>График</dt><dd>{display(c.schedule)}</dd></div><div><dt>Смена</dt><dd>{display(c.shift)}</dd></div><div><dt>Проживание</dt><dd>{provision(c,"housing")}</dd></div><div><dt>Питание</dt><dd>{provision(c,"meals")}</dd></div><div><dt>Проезд</dt><dd>{provision(c,"travel")}</dd></div><div><dt>Развозка</dt><dd>{provision(c,"shuttle")}</dd></div></dl>
  </section>;
}
function provision(c:Record<string,unknown>,key:string){const explicit=c[`${key}Provided`];const detail=display(c[key]);if(explicit===true)return detail==="—"?"Предоставляется":detail;if(explicit===false)return detail==="—"?"Не предоставляется":detail;return detail;}
function display(value:unknown){if(value==null||value==="")return"—";if(typeof value==="string"||typeof value==="number")return String(value);return JSON.stringify(value);}
function localDate(value?:string|null){if(!value||!Number.isFinite(Date.parse(value)))return"";const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
function toLocalInput(date:Date){return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);}
