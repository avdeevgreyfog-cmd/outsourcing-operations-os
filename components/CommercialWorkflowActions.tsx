"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

async function api(url:string,method:string,body?:unknown){
  const response=await fetch(url,{method,headers:body?{"content-type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Операция не выполнена");return json;
}

export function SubmitApprovalButton({subjectType,subjectId,label="Отправить на согласование"}:{subjectType:"calculation_scenario"|"proposal";subjectId:string;label?:string}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const router=useRouter();
  async function submit(){try{setBusy(true);setError("");await api("/api/approvals","POST",{subjectType,subjectId});router.refresh()}catch(e){setError(e instanceof Error?e.message:"Ошибка")}finally{setBusy(false)}}
  return <div className="inline-action"><button className="button primary" disabled={busy} onClick={submit}>{busy?"Отправка…":label}</button>{error&&<small className="form-error">{error}</small>}</div>;
}

export function ApprovalDecisionButtons({approvalId}:{approvalId:string}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [comment,setComment]=useState("");const router=useRouter();
  async function decide(decision:"approve"|"reject"){try{setBusy(true);setError("");await api(`/api/approvals/${approvalId}/decision`,"PATCH",{decision,comment:comment||undefined});router.refresh()}catch(e){setError(e instanceof Error?e.message:"Ошибка")}finally{setBusy(false)}}
  return <div className="approval-action"><input value={comment} onChange={e=>setComment(e.target.value)} placeholder="Комментарий к решению"/><div><button className="button primary" disabled={busy} onClick={()=>decide("approve")}>Согласовать</button><button className="button" disabled={busy} onClick={()=>decide("reject")}>Отклонить</button></div>{error&&<small className="form-error">{error}</small>}</div>;
}

export function CreateProposalButton({requestId}:{requestId:string}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const router=useRouter();
  async function create(){try{setBusy(true);setError("");const result=await api("/api/proposals","POST",{requestId});router.push(`/proposals/${result.id}`);router.refresh()}catch(e){setError(e instanceof Error?e.message:"Ошибка")}finally{setBusy(false)}}
  return <div className="inline-action"><button className="button primary" disabled={busy} onClick={create}>{busy?"Создание…":"Создать новую версию КП"}</button>{error&&<small className="form-error">{error}</small>}</div>;
}

export function ProposalWorkflowActions({proposalId,status,objectId}:{proposalId:string;status:string;objectId?:string|null}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [note,setNote]=useState("");const [launchOpen,setLaunchOpen]=useState(false);const [name,setName]=useState("");const [code,setCode]=useState("");const router=useRouter();
  async function action(value:"send"|"negotiate"|"accept"|"revise"|"reject"){try{setBusy(true);setError("");await api(`/api/proposals/${proposalId}`,"PATCH",{action:value,note:note||undefined});router.refresh()}catch(e){setError(e instanceof Error?e.message:"Ошибка")}finally{setBusy(false)}}
  async function launch(){try{setBusy(true);setError("");const result=await api(`/api/proposals/${proposalId}/launch`,"POST",{name:name||undefined,code:code||undefined});setLaunchOpen(false);router.push(`/objects/${result.id}`);router.refresh()}catch(e){setError(e instanceof Error?e.message:"Ошибка запуска")}finally{setBusy(false)}}
  if(objectId)return <a className="button primary" href={`/objects/${objectId}`}>Открыть созданный объект</a>;
  return <div className="proposal-actions">
    {(status==="approved"||status==="sent"||status==="negotiation")&&<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Комментарий по переговорам / решению клиента" rows={2}/>} 
    <div className="page-actions">
      {status==="draft"&&<SubmitApprovalButton subjectType="proposal" subjectId={proposalId} label="На внутреннее согласование"/>}
      {status==="approved"&&<button className="button primary" disabled={busy} onClick={()=>action("send")}>Отметить как отправленное</button>}
      {(status==="sent"||status==="negotiation")&&<><button className="button" disabled={busy} onClick={()=>action("negotiate")}>Переговоры</button><button className="button primary" disabled={busy} onClick={()=>action("accept")}>Клиент принял</button><button className="button" disabled={busy} onClick={()=>action("revise")}>Вернуть на пересчёт</button><button className="button" disabled={busy} onClick={()=>action("reject")}>Отказ клиента</button></>}
      {status==="accepted"&&<button className="button primary" onClick={()=>setLaunchOpen(true)}>Перейти к запуску объекта</button>}
    </div>
    {error&&<div className="form-error">{error}</div>}
    {launchOpen&&<><div className="drawer-backdrop" onClick={()=>setLaunchOpen(false)}/><aside className="drawer"><button className="icon-button drawer-close" onClick={()=>setLaunchOpen(false)}>×</button><span className="eyebrow">Передача в операции</span><h2>Создать объект</h2><div className="login-form" style={{marginTop:18}}><label>Название объекта<input value={name} onChange={e=>setName(e.target.value)} placeholder="По умолчанию — название заявки"/></label><label>Код объекта<input value={code} onChange={e=>setCode(e.target.value)} placeholder="Автоматически, если пусто"/></label><p className="form-hint">Будут созданы объект, план запуска, потребности по позициям заявки и клиентские ставки из принятой экономики.</p><button className="button primary" disabled={busy} onClick={launch}>{busy?"Создание…":"Создать объект и запуск"}</button>{error&&<div className="form-error">{error}</div>}</div></aside></>}
  </div>;
}
