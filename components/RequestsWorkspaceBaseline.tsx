"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, ChartNoAxesCombined, Columns3, LayoutList, SlidersHorizontal, Users, CalendarDays, Eye, Plus } from "lucide-react";
import { requestBucket, stageByCode, type RequestBoardRow, type RequestStageDefinition } from "@/lib/commercial/request-workflow";
import { SalesDrawer, SalesEmpty, SalesSearch, SalesSegments } from "@/components/sales/SalesUI";
import { daysSince, lossLabels, RequestInsights } from "@/components/sales/RequestInsights";
import { KeyValue } from "@/components/UI";

type Props = { rows: RequestBoardRow[]; stages: RequestStageDefinition[]; canCreate: boolean; canConfigure: boolean; canEdit: boolean; now: number };
type ViewMode = "list" | "board" | "analytics";
type Bucket = "active" | "completed" | "archive";
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

export function RequestsWorkspaceBaseline({ rows, stages, canCreate, canConfigure, canEdit, now }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>("list");
  const [bucket, setBucket] = useState<Bucket>("active");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [shareText, setShareText] = useState("Поделиться формой");
  const [sharing, setSharing] = useState(false);
  const [editingStages, setEditingStages] = useState(stages);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find(row => row.id === selectedId);
  const owners = [...new Map(rows.filter(row => row.ownerUserId).map(row => [row.ownerUserId!, row.owner ?? "Ответственный"])).entries()];
  const resetFilters = () => { setQuery(""); setStageFilter(""); setOwnerFilter(""); };
  const filtered = useMemo(() => rows.filter(row => {
    if (requestBucket(row) !== bucket) return false;
    if (stageFilter && row.workflowStageCode !== stageFilter) return false;
    if (ownerFilter && (row.ownerUserId ?? "unassigned") !== ownerFilter) return false;
    return `${row.title} ${row.client} ${row.location} ${row.owner ?? ""} ${row.roles.map(role => role.name).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [rows, bucket, stageFilter, ownerFilter, query]);
  const visibleStages = stages.filter(stage => (stage.active || filtered.some(row => row.workflowStageCode === stage.code)) && (bucket === "completed" ? stage.terminalKind !== "active" : stage.terminalKind === "active") && (!stageFilter || stage.code === stageFilter)).sort((a, b) => a.sortOrder - b.sortOrder);

  async function shareBlankForm() {
    setError(""); setSharing(true); setShareText("Создаю ссылку…");
    try {
      const response = await fetch("/api/requests/intake-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expiresInDays: null }) });
      const json = await response.json(); if (!response.ok) throw new Error(json.error ?? "Не удалось создать ссылку");
      await navigator.clipboard.writeText(`${window.location.origin}${json.path}`);
      setShareText("Ссылка скопирована");
    } catch (e) { setShareText("Поделиться формой"); setError(e instanceof Error ? e.message : "Не удалось создать ссылку"); }
    finally { setSharing(false); }
  }
  async function changeStage(row: RequestBoardRow, stageCode: string) {
    if (!canEdit || busyId || row.workflowStageCode === stageCode) return;
    let lossReason: string | null = null;
    if (stageCode === "not_agreed") { const answer = window.prompt("Почему предложение не согласовано?"); if (!answer?.trim()) return; lossReason = answer.trim(); }
    setBusyId(row.id); setError("");
    try {
      const response = await fetch(`/api/requests/${row.id}/stage`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stageCode, lossReason }) });
      const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error ?? "Не удалось изменить этап"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось изменить этап"); } finally { setBusyId(""); }
  }
  async function savePipeline() {
    setBusyId("pipeline"); setError("");
    try {
      const response = await fetch("/api/requests/stages", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stages: editingStages }) });
      const json = await response.json().catch(() => ({})); if (!response.ok) throw new Error(json.error ?? "Не удалось сохранить этапы"); setShowSettings(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить этапы"); } finally { setBusyId(""); }
  }
  function openStage(code: string) {
    setBucket(["agreed", "not_agreed"].includes(code) ? "completed" : "active"); resetFilters(); setStageFilter(code); setMode("list");
  }

  return <div className="sales-registry">
    <div className="sales-toolbar">
      <SalesSegments<ViewMode> label="Вид заявок" value={mode} onChange={setMode} items={[{ value: "list", label: "Список", icon: <LayoutList size={15}/> }, { value: "board", label: "Доска", icon: <Columns3 size={15}/> }, { value: "analytics", label: "Аналитика", icon: <ChartNoAxesCombined size={15}/> }]}/>
      <div className="sales-toolbar-actions">{canConfigure && <button className="icon-button" aria-label="Настроить этапы" aria-expanded={showSettings} onClick={() => setShowSettings(v => !v)}><SlidersHorizontal size={16}/></button>}{canCreate && <button className="button" disabled={sharing} onClick={shareBlankForm}>{shareText}</button>}{canCreate && <Link className="button primary" href="/requests/new"><Plus size={16}/>Новая заявка</Link>}</div>
    </div>
    {mode !== "analytics" && <div className="sales-filterbar">
      <SalesSegments<Bucket> label="Раздел заявок" value={bucket} onChange={value => { setBucket(value); setStageFilter(""); }} items={[{ value: "active", label: "Активные" }, { value: "completed", label: "Завершённые" }, { value: "archive", label: "Архив" }]}/>
      <select aria-label="Фильтр по этапу" value={stageFilter} onChange={e => setStageFilter(e.target.value)}><option value="">Все этапы</option>{stages.map(stage => <option key={stage.code} value={stage.code}>{stage.label}</option>)}</select>
      <select aria-label="Фильтр по ответственному" value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}><option value="">Все ответственные</option><option value="unassigned">Не назначен</option>{owners.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select>
      <SalesSearch value={query} onChange={setQuery} placeholder="Поиск по заявкам"/>
    </div>}
    {error && <div role="alert" className="sales-notice sales-notice-error"><strong>Не удалось выполнить действие</strong><span>{error}</span></div>}
    {showSettings&&canConfigure&&<div className="pipeline-settings pipeline-settings-polished"><div className="pipeline-settings-head"><div><strong>Этапы воронки заявок</strong><small>Настройте подписи, порядок, цветовые маркеры и видимость.</small></div><button className="button primary" disabled={busyId==="pipeline"} onClick={savePipeline}>Сохранить</button></div><div className="pipeline-settings-grid">{[...editingStages].sort((a,b)=>a.sortOrder-b.sortOrder).map((stage,index)=><div className="pipeline-settings-row" key={stage.code}><span className="pipeline-drag-index">{index+1}</span><input value={stage.label} onChange={(e)=>setEditingStages(current=>current.map(item=>item.code===stage.code?{...item,label:e.target.value}:item))}/><select value={stage.color} onChange={(e)=>setEditingStages(current=>current.map(item=>item.code===stage.code?{...item,color:e.target.value}:item))}><option value="neutral">Нейтральный</option><option value="blue">Синий</option><option value="cyan">Бирюзовый</option><option value="violet">Фиолетовый</option><option value="amber">Жёлтый</option><option value="orange">Оранжевый</option><option value="pink">Розовый</option><option value="green">Зелёный</option><option value="red">Красный</option></select><input aria-label="Порядок этапа" type="number" value={stage.sortOrder} onChange={(e)=>setEditingStages(current=>current.map(item=>item.code===stage.code?{...item,sortOrder:Number(e.target.value)||10}:item))}/><label className="request-toggle"><input type="checkbox" checked={stage.active} disabled={["new","agreed","not_agreed"].includes(stage.code)} onChange={(e)=>setEditingStages(current=>current.map(item=>item.code===stage.code?{...item,active:e.target.checked}:item))}/><span>Показывать</span></label></div>)}</div></div>}
    {mode !== "analytics" && <div className="sales-results" aria-live="polite"><span>Показано {filtered.length} из {rows.filter(row => requestBucket(row) === bucket).length}</span>{filtered.length > 0 && (query || stageFilter || ownerFilter) && <button onClick={resetFilters}>Сбросить фильтры</button>}{mode === "board" && canEdit && <span className="sales-result-hint">Этап можно изменить в просмотре карточки или перетаскиванием</span>}</div>}
    {mode !== "analytics" && !filtered.length ? <SalesEmpty title={query || stageFilter || ownerFilter ? "Заявки не найдены" : "В этом разделе пока нет заявок"} text={query || stageFilter || ownerFilter ? "Измените условия поиска или сбросьте фильтры." : "Новые заявки появятся в активных. Завершённые и архивные хранятся отдельно."} onReset={query || stageFilter || ownerFilter ? resetFilters : undefined}/> : <>
      {(mode === "list" || (mode === "board" && bucket === "archive")) && <div className="sales-table-wrap"><table className="data-table sales-request-table"><thead><tr><th>Заявка / клиент</th><th>Потребность</th><th>Этап</th><th>Ответственный</th><th>Старт</th><th>Активность</th><th><span className="sales-sr-only">Просмотр</span></th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}><td><Link className="cell-title" href={`/requests/${row.id}`}>{row.title}</Link><span className="cell-sub">{row.client} · {row.location || "Локация уточняется"}</span></td><td><strong>{row.headcount} чел.</strong><span className="cell-sub">{row.roles.slice(0, 2).map(role => `${role.name} · ${role.count}`).join(" / ")}{row.roles.length > 2 ? ` / ещё ${row.roles.length - 2}` : ""}</span></td><td><StageBadge stage={stageByCode(stages, row.workflowStageCode)}/>{row.lossReason && <span className="cell-sub">{lossLabels[row.lossReason] ?? row.lossReason}</span>}</td><td>{row.owner ?? "Не назначен"}</td><td className="sales-nowrap">{fmtDate(row.start)}</td><td><span className={(daysSince(row.updatedAt, now) ?? 0) >= 7 && bucket === "active" ? "sales-stale" : "sales-secondary"}>{activity(row.updatedAt, now)}</span>{row.proposalVersion > 0 && <span className="cell-sub">КП №{row.proposalVersion}{row.proposalSentCount ? ` · отправок ${row.proposalSentCount}` : ""}</span>}</td><td><button className="icon-button sales-preview-button" aria-label={`Просмотр: ${row.title}`} onClick={() => setSelectedId(row.id)}><Eye size={17}/></button></td></tr>)}</tbody></table></div>}
      {mode === "board" && bucket !== "archive" && <div className="sales-board" aria-label="Доска заявок">{visibleStages.map(stage => {
        const stageRows = filtered.filter(row => row.workflowStageCode === stage.code);
        return <section className="sales-board-column" key={stage.code} onDragOver={e => { if (canEdit) e.preventDefault(); }} onDrop={e => { if (!canEdit) return; e.preventDefault(); const row = rows.find(item => item.id === e.dataTransfer.getData("text/request-id")); if (row) void changeStage(row, stage.code); }}><header><StageBadge stage={stage}/><b>{stageRows.length}</b></header><div className="sales-board-cards">{stageRows.length ? stageRows.map(row => <article key={row.id} className="sales-board-card" aria-busy={busyId === row.id} draggable={canEdit && !busyId} onDragStart={e => e.dataTransfer.setData("text/request-id", row.id)}><div className="sales-card-heading"><Link href={`/requests/${row.id}`}>{row.title}</Link><button className="icon-button" onClick={() => setSelectedId(row.id)} aria-label={`Просмотр: ${row.title}`}><ArrowUpRight size={16}/></button></div><p>{row.client}<span>{row.location || "Локация уточняется"}</span></p><div className="sales-card-facts"><span><Users size={14}/>{row.headcount} чел.</span><span><CalendarDays size={14}/>{fmtDate(row.start)}</span></div><footer><span>{row.owner ?? "Не назначен"}</span><small className={(daysSince(row.updatedAt, now) ?? 0) >= 7 ? "sales-stale" : ""}>{activity(row.updatedAt, now)}</small></footer></article>) : <div className="sales-board-empty">Нет заявок</div>}</div></section>;
      })}</div>}
    </>}
    {mode === "analytics" && <RequestInsights rows={rows} stages={stages} now={now} onStage={openStage}/>}
    {selected && <SalesDrawer title={selected.title} subtitle={`${selected.client} · ${selected.location || "Локация уточняется"}`} onClose={() => setSelectedId(null)} footer={<Link className="button primary" href={`/requests/${selected.id}`} onClick={() => setSelectedId(null)}>Открыть карточку<ArrowUpRight size={16}/></Link>}>
      <StageBadge stage={stageByCode(stages, selected.workflowStageCode)}/>
      <div className="sales-drawer-facts"><KeyValue label="Ответственный" value={selected.owner ?? "Не назначен"}/><KeyValue label="Старт" value={fmtDate(selected.start)}/><KeyValue label="Потребность" value={`${selected.headcount} чел.`}/><KeyValue label="Последнее изменение" value={fmtDate(selected.updatedAt)}/><KeyValue label="Версия КП" value={selected.proposalVersion ? `№${selected.proposalVersion}` : "Нет"}/><KeyValue label="Отправки КП" value={selected.proposalSentCount}/></div>
      <h3>Позиции заявки</h3><div className="sales-drawer-roles">{selected.roles.map((role, index) => <div key={`${role.name}-${index}`}><span>{role.name}</span><strong>{role.count} чел.</strong></div>)}</div>
      {canEdit && !selected.archivedAt && !["accepted", "launched"].includes(selected.status) && <label className="sales-stage-field">Изменить этап<select value={selected.workflowStageCode} disabled={Boolean(busyId)} onChange={e => void changeStage(selected, e.target.value)}>{stages.filter(stage => stage.active || stage.code === selected.workflowStageCode).map(stage => <option key={stage.code} value={stage.code}>{stage.label}</option>)}</select></label>}
      {selected.lossReason && <div className="sales-notice"><strong>Причина несогласования</strong><span>{lossLabels[selected.lossReason] ?? selected.lossReason}</span></div>}
      {error && <div role="alert" className="sales-notice sales-notice-error">{error}</div>}
    </SalesDrawer>}
  </div>;
}
