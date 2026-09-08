"use client";

import { useState } from "react";

export function RequestShareHeaderButton({ requestId }: { requestId: string }) {
  const [label,setLabel]=useState("Поделиться");
  const [busy,setBusy]=useState(false);
  async function share(){setBusy(true);try{const response=await fetch(`/api/requests/${requestId}/share`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({expiresInDays:14})});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось создать ссылку");const full=`${window.location.origin}${json.path}`;await navigator.clipboard.writeText(full);setLabel("Ссылка скопирована");setTimeout(()=>setLabel("Поделиться"),1800);}catch(error){setLabel(error instanceof Error?error.message:"Ошибка");setTimeout(()=>setLabel("Поделиться"),2600);}finally{setBusy(false);}}
  return <button type="button" className="button" disabled={busy} onClick={share}>{label}</button>;
}
