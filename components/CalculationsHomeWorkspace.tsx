"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CommercialCalculationRow } from "@/lib/commercial/calculation-list";
import type { CalculationQueueRow } from "@/lib/commercial/calculation-queue.mjs";
import { SalesSearch, SalesSegments } from "@/components/sales/SalesUI";
import { CalculationsRegistryWorkspace } from "@/components/CalculationsRegistryWorkspace";

type View = "queue" | "calculations";
const day = new Intl.DateTimeFormat("ru-RU", { day:"2-digit",month:"2-digit",year:"numeric" });
function dateLabel(value:string|null) {
  if(!value)return "Не указана";
  const parsed=new Date(value);
  return Number.isNaN(parsed.getTime())?"Не указана":day.format(parsed);
}

export function CalculationsHomeWorkspace({queue,calculations,canCreate,canEdit}:{
  queue:CalculationQueueRow[];calculations:CommercialCalculationRow[];canCreate:boolean;canEdit:boolean;
}){
  const [view,setView]=useState<View>("queue");
  const [query,setQuery]=useState("");
  const [filter,setFilter]=useState<"all"|"request"|"tender">("all");
  const visible=useMemo(()=>queue.filter(item=>(filter==="all"||item.sourceType===filter)
    && [item.title,item.client,item.stage,item.stateLabel].some(value=>value.toLowerCase().includes(query.trim().toLowerCase()))),[queue,filter,query]);
  return <div className="request-final-registry request-baseline-registry calculation-home-workspace">
    <div className="sales-registry">
      <div className="sales-toolbar">
        <SalesSegments<View> label="Раздел экономики" value={view} onChange={setView} items={[
          {value:"queue",label:`К расчёту (${queue.length})`},
          {value:"calculations",label:"Расчёты"},
        ]}/>
      </div>
    </div>
    {view==="calculations" ? <CalculationsRegistryWorkspace rows={calculations} canEdit={canEdit}/> : <>
      <div className="sales-registry">
        <div className="sales-toolbar">
          <div className="sales-toolbar-actions">
            <select aria-label="Тип источника" value={filter} onChange={event=>setFilter(event.target.value as typeof filter)}>
              <option value="all">Все источники</option><option value="request">Заявки</option><option value="tender">Тендеры</option>
            </select>
            <SalesSearch value={query} onChange={setQuery} placeholder="Заявка, тендер, клиент или состояние"/>
          </div>
        </div>
        <div className="sales-results" aria-live="polite">Показано {visible.length} из {queue.length} · без дублирования заявок и тендеров</div>
        <div className="request-table-wrap"><table className="data-table">
          <thead><tr><th>Источник</th><th>Клиент</th><th>Этап</th><th>Позиции</th><th>Состояние экономики</th><th>Дата</th><th>Действие</th></tr></thead>
          <tbody>{visible.map(row=><tr key={row.id}>
            <td><Link className="cell-title" href={row.sourceHref}>{row.title}</Link><span className="cell-sub">{row.sourceType==="request"?"Заявка":"Тендер"}</span></td>
            <td>{row.client}</td><td>{row.stage}</td>
            <td className="num"><strong>{row.acceptedRoles}/{row.roleCount}</strong><span className="cell-sub">принято / всего</span></td>
            <td>{row.stateLabel}<span className="cell-sub">Доступных сценариев: {row.scenarioCount}</span></td>
            <td>{dateLabel(row.date)}<span className="cell-sub">{row.dateKind}</span></td>
            <td>{canCreate || row.calculationId
              ? <Link className="button" href={row.calculationHref}>{row.calculationId?"Открыть расчёт":"Рассчитать"}</Link>
              : <Link className="button" href={row.sourceHref}>Открыть источник</Link>}</td>
          </tr>)}
          {!visible.length&&<tr><td colSpan={7} className="muted">{queue.length?"По выбранным фильтрам записей нет.":"Заявок и тендеров, ожидающих доступного расчёта, нет."}</td></tr>}
          </tbody>
        </table></div>
      </div>
    </>}
  </div>;
}
