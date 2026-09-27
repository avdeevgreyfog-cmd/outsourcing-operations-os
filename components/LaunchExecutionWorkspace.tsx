"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronRight, ClipboardCheck, Plus, X } from "lucide-react";
import { LaunchGantt } from "@/components/LaunchGantt";
import type { LaunchTaskRow } from "@/lib/data/service";
import type { OperationsAnalyticsRow, StaffingForecastRow } from "@/lib/operations/service";
import type { RecruitingApplicationRow } from "@/lib/recruiting/service";
import type {
  LaunchAssigneeOption,
  LaunchPlanRow,
  LaunchSiteVisitRow,
  LaunchStaffingWaveRow,
} from "@/lib/operations/launch-management";
import { defaultPrimarySiteVisitChecklist } from "@/lib/operations/launch-checklist";
import type { SiteVisitChecklistItem, SiteVisitChecklistStatus } from "@/lib/operations/launch-checklist";

type LaunchTab="summary"|"plan"|"staffing"|"issues";
type PlanView="gantt"|"table";
type TaskDraft={
  id:string|null;title:string;category:string;ownerUserId:string;startDate:string;endDate:string;progress:number;
  status:string;risk:string;milestone:boolean;blocksLaunch:boolean;dependencyIds:string[];
};
type WaveDraft={id:string|null;name:string;targetDate:string;plannedCount:number;specialtyId:string;status:string;note:string};
type VisitDraft={id:string|null;scheduledDate:string;status:string;checklist:SiteVisitChecklistItem[];notes:string};

const categoryLabels:Record<string,string>={
  contracts:"Договоры и клиент",
  staffing:"Персонал",
  housing:"Проживание",
  transport:"Транспорт",
  meals:"Питание",
  access:"Документы и допуски",
  supply:"СИЗ и обеспечение",
  operations:"Подготовка операций",
  other:"Прочее",
};
const categoryOrder=["contracts","staffing","housing","transport","meals","access","supply","operations","other"];
const phaseLabels:Record<string,string>={preparation:"Подготовка",ready:"Готов к запуску",active:"Запуск / стабилизация",completed:"Завершён",cancelled:"Отменён"};
const taskStatusLabels:Record<string,string>={planned:"Не начато",in_progress:"В работе",blocked:"Заблокировано",done:"Готово",cancelled:"Отменено"};
const visitStatusLabels:Record<SiteVisitChecklistStatus,string>={pending:"Нужно уточнить",confirmed:"Уточнено",issue:"Есть проблема",na:"Не относится"};
const readyStages=new Set(["preparation","first_shift","retention_7","retention_30"]);

