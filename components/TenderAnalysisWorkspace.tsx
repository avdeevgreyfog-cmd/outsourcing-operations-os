"use client";

import {Section} from "@/components/UI";
import {SalesEditSection} from "@/components/sales/SalesEditSection";
import {TenderAnalysisEditor} from "@/components/TenderAnalysisEditor";
import {useState,useRef,type FormEvent} from "react";
import {useRouter} from "next/navigation";
import {TenderRoleEditButton} from "@/components/TenderEntityPanels";
import {saveDemoTenderSnapshot} from "@/components/sales/DemoTenderPreview";
import {SalesInlineForm} from "@/components/sales/SalesInlineForm";
import {useUnsavedChanges,useSalesEditSession} from "@/components/sales/SalesEditSection";
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
const conditionLabels:Record<string,string>={yes:"Да",no:"Нет",partial:"Частично / минимальный объём",with_vat:"С НДС",without_vat:"Без НДС",not_applicable:"Не применяется"};
function conditionLabel(value:unknown){const text=condition(value);return conditionLabels[text]??(text||"Не указано");}

export function TenderAnalysisWorkspace({tender,options,canEdit,demoScope}:{tender:TenderDetail;options:TenderOptions;canEdit:boolean;demoScope?:string}){
  const editorBusy=Boolean(useSalesEditSession()?.active);const router=useRouter();const anchor=useRef<HTMLButtonElement>(null);const [adding,setAdding]=useState(false),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false);const canLeave=useUnsavedChanges(adding&&dirty);
  const [role,setRole]=useState({specialtyId:"",title:"",count:"",volume:"",billingUnit:tender.billingUnit==="unknown"?"hour":tender.billingUnit,targetClientRate:"",notes:""});
  const [state,setState]=useState("");

  async function addRole(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(busy)return;setBusy(true);
    try{
      setState("");
      const body={specialtyId:role.specialtyId||null,title:role.title,count:role.count?Number(role.count):null,volume:role.volume?Number(role.volume):null,billingUnit:role.billingUnit,targetClientRate:role.targetClientRate?Number(role.targetClientRate):null,notes:role.notes||null};
      if(demoScope){const roles=[...tender.roles,{id:crypto.randomUUID(),...body,schedule:{},requirements:{}}];if(!saveDemoTenderSnapshot(demoScope,{...tender,roles,roleCount:roles.length,updatedAt:new Date().toISOString()} as TenderDetail))throw new Error("Не удалось сохранить позицию");}
      else await jsonRequest(`/api/tenders/${tender.id}/roles`,"POST",body);
      setRole(value=>({...value,title:"",count:"",volume:"",targetClientRate:"",notes:""}));setAdding(false);setDirty(false);router.refresh();
    }catch(error){setState(error instanceof Error?error.message:"Ошибка");}finally{setBusy(false);}
  }
  async function removeRole(id:string){
    if(!window.confirm("Удалить позицию? Позиции с расчётами удалять нельзя."))return;
    try{if(demoScope){if(tender.calculationCount>0)throw new Error("Проверьте связанные расчёты перед удалением позиции");const roles=tender.roles.filter(x=>x.id!==id);if(!saveDemoTenderSnapshot(demoScope,{...tender,roles,roleCount:roles.length,updatedAt:new Date().toISOString()} as TenderDetail))throw new Error("Не удалось удалить позицию");}else await jsonRequest(`/api/tenders/${tender.id}/roles`,"DELETE",{roleId:id});router.refresh();}
    catch(error){setState(error instanceof Error?error.message:"Ошибка");}
  }

  return <div className="tender-tab-stack">
    <SalesEditSection title="Анализ тендера" note="Предмет закупки, условия, риски и заключение аналитика" canEdit={canEdit} editor={(onSaved,onCancel)=><TenderAnalysisEditor tender={tender} demoScope={demoScope} onSaved={onSaved} onCancel={onCancel}/>}>
