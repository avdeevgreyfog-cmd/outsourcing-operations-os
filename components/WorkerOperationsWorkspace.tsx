"use client";

import { createPortal } from "react-dom";
import { useState } from "react";
import { ArrowRight, CalendarPlus, Plus, X } from "lucide-react";
import { Status } from "@/components/UI";
import type { OperationsReferenceData, WorkerOperationsDetails } from "@/lib/operations/service";

const absenceLabels:Record<string,string>={intershift:"Межвахта",vacation:"Отпуск",sick:"Больничный",personal:"Личное отсутствие",other:"Другое"};
const absenceStatusLabels:Record<string,string>={tentative:"План",confirmed:"Подтверждено",cancelled:"Отменено",completed:"Завершено"};

export function WorkerAssignmentsWorkspace({workerId,details,options,canEdit,demo}:{workerId:string;details:WorkerOperationsDetails;options:OperationsReferenceData;canEdit:boolean;demo:boolean}){
  const [show,setShow]=useState(false);
  const [objectId,setObjectId]=useState(options.objects[0]?.id??"");
  const [specialtyId,setSpecialtyId]=useState(options.specialties[0]?.id??"");
  const [effectiveFrom,setEffectiveFrom]=useState(new Date().toISOString().slice(0,10));
  const [workMode,setWorkMode]=useState<"local"|"rotation">(details.assignments[0]?.workMode??"local");
  const [paidHoursPerShift,setPaidHoursPerShift]=useState(details.assignments[0]?.paidHoursPerShift==null?"":String(details.assignments[0].paidHoursPerShift));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function transfer(){
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме перевод не сохраняется");return;}
      const response=await fetch("/api/workers/"+workerId+"/transfer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({objectId,specialtyId,effectiveFrom,workMode,paidHoursPerShift:paidHoursPerShift?Number(paidHoursPerShift):null})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось выполнить перевод");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось выполнить перевод");}finally{setBusy(false);}
  }
  return <>
    <section className="section section-flush"><div className="section-head"><div><h2>История назначений</h2><p>Перевод на другой объект создаёт новое назначение, а не новую карточку сотрудника.</p></div>{canEdit&&<button className="button primary" onClick={()=>setShow(true)}><ArrowRight size={14}/> Перевести</button>}</div>
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Объект</th><th>Специальность</th><th>Формат</th><th>Менеджер</th><th>С</th><th>По</th><th>Статус</th></tr></thead><tbody>{details.assignments.map(row=><tr key={row.id}><td className="cell-title">{row.object}</td><td>{row.specialty??"—"}</td><td>{row.workMode==="rotation"?"Вахта":"Местный"}</td><td>{row.manager??"—"}</td><td>{row.effectiveFrom}</td><td>{row.effectiveTo??"—"}</td><td><Status tone={row.effectiveTo?"neutral":"good"}>{row.effectiveTo?"Завершено":"Текущее"}</Status></td></tr>)}</tbody></table>{!details.assignments.length&&<div className="empty-inline">Назначений нет</div>}</div>
    </section>
    {show&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShow(false)}}><div className="recruiting-modal-card"><div className="recruiting-modal-head"><div><h2>Перевод сотрудника</h2><p>Текущее назначение будет завершено перед датой нового назначения.</p></div><button className="icon-button" onClick={()=>setShow(false)}><X size={17}/></button></div><div className="candidate-import-body"><div className="candidate-import-options"><label>Новый объект<select value={objectId} onChange={e=>setObjectId(e.target.value)}>{options.objects.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Специальность<select value={specialtyId} onChange={e=>setSpecialtyId(e.target.value)}>{options.specialties.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Дата перевода<input type="date" value={effectiveFrom} onChange={e=>setEffectiveFrom(e.target.value)}/></label><label>Формат работы<select value={workMode} onChange={e=>setWorkMode(e.target.value as "local"|"rotation")}><option value="local">Местный</option><option value="rotation">Вахта</option></select></label><label>Оплачиваемых часов в смене<input type="number" min="0.5" max="24" step="0.5" value={paidHoursPerShift} onChange={e=>setPaidHoursPerShift(e.target.value)} placeholder="Например, 11"/></label></div>{error&&<div className="recruiting-error">{error}</div>}</div><div className="recruiting-modal-footer"><button className="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" disabled={busy||!objectId||!specialtyId} onClick={()=>void transfer()}>{busy?"Сохраняю…":"Перевести"}</button></div></div></div></Portal>}
  </>;
}

