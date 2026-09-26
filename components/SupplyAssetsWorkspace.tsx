"use client";

import {useState} from "react";
import {InventoryWorkspace} from "@/components/InventoryWorkspace";
import {GlobalPpeTemplatesWorkspace} from "@/components/GlobalPpeTemplatesWorkspace";
import {Section} from "@/components/UI";
import type {InventorySnapshot,ObjectPpeTemplateRow,OperationsReferenceData} from "@/lib/operations/service";

type View="stock"|"norms";

export function SupplyAssetsWorkspace({
  snapshot,options,templates,canManage,demo,initialWorkerId,initialAction,initialItemId,initialVariant,initialObjectId,
}:{
  snapshot:InventorySnapshot;
  options:OperationsReferenceData;
  templates:ObjectPpeTemplateRow[];
  canManage:boolean;
  demo:boolean;
  initialWorkerId?:string|null;
  initialAction?:"issue"|"return"|null;
  initialItemId?:string|null;
  initialVariant?:string|null;
  initialObjectId?:string|null;
}){
  const [view,setView]=useState<View>("stock");
  return <div className="supply-assets-workspace">
    <div className="object-local-tabs supply-assets-views" role="tablist" aria-label="Раздел обеспечения">
      <button type="button" className={view==="stock"?"active":""} onClick={()=>setView("stock")}>Запасы и движения</button>
      <button type="button" className={view==="norms"?"active":""} onClick={()=>setView("norms")}>Нормы выдачи</button>
    </div>
    {view==="stock"?<InventoryWorkspace snapshot={snapshot} options={options} canManage={canManage} demo={demo} initialWorkerId={initialWorkerId} initialAction={initialAction} initialItemId={initialItemId} initialVariant={initialVariant} initialObjectId={initialObjectId}/>:<Section title="Базовые нормы выдачи" note="Общие нормы компании по специальностям. На объекте они применяются автоматически и при необходимости переопределяются локально."><GlobalPpeTemplatesWorkspace templates={templates} inventoryItems={snapshot.items} specialties={options.specialties} canManage={canManage} demo={demo}/></Section>}
  </div>;
}
