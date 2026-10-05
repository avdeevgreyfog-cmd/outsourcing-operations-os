"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3, Filter, Group, Save, ArrowDownUp, X } from "lucide-react";
import { SalesSearch } from "@/components/sales/SalesUI";
import { RegistryColumnControls } from "@/components/registry/RegistryColumnControls";
import { RegistryGroupingControls } from "@/components/registry/RegistryGroupingControls";
import { tenderDecisionLabels, tenderStages } from "@/lib/tenders/model";
import type { TenderOptions, TenderRow } from "@/lib/tenders/service";
import { tenderColumns, defaultTenderSettings, normalizeTenderSettings, normalizeTenderPreferences, tenderPresetSettings, tenderCustomerKey, type TenderRegistrySettings, type TenderSavedView } from "@/lib/tenders/registry";
export { tenderColumns, defaultTenderSettings } from "@/lib/tenders/registry";
export type { TenderColumnId, TenderGroupId, TenderRegistrySettings } from "@/lib/tenders/registry";

export function useTenderRegistryPreferences(scope: string) {
  const [settings, setSettings] = useState<TenderRegistrySettings>(() => normalizeTenderSettings(defaultTenderSettings));
  const [views, setViews] = useState<TenderSavedView[]>([]);
  const [selectedView, setSelectedView] = useState("active");
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const key = `operis.tenders.views.v1:${scope}`;
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let preferences = normalizeTenderPreferences(null);
      try { preferences = normalizeTenderPreferences(JSON.parse(localStorage.getItem(key) ?? "null")); }
      catch { /* Blocked or malformed storage falls back to in-memory preferences. */ }
      setSettings(preferences.settings); setViews(preferences.views); setSelectedView(preferences.selectedView); setHydratedKey(key);
    });
    return () => { cancelled = true; };
  }, [key]);
  useEffect(() => {
    if (hydratedKey !== key) return;
    try { localStorage.setItem(key, JSON.stringify({ settings, views, selectedView })); }
    catch { /* Preferences never block work with tenders. */ }
  }, [key, hydratedKey, settings, views, selectedView]);
  function update(patch: Partial<TenderRegistrySettings>) {
    setSettings(current => normalizeTenderSettings({ ...current, ...patch })); setSelectedView("custom");
  }
  function selectView(id: string) {
    if (id === "custom") return;
    const saved = views.find(view => view.id === id);
    if (!saved && !["active", "completed", "unassigned", "urgent"].includes(id)) return;
    setSelectedView(id);
    if (saved) setSettings(normalizeTenderSettings(saved.settings));
    else setSettings(current => tenderPresetSettings(id, current));
  }
  function saveView(name: string) {
    if (!name.trim()) return;
    const id = `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setViews(current => [...current.slice(-29), { id, name: name.trim().slice(0, 60), settings: normalizeTenderSettings(settings) }]);
    setSelectedView(id);
  }
  function deleteView() { setViews(current => current.filter(view => view.id !== selectedView)); setSelectedView("custom"); }
  return { settings, update, views, selectedView, selectView, saveView, deleteView };
}

type ControlsProps = ReturnType<typeof useTenderRegistryPreferences> & {
  rows: TenderRow[]; options: TenderOptions;
  query: string; onQuery: (query: string) => void; board: boolean; onExpandGroups: () => void;
};
const groupOptions = [{ id: "none", label: "Без группировки" }, { id: "stage", label: "Этап" }, { id: "owner", label: "Ответственный" }, { id: "customer", label: "Заказчик" }, { id: "platform", label: "Площадка" }, { id: "decision", label: "Решение об участии" }] as const;
const deadlineLabels = { all: "Все сроки", today: "Сегодня / просрочено", "3d": "До трёх дней / просрочено", "7d": "До семи дней / просрочено" };

export function TenderRegistryControls({ settings, update, views, selectedView, selectView, saveView, deleteView, rows, options, query, onQuery, board, onExpandGroups }: ControlsProps) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const [name, setName] = useState("");
  const [panel, setPanel] = useState<"filters" | "columns" | "group" | "sort" | "views" | null>(null);
  const closePanel = () => { controlsRef.current?.querySelector<HTMLButtonElement>(".requests-registry-controlbar button[aria-expanded=true]")?.focus(); setPanel(null); };
  const toggle = (value: typeof panel) => setPanel(current => current === value ? null : value);
  const owners = new Map(options.members.map(member => [member.userId, member.name]));
  const customers = new Map(options.clients.map(client => [client.id, client.name]));
  for (const row of rows) {
    if (row.ownerUserId && row.owner) owners.set(row.ownerUserId, row.owner);
    customers.set(tenderCustomerKey(row), row.customer);
  }
  // Options contain names only; avoid inventing a second free-name choice for linked-only customers.
  for (const customer of options.customers) {
    if (!rows.some(row => row.customer === customer)) customers.set(`customer:${customer}`, customer);
  }
  const byLabel = (a: [string, string], b: [string, string]) => a[1].localeCompare(b[1], "ru") || a[0].localeCompare(b[0]);
  const ownerOptions = [...owners].sort(byLabel), customerOptions = [...customers].sort(byLabel);
  const platforms = [...new Set([...options.platforms, ...rows.map(row => row.platform).filter((value): value is string => Boolean(value))])].sort((a, b) => a.localeCompare(b, "ru"));
  const sources = [...new Set([...options.sources, ...rows.map(row => row.sourceName).filter((value): value is string => Boolean(value))])].sort((a, b) => a.localeCompare(b, "ru"));
  const moreFilters = [settings.owner, settings.customer, settings.platform, settings.decision, settings.source].filter(Boolean).length + Number(settings.deadline !== "all") + Number(settings.bucket !== "active");
  const chips = [
    settings.stage && { label: `Этап: ${tenderStages.find(stage => stage.code === settings.stage)?.label ?? "Неизвестный этап"}`, clear: () => update({ stage: "" }) },
    settings.owner && { label: `Ответственный: ${settings.owner === "unassigned" ? "Не назначен" : owners.get(settings.owner) ?? "Не найден"}`, clear: () => update({ owner: "" }) },
    settings.customer && { label: `Заказчик: ${customers.get(settings.customer) ?? "Не найден"}`, clear: () => update({ customer: "" }) },
    settings.platform && { label: `Площадка: ${settings.platform}`, clear: () => update({ platform: "" }) },
    settings.decision && { label: `Решение: ${tenderDecisionLabels[settings.decision] ?? "Неизвестно"}`, clear: () => update({ decision: "" }) },
    settings.source && { label: `Источник: ${settings.source}`, clear: () => update({ source: "" }) },
    settings.deadline !== "all" && { label: `Срок подачи: ${deadlineLabels[settings.deadline]}`, clear: () => update({ deadline: "all" }) },
    settings.bucket === "completed" && { label: "Завершённые", clear: () => update({ bucket: "active", stage: "" }) },
  ].filter((chip): chip is { label: string; clear: () => void } => Boolean(chip));
  return <div ref={controlsRef} className="requests-registry-controls tender-registry-controls" onKeyDown={event => { if (event.key === "Escape" && panel) { event.preventDefault(); closePanel(); } }}>
    <div className="requests-registry-controlbar">
      <div className="requests-registry-primary-controls">
        <SalesSearch value={query} onChange={onQuery} placeholder="Поиск по тендерам"/>
        <label className="requests-stage-choice"><span className="sales-sr-only">Фильтр по этапу</span><select value={settings.stage} onChange={event => update({ stage: event.target.value, ...(event.target.value ? { bucket: event.target.value === "completed" ? "completed" : "active" } : {}) })}>
          <option value="">Все этапы</option>{tenderStages.map(stage => <option key={stage.code} value={stage.code}>{stage.label}</option>)}
        </select></label>
        <button type="button" className="button" aria-expanded={panel === "filters"} aria-controls="tender-registry-options" onClick={() => toggle("filters")}><Filter size={15}/>Фильтры{moreFilters > 0 && <span className="requests-control-count">{moreFilters}</span>}</button>
      </div>
      <div className="requests-registry-secondary-controls">
        <label className="requests-view-choice"><span className="sales-sr-only">Сохранённый вид тендеров</span><select value={selectedView} onChange={event => selectView(event.target.value)}>
          <option value="active">Все активные</option><option value="completed">Завершённые</option><option value="unassigned">Без ответственного</option><option value="urgent">Срок до трёх дней</option>
          {selectedView === "custom" && <option value="custom">Текущие настройки</option>}{views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
        </select></label>
        {!board && <><button type="button" className="button" aria-expanded={panel === "group"} aria-controls="tender-registry-options" onClick={() => toggle("group")}><Group size={15}/>Группировка</button><button type="button" className="button" aria-expanded={panel === "columns"} aria-controls="tender-registry-options" onClick={() => toggle("columns")}><Columns3 size={15}/>Колонки</button></>}
        {board && <label className="requests-hide-empty"><input type="checkbox" checked={settings.hideEmpty} onChange={event => update({ hideEmpty: event.target.checked })}/>Скрыть пустые колонки</label>}
        <button type="button" className="button requests-compact-action" title="Сортировка" aria-label="Сортировка" aria-expanded={panel === "sort"} aria-controls="tender-registry-options" onClick={() => toggle("sort")}><ArrowDownUp size={16}/></button>
        <button type="button" className="button requests-compact-action" title="Сохранить представление" aria-label="Сохранить представление" aria-expanded={panel === "views"} aria-controls="tender-registry-options" onClick={() => toggle("views")}><Save size={16}/></button>
      </div>
    </div>
    {panel && <section id="tender-registry-options" className="requests-registry-options requests-registry-inline-options" aria-label="Настройки представления">
      <div className="requests-registry-options-heading"><strong>{{ filters: "Дополнительные фильтры", columns: "Колонки таблицы", group: "Группировка строк", sort: "Порядок тендеров", views: "Сохранить представление" }[panel]}</strong><button type="button" className="icon-button" aria-label="Закрыть настройки представления" onClick={closePanel}><X size={15}/></button></div>
      {panel === "filters" && <div className="requests-registry-fields">
        <label>Состояние тендеров<select value={settings.bucket} onChange={event => update({ bucket: event.target.value as TenderRegistrySettings["bucket"], stage: "" })}><option value="active">Активные</option><option value="completed">Завершённые</option></select></label>
        <label>Ответственный<select value={settings.owner} onChange={event => update({ owner: event.target.value })}><option value="">Все ответственные</option><option value="unassigned">Не назначен</option>{ownerOptions.map(([id, owner]) => <option key={id} value={id}>{owner}</option>)}</select></label>
        <label>Заказчик<select value={settings.customer} onChange={event => update({ customer: event.target.value })}><option value="">Все заказчики</option>{customerOptions.map(([id, customer]) => <option key={id} value={id}>{customer}</option>)}</select></label>
        <label>Площадка<select value={settings.platform} onChange={event => update({ platform: event.target.value })}><option value="">Все площадки</option>{platforms.map(platform => <option key={platform} value={platform}>{platform}</option>)}</select></label>
        <label>Решение об участии<select value={settings.decision} onChange={event => update({ decision: event.target.value })}><option value="">Все решения</option>{Object.entries(tenderDecisionLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Срок подачи<select value={settings.deadline} onChange={event => update({ deadline: event.target.value as TenderRegistrySettings["deadline"] })}>{Object.entries(deadlineLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Источник<select value={settings.source} onChange={event => update({ source: event.target.value })}><option value="">Все источники</option>{sources.map(source => <option key={source} value={source}>{source}</option>)}</select></label>
      </div>}
      {panel === "columns" && <RegistryColumnControls columns={tenderColumns} layout={settings} onChange={update} onReset={() => update({ columns: defaultTenderSettings.columns, pinned: defaultTenderSettings.pinned, widths: {} })}/>}
      {panel === "group" && <RegistryGroupingControls options={groupOptions} group={settings.group} subgroup={settings.subgroup} none="none" onChange={update} onExpand={onExpandGroups}/>}
      {panel === "sort" && <div className="requests-registry-fields"><label>Поле<select value={settings.sort} onChange={event => update({ sort: event.target.value as TenderRegistrySettings["sort"] })}>{tenderColumns.map(column => <option key={column.id} value={column.id}>{column.label}</option>)}</select></label><label>Порядок<select value={settings.direction} onChange={event => update({ direction: event.target.value as "asc" | "desc" })}><option value="asc">По возрастанию</option><option value="desc">По убыванию</option></select></label></div>}
      {panel === "views" && <form className="requests-registry-save-view" onSubmit={event => { event.preventDefault(); saveView(name); setName(""); closePanel(); }}><label>Название вида<input value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="Например, Подготовка к подаче" required/></label><button className="button primary" disabled={!name.trim()}>Сохранить вид</button>{views.some(view => view.id === selectedView) && <button type="button" className="button" onClick={deleteView}>Удалить текущий вид</button>}<small>Сохраняются фильтры, колонки, порядок, ширина, закрепление, сортировка и два уровня группировки. Поиск не сохраняется. Настройки действуют в текущем браузере.</small></form>}
    </section>}
    {chips.length > 0 && <div className="requests-filter-chips" aria-label="Активные фильтры">{chips.map(chip => <button type="button" key={chip.label} onClick={chip.clear} aria-label={`Снять фильтр: ${chip.label}`}>{chip.label}<X size={12}/></button>)}</div>}
  </div>;
}
