"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Status } from "@/components/UI";
import { SalesSearch } from "@/components/sales/SalesUI";
import type { TimesheetPortfolioRow } from "@/lib/operations/personnel-portfolio";

const fixedStatuses=new Set(["fixed","approved","client_approved","closed"]);
const pendingStatuses=new Set(["client_sent"]);
const reviewStatuses=new Set(["internal_submitted","internal_checked","submitted"]);
const statusLabels:Record<string,string>={
  not_started:"Не начат",draft:"В работе",submitted:"На проверке",approved:"Зафиксирован",fixed:"Зафиксирован",
  returned:"Корректировка",internal_submitted:"На проверке",internal_checked:"Проверен внутри",
  client_sent:"На согласовании",client_approved:"Подтверждён клиентом",closed:"Закрыт",
};

function statusTone(status:string){
  if(fixedStatuses.has(status))return "good" as const;
  if(status==="returned")return "bad" as const;
  if(pendingStatuses.has(status)||reviewStatuses.has(status))return "warn" as const;
  return "neutral" as const;
}
function needsAttention(row:TimesheetPortfolioRow){
  return row.status==="returned"||row.issueCount>0||(row.discrepancy!=null&&Math.abs(row.discrepancy)>.001);
}
function number(value:number|null){return value==null?"—":new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
function monthLabel(value:string){return new Intl.DateTimeFormat("ru-RU",{month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(value+"-01T00:00:00Z"))}

export function TimesheetPortfolioWorkspace({rows,month}:{rows:TimesheetPortfolioRow[];month:string}){
  const router=useRouter();
  const [query,setQuery]=useState("");
  const [manager,setManager]=useState("all");
  const [status,setStatus]=useState("all");
  const [attentionOnly,setAttentionOnly]=useState(false);

  const managerOptions=useMemo(()=>[...new Map(rows.map(row=>[row.managerId??"unassigned",row.manager??"Менеджер не назначен"])).entries()].sort((a,b)=>a[1].localeCompare(b[1],"ru")),[rows]);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase("ru");
    return rows.filter(row=>{
      if(manager!=="all"&&(row.managerId??"unassigned")!==manager)return false;
      if(status==="attention"&&!needsAttention(row))return false;
      if(status==="fixed"&&!fixedStatuses.has(row.status))return false;
      if(status==="pending"&&!pendingStatuses.has(row.status))return false;
      if(status==="work"&&(fixedStatuses.has(row.status)||pendingStatuses.has(row.status)))return false;
      if(attentionOnly&&!needsAttention(row))return false;
      if(needle&&!([row.object,row.client,row.manager].filter(Boolean).join(" ").toLocaleLowerCase("ru").includes(needle)))return false;
      return true;
    });
  },[rows,query,manager,status,attentionOnly]);

  const groups=useMemo(()=>{
    const map=new Map<string,{id:string;name:string;rows:TimesheetPortfolioRow[]}>();
    for(const row of filtered){
      const id=row.managerId??"unassigned",name=row.manager??"Менеджер не назначен";
      const group=map.get(id)??{id,name,rows:[]};group.rows.push(row);map.set(id,group);
    }
    return [...map.values()].sort((a,b)=>a.name.localeCompare(b.name,"ru"));
  },[filtered]);

  const inWork=rows.filter(row=>!fixedStatuses.has(row.status)&&!pendingStatuses.has(row.status)).length;
  const pending=rows.filter(row=>pendingStatuses.has(row.status)).length;
  const attention=rows.filter(needsAttention).length;
  const fixed=rows.filter(row=>fixedStatuses.has(row.status)).length;
  const hasFilters=Boolean(query||manager!=="all"||status!=="all"||attentionOnly);

  function changeMonth(value:string){
    if(!/^\d{4}-\d{2}$/.test(value))return;
    router.push("/timesheets?month="+value);
  }

  return <div className="timesheet-portfolio">
    <div className="metrics-grid timesheet-portfolio-metrics">
      <div className="metric"><span>Объектов</span><strong>{rows.length}</strong><small>{fixed} закрыто / зафиксировано</small></div>
      <div className="metric"><span>В работе</span><strong>{inWork}</strong><small>ещё не переданы клиенту</small></div>
      <div className={"metric "+(pending?"tone-warn":"tone-good")}><span>На согласовании</span><strong>{pending}</strong><small>ожидают клиентский факт</small></div>
      <div className={"metric "+(attention?"tone-bad":"tone-good")}><span>Требуют внимания</span><strong>{attention}</strong><small>расхождения, возвраты и вопросы</small></div>
    </div>

    <div className="personnel-portfolio-toolbar">
      <div className="personnel-portfolio-filters">
        <label className="personnel-month-filter"><span>Период</span><input type="month" value={month} onChange={event=>changeMonth(event.target.value)}/></label>
        <SalesSearch value={query} onChange={setQuery} placeholder="Объект, клиент или менеджер"/>
        <select aria-label="Менеджер" value={manager} onChange={event=>setManager(event.target.value)}><option value="all">Все менеджеры</option>{managerOptions.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select>
        <select aria-label="Статус табеля" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">Все статусы</option><option value="work">В работе</option><option value="pending">На согласовании</option><option value="fixed">Зафиксировано</option><option value="attention">Требуют внимания</option></select>
        <button type="button" className={"button "+(attentionOnly?"active":"")} onClick={()=>setAttentionOnly(value=>!value)}>Только с отклонениями</button>
        {hasFilters&&<button type="button" className="button" onClick={()=>{setQuery("");setManager("all");setStatus("all");setAttentionOnly(false)}}>Сбросить</button>}
      </div>
      <div className="personnel-portfolio-period-label">{monthLabel(month)}</div>
    </div>

    <div className="personnel-portfolio-groups">
      {groups.map(group=>{
        const groupAttention=group.rows.filter(needsAttention).length;
        const groupFixed=group.rows.filter(row=>fixedStatuses.has(row.status)).length;
        return <section className="section personnel-manager-group" key={group.id}>
          <div className="personnel-manager-head"><div><strong>{group.name}</strong><span>{group.rows.length} объектов · зафиксировано {groupFixed}</span></div><div>{groupAttention?<Status tone="warn">Требуют внимания: {groupAttention}</Status>:<Status tone="good">Без отклонений</Status>}</div></div>
          <div className="request-table-wrap"><table className="data-table timesheet-portfolio-table">
            <thead><tr><th>Объект</th><th>Сотрудников</th><th>Внутренний факт</th><th>Клиент</th><th>Расхождение</th><th>Статус</th><th>Последнее изменение</th><th></th></tr></thead>
            <tbody>{group.rows.map(row=><tr key={row.objectId} className={needsAttention(row)?"row-attention":""}>
              <td><Link className="cell-title" href={"/objects/"+row.objectId+"?tab=timesheets&month="+month}>{row.object}</Link><span className="cell-sub">{row.client??"Клиент не указан"}</span></td>
              <td className="num">{row.workerCount}</td>
              <td className="num">{number(row.internalHours)} ч</td>
              <td className="num">{row.clientHours==null?<span className="cell-sub">не подтверждён</span>:number(row.clientHours)+" ч"}</td>
              <td>{row.discrepancy==null?<span className="cell-sub">—</span>:<Status tone={Math.abs(row.discrepancy)>.001?"warn":"good"}>{row.discrepancy>0?"+":""}{number(row.discrepancy)} ч</Status>}</td>
              <td><Status tone={statusTone(row.status)}>{statusLabels[row.status]??"В работе"}</Status>{row.issueCount>0&&<span className="cell-sub">вопросов: {row.issueCount}</span>}</td>
              <td>{row.lastChanged??"—"}</td>
              <td><Link className="button" href={"/timesheets?object="+row.objectId+"&month="+month}>Открыть табель</Link></td>
            </tr>)}</tbody>
          </table></div>
        </section>;
      })}
      {!groups.length&&<div className="empty-inline">Табели по выбранным фильтрам не найдены.</div>}
    </div>
  </div>;
}
