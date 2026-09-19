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
      body:JSON.stringify({roleTemplateId:value || null}),
    });
    setBusy(false);
    if(!response.ok) return;
    router.push("/");
    router.refresh();
  }

  return <div className="workspace-context-controls">
    {context.organizations.length>1&&<label className="workspace-switch">
      <span>Организация</span>
      <select disabled={busy} value={context.currentOrganizationKey} onChange={(event)=>changeWorkspace(event.target.value)} aria-label="Организация">
        {context.organizations.map((organization)=><option key={organization.key} value={organization.key}>{organization.name}</option>)}
      </select>
    </label>}
    {!demo&&context.previewRoles.length>0&&<label className={"workspace-switch access-preview-control "+(context.previewRoleId?"is-preview":"")}>
      <span>{context.previewRoleId?"Режим проверки":"Доступ"}</span>
      <select disabled={busy} value={context.previewRoleId??""} onChange={(event)=>changePreview(event.target.value)} aria-label="Проверить интерфейс как роль">
        <option value="">Моя роль · {context.actualRoleName}</option>
        {context.previewRoles.map((role)=><option key={role.id} value={role.id}>Как {role.name}</option>)}
      </select>
    </label>}
  </div>;
}
