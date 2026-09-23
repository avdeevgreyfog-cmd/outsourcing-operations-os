"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { CalendarClock, LogOut, X } from "lucide-react";
import { KeyValue, Section, Status } from "@/components/UI";
import type { WorkerOffboardingContext } from "@/lib/operations/service";

const reasonLabels:Record<string,string>={
  employee_request:"По инициативе сотрудника",
  employer_decision:"По инициативе компании",
  project_end:"Завершение проекта",
  transfer_out:"Вывод с проекта / перевод вне компании",
  no_show:"Прекращение работы / невыход",
  medical:"Медицинские ограничения",
  other:"Другая причина",
};

export function WorkerEmploymentWorkspace({workerId,workerStatus,context,canOffboard,canAccessAssets,demo}:{workerId:string;workerStatus:string;context:WorkerOffboardingContext;canOffboard:boolean;canAccessAssets:boolean;demo:boolean}){
  const [show,setShow]=useState(false);
  const [effectiveDate,setEffectiveDate]=useState(new Date().toISOString().slice(0,10));
  const [reasonCode,setReasonCode]=useState("employee_request");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const activePlan=useMemo(()=>context.exits.find(row=>row.status==="planned"),[context.exits]);
  const future=effectiveDate>new Date().toISOString().slice(0,10);
  const hasBlockingAssets=context.outstandingAssets.length>0;

  async function submit(){
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме изменения не сохраняются");return;}
      const response=await fetch("/api/workers/"+workerId+"/exit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        action:future?"plan":"complete",effectiveDate,reasonCode,reason:reason||null,
      })});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось сохранить завершение работы");
      window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить завершение работы");}
    finally{setBusy(false);}
  }

  async function cancelPlan(){
    if(!activePlan)return;
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме изменения не сохраняются");return;}
      const response=await fetch("/api/workers/"+workerId+"/exit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"cancel",exitId:activePlan.id})});
      const json=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(json.error??"Не удалось отменить план");
      window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось отменить план");}
    finally{setBusy(false);}
  }

  return <>
    <div className="workspace-grid">
      <Section title="Оформление и статус">
        <div style={{padding:"6px 15px 14px"}}>
          <KeyValue label="Формат оформления" value={employmentTypeLabel(context.relationType)}/>
          <KeyValue label="Действует с" value={context.relationFrom??"—"}/>
          <KeyValue label="Действует по" value={context.relationTo??"—"}/>
          <KeyValue label="Статус сотрудника" value={<Status tone={workerStatus==="active"?"good":"neutral"}>{workerStatus==="active"?"Работает":workerStatus==="dismissed"?"Работа завершена":workerStatus}</Status>}/>
        </div>
      </Section>

      <Section title="Завершение работы" note="Операционные связи закрываются централизованно: объект, ставка, бригада, жильё и будущие смены.">
        <div style={{padding:14}}>
          {activePlan?<div className="stack-item"><div><strong>Завершение запланировано на {activePlan.effectiveDate}</strong><small>{reasonLabels[activePlan.reasonCode]??activePlan.reasonCode}{activePlan.reason?" · "+activePlan.reason:""}</small></div>{canOffboard&&<button className="button" disabled={busy} onClick={()=>void cancelPlan()}>Отменить план</button>}</div>:workerStatus==="active"?<div className="summary-strip"><span>Активного плана завершения работы нет.</span>{canOffboard&&<button className="button primary" onClick={()=>setShow(true)}><LogOut size={14}/> Завершение работы</button>}</div>:<Status tone="neutral">Работа завершена</Status>}
          {error&&<div className="recruiting-error" style={{marginTop:10}}>{error}</div>}
        </div>
      </Section>
    </div>

    <div className="workspace-grid" style={{marginTop:16}}>
      <Section title="Имущество к возврату" note="Возвратное имущество должно быть возвращено или списано до фактического завершения работы.">
        {context.outstandingAssets.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Позиция</th><th>Вариант</th><th>Количество</th></tr></thead><tbody>{context.outstandingAssets.map(row=><tr key={row.itemId+":"+row.variant}><td className="cell-title">{row.item}</td><td>{row.variant||"—"}</td><td className="num">{row.quantity} {row.unit}</td></tr>)}</tbody></table>{canAccessAssets&&<div style={{padding:12}}><Link className="button" href={"/assets?worker="+workerId+"&action=return"}>Открыть возврат / списание</Link></div>}</div>:<div className="empty-inline">Возвратного имущества на сотруднике нет</div>}
      </Section>
      <Section title="Проживание">
        {context.housing.length?<div className="stack-list">{context.housing.map(row=><div className="stack-item" key={row.id}><div><strong>{row.site}</strong><small>Заезд {row.checkIn}{row.checkOut?" · выезд "+row.checkOut:""}</small></div><Status tone={row.status==="active"?"good":"info"}>{row.status==="active"?"Проживает":"Запланировано"}</Status></div>)}</div>:<div className="empty-inline">Активного проживания нет</div>}
      </Section>
    </div>

    {context.exits.length>0&&<Section title="История завершения работы" note="Планы, отмены и фактические завершения сохраняются в истории." ><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Дата</th><th>Причина</th><th>Комментарий</th><th>Статус</th></tr></thead><tbody>{context.exits.map(row=><tr key={row.id}><td>{row.effectiveDate}</td><td>{reasonLabels[row.reasonCode]??row.reasonCode}</td><td>{row.reason??"—"}</td><td><Status tone={row.status==="completed"?"neutral":row.status==="cancelled"?"neutral":"warn"}>{row.status==="completed"?"Завершено":row.status==="cancelled"?"Отменено":"Запланировано"}</Status></td></tr>)}</tbody></table></div></Section>}

    {show&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShow(false)}}><div className="recruiting-modal-card">
      <div className="recruiting-modal-head"><div><h2>{future?"Запланировать завершение работы":"Завершить работу сотрудника"}</h2><p>{future?"До указанной даты сотрудник остаётся действующим. План попадёт в прогноз комплектации.":"После подтверждения будут закрыты действующие назначения, ставка, проживание и будущие смены."}</p></div><button className="icon-button" onClick={()=>setShow(false)}><X size={17}/></button></div>
      <div className="candidate-import-body">
        <div className="candidate-import-options">
          <label>Дата<input type="date" value={effectiveDate} onChange={e=>setEffectiveDate(e.target.value)}/></label>
          <label>Причина<select value={reasonCode} onChange={e=>setReasonCode(e.target.value)}>{Object.entries(reasonLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
        </div>
        <label>Комментарий<textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="Уточнение причины, договорённости и важные детали"/></label>
        {!future&&hasBlockingAssets&&<div className="recruiting-error">Сначала закройте возвратное имущество. В карточке сотрудника есть список позиций, которые нужно вернуть или списать.</div>}
        {error&&<div className="recruiting-error">{error}</div>}
      </div>
      <div className="recruiting-modal-footer"><button className="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" disabled={busy||(!future&&hasBlockingAssets)} onClick={()=>void submit()}><CalendarClock size={14}/>{busy?"Сохраняю…":future?"Запланировать":"Завершить работу"}</button></div>
    </div></div></Portal>}
  </>;
}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
