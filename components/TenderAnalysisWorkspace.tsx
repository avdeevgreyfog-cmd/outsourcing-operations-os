"use client";

import {SalesEditSection} from "@/components/sales/SalesEditSection";
import {TenderAnalysisEditor} from "@/components/TenderAnalysisEditor";
import {useState} from "react";
import {useRouter} from "next/navigation";
import {TenderRoleEditButton} from "@/components/TenderEntityPanels";
import {saveDemoTenderSnapshot} from "@/components/sales/DemoTenderPreview";
import {Plus,Trash2} from "lucide-react";
import type {TenderDetail,TenderOptions} from "@/lib/tenders/service";
import {tenderBillingLabels} from "@/lib/tenders/model";

async function jsonRequest(url:string,method:string,body:unknown){
  const response=await fetch(url,{method,headers:{"content-type":"application/json"},body:JSON.stringify(body)});
  const json=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(json.error??"Не удалось сохранить изменения");
  return json;
}
function condition(value:unknown){return typeof value==="string"?value:"";}

export function TenderAnalysisWorkspace({tender,options,canEdit,demoScope}:{tender:TenderDetail;options:TenderOptions;canEdit:boolean;demoScope?:string}){
  const router=useRouter();
  const [role,setRole]=useState({specialtyId:"",title:"",count:"",volume:"",billingUnit:tender.billingUnit==="unknown"?"hour":tender.billingUnit,targetClientRate:"",notes:""});
  const [state,setState]=useState("");

  async function addRole(){
    try{
      setState("");
      const body={specialtyId:role.specialtyId||null,title:role.title,count:role.count?Number(role.count):null,volume:role.volume?Number(role.volume):null,billingUnit:role.billingUnit,targetClientRate:role.targetClientRate?Number(role.targetClientRate):null,notes:role.notes||null};
      if(demoScope){const roles=[...tender.roles,{id:crypto.randomUUID(),...body,schedule:{},requirements:{}}];if(!saveDemoTenderSnapshot(demoScope,{...tender,roles,roleCount:roles.length,updatedAt:new Date().toISOString()} as TenderDetail))throw new Error("Не удалось сохранить позицию");}
      else await jsonRequest(`/api/tenders/${tender.id}/roles`,"POST",body);
      setRole(value=>({...value,title:"",count:"",volume:"",targetClientRate:"",notes:""}));router.refresh();
    }catch(error){setState(error instanceof Error?error.message:"Ошибка");}
  }
  async function removeRole(id:string){
    if(!window.confirm("Удалить позицию? Позиции с расчётами удалять нельзя."))return;
    try{if(demoScope){if(tender.calculationCount>0)throw new Error("Проверьте связанные расчёты перед удалением позиции");const roles=tender.roles.filter(x=>x.id!==id);if(!saveDemoTenderSnapshot(demoScope,{...tender,roles,roleCount:roles.length,updatedAt:new Date().toISOString()} as TenderDetail))throw new Error("Не удалось удалить позицию");}else await jsonRequest(`/api/tenders/${tender.id}/roles`,"DELETE",{roleId:id});router.refresh();}
    catch(error){setState(error instanceof Error?error.message:"Ошибка");}
  }

  return <div className="tender-tab-stack">
    <SalesEditSection title="Анализ тендера" note="Предмет закупки, условия, риски и заключение аналитика" canEdit={canEdit} editor={(onSaved,onCancel)=><TenderAnalysisEditor tender={tender} demoScope={demoScope} onSaved={onSaved} onCancel={onCancel}/>}>
<p className="tender-overview-summary">{tender.analysisSummary||"Аналитическое заключение пока не заполнено."}</p><div className="request-entity-condition-list">{Object.entries({"subject": "Предмет закупки", "workFormat": "Формат работ", "schedule": "График", "region": "Регион / место", "projectDuration": "Срок проекта", "guaranteedVolume": "Гарантированный объём", "requestLeadTime": "Срок заявки на персонал", "housing": "Проживание", "travel": "Проезд / транспорт", "ppe": "СИЗ", "medical": "Медицинские требования", "vatMode": "НДС", "paymentTerms": "Условия оплаты", "bidSecurity": "Обеспечение заявки", "contractSecurity": "Обеспечение договора", "participantRequirements": "Требования к участнику", "penaltiesRisks": "Штрафы и риски", "openQuestions": "Что уточнить"}).map(([key,label])=><div key={key}><span>{label}</span><strong>{condition(tender.conditions[key])||"Не указано"}</strong></div>)}</div></SalesEditSection>

    <section className="section">
      <div className="tender-section-head"><div><h3>Позиции и объём</h3><p className="muted">Структурируем то, что потребуется посчитать в общем калькуляторе OPERIS.</p></div>{tender.roles.length>0&&<strong>{tender.roles.length} поз.</strong>}</div>
      <div className="grid-scroll"><table className="data-table"><thead><tr><th>Специальность / работа</th><th>Количество</th><th>Объём</th><th>Единица</th><th>Ориентир ставки</th><th></th></tr></thead><tbody>{tender.roles.map(item=><tr key={item.id}><td><strong>{item.title}</strong>{item.notes&&<span className="cell-sub">{item.notes}</span>}</td><td>{item.count??"—"}</td><td>{item.volume??"—"}</td><td>{tenderBillingLabels[item.billingUnit]??item.billingUnit}</td><td>{item.targetClientRate??"—"}</td><td>{canEdit&&<TenderRoleEditButton tenderId={tender.id} role={item} options={options} demoScope={demoScope} tender={tender}/>} {canEdit&&<button className="icon-button" type="button" onClick={()=>void removeRole(item.id)} aria-label="Удалить позицию"><Trash2 size={14}/></button>}</td></tr>)}</tbody></table></div>
      {canEdit&&<div className="tender-add-row"><select value={role.specialtyId} onChange={event=>{const found=options.specialties.find(item=>item.id===event.target.value);setRole(value=>({...value,specialtyId:event.target.value,title:found?.name??value.title}));}}><option value="">Специальность из справочника</option>{options.specialties.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select><input value={role.title} onChange={event=>setRole(value=>({...value,title:event.target.value}))} placeholder="Название позиции"/><input type="number" min="1" value={role.count} onChange={event=>setRole(value=>({...value,count:event.target.value}))} placeholder="Кол-во"/><select value={role.billingUnit} onChange={event=>setRole(value=>({...value,billingUnit:event.target.value}))}>{Object.entries(tenderBillingLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button className="button" type="button" disabled={!role.title.trim()} onClick={()=>void addRole()}><Plus size={14}/> Добавить</button></div>}
      {state&&<p role="status">{state}</p>}
    </section>
  </div>;
}
