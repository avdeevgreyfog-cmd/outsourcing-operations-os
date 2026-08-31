"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, UsersRound, X } from "lucide-react";
import { KeyValue, Metric, Status } from "@/components/UI";
import { rub } from "@/lib/ui/format";
import type { ShiftRow } from "@/lib/data/service";

type Period = "day" | "week" | "month";
type Group = "object" | "specialty";

export function ResourceScheduler({ rows }: { rows: ShiftRow[] }) {
  const [period, setPeriod] = useState<Period>("week");
  const [group, setGroup] = useState<Group>("object");
  const [selected, setSelected] = useState<ShiftRow | null>(null);
  const visible = useMemo(() => {
    const sorted = [...rows].sort((a, b) => String(a[group]).localeCompare(String(b[group]), "ru") || a.date.localeCompare(b.date));
    return period === "day" ? sorted.slice(0, 1) : sorted;
  }, [rows, period, group]);
  const demand = visible.reduce((sum, row) => sum + row.demand, 0);
  const assigned = visible.reduce((sum, row) => sum + row.assigned, 0);
  const reserve = visible.reduce((sum, row) => sum + row.reserve, 0);
  const confirmed = visible.reduce((sum, row) => sum + Number(row.confirmed ?? 0), 0);
  const deficit = visible.reduce((sum, row) => sum + Math.max(0, row.deficit), 0);
  const cost = visible.reduce((sum, row) => sum + Number(row.cost), 0);

  return <>
    <div className="scheduler-controls">
      <div className="segmented" aria-label="Период">{(["day", "week", "month"] as Period[]).map((value) => <button type="button" key={value} className={period === value ? "active" : ""} onClick={() => setPeriod(value)}>{value === "day" ? "День" : value === "week" ? "Неделя" : "Месяц"}</button>)}</div>
      <div className="segmented" aria-label="Группировка">{(["object", "specialty"] as Group[]).map((value) => <button type="button" key={value} className={group === value ? "active" : ""} onClick={() => setGroup(value)}>{value === "object" ? "По объекту" : "По специальности"}</button>)}</div>
    </div>
    <div className="scheduler-summary">
      <Metric label="Потребность" value={demand} note="человек в сменах"/>
      <Metric label="Назначено" value={assigned} note={`${Math.round(assigned / Math.max(1, demand) * 100)}% покрытия`} tone={deficit ? "warn" : "good"}/>
      <Metric label="Резерв" value={reserve}/>
      <Metric label="Подтверждено" value={confirmed}/>
      <Metric label="Дефицит" value={deficit} tone={deficit ? "bad" : "good"}/>
      <Metric label="Cost plan" value={rub(cost)} note="по текущему виду"/>
    </div>
    <section className="section scheduler">
      <table className="data-table">
        <thead><tr><th>Дата / смена</th><th>{group === "object" ? "Объект" : "Специальность"}</th><th>{group === "object" ? "Специальность" : "Объект"}</th><th>Комплектование</th><th>Demand</th><th>Назначено</th><th>Резерв</th><th>Подтверждено</th><th>Дефицит</th><th>Cost plan</th><th>Статус</th></tr></thead>
        <tbody>{visible.map((row) => <tr key={row.id} onDoubleClick={() => setSelected(row)}><td><button type="button" className="cell-link" onClick={() => setSelected(row)}><strong>{row.date} · {row.kind}</strong><span>{row.time}</span></button></td><td>{row[group]}</td><td>{group === "object" ? row.specialty : row.object}</td><td style={{ minWidth: 175 }}><div className="scheduler-bar"><span className="assigned" style={{ width: `${Math.min(100, row.assigned / row.demand * 100)}%` }}/><span className="reserve" style={{ width: `${Math.min(100, row.reserve / row.demand * 100)}%` }}/><span className="deficit" style={{ width: `${Math.min(100, Math.max(0, row.deficit) / row.demand * 100)}%` }}/></div><span className="cell-sub">{row.assigned + row.reserve} из {row.demand}</span></td><td className="num">{row.demand}</td><td className="num">{row.assigned}</td><td className="num">{row.reserve}</td><td className="num">{row.confirmed ?? "—"}</td><td className="num">{row.deficit}</td><td className="num">{rub(row.cost)}</td><td><Status tone={row.deficit > 0 ? "warn" : "good"}>{row.status}</Status></td></tr>)}</tbody>
      </table>
    </section>
    {selected && <><div className="drawer-backdrop" onClick={() => setSelected(null)}/><aside className="drawer"><button className="icon-button drawer-close" onClick={() => setSelected(null)} aria-label="Закрыть"><X size={17}/></button><div className="eyebrow">Смена · {selected.date}</div><h2>{selected.object}</h2><Status tone={selected.deficit ? "warn" : "good"}>{selected.kind} · {selected.status}</Status><div className="drawer-content"><KeyValue label="Время" value={selected.time}/><KeyValue label="Специальность" value={selected.specialty}/><KeyValue label="Demand" value={selected.demand}/><KeyValue label="Назначено" value={selected.assigned}/><KeyValue label="Резерв" value={selected.reserve}/><KeyValue label="Подтверждено" value={selected.confirmed ?? "—"}/><KeyValue label="Открытые позиции" value={selected.deficit}/><KeyValue label="Плановая стоимость" value={rub(selected.cost)} sensitive/></div><div className="drawer-actions"><Link className="button primary" href={`/objects/${selected.objectId}?tab=people`}><UsersRound size={14}/> Назначения</Link><Link className="button" href={`/objects/${selected.objectId}?tab=recruiting`}><CalendarDays size={14}/> Передать в подбор</Link></div></aside></>}
  </>;
}
