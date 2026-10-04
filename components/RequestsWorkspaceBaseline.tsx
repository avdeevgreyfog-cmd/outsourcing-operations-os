"use client";

import Link from "next/link";
import { RequestIntakeLinkPanel } from "@/components/sales/RequestIntakeLinkPanel";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChartNoAxesCombined, Columns3, LayoutList, SlidersHorizontal, Users, CalendarDays, Eye, Plus, X, ChevronRight, ArrowDownUp } from "lucide-react";
import { requestBucket, stageByCode, type RequestBoardRow, type RequestStageDefinition, type RequestWorkspaceOptions } from "@/lib/commercial/request-workflow";
import type { RequestAnalyticsData } from "@/lib/commercial/request-analytics";
import type { RequestAnalyticsMetricPreference } from "@/lib/commercial/request-analytics-metric-registry";
import { SalesDrawer, SalesEmpty, SalesSegments } from "@/components/sales/SalesUI";
import { daysSince, lossLabels, RequestInsights } from "@/components/sales/RequestInsights";
import { RequestRegistryControls, requestColumns, requestSourceLabel, useRequestRegistryPreferences, type RequestColumnId } from "@/components/sales/RequestRegistryControls";
import { HorizontalScrollDock } from "@/components/registry/HorizontalScrollDock";
import { orderedRegistryColumns, registryPinnedOffset, registryWidth } from "@/lib/ui/registry-layout";
import type { RequestGroupId, RequestSortId } from "@/lib/commercial/request-registry";
import { KeyValue } from "@/components/UI";
import { mergeDemoRequestRows, subscribeDemoRequests, updateDemoRequestStage } from "@/lib/commercial/demo-workspace-client";

type LossReasonOption={code:string;name:string};
type Props = { rows: RequestBoardRow[]; stages: RequestStageDefinition[]; options:RequestWorkspaceOptions; analytics:RequestAnalyticsData; metricPreferences:RequestAnalyticsMetricPreference[]; canConfigureMetrics:boolean; lossReasons: LossReasonOption[]; canCreate: boolean; canConfigure: boolean; canEdit: boolean; now: number; demo?: boolean; preferenceScope?:string; initialMode?:ViewMode; onModeChange?:(mode:ViewMode)=>void };
type ViewMode = "list" | "board" | "analytics";
function fmtDate(value: string | null) {
  if (!value) return "Уточняется";
  if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU");
}
function activity(value: string, now: number) {
  const days = daysSince(value, now);
  if (days === null) return "Дата не указана";
  if (!days) return "Обновлено сегодня";
  if (days === 1) return "Обновлено вчера";
  return `Без изменений ${days} дн.`;
}
function StageBadge({ stage }: { stage: RequestStageDefinition }) {
  return <span className={`request-stage-badge-polished request-stage-dot-${stage.color}`}><i/>{stage.label}</span>;
}

