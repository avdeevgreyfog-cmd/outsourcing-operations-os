"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, ChevronDown, ChevronRight, Focus, Maximize2, Minus, Network, Plus, Search, Users, X } from "lucide-react";
import { buildOrganizationTree, organizationUnitLabels } from "@/lib/core/organization.mjs";
import type { CompanyEmployeeRow, OrganizationUnitRow, PositionAssignmentRow, StaffPositionRow } from "@/lib/organization/types";

type TreeUnit = OrganizationUnitRow & { children: TreeUnit[] };
type Selection = { type: "unit" | "position" | "employee"; id: string };
type DetailTab = "overview" | "assignments" | "access" | "history";
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2);

export function OrganizationChart({ units, employees, staffPositions, assignments }: { units: OrganizationUnitRow[]; employees: CompanyEmployeeRow[]; staffPositions: StaffPositionRow[]; assignments: PositionAssignmentRow[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<"units" | "positions">(() => typeof window !== "undefined" && new URL(window.location.href).searchParams.get("mode") === "positions" ? "positions" : "units");
  const [query, setQuery] = useState(() => typeof window === "undefined" ? "" : new URL(window.location.href).searchParams.get("q") ?? "");
  const [kind, setKind] = useState("all");
  const [region, setRegion] = useState(() => typeof window === "undefined" ? "all" : new URL(window.location.href).searchParams.get("region") ?? "all");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selection, setSelection] = useState<Selection | null>(() => {
    if (typeof window === "undefined") return null;
    const params = new URL(window.location.href).searchParams; const id = params.get("selected"); const type = params.get("selectedType");
    return id && (type === "unit" || type === "position" || type === "employee") ? { id, type } : null;
  });
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const roots = useMemo(() => buildOrganizationTree(units) as TreeUnit[], [units]);
  const regions = [...new Set(units.map((item) => item.region).filter(Boolean))] as string[];
  const normalized = query.trim().toLowerCase();

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", view);
    if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
    if (region !== "all") url.searchParams.set("region", region); else url.searchParams.delete("region");
    if (selection) { url.searchParams.set("selected", selection.id); url.searchParams.set("selectedType", selection.type); }
    else { url.searchParams.delete("selected"); url.searchParams.delete("selectedType"); }
    window.history.replaceState(null, "", url);
  }, [view, query, region, selection]);

  const employeeMatches = (employee: CompanyEmployeeRow) => !normalized || [employee.name, employee.position, employee.primaryStaffPosition, employee.orgUnit, ...employee.roles.map((role) => role.name), ...employee.responsibilities].join(" ").toLowerCase().includes(normalized);
  const unitHasIssue = (unit: OrganizationUnitRow) => unit.kind !== "company" && (!unit.managerMembershipId || Number(unit.vacancyCount ?? 0) > 0);
  const unitVisible = (unit: TreeUnit): boolean => {
    const own = (!normalized || unit.name.toLowerCase().includes(normalized) || employees.some((employee) => employee.orgUnitId === unit.id && employeeMatches(employee)))
      && (kind === "all" || unit.kind === kind) && (region === "all" || unit.region === region) && (!issuesOnly || unitHasIssue(unit));
    return own || unit.children.some(unitVisible);
  };

  function select(next: Selection) {
    setSelection(next); setDetailTab("overview");
    if (next.type === "unit") {
      const ancestors = new Set<string>(); let current = units.find((item) => item.id === next.id);
      while (current?.parentId) { ancestors.add(current.parentId); current = units.find((item) => item.id === current?.parentId); }
      setCollapsed((value) => new Set([...value].filter((id) => !ancestors.has(id))));
    }
  }
  function toggle(id: string) { setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function fitToScreen() {
    const element = viewport.current; if (!element) return;
    const canvas = element.querySelector<HTMLElement>(".org-chart-canvas"); if (!canvas) return;
    const ratio = Math.min(1, (element.clientWidth - 40) / Math.max(canvas.scrollWidth, 1), (element.clientHeight - 40) / Math.max(canvas.scrollHeight, 1));
    setZoom(Math.max(0.55, Number(ratio.toFixed(2)))); element.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  }

  function renderUnit(unit: TreeUnit): React.ReactNode {
    if (!unitVisible(unit)) return null;
    const members = employees.filter((item) => item.orgUnitId === unit.id && employeeMatches(item));
    const unitPositions = staffPositions.filter((item) => item.orgUnitId === unit.id);
    const vacancy = unitPositions.reduce((sum, item) => sum + item.open, 0);
    const closed = collapsed.has(unit.id);
    const showEmployees = selection?.type === "unit" && selection.id === unit.id || Boolean(normalized);
    return <li key={unit.id} className="org-tree-node">
      <div className={`org-unit-card ${selection?.type === "unit" && selection.id === unit.id ? "selected" : ""}`} data-node-id={unit.id}>
        <button type="button" className="org-unit-toggle" onClick={() => toggle(unit.id)} aria-label={`${closed ? "Развернуть" : "Свернуть"} ${unit.name}`} aria-expanded={!closed}>{closed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>
        <button type="button" className="org-node-main" onClick={() => select({ type: "unit", id: unit.id })}><span>{organizationUnitLabels[unit.kind] ?? unit.kind}</span><strong>{unit.name}</strong><small>{unit.manager ? `Руководитель: ${unit.manager}` : "Руководитель не назначен"}</small><div className="org-card-metrics"><b>{unit.employeeCount} сотрудников</b><b>{unitPositions.length} позиций</b>{vacancy > 0 && <b className="warn">{vacancy} вакансий</b>}</div></button>
        {unitHasIssue(unit) && <AlertTriangle className="org-node-issue" size={14} aria-label="Есть структурная проблема" />}
      </div>
      {showEmployees && members.length > 0 && <div className="org-unit-employees">{members.map((employee) => <button type="button" className={`org-person-card ${selection?.type === "employee" && selection.id === employee.id ? "selected" : ""}`} key={employee.id} onClick={() => select({ type: "employee", id: employee.id })}><span className="avatar">{initials(employee.name)}</span><span><strong>{employee.name}</strong><small>{employee.primaryStaffPosition ?? employee.position ?? "Позиция не назначена"}</small></span>{(employee.additionalAssignments ?? employee.roles.length) > 0 && <i title="Дополнительные назначения и роли">{(employee.additionalAssignments ?? 0) + employee.roles.length}</i>}</button>)}</div>}
      {!closed && unit.children.length > 0 && <ul>{unit.children.map(renderUnit)}</ul>}
    </li>;
  }

  const filteredPositions = staffPositions.filter((item) => (region === "all" || item.region === region) && (!normalized || [item.code, item.name, item.jobProfile, item.orgUnit].join(" ").toLowerCase().includes(normalized)) && (!issuesOnly || item.open > 0 || (!item.reportsToPositionId && item.level > 0)));
  return <div className="org-chart-workspace">
    <div className="org-chart-toolbar">
      <div className="org-view-switch" role="tablist" aria-label="Режим оргструктуры"><button type="button" role="tab" aria-selected={view === "units"} className={view === "units" ? "active" : ""} onClick={() => setView("units")}>Организационные единицы</button><button type="button" role="tab" aria-selected={view === "positions"} className={view === "positions" ? "active" : ""} onClick={() => setView("positions")}>Штатные позиции</button></div>
      <label className="toolbar-search"><Search size={15} /><span className="sr-only">Поиск в структуре</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={view === "units" ? "Подразделение, сотрудник или роль" : "Код, профиль или позиция"} /></label>
      <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Тип узла" disabled={view === "positions"}><option value="all">Все типы</option>{Object.entries(organizationUnitLabels).filter(([key]) => key !== "company").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      <select value={region} onChange={(event) => setRegion(event.target.value)} aria-label="Регион"><option value="all">Все регионы</option>{regions.map((item) => <option key={item}>{item}</option>)}</select>
      <button type="button" className={`button compact ${issuesOnly ? "active-filter" : ""}`} onClick={() => setIssuesOnly((value) => !value)} aria-pressed={issuesOnly}><AlertTriangle size={14} />Проблемы</button>
      <div className="org-zoom"><button type="button" onClick={() => setZoom((value) => Math.max(0.5, value - 0.1))} aria-label="Уменьшить"><Minus size={14} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(1.5, value + 0.1))} aria-label="Увеличить"><Plus size={14} /></button><button type="button" onClick={fitToScreen} aria-label="Вместить в экран"><Maximize2 size={14} /></button></div>
      <button type="button" className="icon-button" onClick={() => setCollapsed(new Set(units.filter((unit) => unit.parentId).map((unit) => unit.id)))} aria-label="Свернуть все ветки"><Network size={15} /></button>
      <button type="button" className="icon-button" onClick={() => { setCollapsed(new Set()); if (selection?.type === "unit") document.querySelector(`[data-node-id="${selection.id}"]`)?.scrollIntoView({ block: "center", inline: "center" }); }} aria-label="Развернуть выбранную ветку"><Focus size={15} /></button>
    </div>
    <div className="org-chart-viewport" ref={viewport}><div className="org-chart-canvas" style={{ transform: `scale(${zoom})` }}>{view === "units" ? <ul className="org-tree-root">{roots.map(renderUnit)}</ul> : <PositionTree positions={filteredPositions} assignments={assignments} employees={employees} selection={selection} onSelect={select} />}</div>{((view === "units" && !roots.some(unitVisible)) || (view === "positions" && filteredPositions.length === 0)) && <div className="org-no-results"><Users size={24} /><strong>Ничего не найдено</strong><span>Снимите часть фильтров или измените запрос.</span></div>}</div>
    {selection && <OrganizationDrawer selection={selection} units={units} employees={employees} positions={staffPositions} assignments={assignments} tab={detailTab} onTab={setDetailTab} onClose={() => setSelection(null)} />}
  </div>;
}

