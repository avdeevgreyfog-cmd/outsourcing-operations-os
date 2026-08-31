"use client";
import { useState } from "react";
import { Save, ShieldAlert } from "lucide-react";
import { Status } from "@/components/UI";
import type { AccessUserRow } from "@/lib/data/service";

const capabilityGroups = [
  { label: "Продажи", items: ["sales.client.read", "sales.request.read", "calculation.scenario.read", "calculation.scenario.approve"] },
  { label: "Операции", items: ["operations.object.read", "operations.need.read", "operations.shift.read", "time.timesheet.read", "time.timesheet.edit"] },
  { label: "Люди", items: ["recruiting.candidate.read", "recruiting.candidate.edit", "worker.read", "worker.compensation.read"] },
  { label: "Финансы", items: ["finance.worker_accrual.read", "finance.payments.read", "finance.client_margin.read", "finance.pnl.read"] },
  { label: "Администрирование", items: ["admin.permissions.manage", "audit.read"] },
];
const capabilityLabels: Record<string, string> = {
  "sales.client.read": "Просмотр клиентов", "sales.request.read": "Просмотр заявок", "calculation.scenario.read": "Просмотр расчётов", "calculation.scenario.approve": "Согласование расчётов",
  "operations.object.read": "Просмотр объектов", "operations.need.read": "Просмотр потребностей", "operations.shift.read": "Просмотр смен", "time.timesheet.read": "Просмотр табелей", "time.timesheet.edit": "Редактирование табелей",
  "recruiting.candidate.read": "Просмотр кандидатов", "recruiting.candidate.edit": "Редактирование кандидатов", "worker.read": "Просмотр сотрудников", "worker.compensation.read": "Просмотр ставок и начислений",
  "finance.worker_accrual.read": "Просмотр начислений", "finance.payments.read": "Просмотр выплат", "finance.client_margin.read": "Просмотр маржи по клиентам", "finance.pnl.read": "Просмотр прибылей и убытков",
  "admin.permissions.manage": "Управление правами", "audit.read": "Просмотр журнала изменений",
};
const scopes = [{ value: "all_org", label: "Вся организация" }, { value: "region", label: "Регионы пользователя" }, { value: "team", label: "Команды пользователя" }, { value: "assigned_to_me", label: "Назначенные записи" }, { value: "own_created", label: "Созданные пользователем" }];

export function AccessEditor({ users, demo }: { users: AccessUserRow[]; demo: boolean }) {
  const [selectedId, setSelectedId] = useState(users[0]?.membershipId ?? "");
  const user = users.find((item) => item.membershipId === selectedId);
  const [capability, setCapability] = useState(capabilityGroups[0].items[0]);
  const [effect, setEffect] = useState<"inherit" | "allow" | "deny">("inherit"); const [scope, setScope] = useState("assigned_to_me"); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  async function save() { if (demo) { setMessage("В демонстрационном режиме изменения не сохраняются. Подключите PostgreSQL и войдите как администратор."); return } setBusy(true); setMessage(""); const response = await fetch("/api/admin/access", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ membershipId: selectedId, capability, effect, scopeType: effect === "allow" ? scope : undefined }) }); const body = await response.json(); setMessage(response.ok ? "Изменение сохранено. Новые права применятся со следующего запроса." : body.error ?? "Не удалось сохранить"); setBusy(false) }

  return <div className="access-editor"><aside className="access-users">{users.map((item) => <button type="button" key={item.membershipId} className={item.membershipId === selectedId ? "active" : ""} onClick={() => setSelectedId(item.membershipId)}><span className="avatar">{item.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><span><strong>{item.name}</strong><small>{item.role} · {item.regions} регион(а)</small></span></button>)}</aside><div className="access-workspace"><div className="access-person"><div><h2>{user?.name ?? "Пользователь не выбран"}</h2><p>{user?.email} · шаблон {user?.role}</p></div><Status tone={demo ? "warn" : "good"}>{demo ? "preview" : "active"}</Status></div><div className="access-form"><label>Разрешение<select value={capability} onChange={(event) => setCapability(event.target.value)}>{capabilityGroups.map((group) => <optgroup key={group.label} label={group.label}>{group.items.map((item) => <option key={item} value={item}>{capabilityLabels[item]}</option>)}</optgroup>)}</select></label><label>Индивидуальное правило<select value={effect} onChange={(event) => setEffect(event.target.value as typeof effect)}><option value="inherit">Наследовать шаблон</option><option value="allow">Разрешить</option><option value="deny">Запретить</option></select></label>{effect === "allow" && <label>Область доступа<select value={scope} onChange={(event) => setScope(event.target.value)}>{scopes.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>}<div className="access-warning"><ShieldAlert size={16}/><span>Явный запрет имеет приоритет. Изменение влияет только на выбранное разрешение и не расширяет остальные права.</span></div><button className="button primary" type="button" disabled={busy || !user} onClick={save}><Save size={14}/>{busy ? "Сохранение…" : "Сохранить правило"}</button>{message && <p className="form-message">{message}</p>}</div></div></div>;
}
