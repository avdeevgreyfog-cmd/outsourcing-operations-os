"use client";
import { useState } from "react";
import { BriefcaseBusiness, Network, ShieldCheck, Users } from "lucide-react";
import type { PositionAssignmentRow, PositionRow, ProcessRoleRow, ResponsibilityRuleRow, StaffPositionRow } from "@/lib/organization/types";
import { Status } from "@/components/UI";

type Mode="profiles"|"staff"|"roles"|"responsibility";
const statusLabels={planned:"Запланирована",open:"Открыта",filled:"Занята",frozen:"Приостановлена",closed:"Закрыта"};
const responsibilityLabels={owner:"Владелец",executor:"Исполнитель",approver:"Согласующий",observer:"Наблюдатель",fallback:"Резерв"};

export function PositionCatalog({profiles,staffPositions,assignments,roles,responsibilities}:{profiles:PositionRow[];staffPositions:StaffPositionRow[];assignments:PositionAssignmentRow[];roles:ProcessRoleRow[];responsibilities:ResponsibilityRuleRow[]}){
  const [mode,setMode]=useState<Mode>("profiles");
  const [selected,setSelected]=useState<string|null>(profiles[0]?.id??null);
  function change(next:Mode){setMode(next);setSelected(next==="profiles"?profiles[0]?.id??null:next==="roles"?roles[0]?.id??null:next==="staff"?staffPositions[0]?.id??null:null)}
  return <div className="position-workspace">
    <div className="subview-switch" role="tablist" aria-label="Представление должностей">
      <ModeButton active={mode==="profiles"} onClick={()=>change("profiles")} label="Должностные профили" count={profiles.length}/>
      <ModeButton active={mode==="staff"} onClick={()=>change("staff")} label="Штатные позиции" count={staffPositions.length}/>
      <ModeButton active={mode==="roles"} onClick={()=>change("roles")} label="Процессные роли" count={roles.length}/>
      <ModeButton active={mode==="responsibility"} onClick={()=>change("responsibility")} label="Ответственность" count={responsibilities.length}/>
    </div>
    {mode==="profiles"&&<ProfileWorkspace profiles={profiles} selected={selected} onSelect={setSelected}/>}
    {mode==="staff"&&<StaffPositionWorkspace positions={staffPositions} assignments={assignments} selected={selected} onSelect={setSelected}/>}
    {mode==="roles"&&<RoleWorkspace roles={roles} selected={selected} onSelect={setSelected}/>}
    {mode==="responsibility"&&<ResponsibilityMatrix rows={responsibilities}/>}
  </div>;
}

function ModeButton({active,onClick,label,count}:{active:boolean;onClick:()=>void;label:string;count:number}){return <button type="button" role="tab" aria-selected={active} className={active?"active":""} onClick={onClick}>{label} <span>{count}</span></button>}

function ProfileWorkspace({profiles,selected,onSelect}:{profiles:PositionRow[];selected:string|null;onSelect:(id:string)=>void}){
  const item=profiles.find(profile=>profile.id===selected);
  return <div className="position-layout"><div className="position-list">{profiles.map(entry=><button type="button" key={entry.id} className={selected===entry.id?"active":""} onClick={()=>onSelect(entry.id)}><span className="position-icon"><BriefcaseBusiness size={16}/></span><span><strong>{entry.name}</strong><small>{entry.purpose??entry.description??"Цель не описана"}</small></span><span className="position-meta"><i><Users size={12}/>{entry.employeeCount}</i><i><ShieldCheck size={12}/>{entry.capabilityCount}</i></span></button>)}</div>{item&&<aside className="position-detail"><header><div><span>Должностной профиль</span><h2>{item.name}</h2></div><Status tone={item.active?"good":"warn"}>{item.active?"Действует":"Архив"}</Status></header><section><h3>Цель</h3><p>{item.purpose??"Не описана"}</p></section><DetailList title="Обязанности" values={item.duties}/><DetailList title="Ответственность" values={item.responsibilities}/><section><h3>Участие в процессах</h3><div className="tag-list">{item.processes.map(value=><span key={value}>{value}</span>)}</div></section><div className="access-source-summary"><ShieldCheck size={16}/><span>Базовые capabilities: <strong>{item.capabilityCount}</strong>. Профиль не является штатной единицей и может использоваться несколькими позициями.</span></div></aside>}</div>;
}

