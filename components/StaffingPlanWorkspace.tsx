"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Status } from "@/components/UI";
import type { TaskRow, WorkerRow } from "@/lib/data/service";
import type { StaffingForecastRow } from "@/lib/operations/service";
import type { RecruitingApplicationRow } from "@/lib/recruiting/service";

type StaffingView="objects"|"funnel"|"forecast"|"specialties"|"needs";
type FunnelMode="staffing"|"working"|"replacements";
type FunnelLane="work"|"preparation"|"first_shift"|"started"|"problem";
type ShiftKind="day"|"night"|"mixed";

export type StaffingPlanObject={
  id:string;
  organizationId:string;
  name:string;
  client:string|null;
  region:string|null;
  regionId:string|null;
  status:string;
  ownerUserId:string|null;
  ownerName:string|null;
  assigneeUserIds:string[];
};

const viewLabels:Record<StaffingView,string>={
  objects:"По объектам",
  funnel:"Воронка",
  forecast:"Прогноз",
  specialties:"По профессиям",
  needs:"Потребности",
};
const laneLabels:Record<FunnelLane,string>={
  work:"В работе",
  preparation:"Готовятся",
  first_shift:"Выход согласован",
  started:"Первые выходы",
  problem:"Требуют решения",
};
const shiftLabels:Record<ShiftKind,string>={day:"День",night:"Ночь",mixed:"День / ночь"};
const objectStatusLabels:Record<string,string>={
  prelaunch:"Подготовка",launch:"Запуск",active:"Активен",paused:"Приостановлен",risk:"Риск",completed:"Завершён",archived:"Архив",
};

