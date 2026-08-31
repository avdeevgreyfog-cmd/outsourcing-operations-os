import { hasCapability } from "./access.mjs";

/**
 * Единый манифест целевой информационной архитектуры.
 * foundation означает, что для направления есть честная базовая рабочая область,
 * но полноценный бизнес-контур будет углубляться отдельной итерацией.
 */
export const navigationManifest = [
  { id: "home", label: "Главная", icon: "home", groups: [
    { id: "my-work", label: "Рабочее пространство", items: [
      { id: "command-center", label: "Командный центр", href: "/", capability: "home.command.read", keywords: "главная внимание риски" },
      { id: "my-tasks", label: "Мои задачи", href: "/tasks", capability: "task.read", keywords: "дела сроки поручения" },
    ]},
    { id: "team-work", label: "Команда", items: [
      { id: "team-tasks", label: "Задачи команды", href: "/team/tasks", capability: "task.team.read", status: "foundation" },
      { id: "approvals", label: "Согласования", href: "/approvals", capability: "approval.read", status: "foundation" },
    ]},
  ]},
  { id: "commerce", label: "Коммерция", icon: "briefcase", groups: [
    { id: "sales", label: "Продажи", items: [
      { id: "clients", label: "Клиенты", href: "/clients", capability: "sales.client.read" },
      { id: "requests", label: "Заявки", href: "/requests", capability: "sales.request.read" },
      { id: "proposals", label: "Коммерческие предложения", href: "/proposals", capability: "sales.request.read", keywords: "кп предложение" },
      { id: "tenders", label: "Тендеры", href: "/tenders", capability: "sales.tender.read", status: "foundation" },
    ]},
    { id: "economics", label: "Экономика", items: [
      { id: "calculations", label: "Расчёты", href: "/calculations", capability: "calculation.scenario.read" },
      { id: "rates", label: "База ставок", href: "/rates", capability: "calculation.rate_reference.read" },
      { id: "standards", label: "Нормативы", href: "/standards", capability: "calculation.rules.read", status: "foundation" },
    ]},
    { id: "contracts", label: "Договорная работа", items: [
      { id: "contract-registry", label: "Договоры", href: "/contracts", capability: "contract.read", status: "foundation" },
    ]},
  ]},
  { id: "people", label: "Люди", icon: "users", groups: [
    { id: "recruiting", label: "Подбор", items: [
      { id: "needs", label: "Потребности", href: "/needs", capability: "operations.need.read" },
      { id: "recruiting-funnel", label: "Воронка подбора", href: "/recruiting", capability: "recruiting.candidate.read", keywords: "воронка" },
      { id: "candidates", label: "Кандидаты", href: "/candidates", capability: "recruiting.candidate.read" },
    ]},
    { id: "preparation", label: "Подготовка выхода", items: [
      { id: "readiness", label: "Готовность к выходу", href: "/onboarding/readiness", capability: "worker.onboarding.read", status: "foundation" },
      { id: "employment", label: "Оформление", href: "/onboarding/employment", capability: "worker.onboarding.read", status: "foundation" },
      { id: "compliance", label: "Документы и допуски", href: "/compliance", capability: "worker.read" },
      { id: "travel", label: "Проезд и прибытие", href: "/onboarding/travel", capability: "worker.onboarding.read", status: "foundation" },
    ]},
    { id: "workforce", label: "Персонал", items: [
      { id: "workers", label: "Сотрудники", href: "/workers", capability: "worker.read" },
    ]},
  ]},
  { id: "operations", label: "Операции", icon: "factory", groups: [
    { id: "objects", label: "Объекты", items: [
      { id: "object-registry", label: "Реестр объектов", href: "/objects", capability: "operations.object.read" },
      { id: "launch-plan", label: "План запуска", href: "/launches", capability: "operations.object.read" },
      { id: "staffing-plan", label: "План комплектации", href: "/staffing-plan", capability: "operations.need.read", status: "foundation" },
      { id: "shifts", label: "Смены", href: "/shifts", capability: "operations.shift.read" },
      { id: "timesheets", label: "Табели и сверка", href: "/timesheets", capability: "time.timesheet.read", keywords: "сверки" },
    ]},
    { id: "supply", label: "Обеспечение", items: [
      { id: "housing", label: "Жильё", href: "/supply/housing", capability: "supply.housing.read", status: "foundation" },
      { id: "transport", label: "Транспорт", href: "/supply/transport", capability: "supply.transport.read", status: "foundation" },
      { id: "procurement", label: "Закупки", href: "/procurement", capability: "procurement.read", status: "foundation" },
      { id: "assets", label: "Имущество и СИЗ", href: "/assets", capability: "assets.read", status: "foundation" },
      { id: "suppliers", label: "Поставщики", href: "/suppliers", capability: "supplier.read", status: "foundation" },
    ]},
    { id: "quality", label: "Качество", items: [
      { id: "incidents", label: "Инциденты", href: "/incidents", capability: "operations.object.read" },
      { id: "claims", label: "Претензии и SLA", href: "/claims", capability: "operations.claim.read", status: "foundation" },
    ]},
  ]},
  { id: "finance", label: "Финансы", icon: "wallet", groups: [
    { id: "personnel-finance", label: "Персонал", items: [
      { id: "accruals", label: "Начисления", href: "/accruals", capability: "finance.worker_accrual.read" },
      { id: "payments", label: "Выплаты", href: "/payments", capability: "finance.payments.read" },
    ]},
    { id: "client-finance", label: "Клиенты", items: [
      { id: "billing", label: "Биллинг", href: "/billing", capability: "finance.billing.read", status: "foundation" },
      { id: "receivables", label: "Дебиторская задолженность", href: "/receivables", capability: "finance.receivables.read", status: "foundation" },
    ]},
    { id: "management-finance", label: "Экономика", items: [
      { id: "expenses", label: "Операционные расходы", href: "/expenses", capability: "finance.expense.read", status: "foundation" },
      { id: "pnl", label: "Прибыли и убытки", href: "/finance", capability: "finance.pnl.read" },
      { id: "plan-fact", label: "План / факт / прогноз", href: "/finance/plan-fact", capability: "finance.plan_fact.read", status: "foundation" },
    ]},
  ]},
  { id: "analytics", label: "Аналитика", icon: "chart", groups: [
    { id: "leadership-analytics", label: "Руководство", items: [
      { id: "portfolio", label: "Портфель", href: "/analytics", capability: "analytics.portfolio.read" },
      { id: "kpi", label: "KPI", href: "/analytics/kpi", capability: "analytics.kpi.read", status: "foundation" },
      { id: "risks", label: "Риски и сигналы", href: "/analytics/risks", capability: "analytics.risk.read", status: "foundation" },
    ]},
    { id: "direction-analytics", label: "Направления", items: [
      { id: "commerce-analytics", label: "Коммерция", href: "/analytics/commerce", capability: "analytics.sales.read", status: "foundation" },
      { id: "workforce-analytics", label: "Подбор и персонал", href: "/analytics?view=workforce", capability: "analytics.portfolio.read" },
      { id: "operations-analytics", label: "Операции", href: "/analytics?view=comparison", capability: "analytics.portfolio.read" },
      { id: "finance-analytics", label: "Финансы", href: "/analytics/finance", capability: "analytics.finance.read", status: "foundation" },
    ]},
  ]},
  { id: "control", label: "Контроль", icon: "shield", groups: [
    { id: "system-control", label: "Системный контроль", items: [
      { id: "activity", label: "Журнал действий", href: "/activity", capability: "home.command.read" },
      { id: "document-deadlines", label: "Документы и сроки", href: "/control/documents", capability: "document.control.read", status: "foundation" },
      { id: "admissions-control", label: "Допуски", href: "/control/admissions", capability: "document.control.read", status: "foundation" },
    ]},
  ]},
  { id: "organization", label: "Организация", icon: "building", groups: [
    { id: "company", label: "Структура", items: [
      { id: "org-structure", label: "Оргструктура", href: "/organization/structure", capability: "organization.read", status: "foundation" },
      { id: "company-staff", label: "Сотрудники компании", href: "/organization/staff", capability: "organization.read", status: "foundation" },
      { id: "positions", label: "Должности и ответственность", href: "/organization/positions", capability: "organization.read", status: "foundation" },
      { id: "departments", label: "Подразделения и регионы", href: "/organization/departments", capability: "organization.read", status: "foundation" },
    ]},
    { id: "management", label: "Работа компании", items: [
      { id: "processes", label: "Рабочие процессы", href: "/organization/processes", capability: "workflow.manage", status: "foundation" },
      { id: "sla", label: "SLA и эскалации", href: "/organization/sla", capability: "workflow.manage", status: "foundation" },
      { id: "company-kpi", label: "KPI и мотивация", href: "/organization/kpi", capability: "organization.kpi.manage", status: "foundation" },
      { id: "substitutions", label: "Замещения", href: "/organization/substitutions", capability: "organization.read", status: "foundation" },
    ]},
  ]},
  { id: "admin", label: "Администрирование", icon: "settings", groups: [
    { id: "access", label: "Доступ", items: [
      { id: "users-access", label: "Пользователи и права", href: "/admin/access", capability: "admin.permissions.manage" },
    ]},
    { id: "settings", label: "Настройки", items: [
      { id: "directories", label: "Справочники", href: "/admin/directories", capability: "admin.permissions.manage" },
      { id: "company-modules", label: "Модули компании", href: "/admin/modules", capability: "admin.modules.manage", status: "foundation" },
      { id: "integrations", label: "Интеграции", href: "/admin/integrations", capability: "admin.integrations.manage", status: "foundation" },
      { id: "document-templates", label: "Шаблоны документов", href: "/admin/document-templates", capability: "admin.modules.manage", status: "foundation" },
      { id: "legal-entities", label: "Юридические лица", href: "/admin/legal-entities", capability: "admin.modules.manage", status: "foundation" },
    ]},
  ]},
];

export function flattenNavigation(manifest = navigationManifest) {
  return manifest.flatMap((section) => section.groups.flatMap((group) => group.items.map((item) => ({
    ...item,
    sectionId: section.id,
    sectionLabel: section.label,
    groupId: group.id,
    groupLabel: group.label,
  }))));
}

export function filterNavigation(manifest, access, options = {}) {
  const showFoundations = options.showFoundations === true;
  return manifest
    .map((section) => ({
      ...section,
      groups: section.groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => (
            (item.status === "foundation" && showFoundations)
            || (item.status !== "foundation" && (!item.capability || hasCapability(access, item.capability)))
          )),
        }))
        .filter((group) => group.items.length > 0),
    }))
    .filter((section) => section.groups.length > 0);
}
