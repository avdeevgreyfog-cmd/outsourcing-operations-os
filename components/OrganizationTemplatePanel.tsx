"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { organizationTemplates } from "@/lib/core/organization.mjs";

export function OrganizationTemplatePanel({canManage}:{canManage:boolean}){
  const [busy,setBusy]=useState<string|null>(null);const [message,setMessage]=useState("");const router=useRouter();
  if(!canManage)return null;
  async function apply(code:string){setBusy(code);setMessage("");const response=await fetch("/api/organization/template",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({template:code})});const body=await response.json();setBusy(null);if(!response.ok){setMessage(body.error??"Не удалось применить шаблон");return}setMessage("Недостающие подразделения добавлены. Существующая структура сохранена.");router.refresh()}
  return <div className="template-panel"><div className="template-grid">{Object.entries(organizationTemplates).map(([code,template])=><article key={code}><header><strong>{template.label}</strong><span>{template.units.length} подразделений</span></header><p>{template.units.join(" · ")}</p><button type="button" className="button" onClick={()=>apply(code)} disabled={busy!==null}>{busy===code?"Применение…":"Добавить недостающие"}</button></article>)}</div>{message&&<p className="form-message">{message}</p>}</div>;
}