function todayIso(){return new Date().toISOString().slice(0,10)}
function addDays(value:string,days:number){const date=new Date(value+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function formatDate(value:string|null|undefined){
  if(!value)return "—";
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"));
}
function shortDate(value:string|null|undefined){
  if(!value)return "—";
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"));
}
function requiresManagerAction(row:RecruitingApplicationRow){
  return row.workflow?.managerInterviewState==="pending"||row.stage==="preparation"||row.stage==="first_shift"||row.stage==="no_show";
}
function classifyCandidate(row:RecruitingApplicationRow):FunnelLane|null{
  if(row.stage==="rejected"||row.stage==="retention_30")return null;
  if(row.stage==="no_show"||row.workflow?.firstShiftOutcome==="no_show"||row.workflow?.managerInterviewState==="pending")return "problem";
  if(Boolean(row.actualStartAt)||row.stage==="retention_7")return "started";
  if(row.stage==="first_shift")return "first_shift";
  if(row.stage==="preparation")return "preparation";
  if(["new","interview","documents","clearance","reserve"].includes(row.stage))return "work";
  return null;
}
function workerState(row:WorkerRow){
  const today=todayIso();
  if(row.status!=="active")return "Работа завершена";
  if(row.absenceStatus==="confirmed"&&row.absenceFrom&&row.absenceFrom<=today&&(!row.absenceTo||row.absenceTo>=today))return "Отсутствует";
  if(row.plannedExitDate&&row.plannedExitDate>=today)return "Планирует уход";
  return "Работает";
}
function statusTone(state:string){
  if(state==="Работает")return "good" as const;
  if(state==="Планирует уход")return "warn" as const;
  if(state==="Работа завершена")return "neutral" as const;
  return "info" as const;
}

export function StaffingPlanWorkspace({
  rows,applications,workers,objects,tasks,horizon,initialView="objects",editableObjectIds,planEditableObjectIds,demo,
}:{
  rows:StaffingForecastRow[];
  applications:RecruitingApplicationRow[];
  workers:WorkerRow[];
  objects:StaffingPlanObject[];
  tasks:TaskRow[];
  horizon:number;
  initialView?:StaffingView;
  editableObjectIds:string[];
  planEditableObjectIds:string[];
  demo:boolean;
}){
  const today=todayIso();
  const [view,setView]=useState<StaffingView>(initialView);
  const [funnelMode,setFunnelMode]=useState<FunnelMode>("staffing");
  const [localRows,setLocalRows]=useState(rows);
  const [localApplications,setLocalApplications]=useState(applications);
  const [expandedObject,setExpandedObject]=useState<string|null>(null);
  const [manager,setManager]=useState("all");
  const [objectFilter,setObjectFilter]=useState("all");
  const [specialty,setSpecialty]=useState("all");
  const [recruiter,setRecruiter]=useState("all");
  const [shift,setShift]=useState<"all"|ShiftKind>("all");
  const [dateWindow,setDateWindow]=useState("all");
  const [query,setQuery]=useState("");
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");
  const [planDrafts,setPlanDrafts]=useState<Record<string,string>>(()=>Object.fromEntries(rows.map(row=>[row.objectId+":"+row.specialtyId,String(row.required)])));
  const [dates,setDates]=useState<Record<string,string>>(()=>Object.fromEntries(applications.map(row=>[row.applicationId,row.plannedStartDate??addDays(today,1)])));
  const [shifts,setShifts]=useState<Record<string,ShiftKind>>(()=>Object.fromEntries(applications.map(row=>[row.applicationId,(row.plannedShiftKind??"day") as ShiftKind])));

  const liveObjects=useMemo(()=>objects.filter(row=>!["completed","archived"].includes(row.status)),[objects]);
  const managerOptions=useMemo(()=>[...new Map(liveObjects.filter(row=>row.ownerUserId).map(row=>[row.ownerUserId!,row.ownerName??"Менеджер"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[liveObjects]);
  const specialtyOptions=useMemo(()=>[...new Set(localRows.map(row=>row.specialty))].sort((a,b)=>a.localeCompare(b,"ru")),[localRows]);
  const recruiterOptions=useMemo(()=>[...new Map(localApplications.filter(row=>row.ownerUserId).map(row=>[row.ownerUserId!,row.owner??"Рекрутер"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[localApplications]);

  const scopeObjects=useMemo(()=>liveObjects.filter(row=>
    (manager==="all"||row.ownerUserId===manager)&&
    (objectFilter==="all"||row.id===objectFilter)
  ),[liveObjects,manager,objectFilter]);
  const scopeObjectIds=useMemo(()=>new Set(scopeObjects.map(row=>row.id)),[scopeObjects]);
  const scopedRows=useMemo(()=>localRows.filter(row=>scopeObjectIds.has(row.objectId)&&(specialty==="all"||row.specialty===specialty)),[localRows,scopeObjectIds,specialty]);
  const scopedApplications=useMemo(()=>{
    const maxDate=dateWindow==="all"?null:dateWindow==="today"?today:addDays(today,Number(dateWindow));
    const needle=query.trim().toLocaleLowerCase("ru");
    return localApplications.filter(row=>{
      if(!row.objectId||!scopeObjectIds.has(row.objectId))return false;
      if(specialty!=="all"&&row.need!==specialty)return false;
      if(recruiter!=="all"&&row.ownerUserId!==recruiter)return false;
      if(shift!=="all"&&(row.plannedShiftKind??"mixed")!==shift)return false;
      if(maxDate&&(!row.plannedStartDate||row.plannedStartDate<today||row.plannedStartDate>maxDate))return false;
      if(needle&&!([row.fullName,row.object,row.need,row.owner,row.phone].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(needle)))return false;
      return true;
    });
  },[localApplications,scopeObjectIds,specialty,recruiter,shift,dateWindow,query,today]);
  const scopedWorkers=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase("ru");
    return workers.filter(row=>{
      if(!row.objectId||!scopeObjectIds.has(row.objectId))return false;
      if(specialty!=="all"&&row.specialty!==specialty)return false;
      if(needle&&!([row.fullName,row.object,row.specialty,row.managerName,row.source].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(needle)))return false;
      return true;
    });
  },[workers,scopeObjectIds,specialty,query]);

  const openTasks=useMemo(()=>tasks.filter(row=>!["done","cancelled"].includes(row.status)),[tasks]);
  const taskFor=(entityType:string,entityId:string)=>openTasks.find(row=>row.entityType===entityType&&row.entityId===entityId)??null;
  const objectTaskCount=(objectId:string)=>{
    const applicationIds=new Set(localApplications.filter(row=>row.objectId===objectId).map(row=>row.applicationId));
    const workerIds=new Set(workers.filter(row=>row.objectId===objectId).map(row=>row.id));
    return openTasks.filter(row=>
      (row.entityType==="object"&&row.entityId===objectId)||
      (row.entityType==="candidate_application"&&row.entityId&&applicationIds.has(row.entityId))||
      (row.entityType==="worker"&&row.entityId&&workerIds.has(row.entityId))
    ).length;
  };

  const totals=useMemo(()=>({
    required:scopedRows.reduce((sum,row)=>sum+row.required,0),
    working:scopedRows.reduce((sum,row)=>sum+row.working,0),
    confirmed:scopedRows.reduce((sum,row)=>sum+row.confirmedStarts,0),
    deficit:scopedRows.reduce((sum,row)=>sum+row.projectedDeficit,0),
    action:scopedApplications.filter(requiresManagerAction).length,
  }),[scopedRows,scopedApplications]);

  const objectSummaries=useMemo(()=>scopeObjects.map(object=>{
    const objectRows=scopedRows.filter(row=>row.objectId===object.id);
    const objectApps=localApplications.filter(row=>row.objectId===object.id);
    const nextStart=objectApps.filter(row=>row.plannedStartDate&&row.plannedStartDate>=today&&!row.actualStartAt&&["preparation","first_shift"].includes(row.stage))
      .sort((a,b)=>(a.plannedStartDate??"").localeCompare(b.plannedStartDate??""))[0]??null;
    const required=objectRows.reduce((sum,row)=>sum+row.required,0);
    const working=objectRows.reduce((sum,row)=>sum+row.working,0);
    const confirmed=objectRows.reduce((sum,row)=>sum+row.confirmedStarts,0);
    const losses=objectRows.reduce((sum,row)=>sum+row.confirmedAbsences+row.plannedExits,0);
    const projected=objectRows.reduce((sum,row)=>sum+row.projectedAvailable,0);
    const deficit=objectRows.reduce((sum,row)=>sum+row.projectedDeficit,0);
    const candidateActions=objectApps.filter(requiresManagerAction).length;
    const tasksCount=objectTaskCount(object.id);
    return {object,objectRows,required,working,confirmed,losses,projected,deficit,nextStart,candidateActions,tasksCount};
  }),[scopeObjects,scopedRows,localApplications,today,openTasks,workers]);

  const managerGroups=useMemo(()=>{
    const map=new Map<string,{key:string;name:string;items:typeof objectSummaries}>();
    for(const item of objectSummaries){
      const key=item.object.ownerUserId??"unassigned";
      const name=item.object.ownerName??"Менеджер не назначен";
      const current=map.get(key)??{key,name,items:[]};
      current.items.push(item);map.set(key,current);
    }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  },[objectSummaries]);

  const lanes=useMemo(()=>{
    const out:Record<FunnelLane,RecruitingApplicationRow[]>={work:[],preparation:[],first_shift:[],started:[],problem:[]};
    for(const row of scopedApplications){
      const lane=classifyCandidate(row);
      if(lane)out[lane].push(row);
    }
    for(const lane of Object.keys(out) as FunnelLane[])out[lane].sort((a,b)=>(a.plannedStartDate??"9999").localeCompare(b.plannedStartDate??"9999"));
    return out;
  },[scopedApplications]);

  const specialtyRows=useMemo(()=>specialtyOptions.map(name=>{
    const source=scopedRows.filter(row=>row.specialty===name);
    return {
      specialty:name,
      objects:new Set(source.map(row=>row.objectId)).size,
      required:source.reduce((sum,row)=>sum+row.required,0),
      working:source.reduce((sum,row)=>sum+row.working,0),
      preparing:source.reduce((sum,row)=>sum+row.preparing,0),
      confirmed:source.reduce((sum,row)=>sum+row.confirmedStarts,0),
      projected:source.reduce((sum,row)=>sum+row.projectedAvailable,0),
      deficit:source.reduce((sum,row)=>sum+row.projectedDeficit,0),
    };
  }).filter(row=>row.objects>0).sort((a,b)=>b.deficit-a.deficit),[specialtyOptions,scopedRows]);

  async function savePlan(row:StaffingForecastRow){
    const key=row.objectId+":"+row.specialtyId;
    const next=Math.max(0,Number(planDrafts[key]??row.required)||0);
    if(next===row.required)return;
    setBusy("plan:"+key);setMessage("");
    try{
      if(!demo){
        const response=await fetch("/api/staffing-plan/targets",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
          objectId:row.objectId,specialtyId:row.specialtyId,plannedCount:next,shiftKind:"mixed",effectiveFrom:today,
          note:"Корректировка из общего плана комплектации",
        })});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось сохранить план");
      }
      setLocalRows(current=>current.map(item=>item.objectId===row.objectId&&item.specialtyId===row.specialtyId
        ?{...item,required:next,planSource:"target",projectedDeficit:Math.max(next-item.projectedAvailable,0)}
        :item));
      setMessage(`План «${row.object} · ${row.specialty}» изменён: ${row.required} → ${next}`);
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось сохранить план");}
    finally{setBusy("");}
  }

  async function candidateAction(row:RecruitingApplicationRow,action:"schedule"|"worked"|"no_show"|"no_contact"|"reschedule"){
    if(!row.objectId||!editableObjectIds.includes(row.objectId))return;
    const key="candidate:"+row.applicationId;setBusy(key);setMessage("");
    const plannedStartDate=dates[row.applicationId]||addDays(today,1);
    const plannedShiftKind=shifts[row.applicationId]??"day";
    const workflow={...(row.workflow??{}),actionCode:`staffing_plan_${action}`,plannedShift:shiftLabels[plannedShiftKind]};
    let payload:Record<string,unknown>={applicationId:row.applicationId,sourceContext:"object_feedback",stage:row.stage,plannedStartDate,plannedShiftKind,workflow};
    if(action==="schedule"||action==="reschedule")payload={...payload,stage:"first_shift",reason:action==="reschedule"?"Повторный выход согласован менеджером":undefined,workflow:{...workflow,firstShiftOutcome:"pending",additionalComment:action==="reschedule"?"Менеджер согласовал новую дату выхода":"Менеджер согласовал первый выход"}};
    if(action==="worked")payload={...payload,stage:"first_shift",actualStartAt:new Date().toISOString(),workflow:{...workflow,firstShiftOutcome:"worked",additionalComment:"Менеджер подтвердил первый выход"}};
    if(action==="no_show"||action==="no_contact")payload={...payload,stage:"no_show",reasonCode:action==="no_contact"?"no_contact":"no_show",reason:action==="no_contact"?"Кандидат не выходит на связь":"Не вышел в согласованную дату",workflow:{...workflow,firstShiftOutcome:"no_show",additionalComment:action==="no_contact"?"Менеджер: кандидат не выходит на связь":"Менеджер подтвердил невыход"}};
    try{
      if(!demo){
        const response=await fetch(`/api/candidates/${row.candidateId}/stage`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});
        const json=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(json.error??"Не удалось сохранить обратную связь");
      }
      setLocalApplications(current=>current.map(item=>item.applicationId!==row.applicationId?item:{
        ...item,stage:payload.stage as RecruitingApplicationRow["stage"],
        stageLabel:payload.stage==="first_shift"?"Первый выход":payload.stage==="no_show"?"Невыход":item.stageLabel,
        plannedStartDate,plannedShiftKind,actualStartAt:action==="worked"?new Date().toISOString():item.actualStartAt,
        workflow:payload.workflow as RecruitingApplicationRow["workflow"],
      }));
      setMessage(action==="worked"?`${row.fullName}: первый выход подтверждён`:action==="no_show"||action==="no_contact"?`${row.fullName}: обратная связь передана в подбор`:`${row.fullName}: выход запланирован на ${formatDate(plannedStartDate)}`);
    }catch(error){setMessage(error instanceof Error?error.message:"Не удалось сохранить обратную связь");}
    finally{setBusy("");}
  }

  function resetFilters(){
    setManager("all");setObjectFilter("all");setSpecialty("all");setRecruiter("all");setShift("all");setDateWindow("all");setQuery("");
  }
  const hasFilters=manager!=="all"||objectFilter!=="all"||specialty!=="all"||recruiter!=="all"||shift!=="all"||dateWindow!=="all"||Boolean(query.trim());

  return <div className="staffing-plan-workspace">
    <div className="staffing-plan-topbar">
      <div className="segmented staffing-plan-views">
        {(Object.keys(viewLabels) as StaffingView[]).map(key=><button key={key} className={view===key?"active":""} onClick={()=>setView(key)}>{viewLabels[key]}</button>)}
      </div>
      <div className="staffing-plan-horizon"><span>Горизонт</span><div className="segmented">{[14,30,60,90].map(value=><Link key={value} className={horizon===value?"active":""} href={`/staffing-plan?horizon=${value}&view=${view}`}>{value} дней</Link>)}</div></div>
    </div>

    <div className="staffing-plan-filters">
      <select aria-label="Менеджер" value={manager} onChange={event=>{setManager(event.target.value);setObjectFilter("all")}}>
        <option value="all">Все менеджеры</option>{managerOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}
      </select>
      <select aria-label="Объект" value={objectFilter} onChange={event=>setObjectFilter(event.target.value)}>
        <option value="all">Все объекты</option>{liveObjects.filter(row=>manager==="all"||row.ownerUserId===manager).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
      </select>
      <select aria-label="Профессия" value={specialty} onChange={event=>setSpecialty(event.target.value)}>
        <option value="all">Все профессии</option>{specialtyOptions.map(name=><option key={name} value={name}>{name}</option>)}
      </select>
      {view==="funnel"&&<>
        <select aria-label="Рекрутер" value={recruiter} onChange={event=>setRecruiter(event.target.value)}>
          <option value="all">Все рекрутеры</option>{recruiterOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Смена" value={shift} onChange={event=>setShift(event.target.value as "all"|ShiftKind)}>
          <option value="all">Все смены</option><option value="day">День</option><option value="night">Ночь</option><option value="mixed">День / ночь</option>
        </select>
        <select aria-label="Дата выхода" value={dateWindow} onChange={event=>setDateWindow(event.target.value)}>
          <option value="all">Любая дата выхода</option><option value="today">Сегодня</option><option value="7">7 дней</option><option value="14">14 дней</option><option value="30">30 дней</option>
        </select>
      </>}
      <div className="staffing-plan-search"><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Сотрудник, кандидат, объект…"/></div>
      {hasFilters&&<button className="button" onClick={resetFilters}>Сбросить</button>}
    </div>

    <div className="metrics-grid staffing-plan-metrics">
      <div className="metric"><span>Плановая численность</span><strong>{totals.required}</strong><small>{scopeObjects.length} объектов в текущем срезе</small></div>
      <div className="metric"><span>Работает сейчас</span><strong>{totals.working}</strong><small>{totals.required?Math.round(totals.working/totals.required*100):0}% от плана</small></div>
      <div className="metric"><span>Подтверждено к выходу</span><strong>{totals.confirmed}</strong><small>учитываются в надёжном прогнозе</small></div>
      <div className="metric tone-warn"><span>Прогнозный дефицит</span><strong>{totals.deficit}</strong><small>на горизонте {horizon} дней</small></div>
      <div className={"metric "+(totals.action?"tone-bad":"tone-good")}><span>Требуют действия</span><strong>{totals.action}</strong><small>кандидаты, по которым нужен менеджер</small></div>
    </div>

    {message&&<div className="staffing-plan-message">{message}</div>}

    {view==="objects"&&<div className="staffing-plan-object-groups">
      {managerGroups.map(group=>{
        const plan=group.items.reduce((sum,item)=>sum+item.required,0);
        const working=group.items.reduce((sum,item)=>sum+item.working,0);
        const deficit=group.items.reduce((sum,item)=>sum+item.deficit,0);
        const actions=group.items.reduce((sum,item)=>sum+item.candidateActions+item.tasksCount,0);
        return <section className="section staffing-manager-group" key={group.key}>
          <div className="staffing-manager-head"><div><strong>{group.name}</strong><span>{group.items.length} объектов · план {plan} · работает {working}</span></div><div><span>Дефицит <b>{deficit}</b></span><span>Действия <b>{actions}</b></span></div></div>
          <div className="request-table-wrap"><table className="data-table staffing-object-table">
            <thead><tr><th>Объект</th><th>План</th><th>Работает</th><th>Подтв. выход</th><th>Уходят / отсутствуют</th><th>Прогноз</th><th>Дефицит</th><th>Ближайший выход</th><th>Контроль</th></tr></thead>
            <tbody>{group.items.flatMap(item=>{
              const risk=item.deficit>0?"Дефицит":item.candidateActions||item.tasksCount?"Требует внимания":item.required===0?"План не задан":"Покрыто";
              const row=<tr key={item.object.id} className="staffing-object-row">
                <td><button className="staffing-object-toggle" onClick={()=>setExpandedObject(expandedObject===item.object.id?null:item.object.id)}><strong>{item.object.name}</strong><span>{item.object.client??item.object.region??"—"} · {objectStatusLabels[item.object.status]??item.object.status}</span></button></td>
                <td className="num">{item.required||"—"}</td><td className="num">{item.working}</td><td className="num">{item.confirmed||"—"}</td><td className="num">{item.losses||"—"}</td><td className="num">{item.projected}</td><td className="num"><Status tone={item.deficit?"warn":"good"}>{item.deficit}</Status></td>
                <td>{item.nextStart?<><strong>{shortDate(item.nextStart.plannedStartDate)}</strong><span className="cell-sub">{item.nextStart.fullName} · {item.nextStart.need}</span></>:<span className="cell-sub">Нет согласованных выходов</span>}</td>
                <td><Status tone={risk==="Покрыто"?"good":risk==="План не задан"?"neutral":risk==="Дефицит"?"warn":"bad"}>{risk}</Status>{item.tasksCount>0&&<span className="cell-sub">задач: {item.tasksCount}</span>}</td>
              </tr>;
              if(expandedObject!==item.object.id)return [row];
              const detail=<tr key={item.object.id+":detail"} className="staffing-object-detail-row"><td colSpan={9}>
                <div className="staffing-object-detail-head"><div><strong>{item.object.name}</strong><span>Плановая численность задаётся отдельно от потребности подбора.</span></div><div><Link className="button" href={`/objects/${item.object.id}?tab=staffing`}>Открыть объект</Link><Link className="button primary" href={`/needs?object=${item.object.id}`}>Потребности</Link></div></div>
                <div className="request-table-wrap"><table className="data-table staffing-specialty-detail"><thead><tr><th>Профессия</th><th>План</th><th>Работает</th><th>В подготовке</th><th>Подтв. выход</th><th>Выбытие</th><th>Замена</th><th>Прогноз</th><th>Дефицит</th></tr></thead><tbody>
                  {item.objectRows.map(planRow=>{
                    const key=planRow.objectId+":"+planRow.specialtyId;
                    const editable=planEditableObjectIds.includes(planRow.objectId);
                    const dirty=Number(planDrafts[key]??planRow.required)!==planRow.required;
                    return <tr key={key}><td><strong>{planRow.specialty}</strong><span className="cell-sub">{planRow.planSource==="target"?"План OPERIS":"Исходный baseline"} · потребностей {planRow.openNeedCount}</span></td><td><div className="staffing-plan-editor"><input type="number" min="0" disabled={!editable} value={planDrafts[key]??String(planRow.required)} onChange={event=>setPlanDrafts(current=>({...current,[key]:event.target.value}))}/>{dirty&&<button className="button" disabled={busy==="plan:"+key} onClick={()=>void savePlan(planRow)}>Сохранить</button>}</div></td><td className="num">{planRow.working}</td><td className="num">{planRow.preparing||"—"}</td><td className="num">{planRow.confirmedStarts||"—"}</td><td className="num">{planRow.confirmedAbsences+planRow.plannedExits||"—"}</td><td>{planRow.replacementReady?`Готово ${planRow.replacementReady}`:planRow.replacementNeeds?`Ищем ${planRow.replacementNeeds}`:"—"}</td><td className="num">{planRow.projectedAvailable}</td><td className="num"><Status tone={planRow.projectedDeficit?"warn":"good"}>{planRow.projectedDeficit}</Status></td></tr>;
                  })}
                  {!item.objectRows.length&&<tr><td colSpan={9}><div className="empty-inline">Для объекта ещё не задан план численности.</div></td></tr>}
                </tbody></table></div>
              </td></tr>;
              return [row,detail];
            })}</tbody>
          </table></div>
        </section>;
      })}
      {!managerGroups.length&&<div className="empty-inline">Объекты по выбранным фильтрам не найдены.</div>}
    </div>}

    {view==="funnel"&&<>
      <div className="staffing-funnel-modebar"><div className="segmented">{(["staffing","working","replacements"] as FunnelMode[]).map(mode=><button key={mode} className={funnelMode===mode?"active":""} onClick={()=>setFunnelMode(mode)}>{mode==="staffing"?"Комплектование":mode==="working"?"Работающие":"Замены"}</button>)}</div><span>{funnelMode==="staffing"?"Кандидаты по всем доступным объектам с оперативными действиями менеджера.":funnelMode==="working"?"Текущий состав сотрудников по объектам.":"Плановые выбытия и состояние замены."}</span></div>
      {funnelMode==="staffing"&&<div className="staffing-funnel-board">
        {(Object.keys(laneLabels) as FunnelLane[]).map(lane=><section className="staffing-funnel-lane" key={lane}>
          <header><span>{laneLabels[lane]}</span><b>{lanes[lane].length}</b></header>
          <div>{lanes[lane].map(candidate=><StaffingCandidateCard key={candidate.applicationId} row={candidate} date={dates[candidate.applicationId]||addDays(today,1)} shift={shifts[candidate.applicationId]??"day"} task={taskFor("candidate_application",candidate.applicationId)} editable={Boolean(candidate.objectId&&editableObjectIds.includes(candidate.objectId))} busy={busy==="candidate:"+candidate.applicationId} onDate={value=>setDates(current=>({...current,[candidate.applicationId]:value}))} onShift={value=>setShifts(current=>({...current,[candidate.applicationId]:value}))} onAction={action=>void candidateAction(candidate,action)}/>)}
          {!lanes[lane].length&&<div className="staffing-funnel-empty">Нет людей</div>}</div>
        </section>)}
      </div>}
      {funnelMode==="working"&&<section className="section"><div className="request-table-wrap"><table className="data-table staffing-working-table"><thead><tr><th>Сотрудник</th><th>Объект</th><th>Менеджер</th><th>Профессия</th><th>Сейчас</th><th>Изменение</th><th>Задача</th></tr></thead><tbody>
        {scopedWorkers.map(worker=>{const state=workerState(worker);const task=taskFor("worker",worker.id);return <tr key={worker.id}><td><Link className="cell-title" href={`/workers/${worker.id}`}>{worker.fullName}</Link></td><td>{worker.objectId?<Link href={`/objects/${worker.objectId}?tab=workforce`}>{worker.object}</Link>:"—"}</td><td>{worker.managerName??"—"}</td><td>{worker.specialty??"—"}</td><td><Status tone={statusTone(state)}>{state}</Status></td><td>{worker.plannedExitDate?`уход ${formatDate(worker.plannedExitDate)}`:worker.absenceFrom?`отсутствие с ${formatDate(worker.absenceFrom)}`:"—"}</td><td>{task?<><strong>{task.title}</strong><span className="cell-sub">{task.due??"без срока"}</span></>:<span className="cell-sub">Нет открытых задач</span>}</td></tr>})}
        {!scopedWorkers.length&&<tr><td colSpan={7}><div className="empty-inline">Сотрудники не найдены.</div></td></tr>}
      </tbody></table></div></section>}
      {funnelMode==="replacements"&&<section className="section"><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Объект / профессия</th><th>Работает</th><th>Плановое выбытие</th><th>Открыто замен</th><th>Замена готова</th><th>Прогноз</th><th>Дефицит</th><th>Действие</th></tr></thead><tbody>
        {scopedRows.filter(planRow=>planRow.plannedExits||planRow.replacementNeeds||planRow.replacementReady||planRow.projectedDeficit).map(planRow=><tr key={planRow.objectId+":"+planRow.specialtyId}><td><Link className="cell-title" href={`/objects/${planRow.objectId}?tab=staffing`}>{planRow.object}</Link><span className="cell-sub">{planRow.specialty}</span></td><td className="num">{planRow.working}</td><td className="num">{planRow.plannedExits||"—"}</td><td className="num">{planRow.replacementNeeds||"—"}</td><td className="num">{planRow.replacementReady||"—"}</td><td className="num">{planRow.projectedAvailable}</td><td className="num"><Status tone={planRow.projectedDeficit?"warn":"good"}>{planRow.projectedDeficit}</Status></td><td><Link className="button" href={`/needs?object=${planRow.objectId}`}>Потребности</Link></td></tr>)}
        {!scopedRows.some(planRow=>planRow.plannedExits||planRow.replacementNeeds||planRow.replacementReady||planRow.projectedDeficit)&&<tr><td colSpan={8}><div className="empty-inline">Активных замен и прогнозных дефицитов нет.</div></td></tr>}
      </tbody></table></div></section>}
    </>}

    {view==="forecast"&&<section className="section"><div className="section-head"><div><h2>Прогноз на {horizon} дней</h2><p>В надёжный прогноз входят только подтверждённые выходы. Остальные кандидаты показаны отдельно как подготовка.</p></div></div><div className="request-table-wrap"><table className="data-table staffing-forecast-table"><thead><tr><th>Менеджер / объект</th><th>Профессия</th><th>Сейчас</th><th>В подготовке</th><th>+ Подтв. выход</th><th>− Отсутствуют</th><th>− Уходят</th><th>Риск отсутствий</th><th>Прогноз</th><th>План</th><th>Дефицит</th></tr></thead><tbody>
      {[...scopedRows].sort((a,b)=>b.projectedDeficit-a.projectedDeficit).map(planRow=>{const object=objects.find(item=>item.id===planRow.objectId);return <tr key={planRow.objectId+":"+planRow.specialtyId}><td><strong>{object?.ownerName??"—"}</strong><Link className="cell-sub" href={`/objects/${planRow.objectId}?tab=staffing`}>{planRow.object}</Link></td><td>{planRow.specialty}</td><td className="num">{planRow.working}</td><td className="num">{planRow.preparing||"—"}</td><td className="num">{planRow.confirmedStarts?`+${planRow.confirmedStarts}`:"—"}</td><td className="num">{planRow.confirmedAbsences?`−${planRow.confirmedAbsences}`:"—"}</td><td className="num">{planRow.plannedExits?`−${planRow.plannedExits}`:"—"}</td><td className="num">{planRow.tentativeAbsences||"—"}</td><td className="num">{planRow.projectedAvailable}</td><td className="num">{planRow.required}</td><td className="num"><Status tone={planRow.projectedDeficit?"warn":"good"}>{planRow.projectedDeficit}</Status></td></tr>})}
    </tbody></table></div></section>}

    {view==="specialties"&&<section className="section"><div className="section-head"><div><h2>Профессии по доступному портфелю</h2><p>Показывает повторяющийся дефицит сразу на нескольких объектах.</p></div></div><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Профессия</th><th>Объектов</th><th>План</th><th>Работает</th><th>В подготовке</th><th>Подтв. выход</th><th>Прогноз</th><th>Дефицит</th></tr></thead><tbody>
      {specialtyRows.map(item=><tr key={item.specialty}><td className="cell-title">{item.specialty}</td><td className="num">{item.objects}</td><td className="num">{item.required}</td><td className="num">{item.working}</td><td className="num">{item.preparing}</td><td className="num">{item.confirmed}</td><td className="num">{item.projected}</td><td className="num"><Status tone={item.deficit?"warn":"good"}>{item.deficit}</Status></td></tr>)}
    </tbody></table></div></section>}

    {view==="needs"&&<section className="section"><div className="section-head"><div><h2>Исполнительный контур подбора</h2><p>План численности определяет целевое состояние, а потребность остаётся отдельным заданием на закрытие дефицита.</p></div><Link className="button primary" href="/needs">Открыть все потребности</Link></div><div className="staffing-plan-flow">План → обеспеченность → дефицит → потребность → подбор → подготовка → фактический выход</div><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Менеджер / объект</th><th>Профессия</th><th>План</th><th>Прогноз</th><th>Дефицит</th><th>Активные потребности</th><th>Действие</th></tr></thead><tbody>
      {scopedRows.filter(planRow=>planRow.projectedDeficit>0||planRow.openNeedCount>0).sort((a,b)=>b.projectedDeficit-a.projectedDeficit).map(planRow=>{const object=objects.find(item=>item.id===planRow.objectId);return <tr key={planRow.objectId+":"+planRow.specialtyId}><td><strong>{object?.ownerName??"—"}</strong><span className="cell-sub">{planRow.object}</span></td><td>{planRow.specialty}</td><td className="num">{planRow.required}</td><td className="num">{planRow.projectedAvailable}</td><td className="num"><Status tone={planRow.projectedDeficit?"warn":"good"}>{planRow.projectedDeficit}</Status></td><td>{planRow.openNeedCount?<><strong>{planRow.openNeedCount}</strong><span className="cell-sub">исторический объём: {planRow.openNeedVolume}</span></>:<Status tone="bad">Не создана</Status>}</td><td><Link className="button" href={`/needs?object=${planRow.objectId}`}>{planRow.openNeedCount?"Проверить":"Создать потребность"}</Link></td></tr>})}
    </tbody></table></div></section>}
  </div>;
}

function StaffingCandidateCard({row,date,shift,task,editable,busy,onDate,onShift,onAction}:{
  row:RecruitingApplicationRow;date:string;shift:ShiftKind;task:TaskRow|null;editable:boolean;busy:boolean;
  onDate:(value:string)=>void;onShift:(value:ShiftKind)=>void;onAction:(action:"schedule"|"worked"|"no_show"|"no_contact"|"reschedule")=>void;
}){
  const problem=row.stage==="no_show"||row.workflow?.firstShiftOutcome==="no_show";
  const agreed=row.stage==="first_shift"&&!problem&&!row.actualStartAt;
  const preparation=row.stage==="preparation";
  return <article className={"staffing-funnel-card "+(requiresManagerAction(row)?"needs-action":"")}>
    <div className="staffing-funnel-card-head"><Link href={`/candidates/${row.candidateId}`}>{row.fullName}</Link>{row.objectId&&<Link href={`/objects/${row.objectId}?tab=staffing`}>{row.object??"Объект"}</Link>}</div>
    <strong>{row.need}</strong>
    <div className="staffing-funnel-card-meta"><span>{row.owner?`Подбор: ${row.owner}`:"Рекрутер не назначен"}</span>{row.plannedShiftKind&&<span>{shiftLabels[row.plannedShiftKind]}</span>}</div>
    {row.plannedStartDate&&<div className="staffing-funnel-card-date">Выход {formatDate(row.plannedStartDate)}</div>}
    {task&&<div className="staffing-funnel-task"><b>Задача</b><span>{task.title}</span><small>{task.due??"без срока"}</small></div>}
    {row.workflow?.managerInterviewState==="pending"&&<div className="staffing-funnel-alert">Нужно связаться с кандидатом</div>}
    {problem&&<div className="staffing-funnel-alert">Невыход / нет связи — нужна обратная связь</div>}
    {editable&&(preparation||agreed||problem)&&<div className="staffing-funnel-controls">
      <div><input type="date" value={date} onChange={event=>onDate(event.target.value)}/><select value={shift} onChange={event=>onShift(event.target.value as ShiftKind)}><option value="day">День</option><option value="night">Ночь</option><option value="mixed">День / ночь</option></select></div>
      {preparation&&<button className="button primary" disabled={busy||!date} onClick={()=>onAction("schedule")}>Согласовать выход</button>}
      {agreed&&<div className="staffing-funnel-actions"><button className="button primary" disabled={busy} onClick={()=>onAction("worked")}>Вышел</button><button className="button" disabled={busy} onClick={()=>onAction("no_show")}>Не вышел</button><button className="button" disabled={busy} onClick={()=>onAction("no_contact")}>Нет связи</button>{date!==row.plannedStartDate&&<button className="button" disabled={busy||!date} onClick={()=>onAction("reschedule")}>Перенести</button>}</div>}
      {problem&&<button className="button primary" disabled={busy||!date} onClick={()=>onAction("reschedule")}>Назначить новую дату</button>}
    </div>}
  </article>;
}
