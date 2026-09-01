"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BriefcaseBusiness, Building2, ChevronDown, ChevronRight, CircleUserRound, Focus, FolderTree, Globe2, Maximize2, Minus, Network, Plus, Search, Users, UsersRound, X } from "lucide-react";
import { buildOrganizationTree, organizationUnitLabels } from "@/lib/core/organization.mjs";
import type { CompanyEmployeeRow, OrganizationUnitRow, PositionAssignmentRow, StaffPositionRow } from "@/lib/organization/types";

type TreeUnit = OrganizationUnitRow & { children: TreeUnit[] };
type Selection = { type: "unit" | "position" | "employee"; id: string };
type DetailTab = "overview" | "assignments" | "access" | "history";
const initials = (name: string) => name.split(" ").map((part) => part[0]).join("").slice(0, 2);

function UnitIcon({ kind, size = 16 }: { kind: OrganizationUnitRow["kind"]; size?: number }) {
  if (kind === "company") return <Building2 size={size} />;
  if (kind === "region" || kind === "branch") return <Globe2 size={size} />;
  if (kind === "team" || kind === "object_team" || kind === "project_group") return <UsersRound size={size} />;
  return <FolderTree size={size} />;
}

export function OrganizationChart({ units, employees, staffPositions, assignments }: { units: OrganizationUnitRow[]; employees: CompanyEmployeeRow[]; staffPositions: StaffPositionRow[]; assignments: PositionAssignmentRow[] }) {
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const [view, setView] = useState<"units" | "positions">(() => typeof window !== "undefined" && new URL(window.location.href).searchParams.get("mode") === "positions" ? "positions" : "units");
  const [query, setQuery] = useState(() => typeof window === "undefined" ? "" : new URL(window.location.href).searchParams.get("q") ?? "");
  const [kind, setKind] = useState("all");
  const [region, setRegion] = useState(() => typeof window === "undefined" ? "all" : new URL(window.location.href).searchParams.get("region") ?? "all");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [layout, setLayout] = useState<"compact" | "wide">(() => typeof window !== "undefined" && new URL(window.location.href).searchParams.get("layout") === "wide" ? "wide" : "compact");
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
    const url = new URL(window.location.href); url.searchParams.set("mode", view);
    if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
    if (region !== "all") url.searchParams.set("region", region); else url.searchParams.delete("region");
    if (layout === "wide") url.searchParams.set("layout", "wide"); else url.searchParams.delete("layout");
    if (selection) { url.searchParams.set("selected", selection.id); url.searchParams.set("selectedType", selection.type); } else { url.searchParams.delete("selected"); url.searchParams.delete("selectedType"); }
    window.history.replaceState(null, "", url);
  }, [view, query, region, layout, selection]);

  const employeeMatches = (employee: CompanyEmployeeRow) => !normalized || [employee.name, employee.position, employee.primaryStaffPosition, employee.orgUnit, ...employee.roles.map((role) => role.name), ...employee.responsibilities].join(" ").toLowerCase().includes(normalized);
  const unitHasIssue = (unit: OrganizationUnitRow) => unit.kind !== "company" && (!unit.managerMembershipId || Number(unit.vacancyCount ?? 0) > 0);
  const unitVisible = (unit: TreeUnit): boolean => {
    const own = (!normalized || unit.name.toLowerCase().includes(normalized) || employees.some((employee) => employee.orgUnitId === unit.id && employeeMatches(employee))) && (kind === "all" || unit.kind === kind) && (region === "all" || unit.region === region) && (!issuesOnly || unitHasIssue(unit));
    return own || unit.children.some(unitVisible);
  };
  const selectedPath = useMemo(() => {
    const result = new Set<string>();
    let id = selection?.type === "unit" ? selection.id : selection?.type === "employee" ? employees.find((item) => item.id === selection.id)?.orgUnitId : selection?.type === "position" ? staffPositions.find((item) => item.id === selection.id)?.orgUnitId : null;
    while (id) { result.add(id); id = units.find((item) => item.id === id)?.parentId ?? null; }
    return result;
  }, [selection, employees, staffPositions, units]);

  function select(next: Selection) {
    setSelection(next); setDetailTab("overview");
    const unitId = next.type === "unit" ? next.id : next.type === "employee" ? employees.find((item) => item.id === next.id)?.orgUnitId : staffPositions.find((item) => item.id === next.id)?.orgUnitId;
    if (unitId) { const ancestors = new Set<string>(); let current = units.find((item) => item.id === unitId); while (current) { ancestors.add(current.id); current = units.find((item) => item.id === current?.parentId); } setCollapsed((value) => new Set([...value].filter((id) => !ancestors.has(id)))); }
    requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector(`[data-node-id="${next.id}"]`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" })));
  }
  function toggle(id: string) { setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function fitToScreen() {
    const element = viewport.current; const canvas = element?.querySelector<HTMLElement>(".org-chart-canvas"); if (!element || !canvas) return;
    const ratio = Math.min(1, (element.clientWidth - 64) / Math.max(canvas.scrollWidth, 1), (element.clientHeight - 64) / Math.max(canvas.scrollHeight, 1)); const next = Math.max(0.5, Number(ratio.toFixed(2))); setZoom(next);
    requestAnimationFrame(() => element.scrollTo({ left: Math.max(0, (canvas.scrollWidth * next - element.clientWidth) / 2), top: 0, behavior: "smooth" }));
  }
  function focusSearchResult() {
    if (!normalized) return;
    const unit = units.find((item) => item.name.toLowerCase().includes(normalized)); const employee = employees.find(employeeMatches); const position = staffPositions.find((item) => [item.code, item.name, item.jobProfile, item.orgUnit].join(" ").toLowerCase().includes(normalized));
    const next = view === "units" ? unit ? { type: "unit" as const, id: unit.id } : employee ? { type: "employee" as const, id: employee.id } : null : position ? { type: "position" as const, id: position.id } : null;
    if (next) { select(next); requestAnimationFrame(() => document.querySelector(`[data-node-id="${next.id}"]`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" })); }
  }
  function startPan(event: React.PointerEvent<HTMLDivElement>) { if (event.button !== 0 || (event.target as HTMLElement).closest("button,input,select,a")) return; const element = viewport.current; if (!element) return; drag.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop }; setPanning(true); element.setPointerCapture(event.pointerId); }
  function movePan(event: React.PointerEvent<HTMLDivElement>) { const element = viewport.current; const origin = drag.current; if (!element || !origin) return; element.scrollLeft = origin.left - (event.clientX - origin.x); element.scrollTop = origin.top - (event.clientY - origin.y); }
  function endPan(event: React.PointerEvent<HTMLDivElement>) { drag.current = null; setPanning(false); if (viewport.current?.hasPointerCapture(event.pointerId)) viewport.current.releasePointerCapture(event.pointerId); }

  function renderUnit(unit: TreeUnit): React.ReactNode {
    if (!unitVisible(unit)) return null;
    const members = employees.filter((item) => item.orgUnitId === unit.id && employeeMatches(item)); const unitPositions = staffPositions.filter((item) => item.orgUnitId === unit.id); const vacancy = unitPositions.reduce((sum, item) => sum + item.open, 0); const closed = collapsed.has(unit.id); const selected = selection?.type === "unit" && selection.id === unit.id; const showEmployees = selected || (selection?.type === "employee" && members.some((item) => item.id === selection.id)) || Boolean(normalized); const visibleChildren = unit.children.filter(unitVisible); const compactChildren = layout === "compact" && visibleChildren.length > 4;
    return <li key={unit.id} className={`org-tree-node ${selectedPath.has(unit.id) ? "on-path" : ""}`}>
      <article className={`org-unit-card kind-${unit.kind} ${selected ? "selected" : ""} ${selectedPath.has(unit.id) && !selected ? "path-card" : ""}`} data-node-id={unit.id}>
        <div className="org-node-heading"><span className="org-node-symbol"><UnitIcon kind={unit.kind} /></span><div><span className="org-node-type">{organizationUnitLabels[unit.kind] ?? unit.kind}</span><button type="button" className="org-node-title" onClick={() => select({ type: "unit", id: unit.id })}>{unit.name}</button></div>{unitHasIssue(unit) && <AlertTriangle className="org-node-issue" size={14} aria-label="Есть структурная проблема" />}</div>
        <button type="button" className="org-node-manager" onClick={() => select({ type: "unit", id: unit.id })}>{unit.manager ? <span className="org-manager-avatar" aria-hidden="true">{initials(unit.manager)}</span> : <CircleUserRound size={18} />}<span><small>Руководитель</small>{unit.manager ?? "Не назначен"}</span></button>
        <footer><span><strong>{unit.employeeCount}</strong> человек</span><span><strong>{unitPositions.length}</strong> в штате</span><span className={vacancy ? "warn" : ""}><strong>{vacancy}</strong> вакантно</span></footer>
        {(unit.children.length > 0 || members.length > 0) && <button type="button" className="org-branch-toggle" onClick={() => toggle(unit.id)} aria-label={`${closed ? "Развернуть" : "Свернуть"} ${unit.name}`} aria-expanded={!closed}>{closed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{closed && <span>{unit.children.length + members.length}</span>}</button>}
      </article>
      {!closed && showEmployees && members.length > 0 && <div className="org-unit-employees">{members.map((employee) => <button type="button" data-node-id={employee.id} className={`org-person-card ${selection?.type === "employee" && selection.id === employee.id ? "selected" : ""}`} key={employee.id} onClick={() => select({ type: "employee", id: employee.id })}><span className="avatar">{initials(employee.name)}</span><span><strong>{employee.name}</strong><small>{employee.primaryStaffPosition ?? employee.position ?? "Позиция не назначена"}</small></span>{(employee.additionalAssignments ?? employee.roles.length) > 0 && <i title="Дополнительные назначения и роли">{(employee.additionalAssignments ?? 0) + employee.roles.length}</i>}</button>)}</div>}
      {!closed && visibleChildren.length > 0 && <ul className={compactChildren ? "org-compact-children" : ""} data-children={visibleChildren.length}>{visibleChildren.map(renderUnit)}</ul>}
    </li>;
  }

  const filteredPositions = staffPositions.filter((item) => (region === "all" || item.region === region) && (!normalized || [item.code, item.name, item.jobProfile, item.orgUnit].join(" ").toLowerCase().includes(normalized)) && (!issuesOnly || item.open > 0 || (!item.reportsToPositionId && item.level > 0)));
  const noResults = view === "units" ? !roots.some(unitVisible) : filteredPositions.length === 0;
  return <div className="org-chart-workspace">
    <div className="org-chart-toolbar">
      <div className="org-view-switch" role="tablist" aria-label="Режим оргструктуры"><button type="button" role="tab" aria-selected={view === "units"} className={view === "units" ? "active" : ""} onClick={() => setView("units")}>Подразделения</button><button type="button" role="tab" aria-selected={view === "positions"} className={view === "positions" ? "active" : ""} onClick={() => setView("positions")}>Штат и назначения</button></div>
      <label className="toolbar-search"><Search size={15} /><span className="sr-only">Поиск в структуре</span><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") focusSearchResult(); }} placeholder={view === "units" ? "Подразделение, сотрудник или роль" : "Код, профиль или позиция"} /></label>
      <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Тип узла" disabled={view === "positions"}><option value="all">Все типы</option>{Object.entries(organizationUnitLabels).filter(([key]) => key !== "company").map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      <select value={region} onChange={(event) => setRegion(event.target.value)} aria-label="Регион"><option value="all">Все регионы</option>{regions.map((item) => <option key={item}>{item}</option>)}</select>
      <button type="button" className={`button compact ${issuesOnly ? "active-filter" : ""}`} onClick={() => setIssuesOnly((value) => !value)} aria-pressed={issuesOnly}><AlertTriangle size={14} />Проблемы</button>
      {view === "units" && <button type="button" className="button compact org-layout-toggle" onClick={() => setLayout((value) => value === "compact" ? "wide" : "compact")} aria-pressed={layout === "compact"} title={layout === "compact" ? "Показать классическую широкую схему" : "Собрать крупные ветки компактно"}><Network size={14} />{layout === "compact" ? "Компактно" : "Широко"}</button>}
      <div className="org-zoom" aria-label="Масштаб"><button type="button" onClick={() => setZoom((value) => Math.max(0.5, Number((value - 0.1).toFixed(2))))} aria-label="Уменьшить"><Minus size={14} /></button><span>{Math.round(zoom * 100)}%</span><button type="button" onClick={() => setZoom((value) => Math.min(1.5, Number((value + 0.1).toFixed(2))))} aria-label="Увеличить"><Plus size={14} /></button></div>
      <button type="button" className="icon-button" onClick={fitToScreen} aria-label="Вместить структуру в экран" title="Вместить в экран"><Maximize2 size={15} /></button><button type="button" className="icon-button" onClick={() => setCollapsed(new Set(units.filter((unit) => unit.parentId).map((unit) => unit.id)))} aria-label="Свернуть все ветки" title="Свернуть все"><Network size={15} /></button><button type="button" className="icon-button" onClick={() => { setCollapsed(new Set()); if (selection) requestAnimationFrame(() => document.querySelector(`[data-node-id="${selection.id}"]`)?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" })); }} aria-label="Развернуть и показать выбранный узел" title="Показать выбранное"><Focus size={15} /></button>
    </div>
    <div className={`org-chart-viewport ${panning ? "is-panning" : ""}`} ref={viewport} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} aria-label="Интерактивная схема организации">
      <div className="org-canvas-hint"><span>Перетаскивайте свободную область для навигации</span><b>{view === "units" ? `${units.length} узлов` : `${filteredPositions.length} штатных позиций`}</b></div>
      <div className="org-chart-canvas" style={{ transform: `scale(${zoom})` }}>{view === "units" ? <ul className="org-tree-root">{roots.map(renderUnit)}</ul> : <PositionTree positions={filteredPositions} assignments={assignments} employees={employees} selection={selection} onSelect={select} />}</div>
      {noResults && <div className="org-no-results"><Users size={24} /><strong>В этой области ничего не найдено</strong><span>Измените запрос или снимите часть фильтров.</span></div>}
    </div>
    {selection && <OrganizationDrawer selection={selection} units={units} employees={employees} positions={staffPositions} assignments={assignments} tab={detailTab} onTab={setDetailTab} onClose={() => setSelection(null)} />}
  </div>;
}

function PositionTree({ positions, assignments, employees, selection, onSelect }: { positions: StaffPositionRow[]; assignments: PositionAssignmentRow[]; employees: CompanyEmployeeRow[]; selection: Selection | null; onSelect: (selection: Selection) => void }) {
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const grouped = useMemo(() => { const units = new Map<string, Map<string, StaffPositionRow[]>>(); for (const position of positions) { if (!units.has(position.orgUnit)) units.set(position.orgUnit, new Map()); const profiles = units.get(position.orgUnit)!; if (!profiles.has(position.jobProfile)) profiles.set(position.jobProfile, []); profiles.get(position.jobProfile)!.push(position); } return [...units.entries()].map(([unit, profiles]) => ({ unit, profiles: [...profiles.entries()].map(([profile, seats]) => ({ profile, seats })) })); }, [positions]);
  const toggle = (id: string) => setClosed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return <ul className="org-tree-root position-tree">{grouped.map((group) => { const unitKey = `unit:${group.unit}`; const seatCount = group.profiles.reduce((sum, profile) => sum + profile.seats.length, 0); const vacancyCount = group.profiles.flatMap((profile) => profile.seats).reduce((sum, seat) => sum + seat.open, 0); return <li className="org-tree-node position-unit-node" key={group.unit}>
    <article className="org-position-unit-card"><div className="org-node-heading"><span className="org-node-symbol"><FolderTree size={16} /></span><div><span className="org-node-type">Организационная единица</span><strong>{group.unit}</strong></div></div><footer><span><strong>{group.profiles.length}</strong> профилей</span><span><strong>{seatCount}</strong> позиций</span><span className={vacancyCount ? "warn" : ""}><strong>{vacancyCount}</strong> вакансий</span></footer><button type="button" className="org-branch-toggle" onClick={() => toggle(unitKey)} aria-label={`${closed.has(unitKey) ? "Развернуть" : "Свернуть"} ${group.unit}`}>{closed.has(unitKey) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button></article>
    {!closed.has(unitKey) && <ul>{group.profiles.map((profile) => { const profileKey = `${unitKey}:${profile.profile}`; const occupied = profile.seats.reduce((sum, seat) => sum + seat.occupied, 0); const capacity = profile.seats.reduce((sum, seat) => sum + seat.capacity, 0); return <li className="org-tree-node profile-node" key={profile.profile}>
      <article className="org-profile-card"><div className="org-node-heading"><span className="org-node-symbol"><BriefcaseBusiness size={15} /></span><div><span className="org-node-type">Профиль должности</span><strong>{profile.profile}</strong></div></div><footer><span><strong>{profile.seats.length}</strong> позиций</span><span><strong>{occupied}/{capacity}</strong> занято</span></footer><button type="button" className="org-branch-toggle" onClick={() => toggle(profileKey)} aria-label={`${closed.has(profileKey) ? "Развернуть" : "Свернуть"} ${profile.profile}`}>{closed.has(profileKey) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button></article>
      {!closed.has(profileKey) && <ul>{profile.seats.map((position) => { const holders = assignments.filter((item) => item.staffPositionId === position.id && item.status !== "ended"); const seatKey = `seat:${position.id}`; return <li className="org-tree-node seat-node" key={position.id}>
        <article data-node-id={position.id} className={`org-position-card ${selection?.type === "position" && selection.id === position.id ? "selected" : ""}`}><button type="button" className="org-seat-main" onClick={() => onSelect({ type: "position", id: position.id })}><span className="org-node-type">Штатная позиция · {position.code}</span><strong>{position.name}</strong><small>{position.status === "filled" ? "Занята" : position.status === "open" ? "Открыта" : position.status === "planned" ? "Запланирована" : position.status === "frozen" ? "Заморожена" : "Закрыта"}</small></button><footer><span><strong>{position.occupied}/{position.capacity}</strong> FTE</span>{position.open > 0 && <span className="warn"><strong>{position.open}</strong> свободно</span>}</footer><button type="button" className="org-branch-toggle" onClick={() => toggle(seatKey)} aria-label={`${closed.has(seatKey) ? "Показать" : "Скрыть"} назначения`}>{closed.has(seatKey) ? <ChevronRight size={13} /> : <ChevronDown size={13} />}</button></article>
        {!closed.has(seatKey) && <div className="org-seat-occupants">{holders.map((holder) => { const employee = employees.find((item) => item.id === holder.membershipId); return <button type="button" data-node-id={holder.membershipId} className={`org-person-card ${selection?.type === "employee" && selection.id === holder.membershipId ? "selected" : ""}`} key={holder.id} onClick={() => onSelect({ type: "employee", id: holder.membershipId })}><span className="avatar">{initials(holder.employeeName)}</span><span><strong>{holder.employeeName}</strong><small>{holder.assignmentType === "primary" ? "Основное назначение" : holder.assignmentType === "additional" ? "Дополнительное" : "Исполняет обязанности"} · {holder.fte} FTE</small></span>{employee?.roles.length ? <i>{employee.roles.length}</i> : null}</button>; })}{position.open > 0 && <button type="button" className="org-vacancy-card" onClick={() => onSelect({ type: "position", id: position.id })}><Plus size={14} /><span><strong>{position.open === 1 ? "Вакантная единица" : `${position.open} вакантные единицы`}</strong><small>Назначение отсутствует</small></span></button>}</div>}
      </li>; })}</ul>}
    </li>; })}</ul>}
  </li>; })}</ul>;
}

function OrganizationDrawer({ selection, units, employees, positions, assignments, tab, onTab, onClose }: { selection: Selection; units: OrganizationUnitRow[]; employees: CompanyEmployeeRow[]; positions: StaffPositionRow[]; assignments: PositionAssignmentRow[]; tab: DetailTab; onTab: (tab: DetailTab) => void; onClose: () => void }) {
  const unit = selection.type === "unit" ? units.find((item) => item.id === selection.id) : null; const position = selection.type === "position" ? positions.find((item) => item.id === selection.id) : null; const employee = selection.type === "employee" ? employees.find((item) => item.id === selection.id) : null;
  const title = unit?.name ?? position?.name ?? employee?.name ?? "Элемент структуры"; const subtitle = unit ? organizationUnitLabels[unit.kind] : position ? `Штатная позиция · ${position.code}` : employee?.primaryStaffPosition ?? employee?.position ?? "Сотрудник";
  const positionAssignments = position ? assignments.filter((item) => item.staffPositionId === position.id && item.status !== "ended") : employee ? assignments.filter((item) => item.membershipId === employee.id && item.status !== "ended") : [];
  return <aside className="org-detail-drawer" aria-label={`Контекст: ${title}`}><header><div>{employee ? <span className="avatar large">{initials(employee.name)}</span> : position ? <BriefcaseBusiness size={20} /> : unit ? <UnitIcon kind={unit.kind} size={20} /> : <Network size={20} />}<span><strong>{title}</strong><small>{subtitle}</small></span></div><button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть панель"><X size={16} /></button></header>
    <nav className="drawer-tabs" aria-label="Разделы карточки">{(["overview", "assignments", "access", "history"] as DetailTab[]).map((item) => <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => onTab(item)}>{item === "overview" ? "Обзор" : item === "assignments" ? "Назначения" : item === "access" ? "Доступ" : "История"}</button>)}</nav>
    {tab === "overview" && <><dl>{unit && <><Fact label="Родитель" value={units.find((item) => item.id === unit.parentId)?.name ?? "Верхний уровень"} /><Fact label="Руководитель" value={unit.manager ?? "Не назначен"} /><Fact label="Регион" value={unit.region ?? "Вся компания"} /><Fact label="Сотрудники" value={String(unit.employeeCount)} /><Fact label="Штат / вакансии" value={`${unit.staffPositionCount ?? positions.filter((item) => item.orgUnitId === unit.id).length} / ${unit.vacancyCount ?? positions.filter((item) => item.orgUnitId === unit.id).reduce((sum, item) => sum + item.open, 0)}`} /></>}{position && <><Fact label="Профиль" value={position.jobProfile} /><Fact label="Подразделение" value={position.orgUnit} /><Fact label="Руководящая позиция" value={position.reportsToPosition ?? "Верхний уровень"} /><Fact label="Занятость" value={`${position.occupied} из ${position.capacity}`} /><Fact label="Срок действия" value={`${position.effectiveFrom} — ${position.effectiveTo ?? "бессрочно"}`} /></>}{employee && <><Fact label="Подразделение" value={employee.orgUnit ?? "Не назначено"} /><Fact label="Регион" value={employee.region ?? "Вся компания"} /><Fact label="Руководитель" value={employee.manager ?? "Не назначен"} /><Fact label="Статус" value={employee.status === "active" ? "Активен" : employee.status === "invited" ? "Приглашён" : "Неактивен"} /></>}</dl>{unit && !unit.managerMembershipId && <div className="drawer-warning"><AlertTriangle size={16} /><span><strong>Не назначен руководитель</strong><small>Маршрутизация задач и эскалаций для этой ветки может быть неполной.</small></span></div>}{employee && <><section><h3>Процессные роли</h3><div className="tag-list">{employee.roles.length ? employee.roles.map((role) => <span key={role.id}>{role.name}</span>) : <span>Роли не назначены</span>}</div></section><section><h3>Ответственность</h3>{employee.responsibilities.length ? <ul>{employee.responsibilities.map((item) => <li key={item}>{item}</li>)}</ul> : <p>Фактическая ответственность не назначена.</p>}</section></>}</>}
    {tab === "assignments" && <section><h3>{unit ? "Состав выбранной единицы" : "Действующие назначения"}</h3>{unit ? <div className="drawer-list">{employees.filter((item) => item.orgUnitId === unit.id).map((item) => <div key={item.id}><strong>{item.name}</strong><small>{item.primaryStaffPosition ?? item.position ?? "Без позиции"}</small></div>)}</div> : positionAssignments.length ? <div className="drawer-list">{positionAssignments.map((item) => <div key={item.id}><strong>{item.employeeName}</strong><small>{item.assignmentType === "primary" ? "Основное" : item.assignmentType === "additional" ? "Дополнительное" : "И. о."} · {item.fte} FTE · с {item.effectiveFrom}</small></div>)}</div> : <p>Действующих назначений нет.</p>}</section>}
    {tab === "access" && <section><h3>Источник и область доступа</h3><p>{employee ? "Итоговые права складываются из должностного профиля, процессных ролей и индивидуальных исключений. Подробное происхождение доступно в реестре сотрудников." : position ? "Базовые capabilities задаются должностным профилем и дополняются процессными ролями сотрудника." : "Область подразделения используется capability-resolver и правилами ответственности."}</p></section>}
    {tab === "history" && <section><h3>История изменений</h3><p>Структурные изменения фиксируются с автором, датой и значениями до и после. В демонстрационном наборе история не изменяется.</p></section>}
  </aside>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
