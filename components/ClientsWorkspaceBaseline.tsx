"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { ClientRow } from "@/lib/data/service";
import { CreateClientButton } from "@/components/forms/CreateClientButton";
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

export function ClientsWorkspaceBaseline({ rows }: { rows: ClientRow[] }) {
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
    <div className="request-final-command-strip" aria-label="Сводка по клиентам">
      <div><span>Клиенты</span><strong>{rows.length}</strong><small>в доступном контуре</small></div>
      <div><span>Активные</span><strong>{active.length}</strong><small>сейчас в работе</small></div>
      <div><span>Заявки</span><strong>{requestCount}</strong><small>по всем клиентам</small></div>
      <div><span>Объекты</span><strong>{objectCount}</strong><small>{contactCount} контактов в базе</small></div>
    </div>

    <div className="requests-workspace requests-workspace-polished request-baseline-workspace client-baseline-workspace">
      <div className="requests-toolbar requests-toolbar-polished">
        <div className="requests-toolbar-left">
          <div className="segmented-control request-bucket-switcher">
            <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Все</button>
            <button className={filter === "active" ? "active" : ""} onClick={() => setFilter("active")}>Активные</button>
          </div>
        </div>
        <div className="requests-toolbar-actions">
          <input className="request-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по клиентам" />
          <CreateClientButton />
        </div>
      </div>

      <div className="request-table-wrap">
        <table className="data-table request-registry-table">
          <thead><tr><th>Клиент</th><th>Статус</th><th>Контакты</th><th>Заявки</th><th>Объекты</th><th>Контур</th></tr></thead>
          <tbody>{filtered.length ? filtered.map((row) => <tr key={row.id}>
            <td><Link className="cell-title" href={`/clients/${row.id}`}>{row.name}</Link><span className="cell-sub">{row.legalName || "Юридическое лицо не указано"}</span></td>
            <td><Status tone={row.status === "active" ? "good" : "neutral"}>{clientStatusLabel(row.status)}</Status></td>
            <td><strong>{row.contacts}</strong><span className="cell-sub">контактов</span></td>
            <td><strong>{row.requests}</strong><span className="cell-sub">коммерческих заявок</span></td>
            <td><strong>{row.objects}</strong><span className="cell-sub">действующих и завершённых</span></td>
            <td><span className="cell-sub">{row.requests ? `${row.requests} заявок` : "Без заявок"} · {row.objects ? `${row.objects} объектов` : "без объектов"}</span></td>
          </tr>) : <tr><td colSpan={6}><div className="empty-inline">Клиентов по выбранному фильтру нет</div></td></tr>}</tbody>
        </table>
      </div>
    </div>
  </div>;
}
