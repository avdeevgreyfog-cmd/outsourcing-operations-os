"use client";

import { useState } from "react";
import { Flag, GitBranch, X } from "lucide-react";
import { KeyValue, Metric, Status } from "@/components/UI";
import type { LaunchTaskRow } from "@/lib/data/service";

const days = Array.from({ length: 20 }, (_, index) => index + 1);
const day = (value: string) => Number(value.split(".")[0]);

export function LaunchGantt({ rows }: { rows: LaunchTaskRow[] }) {
  const [selected, setSelected] = useState<LaunchTaskRow | null>(null);
  const critical = rows.filter((row) => row.critical).length;
  const milestones = rows.filter((row) => row.milestone).length;
  const progress = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.progress, 0) / rows.length) : 0;
  const baselineChanges = rows.filter((row) => row.baselineStart && row.baselineEnd && (row.baselineStart !== row.start || row.baselineEnd !== row.end)).length;

  return <>
    <div className="gantt-summary">
      <Metric label="Задачи" value={rows.length} note="в текущем плане"/>
      <Metric label="Общий прогресс" value={`${progress}%`}/>
      <Metric label="Критический путь" value={critical} tone={critical ? "bad" : "good"}/>
      <Metric label="Milestones" value={milestones}/>
      <Metric label="Отклонения baseline" value={baselineChanges} tone={baselineChanges ? "warn" : undefined}/>
    </div>
    <section className="section gantt">
      <div className="gantt-head"><div>WBS / задача</div><div className="gantt-dates">{days.map((value) => <span key={value}>{value}</span>)}</div></div>
      {rows.map((task) => {
        const start = Math.max(1, day(task.start)), end = Math.min(20, day(task.end));
        const baselineStart = task.baselineStart ? Math.max(1, day(task.baselineStart)) : null;
        const baselineEnd = task.baselineEnd ? Math.min(20, day(task.baselineEnd)) : null;
        return <div className={`gantt-row ${task.critical ? "critical-row" : ""}`} key={task.id}>
          <button type="button" className="gantt-task-name" style={{ paddingLeft: 14 + task.level * 18 }} onClick={() => setSelected(task)}>{task.milestone ? <Flag size={13}/> : task.dependencyIds.length ? <GitBranch size={13}/> : <span/>}<span><strong>{task.title}</strong><small>{task.owner} · {task.progress}%</small></span></button>
          <div className="gantt-timeline">{days.map((value) => <i key={value}/>)}
            {baselineStart != null && baselineEnd != null && !task.milestone && <span className="gantt-baseline" style={{ left: `${(baselineStart - 1) / 20 * 100}%`, width: `${Math.max(1, baselineEnd - baselineStart + 1) / 20 * 100}%` }}/>}
            {task.milestone ? <button type="button" className="gantt-milestone" style={{ left: `${(start - 1) / 20 * 100}%` }} onClick={() => setSelected(task)} aria-label={task.title}/> : <button type="button" className={`gantt-bar ${task.critical ? "critical" : ""}`} style={{ left: `${(start - 1) / 20 * 100}%`, width: `${Math.max(1, end - start + 1) / 20 * 100}%` }} onClick={() => setSelected(task)}><span style={{ width: `${task.progress}%` }}/><em>{task.progress}%</em></button>}
            <b className="today-line" style={{ left: `${(8 - 1) / 20 * 100}%` }}/>
          </div>
        </div>;
      })}
      <div className="gantt-legend"><span><i className="baseline"/> Baseline</span><span><i className="normal"/> План</span><span><i className="critical"/> Критический путь</span><span><i className="today"/> Сегодня</span></div>
    </section>
    {selected && <><div className="drawer-backdrop" onClick={() => setSelected(null)}/><aside className="drawer"><button className="icon-button drawer-close" onClick={() => setSelected(null)} aria-label="Закрыть"><X size={17}/></button><div className="eyebrow">Задача запуска · {selected.object}</div><h2>{selected.title}</h2><Status tone={selected.risk === "high" ? "warn" : selected.status === "done" ? "good" : "info"}>{selected.status}</Status><div className="drawer-content"><KeyValue label="Ответственный" value={selected.owner}/><KeyValue label="План" value={`${selected.start}–${selected.end}`}/><KeyValue label="Baseline" value={`${selected.baselineStart ?? "—"}–${selected.baselineEnd ?? "—"}`}/><KeyValue label="Прогресс" value={`${selected.progress}%`}/><KeyValue label="Риск" value={selected.risk}/><KeyValue label="Критический путь" value={selected.critical ? "Да" : "Нет"}/><KeyValue label="Зависимости" value={selected.dependencyIds.length || "Нет"}/></div></aside></>}
  </>;
}
