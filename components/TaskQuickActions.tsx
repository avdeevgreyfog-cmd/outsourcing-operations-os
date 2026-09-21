"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Play, RotateCcw, X } from "lucide-react";

export function TaskQuickActions({id,status,canEdit}:{id:string;status:string;canEdit:boolean}){
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  if(!canEdit||status==="cancelled")return null;
  async function change(next:string){
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/tasks/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({status:next})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось обновить задачу");
      router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось обновить задачу");}finally{setBusy(false)}
  }
  return <div className="task-quick-actions">
    {status==="open"&&<button className="icon-button" title="В работу" disabled={busy} onClick={()=>void change("in_progress")}><Play size={14}/></button>}
    {status!=="done"&&<button className="icon-button" title="Выполнено" disabled={busy} onClick={()=>void change("done")}><Check size={14}/></button>}
    {status==="done"&&<button className="icon-button" title="Вернуть в работу" disabled={busy} onClick={()=>void change("in_progress")}><RotateCcw size={14}/></button>}
    {status!=="done"&&<button className="icon-button" title="Отменить" disabled={busy} onClick={()=>void change("cancelled")}><X size={14}/></button>}
    {error&&<span className="cell-sub">{error}</span>}
  </div>;
}
