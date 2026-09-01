export const organizationUnitLabels = {
  company: "Компания",
  department: "Подразделение",
  region: "Регион",
  branch: "Филиал",
  direction: "Направление",
  team: "Команда",
  project_group: "Проектная группа",
};

export const organizationTemplates = {
  recruiting: {
    label: "Рекрутинг",
    units: ["Руководство", "Коммерция", "Рекрутинг", "Клиентский сервис", "Финансы"],
  },
  staffing: {
    label: "Staffing",
    units: ["Руководство", "Продажи", "Подбор", "Оформление", "Операции", "Табели", "Финансы"],
  },
  production: {
    label: "Производственный аутсорсинг",
    units: ["Руководство", "Коммерция", "Экономика", "Подбор", "Операции", "Объекты", "Логистика", "Обеспечение", "Финансы"],
  },
};

export function buildOrganizationTree(units) {
  const nodes = new Map(units.map((unit) => [unit.id, { ...unit, children: [] }]));
  const roots = [];
  for (const unit of nodes.values()) {
    const parent = unit.parentId ? nodes.get(unit.parentId) : null;
    if (parent) parent.children.push(unit);
    else roots.push(unit);
  }
  const sort = (items) => items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"));
  for (const unit of nodes.values()) sort(unit.children);
  return sort(roots);
}

export function inheritedAccessSources({ legacy = [], position = [], roles = [], overrides = [] }) {
  const result = new Map();
  for (const source of [...legacy, ...position, ...roles]) {
    const item = result.get(source.capability) ?? { capability: source.capability, allow: [], denied: false };
    if (source.effect === "deny") item.denied = true;
    else item.allow.push({ scopeType: source.scopeType, scopeIds: source.scopeIds ?? [], source: source.source });
    result.set(source.capability, item);
  }
  for (const override of overrides) {
    if (override.effect === "inherit") continue;
    result.set(override.capability, {
      capability: override.capability,
      allow: override.effect === "allow" ? [{ scopeType: override.scopeType, scopeIds: override.scopeIds ?? [], source: "individual" }] : [],
      denied: override.effect === "deny",
    });
  }
  return [...result.values()];
}
