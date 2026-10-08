"use client";
import {useState} from "react";
import {ResourceScheduler} from "@/components/ResourceScheduler";
import {WorkerConfirmationManager} from "@/components/WorkerConfirmationManager";
import type {ShiftRow} from "@/lib/data/service";
import type {OperationsReferenceData} from "@/lib/operations/service";
export function GlobalShiftsWorkspace({rows,options,canEdit,canReconcile,demo}:{rows:ShiftRow[];options:OperationsReferenceData;canEdit:boolean;canReconcile:boolean;demo:boolean}){
 const [tab,setTab]=useState<"schedule"|"confirmations">("confirmations");
 return <div>
  <div className="worker-confirmation-tabs" role="tablist" aria-label="Смены и выходы">
   <button role="tab" aria-selected={tab==="confirmations"} className={tab==="confirmations"?"active":""} onClick={()=>setTab("confirmations")}>Контроль выходов</button>
   <button role="tab" aria-selected={tab==="schedule"} className={tab==="schedule"?"active":""} onClick={()=>setTab("schedule")}>Графики и смены</button>
  </div>
  {tab==="schedule"?<ResourceScheduler rows={rows} options={options} canEdit={canEdit}/>:<WorkerConfirmationManager canEdit={canEdit} canReconcile={canReconcile} demo={demo}/>}
 </div>;
}
