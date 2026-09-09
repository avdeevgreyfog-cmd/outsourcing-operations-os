"use client";

import {useState} from "react";
import {useRouter} from "next/navigation";
import {Plus,Trash2} from "lucide-react";
import type {TenderDetail,TenderOptions} from "@/lib/tenders/service";
import {tenderBillingLabels,tenderDeadlineState,tenderDecisionLabels} from "@/lib/tenders/model";

async function jsonRequest(url:string,method:string,body:unknown){
  const response=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const json=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(json.error??"Не удалось сохранить изменения");
  return json;
}
function condition(value:unknown){return typeof value==="string"?value:"";}

export function TenderAnalysisWorkspace({tender,options,canEdit}:{tender:TenderDetail;options:TenderOptions;canEdit:boolean}){
  const router=useRouter();
  const deadline=tenderDeadlineState(tender.submissionDeadline);
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
  const [role,setRole]=useState({specialtyId:"",title:"",count:"",volume:"",billingUnit:tender.billingUnit==="unknown"?"hour":tender.billingUnit,targetClientRate:"",notes:""});
  const [state,setState]=useState("");

  async function save(){
    try{
      setState("Сохранение…");
      await jsonRequest(`/api/tenders/${tender.id}`,"PATCH",{action:"analysis",analysisSummary:summary||null,conditions});
      setState("Сохранено");router.refresh();
    }catch(error){setState(error instanceof Error?error.message:"Ошибка");}
  }
  async function addRole(){
    try{
      setState("");
      await jsonRequest(`/api/tenders/${tender.id}/roles`,"POST",{specialtyId:role.specialtyId||null,title:role.title,count:role.count?Number(role.count):null,volume:role.volume?Number(role.volume):null,billingUnit:role.billingUnit,targetClientRate:role.targetClientRate?Number(role.targetClientRate):null,notes:role.notes||null});
      setRole(value=>({...value,title:"",count:"",volume:"",targetClientRate:"",notes:""}));router.refresh();
    }catch(error){setState(error instanceof Error?error.message:"Ошибка");}
  }
  async function removeRole(id:string){
    try{await jsonRequest(`/api/tenders/${tender.id}/roles`,"DELETE",{roleId:id});router.refresh();}
    catch(error){setState(error instanceof Error?error.message:"Ошибка");}
  }

  return <div className="tender-tab-stack">
    <section className="section tender-analysis-workspace">
      <div className="tender-analysis-head">
        <div><h3>Анализ тендера</h3><p className="muted">Рабочее заключение: что покупают, что требуется от участника, где риски и что нужно уточнить до решения об участии.</p></div>
        <div className="tender-analysis-decision"><span>Текущее решение</span><strong>{tenderDecisionLabels[tender.decision]??tender.decision}</strong></div>
      </div>
      <div className="tender-analysis-summary-strip">
        <div><span>Подача</span><strong>{deadline.label}</strong></div>
        <div><span>Документы</span><strong>{tender.readyRequirementCount}/{tender.requirementCount}</strong></div>
        <div><span>Блокеры</span><strong>{tender.blockerCount}</strong></div>
        <div><span>Расчёты</span><strong>{tender.calculationCount}</strong></div>
      </div>

      <div className="tender-analysis-group"><h4>Заключение аналитика</h4>{canEdit?<textarea className="tender-summary-editor" rows={6} value={summary} onChange={event=>setSummary(event.target.value)} placeholder="Короткий вывод: подходит ли закупка, основные условия, критичные риски и что ещё нужно выяснить…"/>:<p className="tender-overview-summary">{summary||"Аналитическое заключение пока не заполнено."}</p>}</div>

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
      {canEdit&&<button className="button primary" type="button" onClick={save}>Сохранить анализ</button>}
      {state&&<p className={state==="Сохранено"?"form-success":"muted"}>{state}</p>}
    </section>

    <section className="section">
      <div className="tender-section-head"><div><h3>Позиции и объём</h3><p className="muted">Структурируем то, что потребуется посчитать в общем калькуляторе OPERIS.</p></div>{tender.roles.length>0&&<strong>{tender.roles.length} поз.</strong>}</div>
      <div className="grid-scroll"><table className="data-table"><thead><tr><th>Специальность / работа</th><th>Количество</th><th>Объём</th><th>Единица</th><th>Ориентир ставки</th><th></th></tr></thead><tbody>{tender.roles.map(item=><tr key={item.id}><td><strong>{item.title}</strong>{item.notes&&<span className="cell-sub">{item.notes}</span>}</td><td>{item.count??"—"}</td><td>{item.volume??"—"}</td><td>{tenderBillingLabels[item.billingUnit]??item.billingUnit}</td><td>{item.targetClientRate??"—"}</td><td>{canEdit&&<button className="icon-button" type="button" onClick={()=>void removeRole(item.id)} aria-label="Удалить позицию"><Trash2 size={14}/></button>}</td></tr>)}</tbody></table></div>
      {canEdit&&<div className="tender-add-row"><select value={role.specialtyId} onChange={event=>{const found=options.specialties.find(item=>item.id===event.target.value);setRole(value=>({...value,specialtyId:event.target.value,title:found?.name??value.title}));}}><option value="">Специальность из справочника</option>{options.specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><input value={role.title} onChange={event=>setRole(value=>({...value,title:event.target.value}))} placeholder="Название позиции"/><input type="number" min="1" value={role.count} onChange={event=>setRole(value=>({...value,count:event.target.value}))} placeholder="Кол-во"/><select value={role.billingUnit} onChange={event=>setRole(value=>({...value,billingUnit:event.target.value}))}>{Object.entries(tenderBillingLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button className="button" type="button" disabled={!role.title.trim()} onClick={()=>void addRole()}><Plus size={14}/> Добавить</button></div>}
    </section>
  </div>;
}
