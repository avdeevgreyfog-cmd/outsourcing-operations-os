"use client";

import { useEffect, useRef, useState } from "react";
import { Columns3, Filter, Group, Save, ArrowDownUp, X } from "lucide-react";
import { requestSourceLabel, type RequestStageDefinition } from "@/lib/commercial/request-workflow";
import { SalesSearch } from "@/components/sales/SalesUI";
import { RegistryColumnControls } from "@/components/registry/RegistryColumnControls";
import { RegistryGroupingControls } from "@/components/registry/RegistryGroupingControls";
import { requestColumns, defaultRequestSettings, normalizeRequestSettings as normalizeSettings, type RequestRegistrySettings, type RequestSortId } from "@/lib/commercial/request-registry";
export { requestColumns, defaultRequestSettings } from "@/lib/commercial/request-registry";
export type { RequestColumnId, RequestRegistrySettings } from "@/lib/commercial/request-registry";

export { requestSourceLabel } from "@/lib/commercial/request-workflow";
type SavedView = { id: string; name: string; settings: RequestRegistrySettings };

export function useRequestRegistryPreferences(scope?: string) {
  const [settings, setSettings] = useState<RequestRegistrySettings>(defaultRequestSettings);
  const [views, setViews] = useState<SavedView[]>([]);
  const [selectedView, setSelectedView] = useState("active");
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const key = scope ? `operis.requests.views.v1:${scope}` : null;
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      let nextSettings = { ...defaultRequestSettings };
      let nextViews: SavedView[] = [];
      let nextSelectedView = "active";
      if (key) {
        try {
          const raw = JSON.parse(localStorage.getItem(key) ?? "null");
          if (raw) {
            nextSettings = normalizeSettings(raw.settings);
            nextViews = Array.isArray(raw.views) ? raw.views.slice(0, 30).filter((view: SavedView) => typeof view?.id === "string" && typeof view.name === "string").map((view: SavedView) => ({ id: view.id, name: view.name.slice(0, 60), settings: normalizeSettings(view.settings) })) : [];
            const id = typeof raw.selectedView === "string" ? raw.selectedView : "active";
            nextSelectedView = ["active", "completed", "archive", "unassigned", "custom"].includes(id) || nextViews.some(view => view.id === id) ? id : "custom";
          }
        } catch { /* A blocked storage falls back to in-memory preferences. */ }
      }
      setSettings(nextSettings); setViews(nextViews); setSelectedView(nextSelectedView); setHydratedKey(key);
    });
    return () => { cancelled = true; };
  }, [key]);

  useEffect(() => {
    if (!key || hydratedKey !== key) return;
    try { localStorage.setItem(key, JSON.stringify({ settings, views, selectedView })); } catch { /* Preferences never block working with requests. */ }
  }, [key, hydratedKey, settings, views, selectedView]);
  function update(patch: Partial<RequestRegistrySettings>) { setSettings(current => normalizeSettings({ ...current, ...patch })); setSelectedView("custom"); }
  function selectView(id: string) {
    setSelectedView(id);
    const saved = views.find(view => view.id === id);
    if (saved) setSettings(normalizeSettings(saved.settings));
    else setSettings(current => ({ ...current, bucket: id === "completed" || id === "archive" ? id : "active", stage: "", owner: id === "unassigned" ? "unassigned" : "", client: "", source: "" }));
  }
  function saveView(name: string) {
    if (!name.trim()) return;
    const id = `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setViews(current => [...current.slice(-29), { id, name: name.trim().slice(0, 60), settings: normalizeSettings(settings) }]);
    setSelectedView(id);
  }
  function deleteView() { setViews(current => current.filter(view => view.id !== selectedView)); setSelectedView("custom"); }
  return { settings, update, views, selectedView, selectView, saveView, deleteView };
}

type ControlsProps = ReturnType<typeof useRequestRegistryPreferences> & {
  stages: RequestStageDefinition[]; owners: Array<[string, string]>;
  clients: Array<{ id: string; name: string }>; sources: string[];
  query: string; onQuery: (query: string) => void; board: boolean; onExpandGroups: () => void;
};
const groupOptions = [{ id: "none", label: "Без группировки" }, { id: "stage", label: "Этап" }, { id: "owner", label: "Ответственный" }, { id: "client", label: "Заказчик" }] as const;
const sortOptions: Array<{ id: RequestSortId; label: string }> = [{ id: "updated", label: "Последнее изменение" }, { id: "title", label: "Название" }, { id: "start", label: "Дата старта" }, { id: "headcount", label: "Потребность" }, { id: "stage", label: "Этап" }, { id: "owner", label: "Ответственный" }, { id: "client", label: "Заказчик" }, { id: "source", label: "Источник" }, { id: "region", label: "Регион" }, { id: "location", label: "Адрес объекта" }, { id: "roles", label: "Специальности" }, { id: "proposal", label: "Версия КП" }];
export function RequestRegistryControls({ settings, update, views, selectedView, selectView, saveView, deleteView, stages, owners, clients, sources, query, onQuery, board, onExpandGroups }: ControlsProps) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const closePanel = () => { controlsRef.current?.querySelector<HTMLButtonElement>(".requests-registry-controlbar button[aria-expanded=true]")?.focus(); setPanel(null); };
  const [name, setName] = useState("");
  const [panel, setPanel] = useState<"filters" | "columns" | "group" | "sort" | "views" | null>(null);
  const moreFilters = Number(Boolean(settings.owner)) + Number(Boolean(settings.client)) + Number(Boolean(settings.source)) + Number(settings.bucket !== "active");
  const toggle = (value: typeof panel) => setPanel(current => current === value ? null : value);
  const chips = [
    settings.stage && { label: `Этап: ${stages.find(stage => stage.code === settings.stage)?.label ?? "Неизвестный этап"}`, clear: () => update({ stage: "" }) },
    settings.owner && { label: `Ответственный: ${settings.owner === "unassigned" ? "Не назначен" : owners.find(([id]) => id === settings.owner)?.[1] ?? "Не найден"}`, clear: () => update({ owner: "" }) },
    settings.client && { label: `Заказчик: ${clients.find(client => client.id === settings.client)?.name ?? "Не найден"}`, clear: () => update({ client: "" }) },
    settings.source && { label: `Источник: ${requestSourceLabel(settings.source)}`, clear: () => update({ source: "" }) },
    settings.bucket !== "active" && { label: settings.bucket === "archive" ? "Архив" : "Завершённые", clear: () => update({ bucket: "active", stage: "" }) },
  ].filter((chip): chip is { label: string; clear: () => void } => Boolean(chip));
  return <div ref={controlsRef} className="requests-registry-controls">
    <div className="requests-registry-controlbar">
      <div className="requests-registry-primary-controls">
        <SalesSearch value={query} onChange={onQuery} placeholder="Поиск по заявкам"/>
        <label className="requests-stage-choice"><span className="sales-sr-only">Фильтр по этапу</span><select value={settings.stage} onChange={event => {
          const stage = stages.find(item => item.code === event.target.value);
          update({ stage: event.target.value, ...(stage && settings.bucket !== "archive" ? { bucket: stage.terminalKind === "active" ? "active" : "completed" } : {}) });
        }}><option value="">Все этапы</option>{stages.map(stage => <option key={stage.code} value={stage.code}>{stage.label}</option>)}</select></label>
        <button className="button" aria-expanded={panel === "filters"} aria-controls="requests-registry-options" onClick={() => toggle("filters")}><Filter size={15}/>Фильтры{moreFilters > 0 && <span className="requests-control-count">{moreFilters}</span>}</button>
      </div>
      <div className="requests-registry-secondary-controls">
        <label className="requests-view-choice"><span className="sales-sr-only">Сохранённый вид заявок</span><select value={selectedView} onChange={event => selectView(event.target.value)}>
          <option value="active">Все активные</option><option value="completed">Завершённые</option><option value="archive">Архив</option><option value="unassigned">Без ответственного</option>
          {selectedView === "custom" && <option value="custom">Текущие настройки</option>}{views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
        </select></label>
        {!board && <><button className="button" aria-expanded={panel === "group"} aria-controls="requests-registry-options" onClick={() => toggle("group")}><Group size={15}/>Группировка</button><button className="button" aria-expanded={panel === "columns"} aria-controls="requests-registry-options" onClick={() => toggle("columns")}><Columns3 size={15}/>Колонки</button></>}
        <button className="button requests-compact-action" title="Сортировка" aria-label="Сортировка" aria-expanded={panel === "sort"} aria-controls="requests-registry-options" onClick={() => toggle("sort")}><ArrowDownUp size={16}/></button>
        <button className="button requests-compact-action" title="Сохранить представление" aria-label="Сохранить представление" aria-expanded={panel === "views"} aria-controls="requests-registry-options" onClick={() => toggle("views")}><Save size={16}/></button>
      </div>
    </div>
    {panel && <section id="requests-registry-options" className="requests-registry-options" aria-label="Настройки представления" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closePanel(); } }}>
      <div className="requests-registry-options-heading"><strong>{{ filters: "Дополнительные фильтры", columns: "Колонки таблицы", group: "Группировка строк", sort: "Порядок заявок", views: "Сохранить представление" }[panel]}</strong><button className="icon-button" aria-label="Закрыть настройки представления" onClick={closePanel}><X size={15}/></button></div>
      {panel === "filters" && <div className="requests-registry-fields">
        <label>Состояние заявок<select value={settings.bucket} onChange={event => update({ bucket: event.target.value as RequestRegistrySettings["bucket"], stage: "" })}><option value="active">Активные</option><option value="completed">Завершённые</option><option value="archive">Архив</option></select></label>
        <label>Ответственный<select value={settings.owner} onChange={event => update({ owner: event.target.value })}><option value="">Все ответственные</option><option value="unassigned">Не назначен</option>{owners.map(([id, owner]) => <option key={id} value={id}>{owner}</option>)}</select></label>
        <label>Заказчик<select value={settings.client} onChange={event => update({ client: event.target.value })}><option value="">Все заказчики</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label>
        <label>Источник<select value={settings.source} onChange={event => update({ source: event.target.value })}><option value="">Все источники</option>{sources.map(source => <option key={source} value={source}>{requestSourceLabel(source)}</option>)}</select></label>
      </div>}
      {panel === "columns" && <RegistryColumnControls columns={requestColumns} layout={settings} onChange={update} onReset={() => update({ columns: defaultRequestSettings.columns, pinned: defaultRequestSettings.pinned, widths: {} })}/>}
      {panel === "group" && <RegistryGroupingControls options={groupOptions} group={settings.group} subgroup={settings.subgroup} none="none" onChange={update} onExpand={onExpandGroups}/>}
      {panel === "sort" && <div className="requests-registry-fields"><label>Поле<select value={settings.sort} onChange={event => update({ sort: event.target.value as RequestRegistrySettings["sort"] })}>{sortOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label><label>Порядок<select value={settings.direction} onChange={event => update({ direction: event.target.value as "asc" | "desc" })}><option value="asc">По возрастанию</option><option value="desc">По убыванию</option></select></label></div>}
      {panel === "views" && <form className="requests-registry-save-view" onSubmit={event => { event.preventDefault(); saveView(name); setName(""); closePanel(); }}><label>Название вида<input value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="Например, КП у заказчика" required/></label><button className="button primary" disabled={!name.trim()}>Сохранить вид</button>{views.some(view => view.id === selectedView) && <button type="button" className="button" onClick={deleteView}>Удалить текущий вид</button>}<small>Сохраняются фильтры, колонки, порядок, ширина, закрепление, сортировка и два уровня группировки. Поиск не сохраняется. Настройки действуют в текущем браузере.</small></form>}
    </section>}
    {chips.length > 0 && <div className="requests-filter-chips" aria-label="Активные фильтры">{chips.map(chip => <button type="button" key={chip.label} onClick={chip.clear} aria-label={`Снять фильтр: ${chip.label}`}>{chip.label}<X size={12}/></button>)}</div>}
  </div>;
}
