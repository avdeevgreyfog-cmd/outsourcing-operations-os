"use client";
import {useState} from "react";
import {ResourceScheduler} from "@/components/ResourceScheduler";
import {WorkerConfirmationManager} from "@/components/WorkerConfirmationManager";
import {MobileShiftControls} from "@/components/MobileShiftControls";
import type {ShiftRow} from "@/lib/data/service";
import type {OperationsReferenceData} from "@/lib/operations/service";
export function GlobalShiftsWorkspace({rows,options,canEdit,canReconcile,canUseMobile=false,demo}:{rows:ShiftRow[];options:OperationsReferenceData;canEdit:boolean;canReconcile:boolean;canUseMobile?:boolean;demo:boolean}){
 const [tab,setTab]=useState<"schedule"|"confirmations">("confirmations");
 return <div>
  <div className="worker-confirmation-tabs" role="tablist" aria-label="Смены и выходы">
   <button role="tab" aria-selected={tab==="confirmations"} className={tab==="confirmations"?"active":""} onClick={()=>setTab("confirmations")}>Контроль выходов</button>
   <button role="tab" aria-selected={tab==="schedule"} className={tab==="schedule"?"active":""} onClick={()=>setTab("schedule")}>Графики и смены</button>
  </div>
  {tab==="schedule"?<ResourceScheduler rows={rows} options={options} canEdit={canEdit}/>:<><div className={"ocs-desktop-confirmations"+(canUseMobile?"":" ocs-keep-desktop")}><WorkerConfirmationManager canEdit={canEdit} canReconcile={canReconcile} demo={demo}/></div>{canUseMobile&&<div className="ocs-mobile-confirmations"><MobileShiftControls canEdit={canEdit} demo={demo} onOpenSchedule={()=>setTab("schedule")}/></div>}</>}
 </div>;
}
