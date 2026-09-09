"use client";

import Link from "next/link";
import { requestBucket, stageByCode, type RequestBoardRow, type RequestStageDefinition } from "@/lib/commercial/request-workflow";
import { Section } from "@/components/UI";
import { SalesEmpty } from "./SalesUI";

export const lossLabels: Record<string, string> = { price: "Не устроила цена", competitor: "Выбран другой подрядчик", cancelled: "Потребность отменена", timing: "Не подошли сроки", conditions: "Не устроили условия", no_response: "Нет ответа заказчика", staffing: "Не обеспечили персонал", other: "Другая причина" };

export function daysSince(value: string, now: number) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / 86400000)) : null;
}

export function RequestInsights({ rows, stages, now, onStage }: { rows: RequestBoardRow[]; stages: RequestStageDefinition[]; now: number; onStage: (code: string) => void }) {
  const actual = rows.filter(row => !row.archivedAt);
  const codes = [...new Set([...stages.map(stage => stage.code), ...actual.map(row => row.workflowStageCode)])];
  const distribution = codes.map(code => ({ code, label: stages.find(stage => stage.code === code)?.label ?? code, count: actual.filter(row => row.workflowStageCode === code).length })).filter(item => item.count || stages.find(stage => stage.code === item.code)?.active);
  const maximum = Math.max(1, ...distribution.map(item => item.count));
  const agreed = actual.filter(row => row.workflowStageCode === "agreed").length;
  const lost = actual.filter(row => row.workflowStageCode === "not_agreed");
  const completed = agreed + lost.length;
  const losses = lost.reduce<Record<string, number>>((result, row) => { const key = row.lossReason || "Причина не указана"; result[key] = (result[key] ?? 0) + 1; return result; }, {});
  const idle = actual.filter(row => requestBucket(row) === "active").map(row => ({ row, days: daysSince(row.updatedAt, now) })).filter((item): item is { row: RequestBoardRow; days: number } => item.days !== null && item.days >= 7).sort((a, b) => b.days - a.days);

  return <div className="sales-insights">
    <Section title="Заявки по этапам" note="Текущее распределение без архива. Нажмите на этап, чтобы открыть заявки.">
      {actual.length ? <div className="sales-bars">{distribution.map(item => <button type="button" className="sales-bar-row" key={item.code} onClick={() => onStage(item.code)} aria-label={`${item.label}: ${item.count}, открыть заявки`}><span>{item.label}</span><strong>{item.count}<small>{Math.round(item.count / actual.length * 100)}%</small></strong><span className="sales-bar-track" aria-hidden="true"><i style={{ width: `${item.count / maximum * 100}%` }}/></span></button>)}</div> : <SalesEmpty title="Пока нет заявок" text="Распределение появится после добавления заявок."/>}
    </Section>
    <Section title="Результаты согласования" note="По завершённым заявкам в доступном контуре, за всё время.">
      <div className="sales-outcome"><strong>{completed ? `${Math.round(agreed / completed * 100)}%` : "—"}</strong><span>{completed ? `Согласовано ${agreed} из ${completed}` : "Завершённых заявок пока нет"}</span><div className="sales-outcome-track" aria-hidden="true"><i style={{ width: `${completed ? agreed / completed * 100 : 0}%` }}/></div><div className="sales-outcome-legend"><span>Согласовано <b>{agreed}</b></span><span>Не согласовано <b>{lost.length}</b></span></div></div>
      <div className="sales-losses"><h3>Причины отказов</h3>{Object.entries(losses).length ? Object.entries(losses).sort((a, b) => b[1] - a[1]).map(([key, value]) => <div key={key}><span>{lossLabels[key] ?? key}</span><strong>{value}</strong></div>) : <p>Причины появятся после фиксации отказов.</p>}</div>
    </Section>
    <Section className="sales-idle-section" title="Без изменений от 7 дней" note="По дате последнего изменения заявки. Это не срок последнего контакта с клиентом.">
      {idle.length ? <div className="sales-idle-list">{idle.map(({ row, days }) => <Link key={row.id} href={`/requests/${row.id}`}><div><strong>{row.title}</strong><span>{row.client} · {stageByCode(stages, row.workflowStageCode).label}</span></div><span>{row.owner ?? "Без ответственного"}</span><b>{days} дн.</b></Link>)}</div> : <SalesEmpty title="Заявок без изменений от 7 дней нет" text="Здесь будут видны активные заявки, которые давно не обновлялись."/>}
    </Section>
  </div>;
}
