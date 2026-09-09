"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClientRow } from "@/lib/data/service";
import { CreateClientButton } from "@/components/forms/CreateClientButton";
import { SalesMetrics, SalesSearch, SalesSegments, SalesEmpty } from "@/components/sales/SalesUI";
import { Status } from "@/components/UI";

type Filter = "all" | "active";

function clientStatusLabel(value: string) {
  const labels: Record<string, string> = {
    active: "Активен",
    inactive: "Неактивен",
    archived: "Архив",
    blocked: "Заблокирован",
  };
  return labels[value] ?? (/[A-Za-z_]/.test(value) ? "Другой статус" : value);
}

export function ClientsWorkspaceBaseline({ rows, canCreate = false }: { rows: ClientRow[]; canCreate?: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const active = rows.filter((row) => row.status === "active");
  const requestCount = rows.reduce((sum, row) => sum + row.requests, 0);
  const objectCount = rows.reduce((sum, row) => sum + row.objects, 0);
  const contactCount = rows.reduce((sum, row) => sum + row.contacts, 0);

  const filtered = useMemo(() => rows.filter((row) => {
    if (filter === "active" && row.status !== "active") return false;
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return `${row.name} ${row.legalName ?? ""}`.toLowerCase().includes(needle);
  }), [rows, filter, query]);

  return <div className="request-final-registry request-baseline-registry client-baseline-registry">
    <SalesMetrics label="Сводка по клиентам" items={[
      {label:"Клиенты",value:rows.length,note:"в доступном контуре"},
      {label:"Активные",value:active.length,note:"сейчас в работе"},
      {label:"Заявки",value:requestCount,note:"доступные заявки клиентов"},
      {label:"Контакты",value:contactCount,note:`Объектов в доступном контуре: ${objectCount}`},
    ]}/>

    <div className="sales-registry">
      <div className="sales-toolbar">
        <SalesSegments<Filter> label="Статус клиентов" value={filter} onChange={setFilter} items={[{value:"all",label:"Все"},{value:"active",label:"Активные"}]}/>
        <div className="sales-toolbar-actions"><SalesSearch value={query} onChange={setQuery} placeholder="Поиск по клиентам"/>{canCreate && <CreateClientButton/>}</div>
      </div>
      <div className="sales-results" aria-live="polite">Показано {filtered.length} из {rows.length}</div>
      <div className="request-table-wrap">
        <table className="data-table sales-client-table">
          <thead><tr><th>Клиент</th><th>Статус</th><th>Контакты</th><th>Заявки</th><th>Объекты</th></tr></thead>
          <tbody>{filtered.length ? filtered.map((row) => <tr key={row.id}>
            <td><Link className="cell-title" href={`/clients/${row.id}`}>{row.name}</Link><span className="cell-sub">{row.legalName || "Юридическое лицо не указано"}</span></td>
            <td><Status tone={row.status === "active" ? "good" : "neutral"}>{clientStatusLabel(row.status)}</Status></td>
            <td><Link href={`/clients/${row.id}?tab=contacts`}>{row.contacts}</Link></td>
            <td><Link href={`/clients/${row.id}?tab=requests`}>{row.requests}</Link></td>
            <td><Link href={`/clients/${row.id}?tab=objects`}>{row.objects}</Link></td>
          </tr>) : <tr><td colSpan={5}><SalesEmpty onReset={() => { setQuery(""); setFilter("all"); }}/></td></tr>}</tbody>
        </table>
      </div>
    </div>
  </div>;
}
