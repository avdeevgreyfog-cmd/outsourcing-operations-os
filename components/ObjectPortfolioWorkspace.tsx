"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ObjectRow } from "@/lib/data/service";
import type { OperationsAnalyticsRow } from "@/lib/operations/service";
import { Status } from "@/components/UI";

const statusLabels:Record<string,string>={prelaunch:"Подготовка",launch:"Запуск",active:"Активен",paused:"Приостановлен",completed:"Завершён",archived:"Архив"};
const riskLabels:Record<string,string>={normal:"Норма",watch:"Контроль",high:"Высокий",critical:"Критический"};

export function ObjectPortfolioWorkspace({objects,analytics}:{objects:ObjectRow[];analytics:OperationsAnalyticsRow[]}){
  const analyticsByObject=useMemo(()=>new Map(analytics.map(row=>[row.objectId,row])),[analytics]);
  const [query,setQuery]=useState("");
  const [status,setStatus]=useState("");
  const [region,setRegion]=useState("");
  const [manager,setManager]=useState("");
  const [selectedId,setSelectedId]=useState(objects[0]?.id??"");

  const regions=useMemo(()=>[...new Set(objects.map(row=>row.region).filter(Boolean))].sort(),[objects]);
  const managers=useMemo(()=>[...new Set(objects.map(row=>row.ownerName).filter((value):value is string=>Boolean(value)))].sort(),[objects]);
  const filtered=useMemo(()=>objects.filter(row=>{
    const hay=`${row.name} ${row.code} ${row.client} ${row.region} ${row.ownerName??""}`.toLocaleLowerCase("ru");
    return (!query.trim()||hay.includes(query.trim().toLocaleLowerCase("ru")))
      &&(!status||row.status===status)
      &&(!region||row.region===region)
      &&(!manager||row.ownerName===manager);
  }),[objects,query,status,region,manager]);
  const selected=objects.find(row=>row.id===selectedId)??filtered[0]??objects[0];
  const selectedAnalytics=selected?analyticsByObject.get(selected.id):null;

  return <>
    <div className="object-portfolio-toolbar">
      <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск по объекту, клиенту, региону или коду"/>
      <select value={region} onChange={e=>setRegion(e.target.value)}><option value="">Все регионы</option>{regions.map(value=><option key={value} value={value}>{value}</option>)}</select>
      <select value={manager} onChange={e=>setManager(e.target.value)}><option value="">Все менеджеры</option>{managers.map(value=><option key={value} value={value}>{value}</option>)}</select>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Все статусы</option>{Object.entries(statusLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>
      {(query||region||manager||status)&&<button className="button" onClick={()=>{setQuery("");setRegion("");setManager("");setStatus("")}}>Сбросить</button>}
    </div>

    <section className="section section-flush">
      <div className="request-table-wrap"><table className="data-table object-portfolio-table">
        <thead><tr><th>Объект</th><th>Клиент</th><th>Регион</th><th>Менеджер</th><th>Статус</th><th>Работает / нужно</th><th>Укомплектованность</th><th>Дефицит</th><th>Старт</th><th>Риски</th></tr></thead>
        <tbody>{filtered.map(row=>{
          const fact=analyticsByObject.get(row.id);
          const working=fact?.working??row.filled;
          const required=fact?.required??row.required;
          const coverage=required?Math.round(working/required*100):100;
          return <tr key={row.id} className={selected?.id===row.id?"is-selected":""} onClick={()=>setSelectedId(row.id)}>
            <td><Link className="cell-title" href={"/objects/"+row.id}>{row.name}</Link><span className="cell-sub">{row.code}</span></td>
            <td>{row.client}</td><td>{row.region}</td><td>{row.ownerName??fact?.manager??"—"}</td>
            <td><Status tone={row.status==="active"?"good":row.status==="paused"?"warn":"info"}>{statusLabels[row.status]??"В работе"}</Status></td>
            <td className="num">{working} / {required}</td>
            <td><div className="object-coverage"><div className="progress"><span style={{width:Math.min(100,coverage)+"%"}}/></div><span>{coverage}%</span></div></td>
            <td className="num"><strong className={Math.max(required-working,0)>0?"priority-critical":""}>{Math.max(required-working,0)}</strong></td>
            <td>{row.targetStart??"—"}</td>
            <td><Status tone={row.risk==="critical"?"bad":row.risk==="high"||row.risk==="watch"?"warn":"good"}>{riskLabels[row.risk??"normal"]??"Контроль"}</Status></td>
          </tr>
        })}</tbody>
      </table>{!filtered.length&&<div className="empty-inline">По выбранным фильтрам объектов нет</div>}</div>
    </section>

    {selected&&<section className="section object-portfolio-focus">
      <div className="section-head"><div><h2>{selected.name}</h2><p>{selected.client} · {selected.region}</p></div><div className="page-actions"><Link className="button" href={"/objects/"+selected.id+"?tab=staffing"}>План комплектации</Link><Link className="button primary" href={"/objects/"+selected.id}>Открыть объект</Link></div></div>
      <div className="object-focus-grid">
        <div><span>Работает / нужно</span><strong>{selectedAnalytics?.working??selected.filled} / {selectedAnalytics?.required??selected.required}</strong></div>
        <div><span>Укомплектованность</span><strong>{selected.coverage}%</strong></div>
        <div><span>Смена сегодня</span><strong>{selectedAnalytics?.todayAssigned??0} / {selectedAnalytics?.todayDemand??0}</strong></div>
        <div><span>Невыходы сегодня</span><strong>{selectedAnalytics?.noShows??0}</strong></div>
        <div><span>Инциденты</span><strong>{selectedAnalytics?.openIncidents??0}</strong></div>
      </div>
    </section>}
  </>;
}
