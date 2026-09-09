"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CommercialProposalRow } from "@/lib/commercial/service";
import { SalesMetrics, SalesSearch, SalesSegments, SalesEmpty } from "@/components/sales/SalesUI";
import { Status } from "@/components/UI";
import { rub } from "@/lib/ui/format";

type Filter = "all" | "draft" | "approval" | "client" | "completed";

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  internal_review: "Внутреннее согласование",
  approved: "Согласовано внутри",
  sent: "У клиента",
  negotiation: "Переговоры",
  accepted: "Принято клиентом",
  revision_requested: "На доработке",
  client_rejected: "Отказ клиента",
  rejected_internal: "Отклонено внутри",
  launched: "Передано в запуск",
};

function label(status: string) {
  return statusLabels[status] ?? (/[A-Za-z_]/.test(status) ? "В работе" : status);
}

function tone(status: string) {
  if (["accepted", "launched"].includes(status)) return "good" as const;
  if (["client_rejected", "rejected_internal"].includes(status)) return "bad" as const;
  if (["draft", "revision_requested"].includes(status)) return "neutral" as const;
  if (["sent", "negotiation", "approved"].includes(status)) return "info" as const;
  return "warn" as const;
}

function belongs(row: CommercialProposalRow, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "draft") return ["draft", "revision_requested", "rejected_internal"].includes(row.status);
  if (filter === "approval") return row.status === "internal_review";
  if (filter === "client") return ["approved", "sent", "negotiation"].includes(row.status);
  return ["accepted", "client_rejected", "launched"].includes(row.status);
}

function activity(row: CommercialProposalRow) {
  if (row.launchedAt) return "Передано в запуск";
  if (row.acceptedAt) return "Принято клиентом";
  if (row.sentAt) return "Отправлено клиенту";
  if (row.approvedAt) return "Согласовано внутри";
  if (row.status === "internal_review") return "На внутреннем согласовании";
  if (row.status === "revision_requested") return "Ожидает новой версии";
  if (row.status === "client_rejected") return "Получен отказ клиента";
  return "Создано " + row.createdAt;
}

export function ProposalsWorkspace({ rows }: { rows: CommercialProposalRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => belongs(row, filter)).filter((row) => {
      if (!needle) return true;
      return `${row.request} ${row.client} ${row.createdBy} ${row.version}`.toLowerCase().includes(needle);
    });
  }, [rows, filter, query]);

  const inWork = rows.filter((row) => !["accepted", "client_rejected", "launched"].includes(row.status));
  const atClient = rows.filter((row) => ["sent", "negotiation"].includes(row.status));
  const accepted = rows.filter((row) => ["accepted", "launched"].includes(row.status));
  const activeValue = inWork.reduce((sum, row) => sum + Number(row.totalValue || 0), 0);

  return <div className="proposal-registry">
    <SalesMetrics label="Сводка по коммерческим предложениям" items={[
      {label:"КП в работе",value:inWork.length,note:"активных версий"},
      {label:"У клиента",value:atClient.length,note:"ожидают решения"},
      {label:"Принято",value:accepted.length,note:"клиентских решений"},
      {label:"Активный объём",value:activeValue ? rub(activeValue) : "—",note:"по текущим версиям"},
    ]}/>
    <div className="sales-toolbar">
      <SalesSegments<Filter> label="Статус КП" value={filter} onChange={setFilter} items={[{value:"all",label:"Все"},{value:"draft",label:"Черновики"},{value:"approval",label:"Согласование"},{value:"client",label:"У клиента"},{value:"completed",label:"Завершённые"}]}/>
      <SalesSearch value={query} onChange={setQuery} placeholder="Поиск по КП, клиенту или заявке"/>
    </div>
    <div className="sales-results" aria-live="polite">Показано {visible.length} из {rows.length}</div>

    <div className="commercial-table-wrap">
      <table className="data-table proposal-registry-table">
        <thead><tr><th>Коммерческое предложение</th><th>Клиент</th><th>Сумма</th><th>Этап</th><th>Позиции</th><th>Создано</th><th>Активность</th></tr></thead>
        <tbody>{visible.length ? visible.map((row) => <tr key={row.id}>
          <td><Link href={`/proposals/${row.id}`} className="cell-title">КП №{row.version} · {row.request}</Link><span className="cell-sub">Автор: {row.createdBy}</span></td>
          <td>{row.client}</td>
          <td className="num">{Number(row.totalValue) ? rub(row.totalValue) : "—"}</td>
          <td><Status tone={tone(row.status)}>{label(row.status)}</Status></td>
          <td className="num">{row.scenarioCount}</td>
          <td>{row.createdAt}</td>
          <td><span className="proposal-activity">{activity(row)}</span></td>
        </tr>) : <tr><td colSpan={7}><SalesEmpty onReset={() => { setQuery(""); setFilter("all"); }}/></td></tr>}</tbody>
      </table>
    </div>
  </div>;
}
