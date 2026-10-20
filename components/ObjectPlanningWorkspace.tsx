"use client";
import {useState} from "react";
import type {ShiftRow,WorkerRow} from "@/lib/data/service";
import {ObjectShiftsWorkspace} from "@/components/ObjectShiftsWorkspace";
import {WorkerConfirmationManager} from "@/components/WorkerConfirmationManager";
export function ObjectPlanningWorkspace({objectId,rows,workers,today,canEdit,canReconcile,canPlanAbsence,demo}:{objectId:string;rows:ShiftRow[];workers:WorkerRow[];today:string;canEdit:boolean;canReconcile:boolean;canPlanAbsence:boolean;demo:boolean}){
 const [tab,setTab]=useState<"planning"|"answers"|"links"|"updates">("planning");
 return <div>
  <div className="object-local-tabs object-planning-tabs" role="tablist" aria-label="Планирование выходов">
   {([["planning","График сотрудников"],["answers","Подтверждения"],["links","Персональные ссылки"],["updates","Изменения сотрудников"]] as const).map(([key,label])=><button key={key} role="tab" aria-selected={tab===key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}
  </div>
  <div hidden={tab!=="planning"}><ObjectShiftsWorkspace objectId={objectId} rows={rows} workers={workers} today={today} canEdit={canEdit} canPlanAbsence={canPlanAbsence} demo={demo} pilot/></div><div hidden={tab==="planning"}><WorkerConfirmationManager objectId={objectId} canEdit={canEdit} canReconcile={canReconcile} demo={demo} view={tab==="planning"?"answers":tab} hideTabs/></div>
 </div>;
}
