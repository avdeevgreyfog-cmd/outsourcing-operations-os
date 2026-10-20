"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
import type {TenderDetail} from "@/lib/tenders/service";
import {useUnsavedChanges} from "@/components/sales/SalesEditSection";
import {loadDemoTenderSnapshot,saveDemoTenderSnapshot} from "@/components/sales/DemoTenderPreview";
function condition(value:unknown){return typeof value==="string"?value:"";}
export function TenderAnalysisEditor({tender,demoScope,onSaved,onCancel}:{tender:TenderDetail;demoScope?:string;onSaved:()=>void;onCancel:()=>void}){
 const router=useRouter();const canEdit=true;
  const [summary,setSummary]=useState(tender.analysisSummary??"");
  const [conditions,setConditions]=useState({
    subject:condition(tender.conditions.subject),
    workFormat:condition(tender.conditions.workFormat),
    schedule:condition(tender.conditions.schedule),
    region:condition(tender.conditions.region),
    projectDuration:condition(tender.conditions.projectDuration),
    guaranteedVolume:condition(tender.conditions.guaranteedVolume),
    requestLeadTime:condition(tender.conditions.requestLeadTime),
    housing:condition(tender.conditions.housing),
    travel:condition(tender.conditions.travel),
    ppe:condition(tender.conditions.ppe),
    medical:condition(tender.conditions.medical),
    vatMode:condition(tender.conditions.vatMode),
    paymentTerms:condition(tender.conditions.paymentTerms),
    bidSecurity:condition(tender.conditions.bidSecurity),
    contractSecurity:condition(tender.conditions.contractSecurity),
    participantRequirements:condition(tender.conditions.participantRequirements),
    penaltiesRisks:condition(tender.conditions.penaltiesRisks),
    openQuestions:condition(tender.conditions.openQuestions),
  });

 const [busy,setBusy]=useState(false);const [error,setError]=useState("");const snapshot=JSON.stringify({summary,conditions});const [initial,setInitial]=useState(snapshot);const dirty=initial!==snapshot;const canLeave=useUnsavedChanges(dirty);
 async function save(){if(busy)return;setBusy(true);setError("");try{
  if(demoScope){const current=loadDemoTenderSnapshot(demoScope,tender.id);if(current&&current.updatedAt!==tender.updatedAt)throw new Error("Тендер уже изменён. Обновите карточку перед сохранением.");if(!saveDemoTenderSnapshot(demoScope,{...tender,analysisSummary:summary||null,conditions:{...tender.conditions,...conditions},updatedAt:new Date().toISOString()} as TenderDetail))throw new Error("Не удалось сохранить изменения в браузере");}
  else{const response=await fetch(`/api/tenders/${tender.id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"analysis",expectedUpdatedAt:tender.updatedAt,analysisSummary:summary||null,conditions})});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить анализ");}
  setInitial(snapshot);onSaved();router.refresh();
 }catch(cause){setError(cause instanceof Error?cause.message:"Не удалось сохранить анализ");}finally{setBusy(false);}}
 return <><fieldset className="sales-edit-fieldset" disabled={busy}>      <div className="tender-analysis-group"><h4>Заключение аналитика</h4>{canEdit?<textarea className="tender-summary-editor" rows={6} value={summary} onChange={event=>setSummary(event.target.value)} placeholder="Короткий вывод: подходит ли закупка, основные условия, критичные риски и что ещё нужно выяснить…"/>:<p className="tender-overview-summary">{summary||"Аналитическое заключение пока не заполнено."}</p>}</div>

      <div className="tender-analysis-group"><h4>Предмет и операционные условия</h4><div className="form-grid two tender-analysis-fields">
        <label><span>Предмет закупки</span><input disabled={!canEdit} value={conditions.subject} onChange={event=>setConditions(value=>({...value,subject:event.target.value}))}/></label>
        <label><span>Формат работ</span><input disabled={!canEdit} value={conditions.workFormat} onChange={event=>setConditions(value=>({...value,workFormat:event.target.value}))}/></label>
        <label><span>График</span><input disabled={!canEdit} value={conditions.schedule} onChange={event=>setConditions(value=>({...value,schedule:event.target.value}))}/></label>
        <label><span>Регион / место</span><input disabled={!canEdit} value={conditions.region} onChange={event=>setConditions(value=>({...value,region:event.target.value}))}/></label>
        <label><span>Срок проекта</span><input disabled={!canEdit} value={conditions.projectDuration} onChange={event=>setConditions(value=>({...value,projectDuration:event.target.value}))}/></label>
        <label><span>Гарантированный объём</span><select disabled={!canEdit} value={conditions.guaranteedVolume} onChange={event=>setConditions(value=>({...value,guaranteedVolume:event.target.value}))}><option value="">Не определено</option><option value="yes">Да</option><option value="no">Нет</option><option value="partial">Частично / минимальный объём</option></select></label>
        <label><span>За сколько дают заявку на персонал</span><input disabled={!canEdit} value={conditions.requestLeadTime} onChange={event=>setConditions(value=>({...value,requestLeadTime:event.target.value}))} placeholder="Например: за 3 рабочих дня"/></label>
        <label><span>Проживание</span><input disabled={!canEdit} value={conditions.housing} onChange={event=>setConditions(value=>({...value,housing:event.target.value}))}/></label>
        <label><span>Проезд / транспорт</span><input disabled={!canEdit} value={conditions.travel} onChange={event=>setConditions(value=>({...value,travel:event.target.value}))}/></label>
        <label><span>СИЗ</span><input disabled={!canEdit} value={conditions.ppe} onChange={event=>setConditions(value=>({...value,ppe:event.target.value}))}/></label>
        <label><span>Медицинские требования</span><input disabled={!canEdit} value={conditions.medical} onChange={event=>setConditions(value=>({...value,medical:event.target.value}))}/></label>
        <label><span>НДС</span><select disabled={!canEdit} value={conditions.vatMode} onChange={event=>setConditions(value=>({...value,vatMode:event.target.value}))}><option value="">Не определено</option><option value="with_vat">С НДС</option><option value="without_vat">Без НДС</option><option value="not_applicable">Не применяется</option></select></label>
        <label className="span-2"><span>Условия оплаты</span><input disabled={!canEdit} value={conditions.paymentTerms} onChange={event=>setConditions(value=>({...value,paymentTerms:event.target.value}))} placeholder="Например: постоплата 30 календарных дней"/></label>
      </div></div>

      <div className="tender-analysis-group"><h4>Требования участия и риски</h4><div className="form-grid two tender-analysis-fields">
        <label><span>Обеспечение заявки</span><input disabled={!canEdit} value={conditions.bidSecurity} onChange={event=>setConditions(value=>({...value,bidSecurity:event.target.value}))} placeholder="Сумма / процент / не требуется"/></label>
        <label><span>Обеспечение договора</span><input disabled={!canEdit} value={conditions.contractSecurity} onChange={event=>setConditions(value=>({...value,contractSecurity:event.target.value}))} placeholder="Сумма / процент / не требуется"/></label>
        <label className="span-2"><span>Требования к участнику</span><textarea disabled={!canEdit} rows={3} value={conditions.participantRequirements} onChange={event=>setConditions(value=>({...value,participantRequirements:event.target.value}))} placeholder="ЧАЗ, опыт аналогичных договоров, оборот, лицензии, допуски…"/></label>
        <label className="span-2"><span>Штрафы и критичные риски</span><textarea disabled={!canEdit} rows={3} value={conditions.penaltiesRisks} onChange={event=>setConditions(value=>({...value,penaltiesRisks:event.target.value}))}/></label>
        <label className="span-2"><span>Что нужно уточнить</span><textarea disabled={!canEdit} rows={3} value={conditions.openQuestions} onChange={event=>setConditions(value=>({...value,openQuestions:event.target.value}))} placeholder="Гарантированный объём, сроки заявки, минимальная численность, порядок оплаты…"/></label>
      </div></div>
</fieldset>{error&&<p className="form-error" role="alert">{error}</p>}<div className="sales-edit-footer"><button type="button" className="button" disabled={busy} onClick={()=>{if(canLeave())onCancel();}}>Отмена</button><button type="button" className="button primary" disabled={busy||!dirty} onClick={()=>void save()}>{busy?"Сохраняю…":"Сохранить изменения"}</button></div></>;
}