function PositionTree({ positions, assignments, employees, selection, onSelect }: { positions: StaffPositionRow[]; assignments: PositionAssignmentRow[]; employees: CompanyEmployeeRow[]; selection: Selection | null; onSelect: (selection: Selection) => void }) {
  const nodes = new Map(positions.map((position) => [position.id, { ...position, children: [] as StaffPositionRow[] }])); const roots: Array<StaffPositionRow & { children: StaffPositionRow[] }> = [];
  for (const node of nodes.values()) { const parent = node.reportsToPositionId ? nodes.get(node.reportsToPositionId) : null; if (parent) parent.children.push(node); else roots.push(node); }
  const render = (position: StaffPositionRow & { children?: StaffPositionRow[] }): React.ReactNode => { const holders = assignments.filter((item) => item.staffPositionId === position.id && item.status !== "ended"); return <li key={position.id} className="org-tree-node"><button type="button" className={`org-position-card ${selection?.type === "position" && selection.id === position.id ? "selected" : ""}`} onClick={() => onSelect({ type: "position", id: position.id })}><BriefcaseBusiness size={15} /><div><span>{position.code}</span><strong>{position.name}</strong><small>{position.orgUnit} · {position.jobProfile}</small><div className="org-card-metrics"><b>{position.occupied}/{position.capacity} занято</b>{position.open > 0 && <b className="warn">{position.open} вакансий</b>}</div></div></button>{holders.length > 0 && <div className="org-unit-employees">{holders.map((holder) => { const employee = employees.find((item) => item.id === holder.membershipId); return <button type="button" className="org-person-card" key={holder.id} onClick={() => onSelect({ type: "employee", id: holder.membershipId })}><span className="avatar">{initials(holder.employeeName)}</span><span><strong>{holder.employeeName}</strong><small>{holder.assignmentType === "primary" ? "Основное" : holder.assignmentType === "additional" ? "Дополнительное" : "Исполняет обязанности"} · {holder.fte} FTE</small></span>{employee?.roles.length ? <i>{employee.roles.length}</i> : null}</button>; })}</div>}{position.children?.length ? <ul>{position.children.map((child) => render(child as StaffPositionRow & { children: StaffPositionRow[] }))}</ul> : null}</li>; };
  return <ul className="org-tree-root position-tree">{roots.map(render)}</ul>;
}

