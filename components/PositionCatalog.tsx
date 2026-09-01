"use client";
import { useState } from "react";
import { BriefcaseBusiness, ShieldCheck, Users } from "lucide-react";
import type { PositionRow, ProcessRoleRow } from "@/lib/organization/types";
import { Status } from "@/components/UI";

export function PositionCatalog({positions,roles}:{positions:PositionRow[];roles:ProcessRoleRow[]}){
  const [mode,setMode]=useState<"positions"|"roles">("positions");
  const [selected,setSelected]=useState<string|null>(positions[0]?.id??null);
  const position=mode==="positions"?positions.find(item=>item.id===selected):undefined;
  const role=mode==="roles"?roles.find(item=>item.id===selected):undefined;
  const item=position??role;
  function change(next:"positions"|"roles"){setMode(next);setSelected((next==="positions"?positions:roles)[0]?.id??null)}
  return <div className="position-workspace">
    <div className="subview-switch">
      <button type="button" className={mode==="positions"?"active":""} onClick={()=>change("positions")}>Должности <span>{positions.length}</span></button>
      <button type="button" className={mode==="roles"?"active":""} onClick={()=>change("roles")}>Процессные роли <span>{roles.length}</span></button>
    </div>
    <div className="position-layout">
      <div className="position-list">{(mode==="positions"?positions:roles).map(entry=><button type="button" key={entry.id} className={selected===entry.id?"active":""} onClick={()=>setSelected(entry.id)}><span className="position-icon">{mode==="positions"?<BriefcaseBusiness size={16}/>:<ShieldCheck size={16}/>}</span><span><strong>{entry.name}</strong><small>{entry.description??("purpose" in entry?entry.purpose:"Функция в процессе")}</small></span><span className="position-meta"><i><Users size={12}/>{entry.employeeCount}</i><i><ShieldCheck size={12}/>{entry.capabilityCount}</i></span></button>)}</div>
      {item&&<aside className="position-detail">
        <header><div><span>{mode==="positions"?"Должность":"Процессная роль"}</span><h2>{item.name}</h2></div><Status tone={item.active?"good":"warn"}>{item.active?"active":"suspended"}</Status></header>
        {position&&<><section><h3>Цель</h3><p>{position.purpose??"Не описана"}</p></section><section><h3>Обязанности</h3><ul>{position.duties.map(value=><li key={value}>{value}</li>)}</ul></section><section><h3>Ответственность</h3><ul>{position.responsibilities.map(value=><li key={value}>{value}</li>)}</ul></section><section><h3>Участие в процессах</h3><div className="tag-list">{position.processes.map(value=><span key={value}>{value}</span>)}</div></section></>}
        {role&&<><section><h3>Назначение</h3><p>{role.description??"Не описано"}</p></section><section><h3>Зона ответственности</h3><p>{role.responsibility??"Не описана"}</p></section></>}
        <div className="access-source-summary"><ShieldCheck size={16}/><span>Базовые права: <strong>{item.capabilityCount}</strong>. Они дополняются правами других ролей и индивидуальными исключениями.</span></div>
      </aside>}
    </div>
  </div>;
}