export function RequestsWorkspaceBaseline({ rows, stages, options, analytics, metricPreferences, canConfigureMetrics, lossReasons, canCreate, canConfigure, canEdit, now, demo = false, initialMode="list", onModeChange, preferenceScope }: Props) {
  const router = useRouter();
  const resizing = useRef<{ id: RequestColumnId; x: number; width: number } | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<ViewMode>(initialMode);
  const preferences = useRequestRegistryPreferences(preferenceScope);
  const { settings, update } = preferences;
  const bucket = settings.bucket;
  const stageFilter = settings.stage;
  const ownerFilter = settings.owner;
  const [analyticsRequestIds, setAnalyticsRequestIds] = useState<string[] | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [showShare, setShowShare] = useState(false);
  const [editingStages, setEditingStages] = useState(stages);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingLoss,setPendingLoss]=useState<RequestBoardRow|null>(null);
  const [lossReasonCode,setLossReasonCode]=useState("");
  const [lossComment,setLossComment]=useState("");
  const [demoRows, setDemoRows] = useState<RequestBoardRow[]>(rows);
  useEffect(() => {
    if (!demo) return;
    const refresh = () => setDemoRows(mergeDemoRequestRows(rows));
    refresh();
    return subscribeDemoRequests(refresh);
  }, [demo, rows]);
  const liveRows = demo ? demoRows : rows;
  const selected = liveRows.find(row => row.id === selectedId);
  const owners = [...new Map(liveRows.filter(row => row.ownerUserId).map(row => [row.ownerUserId!, row.owner ?? "Ответственный"])).entries()];
  const requestHref = (id: string) => demo ? `/requests/new?draft=${encodeURIComponent(id)}` : `/requests/${id}`;
  const resetFilters = () => { setAnalyticsRequestIds(null); setQuery(""); update({ stage: "", owner: "", client: "", source: "" }); };
  const hasFilters = Boolean(analyticsRequestIds || query || stageFilter || ownerFilter || settings.client || settings.source);
  const filtered = useMemo(() => {
    const result = liveRows.filter(row => {
      if (analyticsRequestIds ? !analyticsRequestIds.includes(row.id) : requestBucket(row) !== bucket) return false;
      if (stageFilter && row.workflowStageCode !== stageFilter) return false;
      if (ownerFilter && (row.ownerUserId ?? "unassigned") !== ownerFilter) return false;
      if (settings.client && row.clientId !== settings.client) return false;
      if (settings.source && row.source !== settings.source) return false;
      return `${row.title} ${row.client} ${row.location} ${row.owner ?? ""} ${row.roles.map(role => role.name).join(" ")}`.toLocaleLowerCase("ru-RU").includes(query.trim().toLocaleLowerCase("ru-RU"));
    });
    const dateNumber = (value: string | null) => {
      if (!value) return null;
      const date = /^\d{2}\.\d{2}\.\d{4}$/.test(value) ? value.split(".").reverse().join("-") : value;
      const parsed = Date.parse(date); return Number.isNaN(parsed) ? null : parsed;
    };
    return result.sort((a, b) => {
      let comparison = 0;
      if (settings.sort === "title") comparison = a.title.localeCompare(b.title, "ru");
      else if (settings.sort === "headcount") comparison = a.headcount - b.headcount;
      else if (settings.sort === "stage") comparison = stageByCode(stages, a.workflowStageCode).sortOrder - stageByCode(stages, b.workflowStageCode).sortOrder;
      else if (["owner", "client", "source", "region", "location", "roles"].includes(settings.sort)) {
        const field = (row: RequestBoardRow) => settings.sort === "roles" ? row.roles.map(role => role.name).join(" / ") : settings.sort === "source" ? requestSourceLabel(row.source) : row[settings.sort as "owner" | "client" | "region" | "location"] ?? "";
        const left = field(a), right = field(b);
        if (!left || !right) return left === right ? a.id.localeCompare(b.id) : !left ? 1 : -1;
        comparison = left.localeCompare(right, "ru");
      } else if (settings.sort === "proposal") comparison = a.proposalVersion - b.proposalVersion;
      else {
        const left = dateNumber(settings.sort === "start" ? a.start : a.updatedAt);
        const right = dateNumber(settings.sort === "start" ? b.start : b.updatedAt);
        if (left === null || right === null) return left === right ? a.id.localeCompare(b.id) : left === null ? 1 : -1;
        comparison = left - right;
      }
      return (settings.direction === "asc" ? comparison : -comparison) || a.id.localeCompare(b.id);
    });
  }, [liveRows, analyticsRequestIds, bucket, stageFilter, ownerFilter, settings.client, settings.source, settings.sort, settings.direction, stages, query]);
  const visibleStages = stages.filter(stage => (stage.active || filtered.some(row => row.workflowStageCode === stage.code)) && (analyticsRequestIds || bucket === "archive" || (bucket === "completed" ? stage.terminalKind !== "active" : stage.terminalKind === "active")) && (!stageFilter || stage.code === stageFilter) && (!settings.hideEmpty || filtered.some(row => row.workflowStageCode === stage.code))).sort((a, b) => a.sortOrder - b.sortOrder);
  const columns = orderedRegistryColumns(requestColumns, settings);
  const columnWidth = (id: RequestColumnId) => settings.widths[id] ?? requestColumns.find(column => column.id === id)!.width;
  const pinnedStyle = (id: RequestColumnId) => settings.pinned.includes(id) ? { left: registryPinnedOffset(id, requestColumns, settings) } : undefined;
  const columnSort: Record<RequestColumnId, RequestSortId> = { identity: "title", need: "headcount", stage: "stage", owner: "owner", start: "start", activity: "updated", proposal: "proposal", client: "client", location: "location", roles: "roles", source: "source", region: "region" };
  function renderRows(items: RequestBoardRow[], level = 0, path: string[] = []): React.ReactNode {
    const field: RequestGroupId = level === 0 ? settings.group : level === 1 ? settings.subgroup : "none";
    if (field === "none") return items.map(row => <tr key={row.id}>{columns.map(column => <td key={column.id} style={pinnedStyle(column.id)} className={`requests-cell-${column.id}${settings.pinned.includes(column.id) ? " registry-pinned-cell" : ""}`}><div className="requests-cell-content">{renderCell(row, column.id)}</div></td>)}<td><button className="icon-button sales-preview-button" aria-label={`Просмотр: ${row.title}`} onClick={() => setSelectedId(row.id)}><Eye size={17}/></button></td></tr>);
    const groups = new Map<string, { label: string; rows: RequestBoardRow[] }>();
    for (const row of items) {
      const id = field === "stage" ? row.workflowStageCode : field === "owner" ? row.ownerUserId ?? "unassigned" : row.clientId ?? row.client;
      const label = field === "stage" ? stageByCode(stages, row.workflowStageCode).label : field === "owner" ? row.owner ?? "Не назначен" : row.client;
      if (!groups.has(id)) groups.set(id, { label, rows: [] });
      groups.get(id)!.rows.push(row);
    }
    return [...groups].map(([id, group]) => {
      const nextPath = [...path, `${field}:${id}`], key = JSON.stringify(nextPath), collapsed = collapsedGroups.includes(key);
      return <Fragment key={key}><tr className="requests-group-row"><th colSpan={columns.length + 1} scope="rowgroup"><button type="button" style={{ paddingLeft: 14 + level * 22 }} aria-expanded={!collapsed} onClick={() => setCollapsedGroups(current => collapsed ? current.filter(item => item !== key) : [...current, key])}><ChevronRight size={14} className={collapsed ? "" : "expanded"}/>{group.label}<small>{group.rows.length}</small></button></th></tr>{!collapsed && renderRows(group.rows, level + 1, nextPath)}</Fragment>;
    });
  }
  function renderCell(row: RequestBoardRow, column: RequestColumnId) {
    switch (column) {
      case "identity": return <><Link className="cell-title" title={row.title} href={requestHref(row.id)}>{row.title}</Link><span className="cell-sub" title={row.client}>{row.client}</span></>;
      case "need": return <><strong>{row.headcount} чел.</strong><span className="cell-sub" title={row.roles.map(role => `${role.name} · ${role.count}`).join(" / ")}>{row.roles.slice(0, 2).map(role => `${role.name} · ${role.count}`).join(" / ")}{row.roles.length > 2 ? ` / ещё ${row.roles.length - 2}` : ""}</span></>;
      case "stage": return <><StageBadge stage={stageByCode(stages, row.workflowStageCode)}/>{row.lossReasonCode && <span className="cell-sub">{lossReasons.find(item => item.code === row.lossReasonCode)?.name ?? lossLabels[row.lossReasonCode] ?? "Причина не указана"}</span>}</>;
      case "owner": return row.owner ?? "Не назначен";
      case "start": return fmtDate(row.start);
      case "activity": return <span className={(daysSince(row.updatedAt, now) ?? 0) >= 7 && bucket === "active" ? "sales-stale" : "sales-secondary"}>{activity(row.updatedAt, now)}</span>;
      case "proposal": return row.proposalVersion > 0 ? <>КП №{row.proposalVersion}<span className="cell-sub">Отправок: {row.proposalSentCount}</span></> : "—";
      case "source": return requestSourceLabel(row.source);
      case "region": return row.region ?? "Уточняется";
      case "client": return <span title={row.client}>{row.client}</span>;
      case "location": return <span title={row.location || "Уточняется"}>{row.location || "Уточняется"}</span>;
      case "roles": { const roles = row.roles.map(role => `${role.name} · ${role.count}`).join(" / "); return <span title={roles}>{roles || "Уточняются"}</span>; }
    }
  }

  async function changeStage(row: RequestBoardRow, stageCode: string) {
    if (!canEdit || busyId || row.archivedAt || ["accepted", "launched"].includes(row.status) || row.workflowStageCode === stageCode) return;
    if(stageCode==="not_agreed"){setPendingLoss(row);setLossReasonCode("");setLossComment("");setError("");return}
    await performStageChange(row,stageCode);
  }
  async function performStageChange(row:RequestBoardRow,stageCode:string,reasonCode?:string,reason?:string){
    setBusyId(row.id);setError("");
    try{
      if(demo){
        updateDemoRequestStage(row.id,stageCode,reason??null,row,reasonCode??null);
        setDemoRows(current=>current.map(item=>item.id===row.id?{...item,workflowStageCode:stageCode,lossReason:reason??null,lossReasonCode:reasonCode??null,updatedAt:new Date().toISOString()}:item));
      }else{
        const response=await fetch(`/api/requests/${row.id}/stage`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({stageCode,lossReasonCode:reasonCode??null,lossReason:reason??null})});
        const json=await response.json().catch(()=>({}));if(!response.ok)throw new Error(json.error??"Не удалось изменить этап");router.refresh();
      }
      setPendingLoss(null);setLossReasonCode("");setLossComment("");
    }catch(e){setError(e instanceof Error?e.message:"Не удалось изменить этап")}finally{setBusyId("")}
  }
  async function submitLoss(event:React.FormEvent){
    event.preventDefault();if(!pendingLoss)return;
    if(!lossReasonCode){setError("Выберите причину несогласования");return}
    await performStageChange(pendingLoss,"not_agreed",lossReasonCode,lossComment.trim()||undefined);
  }
  async function savePipeline() {
    setBusyId("pipeline"); setError("");
    try {
      const response = await fetch("/api/requests/stages", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stages: editingStages }) });
      const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error ?? "Не удалось сохранить этапы"); setShowSettings(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить этапы"); } finally { setBusyId(""); }
  }
  function changeMode(value: ViewMode) {
    setMode(value); onModeChange?.(value);
    const params = new URLSearchParams(window.location.search);
    if (value === "list") params.delete("view"); else params.set("view", value);
    router.replace(`/requests${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  }
  function openStage(code: string, requestIds?: string[]) {
    setAnalyticsRequestIds(requestIds ?? null); setQuery("");
    update({ bucket: ["agreed", "not_agreed"].includes(code) ? "completed" : "active", stage: requestIds ? "" : code, owner: "", client: "", source: "" });
    setMode("list"); onModeChange?.("list");
    const params = new URLSearchParams(window.location.search); params.delete("view");
    router.replace(`/requests${params.size ? `?${params.toString()}` : ""}`, { scroll: false });
  }

  return <div className="sales-registry requests-registry">
    <div className="sales-toolbar requests-registry-toolbar">
      <SalesSegments<ViewMode> label="Вид заявок" value={mode} variant="navigation" onChange={changeMode} items={[{ value: "list", label: "Таблица", icon: <LayoutList size={15}/> }, { value: "board", label: "Доска", icon: <Columns3 size={15}/> }, { value: "analytics", label: "Аналитика", icon: <ChartNoAxesCombined size={15}/> }]}/>
      <div className="sales-toolbar-actions">{canConfigure && <button className="icon-button" aria-label="Настроить этапы" aria-expanded={showSettings} onClick={() => setShowSettings(v => !v)}><SlidersHorizontal size={16}/></button>}{canCreate && <button className="button" aria-expanded={showShare} onClick={() => setShowShare(value => !value)}>Форма для заказчика</button>}{canCreate && <Link className="button primary" href="/requests/new"><Plus size={16}/>Новая заявка</Link>}</div>
    </div>
    {showShare && canCreate && <RequestIntakeLinkPanel demo={demo} onClose={() => setShowShare(false)}/>}
    {mode !== "analytics" && <RequestRegistryControls {...preferences} update={patch => { setAnalyticsRequestIds(null); update(patch); }} selectView={id => { setAnalyticsRequestIds(null); preferences.selectView(id); }} stages={stages} owners={owners} clients={options.clients} sources={[...new Set([...options.sources, ...liveRows.map(row => row.source)])]} query={query} onQuery={setQuery} onExpandGroups={() => setCollapsedGroups([])} board={mode === "board"}/>}

    {error && <div role="alert" className="sales-notice sales-notice-error"><strong>Не удалось выполнить действие</strong><span>{error}</span></div>}
    {showSettings&&canConfigure&&<div className="pipeline-settings pipeline-settings-polished"><div className="pipeline-settings-head"><div><strong>Этапы воронки заявок</strong><small>Настройте подписи, порядок, цветовые маркеры и видимость.</small></div><button className="button primary" disabled={busyId==="pipeline"} onClick={savePipeline}>Сохранить</button></div><div className="pipeline-settings-grid">{[...editingStages].sort((a,b)=>a.sortOrder-b.sortOrder).map((stage,index)=><div className="pipeline-settings-row" key={stage.code}><span className="pipeline-drag-index">{index+1}</span><input value={stage.label} onChange={(e)=>setEditingStages(current=>current.map(item=>item.code===stage.code?{...item,label:e.target.value}:item))}/><select value={stage.color} onChange={(e)=>setEditingStages(current=>current.map(item=>item.code===stage.code?{...item,color:e.target.value}:item))}><option value="neutral">Нейтральный</option><option value="blue">Синий</option><option value="cyan">Бирюзовый</option><option value="violet">Фиолетовый</option><option value="amber">Жёлтый</option><option value="orange">Оранжевый</option><option value="pink">Розовый</option><option value="green">Зелёный</option><option value="red">Красный</option></select><input aria-label="Порядок этапа" type="number" value={stage.sortOrder} onChange={(e)=>setEditingStages(current=>current.map(item=>item.code===stage.code?{...item,sortOrder:Number(e.target.value)||10}:item))}/><label className="request-toggle"><input type="checkbox" checked={stage.active} disabled={["new","agreed","not_agreed"].includes(stage.code)} onChange={(e)=>setEditingStages(current=>current.map(item=>item.code===stage.code?{...item,active:e.target.checked}:item))}/><span>Показывать</span></label></div>)}</div></div>}
    {mode !== "analytics" && <div className="sales-results" aria-live="polite"><span>{analyticsRequestIds ? "Выборка из аналитики: " : "Показано "}{filtered.length} из {analyticsRequestIds ? liveRows.filter(row => analyticsRequestIds.includes(row.id)).length : liveRows.filter(row => requestBucket(row) === bucket).length}</span>{hasFilters && <button onClick={resetFilters}>Сбросить фильтры</button>}{mode === "board" && <label className="requests-hide-empty"><input type="checkbox" checked={settings.hideEmpty} onChange={event => update({ hideEmpty: event.target.checked })}/>Скрыть пустые этапы</label>}{mode === "board" && canEdit && bucket !== "archive" && <span className="sales-result-hint">Этап можно изменить в просмотре карточки или перетаскиванием</span>}</div>}
    {mode !== "analytics" && !filtered.length ? <SalesEmpty title={hasFilters ? "Заявки не найдены" : "В этом разделе пока нет заявок"} text={hasFilters ? "Измените условия поиска или сбросьте фильтры." : "Новые заявки появятся в активных. Завершённые и архивные хранятся отдельно."} onReset={hasFilters ? resetFilters : undefined}/> : <>
      {mode === "list" && <div ref={tableRef} className="sales-table-wrap"><table className="data-table sales-request-table" style={{ width: Math.max(52 + columns.reduce((sum, column) => sum + columnWidth(column.id), 0), 0) }}><colgroup>{columns.map(column => <col key={column.id} style={{ width: columnWidth(column.id) }}/>) }<col style={{ width: 52 }}/></colgroup><thead><tr>{columns.map(column => <th key={column.id} scope="col" aria-label={column.label} style={pinnedStyle(column.id)} className={settings.pinned.includes(column.id) ? "registry-pinned-cell" : ""} aria-sort={settings.sort === columnSort[column.id] ? settings.direction === "asc" ? "ascending" : "descending" : "none"}><button className="requests-column-sort" type="button" onClick={() => update({ sort: columnSort[column.id], direction: settings.sort === columnSort[column.id] && settings.direction === "asc" ? "desc" : "asc" })}>{column.label}<ArrowDownUp size={12}/></button><span className="requests-column-resize" role="separator" aria-label={`Ширина: ${column.label}`} aria-orientation="vertical" aria-valuemin={110} aria-valuemax={480} aria-valuenow={columnWidth(column.id)} tabIndex={0} onPointerDown={event => { event.preventDefault(); resizing.current = { id: column.id, x: event.clientX, width: columnWidth(column.id) }; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { const drag = resizing.current; if (drag?.id === column.id) update({ widths: { ...settings.widths, [column.id]: registryWidth(drag.width + event.clientX - drag.x) } }); }} onPointerUp={() => { resizing.current = null; }} onPointerCancel={() => { resizing.current = null; }} onLostPointerCapture={() => { resizing.current = null; }} onKeyDown={event => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); update({ widths: { ...settings.widths, [column.id]: registryWidth(columnWidth(column.id) + (event.key === "ArrowLeft" ? -10 : 10)) } }); } }}/></th>)}<th scope="col"><span className="sales-sr-only">Просмотр</span></th></tr></thead><tbody>{renderRows(filtered)}</tbody></table></div>}
      {mode === "board" && <div ref={boardRef} className="sales-board requests-board" aria-label="Доска заявок">{visibleStages.map(stage => {
        const stageRows = filtered.filter(row => row.workflowStageCode === stage.code);
        return <section className="sales-board-column" key={stage.code} onDragOver={e => { if (canEdit && bucket !== "archive") e.preventDefault(); }} onDrop={e => { if (!canEdit || bucket === "archive") return; e.preventDefault(); const row = liveRows.find(item => item.id === e.dataTransfer.getData("text/request-id")); if (row) void changeStage(row, stage.code); }}><header><StageBadge stage={stage}/><b>{stageRows.length}</b></header><div className="sales-board-cards">{stageRows.length ? stageRows.map(row => <article key={row.id} className="sales-board-card" aria-busy={busyId === row.id} draggable={canEdit && !busyId && !row.archivedAt && !["accepted", "launched"].includes(row.status)} onDragStart={e => e.dataTransfer.setData("text/request-id", row.id)}><div className="sales-card-heading"><Link href={requestHref(row.id)} title={row.title}>{row.title}</Link><button className="icon-button" onClick={() => setSelectedId(row.id)} aria-label={`Просмотр: ${row.title}`}><ArrowUpRight size={16}/></button></div><p>{row.client}<span>{row.location || "Локация уточняется"}</span></p><div className="requests-board-roles">{row.roles.slice(0, 2).map((role, index) => <span key={`${role.name}-${index}`} title={`${role.name} · ${role.count}`}>{role.name} · {role.count}</span>)}{row.roles.length > 2 && <span>Ещё {row.roles.length - 2} поз.</span>}</div><div className="sales-card-facts"><span><Users size={14}/>{row.headcount} чел.</span><span><CalendarDays size={14}/>{fmtDate(row.start)}</span></div><footer><span>{row.owner ?? "Не назначен"}</span><small className={(daysSince(row.updatedAt, now) ?? 0) >= 7 && bucket === "active" ? "sales-stale" : ""}>{activity(row.updatedAt, now)}</small></footer></article>) : <div className="sales-board-empty">Нет заявок</div>}</div></section>;
      })}</div>}
    </>}
    {mode === "list" && filtered.length > 0 && <HorizontalScrollDock scrollRef={tableRef} disabled={Boolean(selectedId || pendingLoss)} label="Прокрутка таблицы заявок" revision={JSON.stringify(settings)}/>}
    {mode === "board" && filtered.length > 0 && <HorizontalScrollDock scrollRef={boardRef} disabled={Boolean(selectedId || pendingLoss)} label="Прокрутка доски заявок" revision={JSON.stringify(settings)}/>}
    {mode === "analytics" && <RequestInsights analytics={analytics} options={options} metricPreferences={metricPreferences} canConfigureMetrics={canConfigureMetrics} demo={demo} demoRows={demo ? liveRows : undefined} stageDefinitions={stages} onStage={openStage}/>}
    {pendingLoss&&<div className="recruiting-modal" onMouseDown={event=>{if(event.currentTarget===event.target)setPendingLoss(null)}}><form className="recruiting-modal-card request-loss-modal" onSubmit={submitLoss}><div className="recruiting-modal-head"><div><h2>Не согласовано</h2><p>Выберите причину для аналитики. Комментарий можно добавить отдельно.</p></div><button type="button" className="icon-button" onClick={()=>setPendingLoss(null)}><X size={17}/></button></div><div className="recruiting-form">{error&&<div className="recruiting-error">{error}</div>}<div className="recruiting-form-grid"><label className="wide">Причина<select required value={lossReasonCode} onChange={event=>setLossReasonCode(event.target.value)}><option value="">Выберите причину</option>{lossReasons.map(item=><option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label className="wide">Комментарий<textarea value={lossComment} onChange={event=>setLossComment(event.target.value)} placeholder="Дополнительный контекст, если нужен"/></label></div><div className="recruiting-form-actions"><button type="button" className="button" onClick={()=>setPendingLoss(null)}>Отмена</button><button className="button primary" disabled={busyId===pendingLoss.id}>{busyId===pendingLoss.id?"Сохраняю…":"Сохранить"}</button></div></div></form></div>}
    {selected && <SalesDrawer title={selected.title} subtitle={`${selected.client} · ${selected.location || "Локация уточняется"}`} onClose={() => setSelectedId(null)} footer={<Link className="button primary" href={requestHref(selected.id)} onClick={() => setSelectedId(null)}>{"Открыть карточку"}<ArrowUpRight size={16}/></Link>}>
      <StageBadge stage={stageByCode(stages, selected.workflowStageCode)}/>
      <div className="sales-drawer-facts"><KeyValue label="Ответственный" value={selected.owner ?? "Не назначен"}/><KeyValue label="Старт" value={fmtDate(selected.start)}/><KeyValue label="Потребность" value={`${selected.headcount} чел.`}/><KeyValue label="Последнее изменение" value={fmtDate(selected.updatedAt)}/><KeyValue label="Версия КП" value={selected.proposalVersion ? `№${selected.proposalVersion}` : "Нет"}/><KeyValue label="Отправки КП" value={selected.proposalSentCount}/></div>
      <h3>Позиции заявки</h3><div className="sales-drawer-roles">{selected.roles.map((role, index) => <div key={`${role.name}-${index}`}><span>{role.name}</span><strong>{role.count} чел.</strong></div>)}</div>
      {canEdit && !selected.archivedAt && !["accepted", "launched"].includes(selected.status) && <label className="sales-stage-field">Изменить этап<select value={selected.workflowStageCode} disabled={Boolean(busyId)} onChange={e => void changeStage(selected, e.target.value)}>{stages.filter(stage => stage.active || stage.code === selected.workflowStageCode).map(stage => <option key={stage.code} value={stage.code}>{stage.label}</option>)}</select></label>}
      {selected.lossReasonCode && <div className="sales-notice"><strong>Причина несогласования</strong><span>{lossReasons.find(item=>item.code===selected.lossReasonCode)?.name ?? lossLabels[selected.lossReasonCode] ?? "Причина не указана"}{selected.lossReason ? ` · ${selected.lossReason}` : ""}</span></div>}
      {error && <div role="alert" className="sales-notice sales-notice-error">{error}</div>}
    </SalesDrawer>}
  </div>;
}
