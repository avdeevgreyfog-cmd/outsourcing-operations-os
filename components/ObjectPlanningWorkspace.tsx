"use client";
import {useState} from "react";
import type {ShiftRow,WorkerRow} from "@/lib/data/service";
import {ObjectShiftsWorkspace} from "@/components/ObjectShiftsWorkspace";
import {WorkerConfirmationManager} from "@/components/WorkerConfirmationManager";
export function ObjectPlanningWorkspace({objectId,rows,workers,today,canEdit,canReconcile,canPlanAbsence,demo}:{objectId:string;rows:ShiftRow[];workers:WorkerRow[];today:string;canEdit:boolean;canReconcile:boolean;canPlanAbsence:boolean;demo:boolean}){
 const [tab,setTab]=useState<"planning"|"confirmations">("planning");
 return <div>
  <div className="worker-confirmation-tabs" role="tablist" aria-label="Планирование выходов">
   <button role="tab" aria-selected={tab==="planning"} className={tab==="planning"?"active":""} onClick={()=>setTab("planning")}>График сотрудников</button>
   <button role="tab" aria-selected={tab==="confirmations"} className={tab==="confirmations"?"active":""} onClick={()=>setTab("confirmations")}>Подтверждения и ссылки</button>
  </div>
  {tab==="planning"?<ObjectShiftsWorkspace objectId={objectId} rows={rows} workers={workers} today={today} canEdit={canEdit} canPlanAbsence={canPlanAbsence} demo={demo} pilot/>:<WorkerConfirmationManager objectId={objectId} canEdit={canEdit} canReconcile={canReconcile} demo={demo}/>}
 </div>;
}
