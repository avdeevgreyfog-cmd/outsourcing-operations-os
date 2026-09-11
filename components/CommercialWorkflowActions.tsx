"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

async function api(url:string,method:string,body?:unknown){
  const response=await fetch(url,{method,headers:body?{"content-type":"application/json"}:undefined,body:body?JSON.stringify(body):undefined});
  const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Операция не выполнена");return json;
}

export function SubmitApprovalButton({subjectType,subjectId,label="Отправить на согласование"}:{subjectType:"calculation_scenario"|"proposal"|"contract";subjectId:string;label?:string}){
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

export function ProposalWorkflowActions({proposalId,status,objectId,canSubmit,canClientDecision,canLaunch}:{proposalId:string;status:string;objectId?:string|null;canSubmit:boolean;canClientDecision:boolean;canLaunch:boolean}){
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [note,setNote]=useState("");const [launchOpen,setLaunchOpen]=useState(false);const [name,setName]=useState("");const [code,setCode]=useState("");const router=useRouter();
  async function action(value:"send"|"negotiate"|"accept"|"revise"|"reject"){try{setBusy(true);setError("");await api(`/api/proposals/${proposalId}`,"PATCH",{action:value,note:note||undefined});router.refresh()}catch(e){setError(e instanceof Error?e.message:"Ошибка")}finally{setBusy(false)}}
  async function launch(){try{setBusy(true);setError("");const result=await api(`/api/proposals/${proposalId}/launch`,"POST",{name:name||undefined,code:code||undefined});setLaunchOpen(false);router.push(`/objects/${result.id}`);router.refresh()}catch(e){setError(e instanceof Error?e.message:"Ошибка подготовки")}finally{setBusy(false)}}
  if(objectId)return <div className="page-actions"><Link className="button primary" href={`/objects/${objectId}`}>Открыть объект в подготовке</Link><Link className="button" href="/contracts">Открыть договоры</Link><Link className="button" href="/needs">Открыть потребности</Link></div>;
  const mayComment=canClientDecision&&(status==="approved"||status==="sent"||status==="negotiation");
  const hasActions=(status==="draft"&&canSubmit)||(canClientDecision&&["approved","sent","negotiation"].includes(status))||(status==="accepted"&&canLaunch);
  if(!hasActions)return <span className="cell-sub">Доступных действий на этом этапе нет.</span>;
  return <div className="proposal-actions">
    {mayComment&&<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Комментарий по переговорам / решению клиента" rows={2}/>} 
    <div className="page-actions">
      {status==="draft"&&canSubmit&&<SubmitApprovalButton subjectType="proposal" subjectId={proposalId} label="На внутреннее согласование"/>}
      {status==="approved"&&canClientDecision&&<button className="button primary" disabled={busy} onClick={()=>action("send")}>Отметить как отправленное</button>}
      {(status==="sent"||status==="negotiation")&&canClientDecision&&<><button className="button" disabled={busy} onClick={()=>action("negotiate")}>Переговоры</button><button className="button primary" disabled={busy} onClick={()=>action("accept")}>Клиент принял</button><button className="button" disabled={busy} onClick={()=>action("revise")}>Вернуть на пересчёт</button><button className="button" disabled={busy} onClick={()=>action("reject")}>Отказ клиента</button></>}
      {status==="accepted"&&canLaunch&&<button className="button primary" onClick={()=>setLaunchOpen(true)}>Начать подготовку</button>}
    </div>
    {error&&<div className="form-error">{error}</div>}
    {launchOpen&&<><div className="drawer-backdrop" onClick={()=>setLaunchOpen(false)}/><aside className="drawer"><button className="icon-button drawer-close" onClick={()=>setLaunchOpen(false)}>×</button><span className="eyebrow">Переход в подготовку</span><h2>Начать подготовку объекта</h2><div className="login-form" style={{marginTop:18}}><label>Название объекта<input value={name} onChange={e=>setName(e.target.value)} placeholder="По умолчанию — название заявки"/></label><label>Код объекта<input value={code} onChange={e=>setCode(e.target.value)} placeholder="Автоматически, если пусто"/></label><p className="form-hint">Одним действием будут созданы объект в статусе подготовки, потребности по всем позициям заявки, план запуска с базовыми задачами, клиентские ставки из принятой экономики и черновик договора. Подбор и подготовка запуска начнутся параллельно; фактический запуск останется заблокирован до подписания договора или отдельного разрешения.</p><button className="button primary" disabled={busy} onClick={launch}>{busy?"Создание…":"Начать подготовку"}</button>{error&&<div className="form-error">{error}</div>}</div></aside></>}
  </div>;
}