function todayIso(){return new Date().toISOString().slice(0,10)}
function parseDate(value:string){return new Date(value+"T00:00:00Z")}
function addDays(value:string,days:number){const d=parseDate(value);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function formatDate(value:string|null|undefined){
  if(!value)return "—";
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(parseDate(value));
}
function formatShort(value:string|null|undefined){
  if(!value)return "—";
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(parseDate(value));
}
function daysTo(value:string){
  return Math.round((parseDate(value).getTime()-parseDate(todayIso()).getTime())/86_400_000);
}
function targetLabel(value:string){
  const days=daysTo(value);
  if(days===0)return "сегодня";
  if(days>0)return "через "+days+" дн.";
  return Math.abs(days)+" дн. назад";
}
function taskDraft(task?:LaunchTaskRow|null,target?:string,defaultOwnerUserId=""):TaskDraft{
  return {
    id:task?.id??null,title:task?.title??"",category:task?.category??"operations",ownerUserId:task?.ownerUserId??defaultOwnerUserId,
    startDate:task?.startDate??todayIso(),endDate:task?.endDate??target??todayIso(),progress:Number(task?.progress??0),
    status:task?.status??"planned",risk:task?.risk??"normal",milestone:Boolean(task?.milestone),blocksLaunch:Boolean(task?.blocksLaunch??task?.critical),
    dependencyIds:[...(task?.dependencyIds??[])],
  };
}
function waveDraft(wave?:LaunchStaffingWaveRow|null,target?:string):WaveDraft{
  return {id:wave?.id??null,name:wave?.name??"",targetDate:wave?.targetDate??target??todayIso(),plannedCount:Number(wave?.plannedCount??1),specialtyId:wave?.specialtyId??"",status:wave?.status??"planned",note:wave?.note??""};
}
function uniqueCandidates(rows:RecruitingApplicationRow[]){
  const map=new Map<string,RecruitingApplicationRow>();
  for(const row of rows){
    const current=map.get(row.candidateId);
    if(!current||(row.updatedAt??"")>(current.updatedAt??""))map.set(row.candidateId,row);
  }
  return [...map.values()];
}

export function LaunchExecutionWorkspace({
  plan,tasks,waves,visits,analytics,applications,forecast,assignees,canEdit,demo,initialTab="summary",
}:{
  plan:LaunchPlanRow;
  tasks:LaunchTaskRow[];
  waves:LaunchStaffingWaveRow[];
  visits:LaunchSiteVisitRow[];
  analytics:OperationsAnalyticsRow|null;
  applications:RecruitingApplicationRow[];
  forecast:StaffingForecastRow[];
  assignees:LaunchAssigneeOption[];
  canEdit:boolean;
  demo:boolean;
  initialTab?:LaunchTab;
}){
  const router=useRouter();
  const [tab,setTab]=useState<LaunchTab>(initialTab);
  const [planView,setPlanView]=useState<PlanView>("gantt");
  const [localPlan,setLocalPlan]=useState(plan);
  const [localTasks,setLocalTasks]=useState(tasks);
  const [localWaves,setLocalWaves]=useState(waves);
  const [localVisits,setLocalVisits]=useState(visits);
  const [taskEditor,setTaskEditor]=useState<TaskDraft|null>(null);
  const [waveEditor,setWaveEditor]=useState<WaveDraft|null>(null);
  const [visitEditor,setVisitEditor]=useState<VisitDraft|null>(null);
  const [planEditor,setPlanEditor]=useState(false);
  const [planDate,setPlanDate]=useState(plan.targetDate);
  const [stabilizationDays,setStabilizationDays]=useState(plan.stabilizationDays);
  const [shiftLinked,setShiftLinked]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const editable=canEdit&&!["completed","cancelled"].includes(localPlan.phase);

  const activeTasks=useMemo(()=>localTasks.filter(row=>row.status!=="cancelled"),[localTasks]);
  const unfinished=useMemo(()=>activeTasks.filter(row=>row.status!=="done"),[activeTasks]);
  const blockingTasks=useMemo(()=>unfinished.filter(row=>row.blocksLaunch||row.status==="blocked"||["high","critical"].includes(row.risk)),[unfinished]);
  const primaryVisit=localVisits.find(row=>row.visitType==="primary")??null;
  const visitStats=useMemo(()=>{
    const checklist=primaryVisit?.checklist??[];
    const applicable=checklist.filter(item=>item.status!=="na");
    const done=applicable.filter(item=>item.status==="confirmed").length;
    const issues=applicable.filter(item=>item.status==="issue").length;
    const unresolvedRequired=applicable.filter(item=>item.required&&item.status==="pending").length;
    return {total:applicable.length,done,issues,unresolvedRequired,percent:applicable.length?Math.round(done/applicable.length*100):0};
  },[primaryVisit]);

  const objectApplications=useMemo(()=>uniqueCandidates(applications.filter(row=>row.objectId===plan.objectId)),[applications,plan.objectId]);
  const waveRows=useMemo(()=>{
    const cumulativeBySpecialty=new Map<string,number>();
    return [...localWaves].sort((a,b)=>a.targetDate.localeCompare(b.targetDate)).map(wave=>{
      const key=wave.specialtyId??"all";
      const cumulative=(cumulativeBySpecialty.get(key)??0)+wave.plannedCount;
      cumulativeBySpecialty.set(key,cumulative);
      const specialtyForecast=wave.specialtyId?forecast.find(item=>item.specialtyId===wave.specialtyId):null;
      const source=specialtyForecast?objectApplications.filter(row=>specialtyForecast.needIds.includes(row.needId)):objectApplications;
      const ready=source.filter(row=>{
        if(!readyStages.has(row.stage))return false;
        const readyDate=row.plannedArrivalAt?String(row.plannedArrivalAt).slice(0,10):row.plannedStartDate;
        return !readyDate||readyDate<=wave.targetDate;
      }).length;
      const arrived=source.filter(row=>Boolean(row.plannedArrivalAt)&&String(row.plannedArrivalAt).slice(0,10)<=wave.targetDate).length;
      const started=source.filter(row=>Boolean(row.actualStartAt)&&String(row.actualStartAt).slice(0,10)<=wave.targetDate).length;
      return {...wave,cumulative,ready,arrived,started,gap:Math.max(cumulative-ready,0),surplus:Math.max(ready-cumulative,0)};
    });
  },[localWaves,objectApplications,forecast]);

  const nextWave=waveRows.find(row=>row.targetDate>=todayIso()&&row.status!=="cancelled")??(waveRows.length?waveRows[waveRows.length-1]:null);
  const ganttRows=useMemo(()=>{
    const taskRows=[...localTasks];
    const staffingRows:LaunchTaskRow[]=localWaves.filter(wave=>wave.status!=="cancelled").map(wave=>({
      id:"wave:"+wave.id,organizationId:plan.organizationId,launchId:plan.id,objectId:plan.objectId,object:plan.object,
      title:`${wave.name} · +${wave.plannedCount} чел.`,level:0,owner:"Подбор",
      start:formatShort(wave.targetDate),end:formatShort(wave.targetDate),startDate:wave.targetDate,endDate:wave.targetDate,
      baselineStart:null,baselineEnd:null,baselineStartDate:null,baselineEndDate:null,progress:wave.status==="completed"?100:0,
      status:wave.status==="completed"?"done":wave.status==="in_progress"?"in_progress":"planned",risk:"normal",milestone:true,critical:false,
      blocksLaunch:false,category:"staffing",taskKind:"staffing_wave",dependencyIds:[],assigneeUserIds:plan.assigneeUserIds,
    }));
    const visitRows:LaunchTaskRow[]=localVisits.filter(visit=>visit.status!=="cancelled"&&visit.scheduledDate).map(visit=>({
      id:"visit:"+visit.id,organizationId:plan.organizationId,launchId:plan.id,objectId:plan.objectId,object:plan.object,
      title:visit.visitType==="primary"?"Первичный выезд на объект":"Контрольный выезд",level:0,owner:visit.owner??plan.ownerName??"—",
      start:formatShort(visit.scheduledDate),end:formatShort(visit.scheduledDate),startDate:visit.scheduledDate,endDate:visit.scheduledDate,
      baselineStart:null,baselineEnd:null,baselineStartDate:null,baselineEndDate:null,progress:visit.status==="completed"?100:visit.status==="in_progress"?50:0,
      status:visit.status==="completed"?"done":visit.status==="in_progress"?"in_progress":"planned",risk:"normal",milestone:true,critical:visit.visitType==="primary"&&visit.status!=="completed",
      blocksLaunch:visit.visitType==="primary"&&visit.status!=="completed",category:"operations",taskKind:"site_visit",dependencyIds:[],assigneeUserIds:plan.assigneeUserIds,
    }));
    return [...taskRows,...staffingRows,...visitRows].sort((a,b)=>{
      const ac=categoryOrder.indexOf(a.category??"other");const bc=categoryOrder.indexOf(b.category??"other");
      return (ac===-1?999:ac)-(bc===-1?999:bc)||(a.startDate??"").localeCompare(b.startDate??"");
    });
  },[localTasks,localWaves,localVisits,plan.id,plan.objectId,plan.object,plan.organizationId,plan.ownerName,plan.assigneeUserIds]);

  const staffingGap=nextWave?.gap??Math.max((analytics?.required??0)-(analytics?.working??0)-(analytics?.preparing??0),0);
  const siteVisitBlocker=Boolean(primaryVisit&&primaryVisit.status!=="completed");
  const contractBlocked=localPlan.contractGate==="blocked";
  const launchBlocked=contractBlocked||blockingTasks.length>0||visitStats.issues>0||staffingGap>0||siteVisitBlocker;

  const readiness=useMemo(()=>{
    const taskScore=activeTasks.length?Math.round(activeTasks.reduce((sum,row)=>sum+Number(row.progress||0),0)/activeTasks.length):0;
    const staffingRequired=analytics?.required??0;
    const staffingReady=staffingRequired?Math.min(100,Math.round(((analytics?.working??0)+(analytics?.preparing??0))/staffingRequired*100)):100;
    const visitScore=primaryVisit?visitStats.percent:100;
    return Math.round(taskScore*.45+staffingReady*.4+visitScore*.15);
  },[activeTasks,analytics,primaryVisit,visitStats.percent]);

  const categoryReadiness=useMemo(()=>categoryOrder.map(category=>{
    const rows=activeTasks.filter(row=>(row.category??"other")===category);
    const visitItems=(primaryVisit?.checklist??[]).filter(item=>item.category===category&&item.status!=="na");
    if(!rows.length&&!visitItems.length)return null;
    const taskValue=rows.length?rows.reduce((sum,row)=>sum+Number(row.progress||0),0)/rows.length:100;
    const visitValue=visitItems.length?visitItems.filter(item=>item.status==="confirmed").length/visitItems.length*100:100;
    return {category,label:categoryLabels[category]??category,value:Math.round(rows.length&&visitItems.length?(taskValue+visitValue)/2:rows.length?taskValue:visitValue)};
  }).filter((row):row is {category:string;label:string;value:number}=>Boolean(row)),[activeTasks,primaryVisit]);

  const nextActions=useMemo(()=>unfinished
    .filter(row=>row.endDate)
    .sort((a,b)=>(a.endDate??"").localeCompare(b.endDate??""))
    .slice(0,6),[unfinished]);

  const visitIssues=useMemo(()=>(primaryVisit?.checklist??[]).filter(item=>item.status==="issue"||(primaryVisit?.status==="completed"&&item.required&&item.status==="pending")),[primaryVisit]);
  const visitAnswer=(id:string)=>primaryVisit?.checklist.find(item=>item.id===id)?.value?.trim()||"Не уточнено";
  const outputRules=[
    ["Допустимые дни вывода",visitAnswer("access-days")],
    ["Максимум новичков за один вывод",visitAnswer("access-limit")],
    ["Минимальный состав первого запуска",visitAnswer("staff-minimum")],
    ["Во сколько быть на объекте",visitAnswer("schedule-arrival")],
  ];

  async function request(url:string,options:RequestInit){
    const response=await fetch(url,options);
    const json=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(json.error??"Не удалось сохранить изменения");
    return json;
  }

  async function savePlan(){
    try{
      setBusy(true);setError("");
      const previous=localPlan.targetDate;
      if(demo){
        const delta=Math.round((parseDate(planDate).getTime()-parseDate(previous).getTime())/86_400_000);
        setLocalPlan(current=>({...current,targetDate:planDate,stabilizationDays}));
        if(delta&&shiftLinked){
          setLocalTasks(current=>current.map(row=>row.status==="done"||row.status==="cancelled"?row:{...row,startDate:row.startDate?addDays(row.startDate,delta):row.startDate,endDate:row.endDate?addDays(row.endDate,delta):row.endDate,start:row.startDate?formatShort(addDays(row.startDate,delta)):row.start,end:row.endDate?formatShort(addDays(row.endDate,delta)):row.end}));
          setLocalWaves(current=>current.map(row=>row.status==="completed"||row.status==="cancelled"?row:{...row,targetDate:addDays(row.targetDate,delta)}));
          setLocalVisits(current=>current.map(row=>row.status==="completed"||row.status==="cancelled"||!row.scheduledDate?row:{...row,scheduledDate:addDays(row.scheduledDate,delta)}));
        }
      }else{
        await request("/api/launches/"+plan.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({targetDate:planDate,stabilizationDays,shiftLinked})});
        router.refresh();
      }
      setPlanEditor(false);
    }catch(e){setError(e instanceof Error?e.message:"Не удалось обновить план");}
    finally{setBusy(false);}
  }

  async function changePhase(phase:LaunchPlanRow["phase"]){
    const message=phase==="active"?"Начать фактический запуск объекта?":phase==="completed"?"Завершить запуск и перевести объект в штатную работу?":"Изменить фазу запуска?";
    if(!window.confirm(message))return;
    try{
      setBusy(true);setError("");
      if(!demo)await request("/api/launches/"+plan.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({phase})});
      setLocalPlan(current=>({...current,phase}));
      if(!demo)router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить фазу");}
    finally{setBusy(false);}
  }

  async function saveTask(){
    if(!taskEditor)return;
    try{
      setBusy(true);setError("");
      if(!taskEditor.title.trim())throw new Error("Укажите название задачи");
      if(taskEditor.endDate<taskEditor.startDate)throw new Error("Дата окончания раньше даты начала");
      const effectiveOwnerUserId=taskEditor.ownerUserId||plan.ownerUserId||null;
      const effectiveProgress=taskEditor.status==="done"?100:taskEditor.progress;
      const payload={title:taskEditor.title.trim(),category:taskEditor.category,ownerUserId:effectiveOwnerUserId,startDate:taskEditor.startDate,endDate:taskEditor.endDate,progress:effectiveProgress,status:taskEditor.status,risk:taskEditor.risk,milestone:taskEditor.milestone,blocksLaunch:taskEditor.blocksLaunch,dependencyIds:taskEditor.dependencyIds};
      if(taskEditor.id){
        if(!demo)await request("/api/launches/"+plan.id+"/tasks/"+taskEditor.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
        const owner=assignees.find(item=>item.id===payload.ownerUserId)?.name??"—";
        setLocalTasks(current=>current.map(row=>row.id===taskEditor.id?{...row,...payload,ownerUserId:payload.ownerUserId??undefined,owner,start:formatShort(payload.startDate),end:formatShort(payload.endDate),critical:payload.blocksLaunch}:row));
      }else{
        let id="demo-task-"+Date.now();
        if(!demo){const json=await request("/api/launches/"+plan.id+"/tasks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});id=json.id??id;}
        setLocalTasks(current=>[...current,{id,organizationId:plan.organizationId,launchId:plan.id,objectId:plan.objectId,object:plan.object,title:payload.title,level:0,owner:assignees.find(item=>item.id===payload.ownerUserId)?.name??plan.ownerName??"—",start:formatShort(payload.startDate),end:formatShort(payload.endDate),startDate:payload.startDate,endDate:payload.endDate,baselineStart:formatShort(payload.startDate),baselineEnd:formatShort(payload.endDate),baselineStartDate:payload.startDate,baselineEndDate:payload.endDate,progress:payload.progress,status:payload.status,risk:payload.risk,milestone:payload.milestone,critical:payload.blocksLaunch,blocksLaunch:payload.blocksLaunch,category:payload.category,taskKind:payload.milestone?"milestone":"task",dependencyIds:[],ownerUserId:payload.ownerUserId??plan.ownerUserId??undefined,assigneeUserIds:plan.assigneeUserIds}]);
      }
      setTaskEditor(null);
      if(!demo)router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить задачу");}
    finally{setBusy(false);}
  }

  async function saveWave(){
    if(!waveEditor)return;
    try{
      setBusy(true);setError("");
      if(!waveEditor.name.trim())throw new Error("Укажите название волны");
      const payload={name:waveEditor.name.trim(),targetDate:waveEditor.targetDate,plannedCount:Number(waveEditor.plannedCount),specialtyId:waveEditor.specialtyId||null,status:waveEditor.status,note:waveEditor.note||null};
      if(waveEditor.id){
        if(!demo)await request("/api/launches/"+plan.id+"/waves/"+waveEditor.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
        const specialty=forecast.find(item=>item.specialtyId===payload.specialtyId)?.specialty??null;
        setLocalWaves(current=>current.map(row=>row.id===waveEditor.id?{...row,...payload,specialty}:row));
      }else{
        let id="demo-wave-"+Date.now();
        if(!demo){const json=await request("/api/launches/"+plan.id+"/waves",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});id=json.id??id;}
        const specialty=forecast.find(item=>item.specialtyId===payload.specialtyId)?.specialty??null;
        setLocalWaves(current=>[...current,{id,organizationId:plan.organizationId,launchId:plan.id,objectId:plan.objectId,name:payload.name,targetDate:payload.targetDate,plannedCount:payload.plannedCount,specialtyId:payload.specialtyId,specialty,note:payload.note,status:"planned"}]);
      }
      setWaveEditor(null);
      if(!demo)router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить волну");}
    finally{setBusy(false);}
  }

  function openVisit(visit:LaunchSiteVisitRow){
    setVisitEditor({id:visit.id,scheduledDate:visit.scheduledDate??"",status:visit.status,checklist:visit.checklist.map(item=>({...item})),notes:visit.notes??""});
  }

  async function createVisit(){
    const scheduled=addDays(localPlan.targetDate,-10);
    try{
      setBusy(true);setError("");
      let id="demo-visit-"+Date.now();
      if(!demo){const json=await request("/api/launches/"+plan.id+"/visits",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({scheduledDate:scheduled,visitType:"primary"})});id=json.id??id;}
      const visit:LaunchSiteVisitRow={id,organizationId:plan.organizationId,launchId:plan.id,objectId:plan.objectId,visitType:"primary",scheduledDate:scheduled,ownerUserId:plan.ownerUserId,owner:plan.ownerName,status:"planned",checklist:defaultPrimarySiteVisitChecklist(),notes:null,completedAt:null};
      setLocalVisits(current=>[...current,visit]);openVisit(visit);
      if(!demo)router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось запланировать выезд");}
    finally{setBusy(false);}
  }

  function changeChecklistItem(itemId:string,patch:Partial<SiteVisitChecklistItem>){
    setVisitEditor(current=>current?{...current,checklist:current.checklist.map(item=>item.id===itemId?{...item,...patch}:item)}:current);
  }

  async function saveVisit(completed=false){
    if(!visitEditor?.id)return;
    try{
      setBusy(true);setError("");
      const status=completed?"completed":visitEditor.status==="planned"?"in_progress":visitEditor.status;
      const payload={scheduledDate:visitEditor.scheduledDate||null,status,checklist:visitEditor.checklist,notes:visitEditor.notes||null};
      if(!demo)await request("/api/launches/"+plan.id+"/visits/"+visitEditor.id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
      setLocalVisits(current=>current.map(row=>row.id===visitEditor.id?{...row,scheduledDate:payload.scheduledDate,status:status as LaunchSiteVisitRow["status"],checklist:visitEditor.checklist,notes:payload.notes,completedAt:completed?new Date().toISOString():row.completedAt}:row));
      if(completed&&demo){
        const issues=visitEditor.checklist.filter(item=>item.status==="issue"||(item.required&&item.status==="pending"));
        const newTasks=issues.filter(item=>!localTasks.some(task=>task.title.endsWith(item.label)&&task.status!=="done"&&task.status!=="cancelled")).map((item,index):LaunchTaskRow=>({
          id:"demo-visit-task-"+Date.now()+"-"+index,organizationId:plan.organizationId,launchId:plan.id,objectId:plan.objectId,object:plan.object,
          title:(item.status==="issue"?"Решить: ":"Уточнить: ")+item.label,level:0,owner:plan.ownerName??"—",
          start:formatShort(todayIso()),end:formatShort(addDays(localPlan.targetDate,-1)),startDate:todayIso(),endDate:addDays(localPlan.targetDate,-1),
          baselineStart:formatShort(todayIso()),baselineEnd:formatShort(addDays(localPlan.targetDate,-1)),baselineStartDate:todayIso(),baselineEndDate:addDays(localPlan.targetDate,-1),
          progress:0,status:"planned",risk:item.blocksLaunch?"high":"watch",milestone:false,critical:item.blocksLaunch,blocksLaunch:item.blocksLaunch,category:item.category,taskKind:"task",dependencyIds:[],
          ownerUserId:plan.ownerUserId??undefined,assigneeUserIds:plan.assigneeUserIds,
        }));
        setLocalTasks(current=>[...current,...newTasks]);
      }
      setVisitEditor(null);
      if(!demo)router.refresh();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить выезд");}
    finally{setBusy(false);}
  }

  const groupedChecklist=useMemo(()=>{
    const groups=new Map<string,SiteVisitChecklistItem[]>();
    for(const item of visitEditor?.checklist??[])groups.set(item.section,[...(groups.get(item.section)??[]),item]);
    return [...groups.entries()];
  },[visitEditor]);

  return <section className="launch-detail-workspace">
    <header className="launch-detail-head">
      <div>
        <span className="launch-detail-eyebrow">План запуска</span>
        <h2>{localPlan.object}</h2>
        <p>{localPlan.client} · {localPlan.ownerName??"Ответственный не назначен"}</p>
        {!editable&&["completed","cancelled"].includes(localPlan.phase)&&<span className="launch-readonly-note">Архивный план · только просмотр</span>}
      </div>
      <div className="launch-head-facts">
        <div><span>Дата запуска</span><strong>{formatDate(localPlan.targetDate)}</strong><small>{targetLabel(localPlan.targetDate)}</small></div>
        <div><span>Готовность</span><strong>{readiness}%</strong><small>{launchBlocked?"есть препятствия":"критических препятствий нет"}</small></div>
        <div><span>Фаза</span><strong>{phaseLabels[localPlan.phase]??localPlan.phase}</strong><small>{localPlan.phase==="active"?"стабилизация "+localPlan.stabilizationDays+" дн.":"управляется планом"}</small></div>
        <div><span>Допуск</span><strong>{localPlan.contractGate==="blocked"?"Договор не готов":localPlan.contractGate==="exception"?"По исключению":"Разрешён"}</strong><small>{localPlan.contractStatus==="signed"?"договор подписан":localPlan.contractGate==="exception"?"согласовано исключение":"контроль договора"}</small></div>
      </div>
      {editable&&<div className="launch-head-actions">
        <button className="button" onClick={()=>setPlanEditor(true)}>Настроить план</button>
        {localPlan.phase==="preparation"&&!launchBlocked&&<button className="button" onClick={()=>void changePhase("ready")}>Готов к запуску</button>}
        {["preparation","ready"].includes(localPlan.phase)&&<button className="button primary" disabled={launchBlocked||busy} onClick={()=>void changePhase("active")}>Начать запуск</button>}
        {localPlan.phase==="active"&&<button className="button primary" onClick={()=>void changePhase("completed")}>Завершить запуск</button>}
      </div>}
    </header>

    {error&&<div className="launch-inline-error">{error}</div>}

    <nav className="entity-tabs launch-execution-tabs">
      {([
        ["summary","Сводка"],
        ["plan","План запуска"],
        ["staffing","Персонал"],
        ["issues","Проблемы"],
      ] as Array<[LaunchTab,string]>).map(([key,label])=><button type="button" key={key} className={tab===key?"active":""} onClick={()=>setTab(key)}>{label}</button>)}
    </nav>

    {tab==="summary"&&<div className="launch-summary-layout">
      <div className="launch-summary-main">
        <section className="launch-card launch-critical-card">
          <header><div><h3>Критично сейчас</h3><p>То, что влияет на ближайший вывод и дату запуска.</p></div><span>{blockingTasks.length+(staffingGap>0?1:0)+(siteVisitBlocker?1:0)+(contractBlocked?1:0)}</span></header>
          <div className="launch-action-list">
            {contractBlocked&&<div className="launch-action-static"><div><strong>Договор не даёт допуск к запуску</strong><small>Нужно подписать договор либо оформить согласованное исключение.</small></div></div>}
            {staffingGap>0&&<button type="button" onClick={()=>setTab("staffing")}><div><strong>Не хватает {staffingGap} чел. к {nextWave?formatDate(nextWave.targetDate):"ближайшей контрольной точке"}</strong><small>План комплектования отстаёт от контрольной точки</small></div><ChevronRight size={16}/></button>}
            {siteVisitBlocker&&primaryVisit&&<button type="button" onClick={()=>openVisit(primaryVisit)}><div><strong>Первичный выезд не завершён</strong><small>{primaryVisit.scheduledDate?"План "+formatDate(primaryVisit.scheduledDate):"Дата не назначена"} · осталось уточнить {visitStats.unresolvedRequired}</small></div><ChevronRight size={16}/></button>}
            {blockingTasks.slice(0,5).map(row=><button type="button" key={row.id} onClick={()=>editable&&setTaskEditor(taskDraft(row,localPlan.targetDate))}><div><strong>{row.title}</strong><small>{row.owner} · срок {row.endDate?formatDate(row.endDate):row.end} · {taskStatusLabels[row.status]??row.status}</small></div><ChevronRight size={16}/></button>)}
            {!launchBlocked&&<div className="launch-empty-positive">Критических препятствий к запуску не зафиксировано.</div>}
          </div>
        </section>

        <section className="launch-card">
          <header><div><h3>Готовность по направлениям</h3><p>Собирается из задач плана и результатов выезда.</p></div></header>
          <div className="launch-readiness-list">
            {categoryReadiness.map(row=><div key={row.category}><div><strong>{row.label}</strong><span>{row.value}%</span></div><div className="progress"><span style={{width:row.value+"%"}}/></div></div>)}
            {!categoryReadiness.length&&<div className="empty-inline">Направления ещё не настроены</div>}
          </div>
        </section>

        <section className="launch-card">
          <header><div><h3>Следующие контрольные точки</h3><p>Ближайшие задачи и milestones по текущему плану.</p></div></header>
          <div className="launch-milestone-list">
            {nextActions.map(row=><button type="button" key={row.id} onClick={()=>editable&&setTaskEditor(taskDraft(row,localPlan.targetDate))}><span>{row.endDate?formatShort(row.endDate):row.end}</span><div><strong>{row.title}</strong><small>{row.owner} · {taskStatusLabels[row.status]??row.status}</small></div></button>)}
            {!nextActions.length&&<div className="empty-inline">Незавершённых задач нет</div>}
          </div>
        </section>
      </div>

      <aside className="launch-summary-side">
        <section className="launch-card launch-staffing-card">
          <header><div><h3>Персонал на запуск</h3><p>Текущая операционная комплектация.</p></div><button type="button" className="launch-text-action" onClick={()=>setTab("staffing")}>Подробнее</button></header>
          <div className="launch-staffing-kpis">
            <div><span>План</span><strong>{analytics?.required??0}</strong></div>
            <div><span>Работает</span><strong>{analytics?.working??0}</strong></div>
            <div><span>Готовятся</span><strong>{analytics?.preparing??0}</strong></div>
            <div><span>Дефицит</span><strong>{analytics?.deficit??0}</strong></div>
          </div>
          {nextWave&&<div className="launch-next-wave"><span>Ближайшая волна</span><strong>{formatDate(nextWave.targetDate)} · +{nextWave.plannedCount}</strong><small>Накопительный план {nextWave.cumulative}, готовы {nextWave.ready}</small></div>}
        </section>

        <section className="launch-card launch-visit-card">
          <header><div><h3>Выезд на объект</h3><p>Чек-лист вопросов, которые нужно закрыть на площадке.</p></div></header>
          {primaryVisit?<button type="button" className="launch-visit-open" onClick={()=>openVisit(primaryVisit)}>
            <div className="launch-visit-icon"><ClipboardCheck size={20}/></div>
            <div><strong>{primaryVisit.status==="completed"?"Первичный выезд завершён":"Первичный выезд"}</strong><span>{primaryVisit.scheduledDate?formatDate(primaryVisit.scheduledDate):"Дата не назначена"} · {primaryVisit.owner??"без ответственного"}</span><small>{visitStats.done} из {visitStats.total} уточнено · проблем {visitStats.issues}</small></div>
            <ChevronRight size={17}/>
          </button>:editable?<button type="button" className="button launch-create-visit" onClick={()=>void createVisit()}><CalendarDays size={15}/> Запланировать первичный выезд</button>:<div className="empty-inline">Выезд не запланирован</div>}
        </section>
      </aside>
    </div>}

    {tab==="plan"&&<div className="launch-plan-view">
      <div className="launch-plan-toolbar">
        <div className="segmented"><button className={planView==="gantt"?"active":""} onClick={()=>setPlanView("gantt")}>Gantt</button><button className={planView==="table"?"active":""} onClick={()=>setPlanView("table")}>Таблица</button></div>
        <div className="launch-plan-toolbar-meta"><span>{unfinished.length} незавершённых</span><span>{blockingTasks.length} блокируют / требуют контроля</span></div>
        {editable&&<button className="button" onClick={()=>editable&&setTaskEditor(taskDraft(null,localPlan.targetDate,plan.ownerUserId??""))}><Plus size={14}/> Задача</button>}
      </div>
      {planView==="gantt"?<LaunchGantt rows={ganttRows} categoryLabels={categoryLabels} onSelectTask={editable?(row=>{
        if(row.taskKind==="staffing_wave"){
          const id=row.id.slice("wave:".length);const wave=localWaves.find(item=>item.id===id);if(wave)setWaveEditor(waveDraft(wave,localPlan.targetDate));return;
        }
        if(row.taskKind==="site_visit"){
          const id=row.id.slice("visit:".length);const visit=localVisits.find(item=>item.id===id);if(visit)openVisit(visit);return;
        }
        setTaskEditor(taskDraft(row,localPlan.targetDate));
      }):undefined}/>:<div className="request-table-wrap launch-plan-table-wrap"><table className="data-table launch-plan-table">
        <thead><tr><th>Направление / задача</th><th>Ответственный</th><th>Срок</th><th>Прогресс</th><th>Состояние</th></tr></thead>
        <tbody>{[...localTasks].sort((a,b)=>categoryOrder.indexOf(a.category??"other")-categoryOrder.indexOf(b.category??"other")||(a.startDate??"").localeCompare(b.startDate??"")).map(row=><tr key={row.id} onDoubleClick={()=>editable&&setTaskEditor(taskDraft(row,localPlan.targetDate))}>
          <td><span className="launch-task-category">{categoryLabels[row.category??"other"]??"Прочее"}</span><button type="button" className="launch-task-link" onClick={()=>editable&&setTaskEditor(taskDraft(row,localPlan.targetDate))}>{row.title}</button>{row.blocksLaunch&&<small>Блокирует запуск</small>}</td>
          <td>{row.owner}</td><td>{row.startDate?formatShort(row.startDate):row.start} – {row.endDate?formatShort(row.endDate):row.end}</td>
          <td><div className="launch-table-progress"><div className="progress"><span style={{width:Math.min(100,Number(row.progress))+"%"}}/></div><span>{row.progress}%</span></div></td>
          <td><span className={"launch-state-text "+(row.status==="blocked"?"is-problem":"")}>{taskStatusLabels[row.status]??row.status}</span></td>
        </tr>)}</tbody>
      </table></div>}
    </div>}

    {tab==="staffing"&&<div className="launch-staffing-view">
      <section className="launch-card">
        <header><div><h3>План вывода персонала</h3><p>Каждая волна задаёт контрольную дату и количество новых сотрудников, которых нужно подготовить к выводу.</p></div>{editable&&<button className="button" onClick={()=>setWaveEditor(waveDraft(null,localPlan.targetDate))}><Plus size={14}/> Добавить волну</button>}</header>
        <div className="request-table-wrap"><table className="data-table launch-wave-table">
          <thead><tr><th>Волна</th><th>Дата</th><th>+ План</th><th>План накопительно</th><th>Готовы</th><th>Прибыло</th><th>Вышло</th><th>Отклонение</th></tr></thead>
          <tbody>{waveRows.map(row=><tr key={row.id}>
            <td><button type="button" className="launch-task-link" onClick={()=>editable&&setWaveEditor(waveDraft(row,localPlan.targetDate))}>{row.name}</button>{row.specialty&&<small>{row.specialty}</small>}</td>
            <td>{formatDate(row.targetDate)}</td><td className="num">{row.plannedCount}</td><td className="num">{row.cumulative}</td><td className="num">{row.ready}</td><td className="num">{row.arrived}</td><td className="num">{row.started}</td>
            <td><span className={row.gap>0?"launch-wave-gap":row.surplus>0?"launch-wave-surplus":""}>{row.gap>0?"−"+row.gap:row.surplus>0?("+"+row.surplus+" готовы раньше"):"по плану"}</span></td>
          </tr>)}</tbody>
        </table>{!waveRows.length&&<div className="empty-inline">Волны вывода ещё не заданы</div>}</div>
      </section>

      <div className="launch-staffing-lower">
        <section className="launch-card">
          <header><div><h3>Готовность кандидатов</h3><p>Считаются кандидаты, дошедшие до подготовки / первого выхода.</p></div><Link href={"/recruiting?object="+plan.objectId} className="launch-text-action">Открыть подбор</Link></header>
          <div className="launch-candidate-stats">
            <div><span>Всего в работе</span><strong>{objectApplications.length}</strong></div>
            <div><span>Готовы к выводу</span><strong>{objectApplications.filter(row=>readyStages.has(row.stage)).length}</strong></div>
            <div><span>Есть план выхода</span><strong>{objectApplications.filter(row=>Boolean(row.plannedStartDate)).length}</strong></div>
            <div><span>Уже вышли</span><strong>{objectApplications.filter(row=>Boolean(row.actualStartAt)).length}</strong></div>
          </div>
        </section>
        <section className="launch-card">
          <header><div><h3>Операционный факт</h3><p>Данные объекта после фактических выходов.</p></div></header>
          <div className="launch-candidate-stats">
            <div><span>Требуется</span><strong>{analytics?.required??0}</strong></div>
            <div><span>Работает</span><strong>{analytics?.working??0}</strong></div>
            <div><span>Готовится</span><strong>{analytics?.preparing??0}</strong></div>
            <div><span>Не хватает</span><strong>{analytics?.deficit??0}</strong></div>
          </div>
        </section>
        <section className="launch-card launch-output-rules">
          <header><div><h3>Условия вывода с объекта</h3><p>Данные из первичного выезда, которые нужно учитывать при планировании волн.</p></div>{primaryVisit&&<button type="button" className="launch-text-action" onClick={()=>openVisit(primaryVisit)}>Открыть чек-лист</button>}</header>
          <div className="launch-rule-list">{outputRules.map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
        </section>
      </div>
    </div>}

    {tab==="issues"&&<div className="launch-issues-view">
      <section className="launch-card">
        <header><div><h3>Проблемы и блокеры</h3><p>Конкретные причины, которые могут сдвинуть запуск или следующую волну персонала.</p></div><span>{blockingTasks.length+visitIssues.length+(staffingGap>0?1:0)+(contractBlocked?1:0)}</span></header>
        <div className="launch-issue-list">
          {contractBlocked&&<div className="launch-issue-static"><span className="launch-issue-source">Договор</span><div><strong>Нет допуска к запуску</strong><small>Договор не подписан и исключение не согласовано.</small></div></div>}
          {staffingGap>0&&<button type="button" onClick={()=>setTab("staffing")}><span className="launch-issue-source">Персонал</span><div><strong>Дефицит {staffingGap} чел. к контрольной точке</strong><small>{nextWave?formatDate(nextWave.targetDate):"Текущий план комплектования"} · перейти к волнам вывода</small></div><ChevronRight size={16}/></button>}
          {visitIssues.map(item=><button type="button" key={item.id} onClick={()=>primaryVisit&&openVisit(primaryVisit)}><span className="launch-issue-source">Выезд</span><div><strong>{item.label}</strong><small>{item.status==="issue"?"Зафиксирована проблема":"Вопрос остался без ответа"}{item.blocksLaunch?" · блокирует запуск":""}</small></div><ChevronRight size={16}/></button>)}
          {blockingTasks.map(row=><button type="button" key={row.id} onClick={()=>editable&&setTaskEditor(taskDraft(row,localPlan.targetDate))}><span className="launch-issue-source">{categoryLabels[row.category??"other"]??"План"}</span><div><strong>{row.title}</strong><small>{row.owner} · срок {row.endDate?formatDate(row.endDate):row.end} · {taskStatusLabels[row.status]??row.status}</small></div><ChevronRight size={16}/></button>)}
          {!launchBlocked&&<div className="launch-empty-positive">Открытых блокеров нет.</div>}
        </div>
      </section>
    </div>}

    {planEditor&&<><div className="drawer-backdrop" onClick={()=>setPlanEditor(false)}/><aside className="drawer launch-editor-drawer"><button className="icon-button drawer-close" onClick={()=>setPlanEditor(false)}><X size={17}/></button><span className="eyebrow">План запуска</span><h2>Настройки плана</h2><div className="launch-editor-form">
      <label>Дата первого планового запуска<input type="date" value={planDate} onChange={e=>setPlanDate(e.target.value)}/></label>
      <label>Стабилизация после первого выхода, дней<input type="number" min="0" max="60" value={stabilizationDays} onChange={e=>setStabilizationDays(Number(e.target.value||0))}/></label>
      <label className="launch-check wide"><input type="checkbox" checked={shiftLinked} onChange={e=>setShiftLinked(e.target.checked)}/><span>При изменении даты сдвинуть незавершённые задачи, волны персонала и запланированные выезды на ту же величину. Baseline оставить исходным.</span></label>
      <div className="wide launch-editor-actions"><button className="button primary" disabled={busy} onClick={()=>void savePlan()}>Сохранить</button></div>
    </div></aside></>}

    {taskEditor&&<><div className="drawer-backdrop" onClick={()=>setTaskEditor(null)}/><aside className="drawer launch-editor-drawer"><button className="icon-button drawer-close" onClick={()=>setTaskEditor(null)}><X size={17}/></button><span className="eyebrow">План запуска</span><h2>{taskEditor.id?"Задача":"Новая задача"}</h2><div className="launch-editor-form">
      <label className="wide">Название<input value={taskEditor.title} onChange={e=>setTaskEditor({...taskEditor,title:e.target.value})}/></label>
      <label>Направление<select value={taskEditor.category} onChange={e=>setTaskEditor({...taskEditor,category:e.target.value})}>{categoryOrder.map(key=><option key={key} value={key}>{categoryLabels[key]}</option>)}</select></label>
      <label>Ответственный<select value={taskEditor.ownerUserId} onChange={e=>setTaskEditor({...taskEditor,ownerUserId:e.target.value})}><option value="">Менеджер объекта</option>{assignees.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Состояние<select value={taskEditor.status} onChange={e=>setTaskEditor({...taskEditor,status:e.target.value})}>{Object.entries(taskStatusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      <label>Начало<input type="date" value={taskEditor.startDate} onChange={e=>setTaskEditor({...taskEditor,startDate:e.target.value})}/></label>
      <label>Окончание<input type="date" value={taskEditor.endDate} onChange={e=>setTaskEditor({...taskEditor,endDate:e.target.value})}/></label>
      <label>Прогресс, %<input type="number" min="0" max="100" value={taskEditor.progress} onChange={e=>setTaskEditor({...taskEditor,progress:Number(e.target.value||0)})}/></label>
      <label>Риск<select value={taskEditor.risk} onChange={e=>setTaskEditor({...taskEditor,risk:e.target.value})}><option value="normal">Норма</option><option value="watch">Контроль</option><option value="high">Высокий</option><option value="critical">Критический</option></select></label>
      <div className="wide launch-dependency-editor"><span>Зависит от</span><div>{localTasks.filter(row=>row.id!==taskEditor.id&&row.status!=="cancelled").map(row=><label key={row.id}><input type="checkbox" checked={taskEditor.dependencyIds.includes(row.id)} onChange={e=>setTaskEditor({...taskEditor,dependencyIds:e.target.checked?[...taskEditor.dependencyIds,row.id]:taskEditor.dependencyIds.filter(id=>id!==row.id)})}/><span>{row.title}</span><small>{categoryLabels[row.category??"other"]??"Прочее"}</small></label>)}{!localTasks.some(row=>row.id!==taskEditor.id&&row.status!=="cancelled")&&<small>Других задач пока нет</small>}</div></div>
      <label className="launch-check wide"><input type="checkbox" checked={taskEditor.milestone} onChange={e=>setTaskEditor({...taskEditor,milestone:e.target.checked})}/><span>Контрольная точка / milestone</span></label>
      <label className="launch-check wide"><input type="checkbox" checked={taskEditor.blocksLaunch} onChange={e=>setTaskEditor({...taskEditor,blocksLaunch:e.target.checked})}/><span>Невыполнение блокирует запуск</span></label>
      <div className="wide launch-editor-actions"><button className="button primary" disabled={busy} onClick={()=>void saveTask()}>Сохранить задачу</button></div>
    </div></aside></>}

    {waveEditor&&<><div className="drawer-backdrop" onClick={()=>setWaveEditor(null)}/><aside className="drawer launch-editor-drawer"><button className="icon-button drawer-close" onClick={()=>setWaveEditor(null)}><X size={17}/></button><span className="eyebrow">Персонал</span><h2>{waveEditor.id?"Волна вывода":"Новая волна"}</h2><div className="launch-editor-form">
      <label className="wide">Название<input value={waveEditor.name} onChange={e=>setWaveEditor({...waveEditor,name:e.target.value})} placeholder="Например, Первая волна"/></label>
      <label>Дата вывода<input type="date" value={waveEditor.targetDate} onChange={e=>setWaveEditor({...waveEditor,targetDate:e.target.value})}/></label>
      <label>Количество новых сотрудников<input type="number" min="1" value={waveEditor.plannedCount} onChange={e=>setWaveEditor({...waveEditor,plannedCount:Number(e.target.value||1)})}/></label>
      <label className="wide">Специальность<select value={waveEditor.specialtyId} onChange={e=>setWaveEditor({...waveEditor,specialtyId:e.target.value})}><option value="">Все позиции / общий вывод</option>{forecast.map(item=><option key={item.specialtyId} value={item.specialtyId}>{item.specialty} · план {item.required}</option>)}</select></label>
      {waveEditor.id&&<label className="wide">Состояние волны<select value={waveEditor.status} onChange={e=>setWaveEditor({...waveEditor,status:e.target.value})}><option value="planned">Запланирована</option><option value="in_progress">В работе</option><option value="completed">Выполнена</option><option value="cancelled">Отменена</option></select></label>}
      <label className="wide">Комментарий<textarea value={waveEditor.note} onChange={e=>setWaveEditor({...waveEditor,note:e.target.value})} placeholder="Состав волны, ограничения заказчика, приоритетные позиции"/></label>
      <div className="wide launch-editor-actions"><button className="button primary" disabled={busy} onClick={()=>void saveWave()}>Сохранить волну</button></div>
    </div></aside></>}

    {visitEditor&&<><div className="drawer-backdrop" onClick={()=>setVisitEditor(null)}/><aside className="drawer launch-visit-drawer"><button className="icon-button drawer-close" onClick={()=>setVisitEditor(null)}><X size={17}/></button><span className="eyebrow">Выезд на объект</span><h2>Первичный чек-лист</h2><fieldset className="launch-visit-fieldset" disabled={!editable}><div className="launch-visit-meta"><label>Дата выезда<input type="date" value={visitEditor.scheduledDate} onChange={e=>setVisitEditor({...visitEditor,scheduledDate:e.target.value})}/></label><div><span>Уточнено</span><strong>{visitEditor.checklist.filter(item=>item.status==="confirmed").length} / {visitEditor.checklist.filter(item=>item.status!=="na").length}</strong></div><div><span>Проблемы</span><strong>{visitEditor.checklist.filter(item=>item.status==="issue").length}</strong></div></div>
      <div className="launch-visit-sections">{groupedChecklist.map(([section,items])=><section key={section}><header><h3>{section}</h3><span>{items.filter(item=>item.status==="confirmed").length} / {items.filter(item=>item.status!=="na").length}</span></header><div>{items.map(item=><article className={"launch-checklist-item status-"+item.status} key={item.id}>
        <div className="launch-checklist-question"><strong>{item.label}</strong>{item.required&&<small>Обязательный вопрос</small>}{item.blocksLaunch&&<small>Может блокировать запуск</small>}</div>
        <select value={item.status} onChange={e=>changeChecklistItem(item.id,{status:e.target.value as SiteVisitChecklistStatus})}>{Object.entries(visitStatusLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>
        <input value={item.value} onChange={e=>changeChecklistItem(item.id,{value:e.target.value})} placeholder="Ответ / фактические данные"/>
        <textarea value={item.note} onChange={e=>changeChecklistItem(item.id,{note:e.target.value})} placeholder="Комментарий, что нужно сделать дальше"/>
      </article>)}</div></section>)}</div>
      <label className="launch-visit-notes">Общие заметки<textarea value={visitEditor.notes} onChange={e=>setVisitEditor({...visitEditor,notes:e.target.value})}/></label></fieldset>
      {editable&&<div className="launch-visit-actions"><button className="button" disabled={busy} onClick={()=>void saveVisit(false)}>Сохранить</button><button className="button primary" disabled={busy} onClick={()=>void saveVisit(true)}>Завершить выезд</button></div>}
      <p className="launch-visit-hint">При завершении пункты с проблемами и обязательные неуточнённые вопросы автоматически превращаются в задачи плана запуска.</p>
    </aside></>}
  </section>;
}
