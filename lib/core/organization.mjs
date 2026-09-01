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

export function positionOccupancy(position, assignments, onDate = new Date().toISOString().slice(0, 10)) {
  const active = assignments.filter((assignment) => assignment.staffPositionId === position.id
    && assignment.status !== "ended"
    && assignment.effectiveFrom <= onDate
    && (!assignment.effectiveTo || assignment.effectiveTo >= onDate));
  return {
    occupied: active.reduce((sum, assignment) => sum + Number(assignment.fte ?? 1), 0),
    open: Math.max(0, Number(position.capacity) - active.reduce((sum, assignment) => sum + Number(assignment.fte ?? 1), 0)),
  };
}

export function findStructureIssues({ units, staffPositions, assignments }) {
  const issues = [];
  for (const unit of units) {
    if (unit.kind !== "company" && unit.active && !unit.managerMembershipId) {
      issues.push({ id: `unit-manager-${unit.id}`, severity: "warning", entityType: "unit", entityId: unit.id, label: unit.name, message: "Не назначен руководитель подразделения" });
    }
  }
  for (const position of staffPositions) {
    const occupancy = positionOccupancy(position, assignments);
    if (position.status === "open" || occupancy.open > 0) {
      issues.push({ id: `position-open-${position.id}`, severity: "info", entityType: "staff_position", entityId: position.id, label: position.name, message: `Открыто ${occupancy.open || position.capacity} штат. ед.` });
    }
    if (!position.reportsToPositionId && position.level > 0 && position.status !== "closed") {
      issues.push({ id: `position-manager-${position.id}`, severity: "warning", entityType: "staff_position", entityId: position.id, label: position.name, message: "Не задана руководящая позиция" });
    }
  }
  return issues;
}
