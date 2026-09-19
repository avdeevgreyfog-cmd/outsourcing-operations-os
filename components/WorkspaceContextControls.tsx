"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { WorkspaceContext } from "@/lib/access/types";

export function WorkspaceContextControls({ context, demo }: { context: WorkspaceContext; demo: boolean }) {
  const router = useRouter();
  const [busy,setBusy] = useState(false);

  async function changeWorkspace(value:string){
    if(!value || value===context.currentOrganizationKey) return;
    setBusy(true);
    const response=await fetch("/api/session/workspace",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({workspace:value}),
    });
    setBusy(false);
    if(!response.ok) return;
    router.push("/");
    router.refresh();
  }

  async function changePreview(value:string){
    setBusy(true);
    const response=await fetch("/api/session/access-preview",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({target:value || null}),
    });
    setBusy(false);
    if(!response.ok) return;
    router.push("/");
    router.refresh();
  }

  const accessTemplates=context.previewOptions.filter((item)=>item.targetType==="role_template");
  const positions=context.previewOptions.filter((item)=>item.targetType==="position");
  const processRoles=context.previewOptions.filter((item)=>item.targetType==="process_role");

  return <div className="workspace-context-controls">
    {context.organizations.length>1&&<label className="workspace-switch">
      <span>Организация</span>
      <select disabled={busy} value={context.currentOrganizationKey} onChange={(event)=>changeWorkspace(event.target.value)} aria-label="Организация">
        {context.organizations.map((organization)=><option key={organization.key} value={organization.key}>{organization.name}</option>)}
      </select>
    </label>}
    {!demo&&context.previewOptions.length>0&&<label className={"workspace-switch access-preview-control "+(context.previewTarget?"is-preview":"")}>
      <span>{context.previewTarget?"Режим проверки":"Доступ"}</span>
      <select disabled={busy} value={context.previewTarget??""} onChange={(event)=>changePreview(event.target.value)} aria-label="Проверить интерфейс как роль или должность">
        <option value="">Моя роль · {context.actualRoleName}</option>
        {accessTemplates.length>0&&<optgroup label="Шаблоны доступа">{accessTemplates.map((item)=><option key={"role:"+item.id} value={"role_template:"+item.id}>Как {item.name}</option>)}</optgroup>}
        {positions.length>0&&<optgroup label="Должности">{positions.map((item)=><option key={"position:"+item.id} value={"position:"+item.id}>Должность · {item.name}</option>)}</optgroup>}
        {processRoles.length>0&&<optgroup label="Процессные роли">{processRoles.map((item)=><option key={"process:"+item.id} value={"process_role:"+item.id}>Роль · {item.name}</option>)}</optgroup>}
      </select>
    </label>}
  </div>;
}
