import { hasCapability } from "./access.mjs";

/**
 * Целевая информационная архитектура платформы.
 * planned-модули фиксируют каноническое место и маршрут, но не попадают в UI,
 * пока у них нет рабочего контура. Это не даёт roadmap превращаться в пустые страницы.
 */
export const navigationManifest = [
  { id: "home", label: "Главная", icon: "home", groups: [
    { id: "my-work", label: "Рабочее пространство", items: [
      { id: "command-center", label: "Командный центр", href: "/", capability: "home.command.read", keywords: "главная внимание риски" },
      { id: "my-tasks", label: "Мои задачи", href: "/tasks", capability: "task.read", keywords: "дела сроки поручения" },
    ]},
    { id: "team-work", label: "Команда", items: [
      { id: "team-tasks", label: "Задачи команды", href: "/team/tasks", capability: "task.team.read", status: "planned" },
      { id: "approvals", label: "Согласования", href: "/approvals", capability: "approval.read", status: "planned" },
    ]},
  ]},
  { id: "commerce", label: "Коммерция", icon: "briefcase", groups: [
    { id: "sales", label: "Продажи", items: [
      { id: "clients", label: "Клиенты", href: "/clients", capability: "sales.client.read" },
      { id: "requests", label: "Заявки", href: "/requests", capability: "sales.request.read" },
      { id: "proposals", label: "Коммерческие предложения", href: "/proposals", capability: "sales.request.read", keywords: "кп предложение" },
      { id: "tenders", label: "Тендеры", href: "/tenders", capability: "sales.tender.read", status: "planned" },
    ]},
    { id: "economics", label: "Экономика", items: [
      { id: "calculations", label: "Расчёты", href: "/calculations", capability: "calculation.scenario.read" },
      { id: "rates", label: "База ставок", href: "/rates", capability: "calculation.rate_reference.read" },
      { id: "standards", label: "Нормативы", href: "/standards", capability: "calculation.rules.read", status: "planned" },
    ]},
    { id: "contracts", label: "Договоры", items: [
      { id: "contract-registry", label: "Договоры", href: "/contracts", capability: "contract.read", status: "planned" },
    ]},
  ]},
  { id: "people", label: "Люди", icon: "users", groups: [
    { id: "recruiting", label: "Подбор", items: [
      { id: "needs", label: "Потребности", href: "/needs", capability: "operations.need.read" },
      { id: "candidates", label: "Кандидаты", href: "/candidates", capability: "recruiting.candidate.read" },
      { id: "recruiting-funnel", label: "Воронка подбора", href: "/recruiting", capability: "recruiting.candidate.read", keywords: "воронка" },
    ]},
    { id: "preparation", label: "Подготовка", items: [
      { id: "employment", label: "Оформление", href: "/onboarding/employment", capability: "worker.onboarding.read", status: "planned" },
      { id: "compliance", label: "Документы и допуски", href: "/compliance", capability: "worker.read" },
      { id: "readiness", label: "Подготовка выхода", href: "/onboarding/readiness", capability: "worker.onboarding.read", status: "planned" },
    ]},
    { id: "workforce", label: "Персонал", items: [
      { id: "workers", label: "Сотрудники", href: "/workers", capability: "worker.read" },
    ]},
  ]},
  { id: "operations", label: "Операции", icon: "factory", groups: [
    { id: "objects", label: "Объекты", items: [
      { id: "object-registry", label: "Объекты", href: "/objects", capability: "operations.object.read" },
      { id: "launch-plan", label: "План запуска", href: "/launches", capability: "operations.object.read" },
      { id: "staffing-plan", label: "Комплектация", href: "/staffing-plan", capability: "operations.need.read", status: "planned" },
    ]},
    { id: "work-processes", label: "Рабочие процессы", items: [
      { id: "shifts", label: "Смены", href: "/shifts", capability: "operations.shift.read" },
      { id: "timesheets", label: "Табели", href: "/timesheets", capability: "time.timesheet.read", keywords: "сверки" },
    ]},
    { id: "supply", label: "Обеспечение", items: [
      { id: "housing", label: "Жильё", href: "/supply/housing", capability: "supply.housing.read", status: "planned" },
      { id: "transport", label: "Транспорт", href: "/supply/transport", capability: "supply.transport.read", status: "planned" },
      { id: "procurement", label: "Закупки", href: "/procurement", capability: "procurement.read", status: "planned" },
      { id: "assets", label: "Имущество", href: "/assets", capability: "assets.read", status: "planned" },
      { id: "suppliers", label: "Поставщики", href: "/suppliers", capability: "supplier.read", status: "planned" },
    ]},
    { id: "quality", label: "Качество", items: [
      { id: "incidents", label: "Инциденты", href: "/incidents", capability: "operations.object.read" },
      { id: "claims", label: "Претензии и SLA", href: "/claims", capability: "operations.claim.read", status: "planned" },
    ]},
  ]},
  { id: "finance", label: "Финансы", icon: "wallet", groups: [
    { id: "personnel-finance", label: "Персонал", items: [
      { id: "accruals", label: "Начисления", href: "/accruals", capability: "finance.worker_accrual.read" },
      { id: "payments", label: "Выплаты", href: "/payments", capability: "finance.payments.read" },
    ]},
    { id: "client-finance", label: "Клиенты", items: [
      { id: "billing", label: "Биллинг", href: "/billing", capability: "finance.billing.read", status: "planned" },
      { id: "receivables", label: "Дебиторская задолженность", href: "/receivables", capability: "finance.receivables.read", status: "planned" },
    ]},
    { id: "management-finance", label: "Управление", items: [
      { id: "expenses", label: "Расходы", href: "/expenses", capability: "finance.expense.read", status: "planned" },
      { id: "pnl", label: "Прибыли и убытки", href: "/finance", capability: "finance.pnl.read" },
      { id: "plan-fact", label: "План / факт", href: "/finance/plan-fact", capability: "finance.plan_fact.read", status: "planned" },
    ]},
  ]},
  { id: "analytics", label: "Аналитика", icon: "chart", groups: [
    { id: "leadership-analytics", label: "Руководство", items: [
      { id: "portfolio", label: "Портфель", href: "/analytics", capability: "analytics.portfolio.read" },
      { id: "kpi", label: "KPI", href: "/analytics?view=kpi", capability: "analytics.kpi.read", status: "planned" },
      { id: "risks", label: "Риски и сигналы", href: "/analytics?view=risks", capability: "analytics.risk.read", status: "planned" },
    ]},
    { id: "direction-analytics", label: "Направления", items: [
      { id: "commerce-analytics", label: "Коммерция", href: "/analytics?view=commerce", capability: "analytics.sales.read", status: "planned" },
      { id: "workforce-analytics", label: "Подбор и персонал", href: "/analytics?view=workforce", capability: "analytics.portfolio.read" },
      { id: "operations-analytics", label: "Операции", href: "/analytics?view=comparison", capability: "analytics.portfolio.read" },
      { id: "finance-analytics", label: "Финансы", href: "/analytics?view=finance", capability: "analytics.finance.read", status: "planned" },
    ]},
  ]},
  { id: "control", label: "Контроль", icon: "shield", groups: [
    { id: "system-control", label: "Системный контроль", items: [
      { id: "activity", label: "Журнал действий", href: "/activity", capability: "home.command.read" },
      { id: "document-deadlines", label: "Документы и сроки", href: "/control/documents", capability: "document.control.read", status: "planned" },
    ]},
  ]},
  { id: "organization", label: "Организация", icon: "building", groups: [
    { id: "company", label: "Компания", items: [
      { id: "org-structure", label: "Оргструктура", href: "/organization/structure", capability: "organization.read", status: "planned" },
      { id: "departments", label: "Подразделения", href: "/organization/departments", capability: "organization.read", status: "planned" },
      { id: "positions", label: "Должности", href: "/organization/positions", capability: "organization.read", status: "planned" },
    ]},
    { id: "management", label: "Управление", items: [
      { id: "processes", label: "Процессы", href: "/organization/processes", capability: "workflow.manage", status: "planned" },
      { id: "sla", label: "SLA", href: "/organization/sla", capability: "workflow.manage", status: "planned" },
      { id: "company-kpi", label: "KPI", href: "/organization/kpi", capability: "organization.kpi.manage", status: "planned" },
    ]},
  ]},
  { id: "admin", label: "Администрирование", icon: "settings", groups: [
    { id: "access", label: "Доступ", items: [
      { id: "users-access", label: "Пользователи и права", href: "/admin/access", capability: "admin.permissions.manage" },
    ]},
    { id: "settings", label: "Настройки", items: [
      { id: "directories", label: "Справочники", href: "/admin/directories", capability: "admin.permissions.manage" },
      { id: "company-modules", label: "Модули компании", href: "/admin/modules", capability: "admin.modules.manage", status: "planned" },
      { id: "integrations", label: "Интеграции", href: "/admin/integrations", capability: "admin.integrations.manage", status: "planned" },
    ]},
  ]},
];

export function filterNavigation(manifest, access) {
  return manifest
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => item.status !== "planned" && (!item.capability || hasCapability(access, item.capability))),
        }))
        .filter((group) => group.items.length > 0),
    }))
    .filter((section) => section.groups.length > 0);
}
