"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { requestStageLabels } from "@/lib/ui/commercial";

export function RequestCommercialActions({requestId,stage,archived,canEdit,canArchive,canCreateObject}:{requestId:string;stage:string;archived:boolean;canEdit:boolean;canArchive:boolean;canCreateObject:boolean}){
  const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function action(payload:Record<string,unknown>){setBusy(true);setError("");try{const response=await fetch(`/api/requests/${requestId}/commercial`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось выполнить действие");router.refresh();return data;}catch(e){setError(e instanceof Error?e.message:"Не удалось выполнить действие");}finally{setBusy(false)}}
  return <div className="stack-list" style={{padding:12}}>
    {canEdit&&!archived&&<label className="field"><span>Текущий этап</span><select disabled={busy} value={stage} onChange={(e)=>action({action:"stage",stage:e.target.value})}>{Object.entries(requestStageLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {canEdit&&!archived&&<button className="button" disabled={busy} onClick={()=>{const reason=window.prompt("Причина закрытия: irrelevant / client_declined / price / competitor / cancelled / postponed / no_feedback / staffing_impossible / terms / duplicate / other","client_declined");if(reason)action({action:"close",reason,comment:window.prompt("Комментарий к закрытию")||undefined})}}>Закрыть</button>}
      {canArchive&&!archived&&<button className="button" disabled={busy} onClick={()=>action({action:"archive"})}>В архив</button>}
      {canArchive&&archived&&<button className="button primary" disabled={busy} onClick={()=>action({action:"restore",stage:"clarification"})}>Вернуть в работу</button>}
      {canEdit&&!archived&&<button className="button" disabled={busy} onClick={async()=>{const data=await action({action:"duplicate"}) as {id?:string}|undefined;if(data?.id)router.push(`/requests/${data.id}`)}}>Создать похожую</button>}
      {canCreateObject&&stage==="accepted"&&<button className="button primary" disabled={busy} onClick={()=>{const name=window.prompt("Название объекта");const code=window.prompt("Код объекта");if(name&&code)action({action:"create_object",name,code})}}>Создать объект</button>}
    </div>
    {error&&<div className="compliance-note">{error}</div>}
  </div>;
}
