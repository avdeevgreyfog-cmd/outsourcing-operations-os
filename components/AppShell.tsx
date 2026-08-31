import { cookies } from "next/headers";
import type { Actor } from "@/lib/access/types";
import { hasCapability } from "@/lib/core/access.mjs";
import { WorkspaceNavigation, type NavigationSection } from "@/components/WorkspaceNavigation";

const navigation: NavigationSection[] = [
  { id: "home", label: "Главная", icon: "home", groups: [{ id: "command", label: "Рабочий день", items: [
    { label: "Командный центр", href: "/", capability: "home.command.read", keywords: "главная внимание риски" }, { label: "Мои задачи", href: "/tasks", capability: "task.read", keywords: "дела сроки поручения" },
  ]}]},
  { id: "commerce", label: "Коммерция", icon: "briefcase", groups: [
    { id: "sales", label: "Продажи", items: [{ label: "Клиенты", href: "/clients", capability: "sales.client.read" }, { label: "Заявки", href: "/requests", capability: "sales.request.read" }, { label: "Коммерческие предложения", href: "/proposals", capability: "sales.request.read", keywords: "кп предложение" }]},
    { id: "economics", label: "Экономика", items: [{ label: "Расчёты", href: "/calculations", capability: "calculation.scenario.read" }, { label: "База ставок", href: "/rates", capability: "calculation.rate_reference.read" }]},
  ]},
  { id: "operations", label: "Операции", icon: "factory", groups: [{ id: "objects", label: "Объекты", items: [
    { label: "Реестр объектов", href: "/objects", capability: "operations.object.read" }, { label: "План запусков", href: "/launches", capability: "operations.object.read" }, { label: "Потребности", href: "/needs", capability: "operations.need.read" }, { label: "Смены", href: "/shifts", capability: "operations.shift.read" }, { label: "Табели и сверки", href: "/timesheets", capability: "time.timesheet.read" },
  ]}]},
  { id: "people", label: "Люди", icon: "users", groups: [
    { id: "recruiting", label: "Подбор", items: [{ label: "Воронка", href: "/recruiting", capability: "recruiting.candidate.read" }, { label: "Кандидаты", href: "/candidates", capability: "recruiting.candidate.read" }]},
    { id: "workforce", label: "Персонал", items: [{ label: "Сотрудники", href: "/workers", capability: "worker.read" }, { label: "Начисления", href: "/accruals", capability: "finance.worker_accrual.read" }, { label: "Выплаты", href: "/payments", capability: "finance.payments.read" }]},
  ]},
  { id: "finance", label: "Финансы", icon: "wallet", groups: [{ id: "object-economics", label: "Экономика объектов", items: [{ label: "Прибыли и убытки", href: "/finance", capability: "finance.pnl.read" }, { label: "Сравнение объектов", href: "/analytics?view=comparison", capability: "analytics.portfolio.read" }] }]},
  { id: "analytics", label: "Аналитика", icon: "chart", groups: [{ id: "analytics-main", label: "Отчёты", items: [{ label: "Портфель", href: "/analytics", capability: "analytics.portfolio.read" }, { label: "Подбор и персонал", href: "/analytics?view=workforce", capability: "analytics.portfolio.read" }] }]},
  { id: "control", label: "Контроль", icon: "shield", groups: [{ id: "control-main", label: "Рабочий контроль", items: [{ label: "Задачи", href: "/tasks", capability: "task.read" }, { label: "Журнал действий", href: "/activity", capability: "home.command.read" }, { label: "Инциденты", href: "/incidents", capability: "operations.object.read" }, { label: "Допуски и документы", href: "/compliance", capability: "worker.read" }] }]},
  { id: "admin", label: "Администрирование", icon: "settings", groups: [{ id: "access", label: "Организация", items: [{ label: "Пользователи и права", href: "/admin/access", capability: "admin.permissions.manage" }, { label: "Справочники", href: "/admin/directories", capability: "admin.permissions.manage" }] }]},
];

export async function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("oo_theme")?.value === "dark" ? "dark" : "light";
  const allowed = navigation.map((section) => ({ ...section, groups: section.groups.map((group) => ({ ...group, items: group.items.filter((item) => !item.capability || hasCapability(actor.access, item.capability)) })).filter((group) => group.items.length) })).filter((section) => section.groups.length);
  return <div className="app-shell" data-initial-theme={theme}>
    <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)}` }} />
    <WorkspaceNavigation actor={actor} sections={allowed}/><main className="main-canvas"><div className="page-wrap">{children}</div></main>
  </div>;
}