export function WorkerAbsencesWorkspace({workerId,details,canEdit,demo}:{workerId:string;details:WorkerOperationsDetails;canEdit:boolean;demo:boolean}){
  const [show,setShow]=useState(false);
  const [absenceType,setAbsenceType]=useState("intershift");
  const [status,setStatus]=useState("tentative");
  const [plannedFrom,setPlannedFrom]=useState(new Date().toISOString().slice(0,10));
  const [plannedTo,setPlannedTo]=useState("");
  const [flexibleReturn,setFlexibleReturn]=useState(true);
  const [note,setNote]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function save(){
    setBusy(true);setError("");
    try{
      if(demo){setError("В демо-режиме отсутствие не сохраняется");return;}
      const response=await fetch("/api/workers/"+workerId+"/absences",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({absenceType,status,plannedFrom,plannedTo:plannedTo||null,flexibleReturn,note:note||null})});
      const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось сохранить отсутствие");window.location.reload();
    }catch(e){setError(e instanceof Error?e.message:"Не удалось сохранить отсутствие");}finally{setBusy(false);}
  }
  return <section className="section section-flush"><div className="section-head"><div><h2>Межвахта и плановые отсутствия</h2><p>План можно переносить: подтверждённый период используется для планирования смен и будущей комплектации.</p></div>{canEdit&&<button className="button primary" onClick={()=>setShow(true)}><CalendarPlus size={14}/> Запланировать</button>}</div>
    <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Тип</th><th>План с</th><th>План по</th><th>Возврат</th><th>Статус</th><th>Комментарий</th></tr></thead><tbody>{details.absences.map(row=><tr key={row.id}><td className="cell-title">{absenceLabels[row.absenceType]??row.absenceType}</td><td>{row.plannedFrom}</td><td>{row.plannedTo??"Открытая дата"}</td><td>{row.flexibleReturn?"Гибкий":"Фиксированный"}</td><td><Status tone={row.status==="confirmed"?"info":row.status==="cancelled"?"neutral":"warn"}>{absenceStatusLabels[row.status]??row.status}</Status></td><td>{row.note??"—"}</td></tr>)}</tbody></table>{!details.absences.length&&<div className="empty-inline">Запланированных отсутствий нет</div>}</div>
    {show&&<Portal><div className="recruiting-modal" onMouseDown={e=>{if(e.currentTarget===e.target)setShow(false)}}><div className="recruiting-modal-card"><div className="recruiting-modal-head"><div><h2>Плановое отсутствие</h2><p>Для межвахты можно оставить дату возврата открытой или ориентировочной.</p></div><button className="icon-button" onClick={()=>setShow(false)}><X size={17}/></button></div><div className="candidate-import-body"><div className="candidate-import-options"><label>Тип<select value={absenceType} onChange={e=>setAbsenceType(e.target.value)}>{Object.entries(absenceLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Состояние<select value={status} onChange={e=>setStatus(e.target.value)}><option value="tentative">Предварительный план</option><option value="confirmed">Подтверждено</option></select></label><label>План с<input type="date" value={plannedFrom} onChange={e=>setPlannedFrom(e.target.value)}/></label><label>План по<input type="date" value={plannedTo} onChange={e=>setPlannedTo(e.target.value)}/></label><label className="operations-check"><input type="checkbox" checked={flexibleReturn} onChange={e=>setFlexibleReturn(e.target.checked)}/> Возврат можно переносить</label></div><label>Комментарий<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Например: сотрудник пока думает, возможно останется ещё на месяц"/></label>{error&&<div className="recruiting-error">{error}</div>}</div><div className="recruiting-modal-footer"><button className="button" onClick={()=>setShow(false)}>Отмена</button><button className="button primary" disabled={busy} onClick={()=>void save()}>{busy?"Сохраняю…":"Сохранить"}</button></div></div></div></Portal>}
  </section>;
}
function Portal({children}:{children:React.ReactNode}){return typeof document==="undefined"?null:createPortal(children,document.body)}
