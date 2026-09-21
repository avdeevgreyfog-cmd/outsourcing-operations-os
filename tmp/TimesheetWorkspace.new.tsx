"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Download, Printer, RotateCcw, Send, ShieldCheck, WalletCards } from "lucide-react";
import { Metric, Status } from "@/components/UI";
import { rub } from "@/lib/ui/format";
import type { TimesheetData, TimesheetWorkerRow } from "@/lib/data/service";
import type { OperationsReferenceData } from "@/lib/operations/service";

type Mode="first"|"second"|"month";
type View="client"|"internal";
type WorkflowAction="submit_internal"|"review_internal"|"return_internal"|"send_client"|"client_approve"|"client_return"|"close";

const statusLabels:Record<string,string>={
  draft:"Черновик",submitted:"Передан",approved:"Согласован",returned:"Возвращён",
  internal_submitted:"На внутренней проверке",internal_checked:"Проверен внутри",client_sent:"Отправлен клиенту",client_approved:"Подтверждён клиентом",closed:"Закрыт",
};

export function TimesheetWorkspace({data,options,sensitive,canEdit,canSubmit,canReview,canApproveClient,canClose}:{
  data:TimesheetData;options:OperationsReferenceData;sensitive:boolean;canEdit:boolean;canSubmit:boolean;canReview:boolean;canApproveClient:boolean;canClose:boolean;
}){
  const router=useRouter();
  const [mode,setMode]=useState<Mode>("month");
  const [view,setView]=useState<View>(sensitive?"internal":"client");
  const [rows,setRows]=useState<TimesheetWorkerRow[]>(data.rows);
  const [saving,setSaving]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [comment,setComment]=useState("");
  const lastDay=Number(data.periodEnd.slice(8,10));
  const allDays=useMemo(()=>range(1,lastDay),[lastDay]);
  const days=mode==="first"?allDays.filter(day=>day<=15):mode==="second"?allDays.filter(day=>day>=16):allDays;
  const visibleRows=rows.map(row=>({...row,visibleTotal:days.reduce((sum,day)=>sum+numericCell(row.days?.[String(day)]),0)}));
  const totals=days.map(day=>visibleRows.reduce((sum,row)=>sum+numericCell(row.days?.[String(day)]),0));
  const totalHours=visibleRows.reduce((sum,row)=>sum+row.visibleTotal,0);
  const totalNight=visibleRows.reduce((sum,row)=>sum+Number(row.night??0),0);
  const totalOvertime=visibleRows.reduce((sum,row)=>sum+Number(row.overtime??0),0);
  const internal=data.internalSnapshot;
  const client=data.clientSnapshot;
  const locked=internal?.status==="internal_submitted"||internal?.status==="internal_checked"||internal?.status==="closed"||client?.status==="client_sent"||client?.status==="client_approved"||client?.status==="closed";
  const canEditFact=canEdit&&view==="internal"&&!locked;

  function changeContext(objectId:string,month:string){
    const params=new URLSearchParams();if(objectId)params.set("object",objectId);if(month)params.set("month",month);
    router.push("/timesheets?"+params.toString());
  }
  async function saveCell(workerId:string,day:number,value:string){
    if(!canEditFact)return;
    const key=workerId+":"+day;setSaving(key);setMessage("");
    try{
      const workDate=data.month+"-"+String(day).padStart(2,"0");
      const response=await fetch("/api/timesheets/entries",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({workerId,objectId:data.objectId,workDate,value})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить");
      setRows(current=>current.map(row=>row.workerId===workerId?{...row,days:{...(row.days??{}),[String(day)]:normalizeCell(value)}}:row));
      setMessage("Изменение сохранено");
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось сохранить");}
    finally{setSaving("");}
  }
  async function workflow(action:WorkflowAction){
    setBusy(true);setMessage("");
    try{
      const response=await fetch("/api/timesheets/workflow",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,objectId:data.objectId,periodStart:data.periodStart,periodEnd:data.periodEnd,comment:comment||null})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось выполнить действие");
      const labels:Record<WorkflowAction,string>={submit_internal:"Табель передан на внутреннюю проверку",review_internal:"Внутренний табель согласован",return_internal:"Табель возвращён менеджеру",send_client:"Клиентская версия зафиксирована и отправлена",client_approve:"Подтверждение клиента зафиксировано",client_return:"Клиентский возврат зафиксирован",close:"Период закрыт, начисления и экономика сформированы"};
      setMessage(labels[action]);setComment("");router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось выполнить действие");}finally{setBusy(false)}
  }
  function exportCsv(){
    const header=["Сотрудник",...days.map(day=>String(day).padStart(2,"0")+"."+data.month.slice(5,7)),"Часы",...(view==="internal"&&sensitive?["Ставка","Начислено"]:[])];
    const body=visibleRows.map(row=>[row.name,...days.map(day=>row.days?.[String(day)]??""),row.visibleTotal,...(view==="internal"&&sensitive?[row.rate??"",row.accrual??""]:[])]);
    const csv=[header,...body].map(line=>line.map(value=>'"'+String(value).replaceAll('"','""')+'"').join(";")).join("\n");
    const link=document.createElement("a");link.href=URL.createObjectURL(new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"}));link.download="timesheet-"+data.month+"-"+view+".csv";link.click();URL.revokeObjectURL(link.href);
  }

  const actions=[] as Array<{key:WorkflowAction;label:string;tone?:"primary";icon:React.ReactNode}>;
  if(canSubmit&&(!internal||["draft","returned"].includes(internal.status)))actions.push({key:"submit_internal",label:"На внутреннюю проверку",tone:"primary",icon:<Send size={14}/>});
  if(canReview&&internal?.status==="internal_submitted"){
    actions.push({key:"review_internal",label:"Проверено",tone:"primary",icon:<CheckCircle2 size={14}/>});
    actions.push