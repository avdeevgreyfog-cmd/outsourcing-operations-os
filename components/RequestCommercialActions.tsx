"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { closeReasonLabels, requestStageLabels } from "@/lib/ui/commercial";

export function RequestCommercialActions({requestId,stage,archived,canEdit,canArchive,canCreateObject,canPublicLink}:{requestId:string;stage:string;archived:boolean;canEdit:boolean;canArchive:boolean;canCreateObject:boolean;canPublicLink:boolean}){
  const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [closeReason,setCloseReason]=useState("client_declined");const [closeComment,setCloseComment]=useState("");const [closing,setClosing]=useState(false);const [publicUrl,setPublicUrl]=useState("");
  async function action(payload:Record<string,unknown>){setBusy(true);setError("");try{const response=await fetch(`/api/requests/${requestId}/commercial`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось выполнить действие");router.refresh();return data;}catch(e){setError(e instanceof Error?e.message:"Не удалось выполнить действие");}finally{setBusy(false)}}
  async function createPublicLink(){setBusy(true);setError("");try{const response=await fetch(`/api/requests/${requestId}/public-link`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({mode:"complete"})});const data=await response.json();if(!response.ok)throw new Error(data.error||"Не удалось создать ссылку");setPublicUrl(data.url);}catch(e){setError(e instanceof Error?e.message:"Не удалось создать ссылку")}finally{setBusy(false)}}
  return <div className="stack-list" style={{padding:12}}>
    {canEdit&&!archived&&<label><span className="cell-sub">Текущий этап</span><select disabled={busy} value={stage} onChange={(e)=>action({action:"stage",stage:e.target.value})}>{Object.entries(requestStageLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>}
    {closing&&<div className="stack-item"><div style={{width:"100%"}}><strong>Закрытие заявки</strong><div style={{display:"grid",gap:8,marginTop:8}}><select value={closeReason} onChange={(e)=>setCloseReason(e.target.value)}>{Object.entries(closeReasonLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select><textarea value={closeComment} onChange={(e)=>setCloseComment(e.target.value)} placeholder="Комментарий к закрытию" rows={3}/><div style={{display:"flex",gap:8}}><button className="button primary" disabled={busy} onClick={async()=>{await action({action:"close",reason:closeReason,comment:closeComment||undefined});setClosing(false)}}>Подтвердить закрытие</button><button className="button" disabled={busy} onClick={()=>setClosing(false)}>Отмена</button></div></div></div></div>}
    {publicUrl&&<div className="stack-item"><div style={{minWidth:0}}><strong>Безопасная ссылка для заказчика</strong><small style={{wordBreak:"break-all"}}>{publicUrl}</small></div><button className="button" type="button" onClick={()=>navigator.clipboard.writeText(publicUrl)}>Копировать</button></div>}
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      {canEdit&&!archived&&!closing&&<button className="button" disabled={busy} onClick={()=>setClosing(true)}>Закрыть</button>}
      {canArchive&&!archived&&<button className="button" disabled={busy} onClick={()=>action({action:"archive"})}>В архив</button>}
      {canArchive&&archived&&<button className="button primary" disabled={busy} onClick={()=>action({action:"restore",stage:"clarification"})}>Вернуть в работу</button>}
      {canEdit&&!archived&&<button className="button" disabled={busy} onClick={async()=>{const data=await action({action:"duplicate"}) as {id?:string}|undefined;if(data?.id)router.push(`/requests/${data.id}`)}}>Создать похожую заявку</button>}
      {canPublicLink&&!archived&&<button className="button" disabled={busy} onClick={createPublicLink}>Ссылка для заказчика</button>}
      {canCreateObject&&stage==="accepted"&&<button className="button primary" disabled={busy} onClick={()=>{const name=window.prompt("Название объекта");const code=window.prompt("Код объекта");if(name&&code)action({action:"create_object",name,code})}}>Создать объект</button>}
    </div>
    {error&&<div className="compliance-note">{error}</div>}
  </div>;
}
