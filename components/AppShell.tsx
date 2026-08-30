import Link from "next/link";
import { cookies } from "next/headers";
import type { Actor } from "@/lib/access/types";
import { hasCapability } from "@/lib/core/access.mjs";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DemoRoleSwitch } from "@/components/DemoRoleSwitch";

const nav = [
  { group: "Home", items: [["Командный центр", "/", "home.command.read"], ["Мои задачи", "/tasks", "task.read"]] },
  { group: "Коммерция", items: [["Клиенты", "/clients", "sales.client.read"], ["Заявки", "/requests", "sales.request.read"], ["Расчёты", "/calculations", "calculation.scenario.read"]] },
  { group: "Операции", items: [["Объекты", "/objects", "operations.object.read"], ["Потребности", "/needs", "operations.need.read"], ["Планирование смен", "/shifts", "operations.shift.read"], ["Табели / сверки", "/timesheets", "time.timesheet.read"]] },
  { group: "Люди", items: [["Подбор", "/recruiting", "recruiting.candidate.read"], ["Сотрудники", "/workers", "worker.read"]] },
  { group: "Финансы", items: [["P&L и финансы", "/finance", "finance.pnl.read"]] },
  { group: "Аналитика", items: [["Портфель", "/analytics", "analytics.portfolio.read"]] },
  { group: "Контроль", items: [["Activity", "/activity", "home.command.read"]] },
  { group: "Администрирование", items: [["Пользователи и доступ", "/admin/access", "admin.permissions.manage"]] },
] as const;

export async function AppShell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const store = await cookies();
  const theme = store.get("oo_theme")?.value === "dark" ? "dark" : "light";
  return (
    <div className="app-shell" data-initial-theme={theme}>
      <script dangerouslySetInnerHTML={{ __html: `document.documentElement.dataset.theme=${JSON.stringify(theme)}` }} />
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">O</span><div><strong>OPERIS</strong><small>Outsourcing OS</small></div></div>
        <nav className="nav-groups">
          {nav.map((section) => {
            const allowed = section.items.filter(([, , capability]) => hasCapability(actor.access, capability));
            if (!allowed.length) return null;
            return <div className="nav-group" key={section.group}><div className="nav-group-title">{section.group}</div>{allowed.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}</div>;
          })}
        </nav>
        <div className="sidebar-foot">
          <div className="avatar">{actor.displayName.split(" ").map(x => x[0]).join("").slice(0,2)}</div>
          <div className="who"><strong>{actor.displayName}</strong><span>{actor.roleName}</span></div>
        </div>
      </aside>
      <main className="main-canvas">
        <header className="topbar">
          <div className="topbar-context"><span className="live-dot" /> Единая операционная среда</div>
          <div className="topbar-actions">{actor.demo && <DemoRoleSwitch current={actor.roleCode === "object_manager" ? "object" : actor.roleCode === "sales_manager" ? "sales" : actor.roleCode === "regional_manager" ? "regional" : actor.roleCode} />}<ThemeToggle /><Link className="icon-button" href="/tasks" aria-label="Задачи">✓</Link></div>
        </header>
        <div className="page-wrap">{children}</div>
      </main>
    </div>
  );
}
