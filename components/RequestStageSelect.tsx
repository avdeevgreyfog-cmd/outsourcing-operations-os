"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RequestStageDefinition } from "@/lib/commercial/request-workflow";

export function RequestStageSelect({requestId,value,stages,disabled=false}:{requestId:string;value:string;stages:RequestStageDefinition[];disabled?:boolean}){
  const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function change(next:string){if(next===value)return;let lossReason:null|string=null;if(next==="not_agreed"){const reason=window.prompt("Причина несогласования");if(!reason?.trim())return;lossReason=reason.trim();}setBusy(true);setError("");try{const response=await fetch(`/api/requests/${requestId}/stage`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({stageCode:next,lossReason})});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось изменить этап");router.refresh();}catch(stageError){setError(stageError instanceof Error?stageError.message:"Не удалось изменить этап");}finally{setBusy(false);}}
  return <div className="request-stage-control"><select value={value} disabled={disabled||busy} onChange={(event)=>void change(event.target.value)}>{stages.filter((stage)=>stage.active).sort((a,b)=>a.sortOrder-b.sortOrder).map((stage)=><option key={stage.code} value={stage.code}>{stage.label}</option>)}</select>{error&&<small>{error}</small>}</div>;
}