function StaffPositionWorkspace({positions,assignments,selected,onSelect}:{positions:StaffPositionRow[];assignments:PositionAssignmentRow[];selected:string|null;onSelect:(id:string)=>void}){
  const item=positions.find(position=>position.id===selected);const holders=item?assignments.filter(assignment=>assignment.staffPositionId===item.id&&assignment.status!=="ended"):[];
  return <div className="position-layout"><div className="position-list">{positions.map(entry=><button type="button" key={entry.id} className={selected===entry.id?"active":""} onClick={()=>onSelect(entry.id)}><span className="position-icon"><Network size={16}/></span><span><strong>{entry.name}</strong><small>{entry.orgUnit} · {entry.jobProfile}</small></span><span className="position-meta capacity"><i>{entry.occupied}/{entry.capacity}</i>{entry.open>0&&<i className="open-count">−{entry.open}</i>}</span></button>)}</div>{item&&<aside className="position-detail"><header><div><span>Штатная позиция · {item.code}</span><h2>{item.name}</h2></div><Status tone={item.status==="filled"?"good":item.status==="open"?"warn":"neutral"}>{statusLabels[item.status]}</Status></header><dl className="position-facts"><div><dt>Должностной профиль</dt><dd>{item.jobProfile}</dd></div><div><dt>Подразделение</dt><dd>{item.orgUnit}</dd></div><div><dt>Регион</dt><dd>{item.region??"Вся компания"}</dd></div><div><dt>Подчиняется позиции</dt><dd>{item.reportsToPosition??positions.find(value=>value.id===item.reportsToPositionId)?.name??"Верхний уровень"}</dd></div><div><dt>Штат / занято / открыто</dt><dd>{item.capacity} / {item.occupied} / {item.open}</dd></div><div><dt>Действует</dt><dd>{item.effectiveFrom}{item.effectiveTo?` — ${item.effectiveTo}`:" — бессрочно"}</dd></div></dl><section><h3>Назначения</h3>{holders.length?<div className="assignment-list">{holders.map(holder=><div key={holder.id}><strong>{holder.employeeName}</strong><span>{holder.assignmentType==="acting"?"И. о.":holder.assignmentType==="additional"?"Дополнительное":"Основное"} · {holder.fte} FTE</span></div>)}</div>:<p>Позиция свободна. Сотрудник может быть назначен без изменения профиля или структуры.</p>}</section></aside>}</div>;
}

function RoleWorkspace({roles,selected,onSelect}:{roles:ProcessRoleRow[];selected:string|null;onSelect:(id:string)=>void}){const item=roles.find(role=>role.id===selected);return <div className="position-layout"><div className="position-list">{roles.map(entry=><button type="button" key={entry.id} className={selected===entry.id?"active":""} onClick={()=>onSelect(entry.id)}><span className="position-icon"><ShieldCheck size={16}/></span><span><strong>{entry.name}</strong><small>{entry.description??"Функция в процессе"}</small></span><span className="position-meta"><i><Users size={12}/>{entry.employeeCount}</i><i><ShieldCheck size={12}/>{entry.capabilityCount}</i></span></button>)}</div>{item&&<aside className="position-detail"><header><div><span>Процессная роль</span><h2>{item.name}</h2></div><Status tone={item.active?"good":"warn"}>{item.active?"Действует":"Архив"}</Status></header><section><h3>Назначение</h3><p>{item.description??"Не описано"}</p></section><section><h3>Зона ответственности</h3><p>{item.responsibility??"Не описана"}</p></section><div className="access-source-summary"><ShieldCheck size={16}/><span>Роль добавляет <strong>{item.capabilityCount}</strong> capabilities к правам должностного профиля. Один сотрудник может иметь несколько ролей.</span></div></aside>}</div>}

function ResponsibilityMatrix({rows}:{rows:ResponsibilityRuleRow[]}){return <div className="grid-scroll responsibility-matrix"><table className="data-table"><thead><tr><th>Процесс</th><th>Этап</th><th>Тип ответственности</th><th>Разрешающий субъект</th><th>Область</th><th>Резерв</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><span className="cell-title">{row.process}</span></td><td>{row.step}</td><td><Status tone={row.responsibilityType==="approver"?"warn":row.responsibilityType==="owner"?"info":"neutral"}>{responsibilityLabels[row.responsibilityType]}</Status></td><td>{row.subjectName}<span className="cell-sub">{row.subjectType==="process_role"?"Процессная роль":row.subjectType==="staff_position"?"Штатная позиция":row.subjectType==="org_unit"?"Подразделение":"Сотрудник"}</span></td><td>{row.scopeLabel}</td><td>{row.fallbackName??"Не задан"}</td></tr>)}</tbody></table></div>}

function DetailList({title,values}:{title:string;values:string[]}){return <section><h3>{title}</h3>{values.length?<ul>{values.map(value=><li key={value}>{value}</li>)}</ul>:<p>Не описано</p>}</section>}