function OrganizationDrawer({ selection, units, employees, positions, assignments, tab, onTab, onClose }: { selection: Selection; units: OrganizationUnitRow[]; employees: CompanyEmployeeRow[]; positions: StaffPositionRow[]; assignments: PositionAssignmentRow[]; tab: DetailTab; onTab: (tab: DetailTab) => void; onClose: () => void }) {
  const unit = selection.type === "unit" ? units.find((item) => item.id === selection.id) : null; const position = selection.type === "position" ? positions.find((item) => item.id === selection.id) : null; const employee = selection.type === "employee" ? employees.find((item) => item.id === selection.id) : null;
  const title = unit?.name ?? position?.name ?? employee?.name ?? "Элемент структуры"; const subtitle = unit ? organizationUnitLabels[unit.kind] : position ? `Штатная позиция · ${position.code}` : employee?.primaryStaffPosition ?? employee?.position ?? "Сотрудник";
  const positionAssignments = position ? assignments.filter((item) => item.staffPositionId === position.id && item.status !== "ended") : employee ? assignments.filter((item) => item.membershipId === employee.id && item.status !== "ended") : [];
  return <aside className="org-detail-drawer" aria-label={`Контекст: ${title}`}><header><div>{employee ? <span className="avatar large">{initials(employee.name)}</span> : position ? <BriefcaseBusiness size={20} /> : <Network size={20} />}<span><strong>{title}</strong><small>{subtitle}</small></span></div><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть панель"><X size={16} /></button></header>
    <nav className="drawer-tabs" aria-label="Разделы карточки">{(["overview", "assignments", "access", "history"] as DetailTab[]).map((item) => <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => onTab(item)}>{item === "overview" ? "Обзор" : item === "assignments" ? "Назначения" : item === "access" ? "Доступ" : "История"}</button>)}</nav>
    {tab === "overview" && <><dl>{unit && <><Fact label="Родитель" value={units.find((item) => item.id === unit.parentId)?.name ?? "Верхний уровень"} /><Fact label="Руководитель" value={unit.manager ?? "Не назначен"} /><Fact label="Регион" value={unit.region ?? "Вся компания"} /><Fact label="Сотрудники" value={String(unit.employeeCount)} /><Fact label="Штат / вакансии" value={`${unit.staffPositionCount ?? positions.filter((item) => item.orgUnitId === unit.id).length} / ${unit.vacancyCount ?? positions.filter((item) => item.orgUnitId === unit.id).reduce((sum, item) => sum + item.open, 0)}`} /></>}{position && <><Fact label="Профиль" value={position.jobProfile} /><Fact label="Подразделение" value={position.orgUnit} /><Fact label="Руководящая позиция" value={position.reportsToPosition ?? "Верхний уровень"} /><Fact label="Занятость" value={`${position.occupied} из ${position.capacity}`} /><Fact label="Срок действия" value={`${position.effectiveFrom} — ${position.effectiveTo ?? "бессрочно"}`} /></>}{employee && <><Fact label="Подразделение" value={employee.orgUnit ?? "Не назначено"} /><Fact label="Регион" value={employee.region ?? "Вся компания"} /><Fact label="Руководитель" value={employee.manager ?? "Не назначен"} /><Fact label="Статус" value={employee.status === "active" ? "Активен" : employee.status === "invited" ? "Приглашён" : "Неактивен"} /></>}</dl>{unit && !unit.managerMembershipId && <div className="drawer-warning"><AlertTriangle size={16} /><span><strong>Не назначен руководитель</strong><small>Маршрутизация задач и эскалаций для этой ветки может быть неполной.</small></span></div>}{employee && <><section><h3>Процессные роли</h3><div className="tag-list">{employee.roles.length ? employee.roles.map((role) => <span key={role.id}>{role.name}</span>) : <span>Роли не назначены</span>}</div></section><section><h3>Ответственность</h3>{employee.responsibilities.length ? <ul>{employee.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Фактическая ответственность не назначена.</p>}</section></>}</>}
    {tab === "assignments" && <section><h3>{unit ? "Состав выбранной единицы" : "Действующие назначения"}</h3>{unit ? <div className="drawer-list">{employees.filter((item) => item.orgUnitId === unit.id).map((item) => <div key={item.id}><strong>{item.name}</strong><small>{item.primaryStaffPosition ?? item.position ?? "Без позиции"}</small></div>)}</div> : positionAssignments.length ? <div className="drawer-list">{positionAssignments.map((item) => <div key={item.id}><strong>{item.employeeName}</strong><small>{item.assignmentType === "primary" ? "Основное" : item.assignmentType === "additional" ? "Дополнительное" : "И. о."} · {item.fte} FTE · с {item.effectiveFrom}</small></div>)}</div> : <p>Действующих назначений нет.</p>}</section>}
    {tab === "access" && <section><h3>Источник и область доступа</h3><p>{employee ? "Итоговые права складываются из должностного профиля, процессных ролей и индивидуальных исключений. Подробное происхождение доступно в реестре сотрудников." : position ? "Базовые capabilities задаются должностным профилем и дополняются процессными ролями сотрудника." : "Область подразделения используется capability-resolver и правилами ответственности."}</p></section>}
    {tab === "history" && <section><h3>История изменений</h3><p>Структурные изменения фиксируются с автором, датой и значениями до и после. В демонстрационном наборе история не изменяется.</p></section>}
  </aside>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
