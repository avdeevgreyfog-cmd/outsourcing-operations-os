"use client";

import Link from "next/link";
import { useMemo,useState } from "react";
import { useRouter } from "next/navigation";
import type { WorkerRow } from "@/lib/data/service";
import type { StaffingForecastRow } from "@/lib/operations/service";
import type { RecruitingApplicationRow } from "@/lib/recruiting/service";
import { activeAbsence } from "@/lib/operations/workforce-status";
import { Status } from "@/components/UI";

type Lane="new"|"work"|"preparation"|"first_shift"|"problem";
const laneLabels:Record<Lane,string>={new:"Новые",work:"В работе",preparation:"Готовятся",first_shift:"Выход согласован",problem:"Требуют решения"};
const shiftLabels:Record<string,string>={day:"День",night:"Ночь",mixed:"День / ночь"};

export function ObjectStaffingWorkspace({objectId,forecast,applications,workers,today,canEditNeed,canFeedback,demo}:{objectId:string;forecast:StaffingForecastRow[];applications:RecruitingApplicationRow[];workers:WorkerRow[];today:string;canEditNeed:boolean;canFeedback:boolean;demo:boolean}){
  const router=useRouter();
  const [needRows,setNeedRows]=useState(forecast);
  const [rows,setRows]=useState(applications);
  const [busy,setBusy]=useState("");
  const [message,setMessage]=useState("");
  const [dates,setDates]=useState<Record<string,string>>(()=>Object.fromEntries(applications.map(row=>[row.applicationId,row.plannedStartDate??addDays(today,1)])));
  const [shifts,setShifts]=useState<Record<string,"day"|"night"|"mixed">>(()=>Object.fromEntries(applications.map(row=>[row.applicationId,row.plannedShiftKind??"day"])));

  const active=rows.filter(row=>!["rejected","retention_7","retention_30"].includes(row.stage));
  const lanes=useMemo(()=>({
    new:active.filter(row=>row.stage==="new"),
    work:active.filter(row=>["interview","documents","clearance","reserve"].includes(row.stage)),
    preparation:active.filter(row=>row.stage==="preparation"),
    first_shift:active.filter(row=>row.stage==="first_shift"&&row.workflow?.firstShiftOutcome!=="no_show"),
    problem:active.filter(row=>row.stage==="no_show"||row.workflow?.firstShiftOutcome==="no_show"||row.workflow?.managerInterviewState==="pending"),
  }),[active]);
  const actionCount=active.filter(requiresManagerAction).length;

  async function changeNeed(row:StaffingForecastRow,delta:number){
    if(!canEditNeed||!row.editableNeedId)return;const next=Math.max(1,row.required+delta);if(next===row.required)return;
    setBusy("need:"+row.specialtyId);setMessage("");
    try{
      if(!demo){
        const response=await fetch(`/api/needs/${row.editableNeedId}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({countRequired:next,quantityReason:"Корректировка потребности менеджером объекта"})});
        const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось изменить потребность");
      }
      setNeedRows(current=>current.map(item=>item.specialtyId===row.specialtyId?{...item,required:next,projectedDeficit:Math.max(next-item.projectedAvailable,0)}:item));
      setMessage(`Потребность «${row.specialty}» изменена: ${row.required} → ${next}`);if(!demo)router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось изменить потребность");}finally{setBusy("");}
  }

  async function candidateAction(row:RecruitingApplicationRow,action:"schedule"|"worked"|"no_show"|"no_contact"|"reschedule"){
    if(!canFeedback)return;const key=`candidate:${row.applicationId}`;setBusy(key);setMessage("");
    const plannedStartDate=dates[row.applicationId]||addDays(today,1);const plannedShiftKind=shifts[row.applicationId]??"day";
    const workflow={...(row.workflow??{}),actionCode:`object_${action}`,plannedShift:shiftLabels[plannedShiftKind]};
    let payload:Record<string,unknown>={applicationId:row.applicationId,sourceContext:"object_feedback",stage:row.stage,plannedStartDate,plannedShiftKind,workflow};
    if(action==="schedule"||action==="reschedule")payload={...payload,stage:"first_shift",reason:action==="reschedule"?"Повторный выход согласован менеджером объекта":undefined,workflow:{...workflow,firstShiftOutcome:"pending",additionalComment:action==="reschedule"?"Менеджер объекта согласовал новую дату выхода":"Менеджер объекта согласовал первый выход"}};
    if(action==="worked")payload={...payload,stage:"first_shift",actualStartAt:new Date().toISOString(),workflow:{...workflow,firstShiftOutcome:"worked",additionalComment:"Менеджер объекта подтвердил первый выход"}};
    if(action==="no_show"||action==="no_contact")payload={...payload,stage:"no_show",reasonCode:action==="no_contact"?"no_contact":"no_show",reason:action==="no_contact"?"Кандидат не выходит на связь":"Не вышел в согласованную дату",workflow:{...workflow,firstShiftOutcome:"no_show",additionalComment:action==="no_contact"?"Менеджер объекта: кандидат не выходит на связь":"Менеджер объекта подтвердил невыход"}};
    try{
      if(!demo){const response=await fetch(`/api/candidates/${row.candidateId}/stage`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить обратную связь");}
      setRows(current=>current.map(item=>item.applicationId!==row.applicationId?item:{...item,stage:payload.stage as RecruitingApplicationRow["stage"],stageLabel:payload.stage==="first_shift"?"Первый выход":payload.stage==="no_show"?"Невыход":item.stageLabel,plannedStartDate,plannedShiftKind,actualStartAt:action==="worked"?new Date().toISOString():item.actualStartAt,workflow:payload.workflow as RecruitingApplicationRow["workflow"]}));
      setMessage(action==="worked"?`${row.fullName}: первый выход подтверждён`:action==="no_show"||action==="no_contact"?`${row.fullName}: обратная связь передана в подбор`:`${row.fullName}: выход запланирован на ${formatDate(plannedStartDate)}`);if(!demo)router.refresh();
    }catch(e){setMessage(e instanceof Error?e.message:"Не удалось сохранить обратную связь");}finally{setBusy("");}
  }

  return <>
    <div className="metrics-grid object-staffing-metrics">
      <div className="metric"><span>План</span><strong>{needRows.reduce((sum,row)=>sum+row.required,0)}</strong></div>
      <div className="metric"><span>На объекте</span><strong>{needRows.reduce((sum,row)=>sum+row.working,0)}</strong></div>
      <div className="metric"><span>Кандидатов в работе</span><strong>{active.length}</strong></div>
      <div className="metric"><span>Нужно действие менеджера</span><strong>{actionCount}</strong></div>
    </div>

    <section className="section section-flush">
      <div className="section-head"><div><h2>Потребность по специальностям</h2><p>Здесь меняется реальная потребность объекта; изменение сразу уходит в подбор и историю.</p></div></div>
      <div className="request-table-wrap"><table className="data-table object-staffing-table"><thead><tr><th>Специальность</th><th>План</th><th>На объекте</th><th>Доступны сейчас</th><th>Готовятся</th><th>Дефицит</th><th></th></tr></thead><tbody>{needRows.map(row=>{const currentAbsences=workers.filter(worker=>worker.specialty===row.specialty&&activeAbsence(worker,today)).length;const available=Math.max(row.working-currentAbsences,0);return <tr key={row.specialtyId}><td><strong className="cell-title">{row.specialty}</strong>{row.needIds.length>1&&<span className="cell-sub">{row.needIds.length} активные потребности</span>}</td><td><div className="object-need-stepper"><button disabled={!canEditNeed||!row.editableNeedId||busy===`need:${row.specialtyId}`} onClick={()=>void changeNeed(row,-1)}>−</button><strong>{row.required}</strong><button disabled={!canEditNeed||!row.editableNeedId||busy===`need:${row.specialtyId}`} onClick={()=>void changeNeed(row,1)}>+</button></div></td><td className="num">{row.working}</td><td className="num">{available}</td><td className="num">{row.preparing||"—"}</td><td className="num"><Status tone={row.projectedDeficit?"warn":"good"}>{row.projectedDeficit}</Status></td><td>{row.editableNeedId?<Link className="table-link" href={`/needs?object=${objectId}`}>Открыть</Link>:<Link className="table-link" href={`/needs?object=${objectId}`}>Разобрать</Link>}</td></tr>})}</tbody></table></div>
      {!needRows.length&&<div className="empty-inline">Активных потребностей по объекту нет</div>}
    </section>

    <section className="section section-flush object-candidate-section">
      <div className="section-head"><div><h2>Кандидаты объекта</h2><p>{actionCount?`По ${actionCount} кандидатам требуется действие со стороны объекта.`:"Текущий подбор по объекту без дублирования полной карточки кандидата."}</p></div><Link className="button" href={`/recruiting?object=${objectId}`}>Полный подбор</Link></div>
      {message&&<div className="object-staffing-message">{message}</div>}
      <div className="object-candidate-board">{(["new","work","preparation","first_shift","problem"] as Lane[]).map(lane=><div className="object-candidate-lane" key={lane}><div className="object-candidate-lane-head"><span>{laneLabels[lane]}</span><b>{lanes[lane].length}</b></div><div className="object-candidate-cards">{lanes[lane].map(row=><CandidateCard key={row.applicationId} row={row} date={dates[row.applicationId]||addDays(today,1)} shift={shifts[row.applicationId]??"day"} canFeedback={canFeedback} busy={busy===`candidate:${row.applicationId}`} onDate={value=>setDates(current=>({...current,[row.applicationId]:value}))} onShift={value=>setShifts(current=>({...current,[row.applicationId]:value}))} onAction={action=>void candidateAction(row,action)}/>) }{!lanes[lane].length&&<div className="object-candidate-lane-empty">Нет кандидатов</div>}</div></div>)}</div>
    </section>
  </>;
}

function CandidateCard({row,date,shift,canFeedback,busy,onDate,onShift,onAction}:{row:RecruitingApplicationRow;date:string;shift:"day"|"night"|"mixed";canFeedback:boolean;busy:boolean;onDate:(value:string)=>void;onShift:(value:"day"|"night"|"mixed")=>void;onAction:(action:"schedule"|"worked"|"no_show"|"no_contact"|"reschedule")=>void}){
  const problem=row.stage==="no_show"||row.workflow?.firstShiftOutcome==="no_show";
  const needsContact=row.workflow?.managerInterviewState==="pending";
  const agreed=row.stage==="first_shift"&&!problem;
  return <article className={`object-candidate-card ${requiresManagerAction(row)?"needs-action":""}`}>
    <Link href={`/candidates/${row.candidateId}`}>{row.fullName||"Новый кандидат"}</Link>
    <span>{row.need}</span>
    {needsContact&&<strong className="object-candidate-action-label">Нужно связаться</strong>}
    {agreed&&<><strong>Выход {row.plannedStartDate?formatDate(row.plannedStartDate):"не назначен"}</strong><small>{shiftLabels[row.plannedShiftKind??shift]??"Смена не указана"}</small></>}
    {problem&&<strong className="object-candidate-action-label">Не вышел · нужна обратная связь</strong>}
    {canFeedback&&(["preparation","first_shift","no_show"].includes(row.stage))&&<div className="object-candidate-controls"><div><input type="date" value={date} onChange={e=>onDate(e.target.value)}/><select value={shift} onChange={e=>onShift(e.target.value as "day"|"night"|"mixed")}><option value="day">День</option><option value="night">Ночь</option><option value="mixed">День / ночь</option></select></div>{row.stage==="preparation"&&<button className="button primary" disabled={busy||!date} onClick={()=>onAction("schedule")}>Согласовать выход</button>}{agreed&&<div className="object-candidate-buttons"><button className="button primary" disabled={busy} onClick={()=>onAction("worked")}>Вышел</button><button className="button" disabled={busy} onClick={()=>onAction("no_show")}>Не вышел</button><button className="button" disabled={busy} onClick={()=>onAction("no_contact")}>Нет связи</button>{date!==row.plannedStartDate&&<button className="button" disabled={busy||!date} onClick={()=>onAction("reschedule")}>Перенести</button>}</div>}{problem&&<button className="button primary" disabled={busy||!date} onClick={()=>onAction("reschedule")}>Назначить новую дату</button>}</div>}
  </article>;
}
function requiresManagerAction(row:RecruitingApplicationRow){return row.workflow?.managerInterviewState==="pending"||row.stage==="preparation"||row.stage==="first_shift"||row.stage==="no_show"}
function addDays(value:string,days:number){const date=new Date(value+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function formatDate(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}