<p className="tender-overview-summary">{tender.analysisSummary||"Аналитическое заключение пока не заполнено."}</p><div className="request-entity-condition-list">{Object.entries({"subject": "Предмет закупки", "workFormat": "Формат работ", "schedule": "График", "region": "Регион / место", "projectDuration": "Срок проекта", "guaranteedVolume": "Гарантированный объём", "requestLeadTime": "Срок заявки на персонал", "housing": "Проживание", "travel": "Проезд / транспорт", "ppe": "СИЗ", "medical": "Медицинские требования", "vatMode": "НДС", "paymentTerms": "Условия оплаты", "bidSecurity": "Обеспечение заявки", "contractSecurity": "Обеспечение договора", "participantRequirements": "Требования к участнику", "penaltiesRisks": "Штрафы и риски", "openQuestions": "Что уточнить"}).map(([key,label])=><div key={key}><span>{label}</span><strong>{conditionLabel(tender.conditions[key])}</strong></div>)}</div></SalesEditSection>

    <Section title="Позиции и объём" note="Специальности, численность и ставки для расчёта стоимости" actions={canEdit?<button disabled={editorBusy} ref={anchor} type="button" className="button" onClick={()=>{setAdding(true);setState("");}}><Plus size={14}/>Добавить позицию</button>:undefined}>
      <div className="grid-scroll"><table className="data-table"><thead><tr><th>Специальность / работа</th><th>Количество</th><th>Объём</th><th>Единица</th><th>Ориентир ставки</th><th></th></tr></thead><tbody>{tender.roles.map(item=><tr key={item.id}><td><strong>{item.title}</strong>{item.notes&&<span className="cell-sub">{item.notes}</span>}</td><td>{item.count??"—"}</td><td>{item.volume??"—"}</td><td>{tenderBillingLabels[item.billingUnit]??item.billingUnit}</td><td>{item.targetClientRate??"—"}</td><td>{canEdit&&<TenderRoleEditButton tenderId={tender.id} role={item} options={options} demoScope={demoScope} tender={tender}/>} {canEdit&&<button className="icon-button" type="button" onClick={()=>void removeRole(item.id)} aria-label="Удалить позицию"><Trash2 size={14}/></button>}</td></tr>)}</tbody></table></div>
      {canEdit&&adding&&<SalesInlineForm anchor={anchor} title="Добавить позицию"><form onSubmit={addRole} onChange={()=>setDirty(true)}><fieldset className="sales-edit-fieldset" disabled={busy}><div className="form-grid two"><label><span>Специальность / работа *</span><input required minLength={2} maxLength={240} list="tender-role-specialties" value={role.title} onChange={e=>{const found=options.specialties.find(x=>x.name===e.target.value);setRole(v=>({...v,title:e.target.value,specialtyId:found?.id??""}));}}/><datalist id="tender-role-specialties">{options.specialties.map(x=><option key={x.id} value={x.name}/>)}</datalist></label><label><span>Количество</span><input type="number" min={1} step={1} value={role.count} onChange={e=>setRole(v=>({...v,count:e.target.value}))}/></label><label><span>Объём</span><input type="number" min={0} step="0.01" value={role.volume} onChange={e=>setRole(v=>({...v,volume:e.target.value}))}/></label><label><span>Единица расчёта</span><select value={role.billingUnit} onChange={e=>setRole(v=>({...v,billingUnit:e.target.value}))}>{Object.entries(tenderBillingLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label><span>Ориентир ставки, ₽</span><input type="number" min={0} step="0.01" value={role.targetClientRate} onChange={e=>setRole(v=>({...v,targetClientRate:e.target.value}))}/></label><label><span>Примечание</span><input value={role.notes} onChange={e=>setRole(v=>({...v,notes:e.target.value}))}/></label></div>{state&&<p className="form-error" role="alert">{state}</p>}<div className="sales-edit-footer"><button type="button" className="button" onClick={()=>{if(canLeave()){setAdding(false);setDirty(false);setRole(v=>({...v,title:"",count:"",volume:"",targetClientRate:"",notes:""}));}}}>Отмена</button><button type="submit" className="button primary">Сохранить позицию</button></div></fieldset></form></SalesInlineForm>}
      {state&&<p className="sales-section-note" role="status">{state}</p>}
    </Section>
  </div>;
}
