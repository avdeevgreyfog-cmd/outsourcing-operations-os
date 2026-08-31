"use client";

import { useMemo, useState } from "react";
import { Download, ShieldCheck } from "lucide-react";
import { Metric, Status } from "@/components/UI";
import { rub } from "@/lib/ui/format";
import type { TimesheetData } from "@/lib/data/service";

type Mode = "first" | "second" | "month";
type View = "client" | "internal";

export function TimesheetWorkspace({ data, sensitive }: { data: TimesheetData; sensitive: boolean }) {
  const [mode, setMode] = useState<Mode>("second");
  const [view, setView] = useState<View>("client");
  const days = useMemo(() => mode === "first" ? range(1, 15) : mode === "second" ? range(16, 31) : range(1, 31), [mode]);
  const rows = data.rows.map((row) => ({ ...row, visibleTotal: days.reduce((sum, day) => sum + Number(row.days?.[String(day)] ?? 0), 0) }));
  const totals = days.map((day) => rows.reduce((sum, row) => sum + Number(row.days?.[String(day)] ?? 0), 0));
  const totalHours = rows.reduce((sum, row) => sum + row.visibleTotal, 0);
  const totalNight = rows.reduce((sum, row) => sum + Number(row.night ?? 0), 0);
  const totalOvertime = rows.reduce((sum, row) => sum + Number(row.overtime ?? 0), 0);

  function exportCsv() {
    const header = ["Сотрудник", ...days.map((day) => `${day}.08`), "Часы", ...(view === "internal" && sensitive ? ["Ставка", "Начислено"] : [])];
    const body = rows.map((row) => [row.name, ...days.map((day) => row.days?.[String(day)] == null ? "" : row.days?.[String(day)]), row.visibleTotal, ...(view === "internal" && sensitive ? [row.rate ?? "", row.accrual ?? ""] : [])]);
    const csv = [header, ...body].map((line) => line.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(";")).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    link.download = `timesheet-${mode}-${view}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return <>
    <div className="scheduler-controls">
      <div className="segmented">{(["first", "second", "month"] as Mode[]).map((value) => <button type="button" key={value} className={mode === value ? "active" : ""} onClick={() => setMode(value)}>{value === "first" ? "1–15" : value === "second" ? "16–конец" : "Весь месяц"}</button>)}</div>
      <div className="page-actions">
        <div className="segmented"><button type="button" className={view === "client" ? "active" : ""} onClick={() => setView("client")}>Клиентский</button>{sensitive && <button type="button" className={view === "internal" ? "active" : ""} onClick={() => setView("internal")}>Внутренний</button>}</div>
        <button className="button" type="button" onClick={exportCsv} title="Скачать в формате CSV"><Download size={14}/> Скачать таблицу</button>
      </div>
    </div>
    <div className="timesheet-summary">
      <Metric label="Сотрудники" value={rows.length} note="в текущем представлении"/>
      <Metric label="Факт" value={`${totalHours} ч`} note={mode === "month" ? "за месяц" : "за период"}/>
      <Metric label="Ночные" value={`${totalNight} ч`}/>
      <Metric label="Переработка" value={`${totalOvertime} ч`} tone={totalOvertime > 0 ? "warn" : undefined}/>
    </div>
    <div className="timesheet-mode-note">
      <Status tone={view === "client" ? "info" : "warn"}>{view === "client" ? "Клиентский вид" : "Внутренний расчёт"}</Status>
      <span>{view === "client" ? "Показаны фактические часы и коды присутствия. Ставки и начисления скрыты." : "Показаны внутренние ставки и начисления для финансовой сверки."}</span>
    </div>
    <section className="section">
      <div className="section-head"><div><h2>{data.object} · {view === "client" ? "клиентский табель" : "внутренний табель"}</h2><p>{mode === "first" ? "1–15 августа 2026" : mode === "second" ? "16–31 августа 2026" : "Август 2026"}</p></div>{view === "client" && <Status tone="info"><ShieldCheck size={12}/> без внутренних ставок</Status>}</div>
      <div className="timesheet-wrap">
        <table className="data-table timesheet">
          <thead><tr><th className="sticky-col">Сотрудник</th>{days.map((day) => <th className={`day ${isWeekend(day) ? "weekend" : ""}`} key={day}><span>{weekday(day)}</span>{day}</th>)}<th className="timesheet-total">Часы</th><th>Ночь</th><th>Переработка</th>{view === "internal" && sensitive && <><th className="timesheet-financial">Ставка</th><th className="timesheet-financial">Начислено</th></>}</tr></thead>
          <tbody>{rows.map((row) => <tr key={row.workerId}><td className="cell-title sticky-col">{row.name}</td>{days.map((day) => { const value = row.days?.[String(day)]; return <td key={day} className={`day ${isWeekend(day) ? "weekend" : ""} ${value === null ? "day-off" : value === 0 ? "day-zero" : ""}`}>{value === null ? "В" : value === undefined ? "—" : value}</td> })}<td className="num timesheet-total">{row.visibleTotal}</td><td className="num">{row.night ?? 0}</td><td className="num">{row.overtime ?? 0}</td>{view === "internal" && sensitive && <><td className="num timesheet-financial">{row.rate ? rub(row.rate) : "—"}</td><td className="num timesheet-financial">{row.accrual ? rub(row.accrual) : "—"}</td></>}</tr>)}</tbody>
          <tfoot><tr><td className="sticky-col">Итого часов</td>{totals.map((value, index) => <td className={`day num ${isWeekend(days[index]) ? "weekend" : ""}`} key={days[index]}>{value || "—"}</td>)}<td className="num timesheet-total">{totalHours}</td><td className="num">{totalNight}</td><td className="num">{totalOvertime}</td>{view === "internal" && sensitive && <><td className="timesheet-financial">—</td><td className="num timesheet-financial">{rub(rows.reduce((sum, row) => sum + Number(row.accrual ?? 0), 0))}</td></>}</tr></tfoot>
        </table>
      </div>
    </section>
    <div className="summary-strip timesheet-legend"><strong>Обозначения:</strong><span>В — плановый выходной</span><span>0 — назначение без факта</span><span>— — данных за день нет</span></div>
  </>;
}

function range(start: number, end: number) { return Array.from({ length: end - start + 1 }, (_, index) => start + index) }
function dateFor(day: number) { return new Date(Date.UTC(2026, 7, day)) }
function isWeekend(day: number) { const value = dateFor(day).getUTCDay(); return value === 0 || value === 6 }
function weekday(day: number) { return new Intl.DateTimeFormat("ru-RU", { weekday: "short", timeZone: "UTC" }).format(dateFor(day)).replace(".", "") }
