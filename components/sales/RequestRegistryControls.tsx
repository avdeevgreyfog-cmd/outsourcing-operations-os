"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Columns3, Filter, Group, Save, ArrowDownUp, X } from "lucide-react";
import { requestSourceLabel, type RequestStageDefinition } from "@/lib/commercial/request-workflow";
import { SalesSearch } from "@/components/sales/SalesUI";

export const requestColumns = [
  { id: "identity", label: "Заявка / клиент", fixed: true },
  { id: "need", label: "Потребность" }, { id: "stage", label: "Этап" },
  { id: "owner", label: "Ответственный" }, { id: "start", label: "Старт" },
  { id: "activity", label: "Последнее изменение" }, { id: "proposal", label: "КП" },
  { id: "source", label: "Источник" }, { id: "region", label: "Регион" },
] as const;
export type RequestColumnId = typeof requestColumns[number]["id"];
export type RequestRegistrySettings = {
  bucket: "active" | "completed" | "archive";
  stage: string; owner: string; client: string; source: string;
  columns: RequestColumnId[];
  sort: "updated" | "title" | "start" | "headcount" | "stage";
  direction: "asc" | "desc";
  group: "none" | "stage" | "owner" | "client";
  hideEmpty: boolean;
};
export const defaultRequestSettings: RequestRegistrySettings = {
  bucket: "active", stage: "", owner: "", client: "", source: "",
  columns: ["identity", "need", "stage", "owner", "start", "activity", "proposal"],
  sort: "updated", direction: "desc", group: "none", hideEmpty: false,
};
export { requestSourceLabel } from "@/lib/commercial/request-workflow";
type SavedView = { id: string; name: string; settings: RequestRegistrySettings };
function normalizeSettings(value: unknown): RequestRegistrySettings {
  if (!value || typeof value !== "object") return { ...defaultRequestSettings };
  const item = value as Partial<RequestRegistrySettings>;
  const columns = Array.isArray(item.columns) ? requestColumns.filter(column => ("fixed" in column && column.fixed) || item.columns!.includes(column.id)).map(column => column.id) : defaultRequestSettings.columns;
  return {
    bucket: ["active", "completed", "archive"].includes(item.bucket ?? "") ? item.bucket! : "active",
    stage: typeof item.stage === "string" ? item.stage : "", owner: typeof item.owner === "string" ? item.owner : "",
    client: typeof item.client === "string" ? item.client : "", source: typeof item.source === "string" ? item.source : "",
    columns, sort: ["updated", "title", "start", "headcount", "stage"].includes(item.sort ?? "") ? item.sort! : "updated",
    direction: item.direction === "asc" ? "asc" : "desc",
    group: ["none", "stage", "owner", "client"].includes(item.group ?? "") ? item.group! : "none", hideEmpty: item.hideEmpty === true,
  };
}

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
  function update(patch: Partial<RequestRegistrySettings>) { setSettings(current => ({ ...current, ...patch })); setSelectedView("custom"); }
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
  query: string; onQuery: (query: string) => void; board: boolean;
};
export function RequestRegistryControls({ settings, update, views, selectedView, selectView, saveView, deleteView, stages, owners, clients, sources, query, onQuery, board }: ControlsProps) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const closePanel = () => { controlsRef.current?.querySelector<HTMLButtonElement>(".requests-registry-controlbar button[aria-expanded=true]")?.focus(); setPanel(null); };
  const [name, setName] = useState("");
  const [panel, setPanel] = useState<"filters" | "columns" | "group" | "sort" | "views" | null>(null);
  const moreFilters = Number(Boolean(settings.owner)) + Number(Boolean(settings.client)) + Number(Boolean(settings.source));
  const toggle = (value: typeof panel) => setPanel(current => current === value ? null : value);
  return <div ref={controlsRef} className="requests-registry-controls">
    <div className="requests-registry-controlbar">
      <div className="requests-registry-primary-controls">
      <label className="requests-view-choice"><span className="sales-sr-only">Сохранённый вид заявок</span><select value={selectedView} onChange={event => selectView(event.target.value)}>
        <option value="active">Все активные</option><option value="completed">Завершённые</option><option value="archive">Архив</option><option value="unassigned">Без ответственного</option>
        {selectedView === "custom" && <option value="custom">Текущие настройки</option>}{views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
      </select></label>
      <label className="requests-stage-choice"><span className="sales-sr-only">Фильтр по этапу</span><select value={settings.stage} onChange={event => {
        const stage = stages.find(item => item.code === event.target.value);
        update({ stage: event.target.value, ...(stage && settings.bucket !== "archive" ? { bucket: stage.terminalKind === "active" ? "active" : "completed" } : {}) });
      }}><option value="">Все этапы</option>{stages.map(stage => <option key={stage.code} value={stage.code}>{stage.label}</option>)}</select></label>
      <SalesSearch value={query} onChange={onQuery} placeholder="Поиск по заявкам"/>
      </div>
      <div className="requests-registry-secondary-controls">
      <button className="button" aria-expanded={panel === "filters"} aria-controls="requests-registry-options" onClick={() => toggle("filters")}><Filter size={15}/>Фильтры{moreFilters > 0 && <span className="requests-control-count">{moreFilters}</span>}</button>
      {!board && <><button className="button" aria-expanded={panel === "columns"} aria-controls="requests-registry-options" onClick={() => toggle("columns")}><Columns3 size={15}/>Колонки</button><button className="button" aria-expanded={panel === "group"} aria-controls="requests-registry-options" onClick={() => toggle("group")}><Group size={15}/>Группировка</button></>}
      <button className="button" aria-expanded={panel === "sort"} aria-controls="requests-registry-options" onClick={() => toggle("sort")}><ArrowDownUp size={15}/>Сортировка</button>
      <button className="button" aria-expanded={panel === "views"} aria-controls="requests-registry-options" onClick={() => toggle("views")}><Save size={15}/>Виды<ChevronDown size={13}/></button>
      </div>
    </div>
    {panel && <section id="requests-registry-options" className="requests-registry-options" aria-label="Настройки представления" onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closePanel(); } }}>
      <div className="requests-registry-options-heading"><strong>{{ filters: "Дополнительные фильтры", columns: "Колонки таблицы", group: "Группировка строк", sort: "Порядок заявок", views: "Сохранить представление" }[panel]}</strong><button className="icon-button" aria-label="Закрыть настройки представления" onClick={closePanel}><X size={15}/></button></div>
      {panel === "filters" && <div className="requests-registry-fields"><label>Ответственный<select value={settings.owner} onChange={event => update({ owner: event.target.value })}><option value="">Все ответственные</option><option value="unassigned">Не назначен</option>{owners.map(([id, owner]) => <option key={id} value={id}>{owner}</option>)}</select></label><label>Заказчик<select value={settings.client} onChange={event => update({ client: event.target.value })}><option value="">Все заказчики</option>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>Источник<select value={settings.source} onChange={event => update({ source: event.target.value })}><option value="">Все источники</option>{sources.map(source => <option key={source} value={source}>{requestSourceLabel(source)}</option>)}</select></label></div>}
      {panel === "columns" && <div className="requests-registry-column-options">{requestColumns.map(column => <label key={column.id}><input type="checkbox" checked={settings.columns.includes(column.id)} disabled={"fixed" in column && column.fixed} onChange={event => update({ columns: requestColumns.filter(item => item.id === column.id ? event.target.checked : settings.columns.includes(item.id)).map(item => item.id) })}/>{column.label}</label>)}</div>}
      {panel === "group" && <label className="requests-registry-field">Группировать по<select value={settings.group} onChange={event => update({ group: event.target.value as RequestRegistrySettings["group"] })}><option value="none">Без группировки</option><option value="stage">Этапу</option><option value="owner">Ответственному</option><option value="client">Заказчику</option></select></label>}
      {panel === "sort" && <div className="requests-registry-fields"><label>Поле<select value={settings.sort} onChange={event => update({ sort: event.target.value as RequestRegistrySettings["sort"] })}><option value="updated">Последнее изменение</option><option value="title">Название</option><option value="start">Дата старта</option><option value="headcount">Потребность</option><option value="stage">Этап</option></select></label><label>Порядок<select value={settings.direction} onChange={event => update({ direction: event.target.value as "asc" | "desc" })}><option value="asc">По возрастанию</option><option value="desc">По убыванию</option></select></label></div>}
      {panel === "views" && <form className="requests-registry-save-view" onSubmit={event => { event.preventDefault(); saveView(name); setName(""); closePanel(); }}><label>Название вида<input value={name} maxLength={60} onChange={event => setName(event.target.value)} placeholder="Например, КП у заказчика" required/></label><button className="button primary" disabled={!name.trim()}>Сохранить вид</button>{views.some(view => view.id === selectedView) && <button type="button" className="button" onClick={deleteView}>Удалить текущий вид</button>}<small>Сохраняются фильтры, колонки, сортировка и группировка. Поиск не сохраняется.</small></form>}
    </section>}
  </div>;
}
