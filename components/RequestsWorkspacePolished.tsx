"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { requestBucket, stageByCode, type RequestBoardRow, type RequestStageDefinition } from "@/lib/commercial/request-workflow";

type Props = { rows: RequestBoardRow[]; stages: RequestStageDefinition[]; canCreate: boolean; canConfigure: boolean };
type ViewMode = "list" | "board" | "analytics";
type Bucket = "active" | "completed" | "archive";

const lossLabels: Record<string,string> = {
  price: "Не устроила цена",
  competitor: "Выбран другой подрядчик",
  cancelled: "Потребность отменена",
  timing: "Не подошли сроки",
  conditions: "Не устроили условия",
  no_response: "Заказчик перестал отвечать",
  staffing: "Не смогли обеспечить персонал",
  other: "Другое",
};

const sourceLabels: Record<string,string> = {
  manual: "Создана вручную",
  public_form: "Внешняя форма",
  website: "Сайт",
  web: "Сайт",
  phone: "Телефон",
  email: "Эл. почта",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  tender: "Тендер",
  referral: "Рекомендация",
  repeat: "Повторное обращение",
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU");
}

function sourceLabel(value: string) {
  const normalized = value.trim();
  if (!normalized) return "Источник не указан";
  const known = sourceLabels[normalized.toLowerCase()];
  if (known) return known;
  return /[A-Za-z_]/.test(normalized) ? "Другой источник" : normalized;
}

function StageBadge({ stage }: { stage: RequestStageDefinition }) {
  return <span className={`request-stage-badge-polished request-stage-dot-${stage.color}`}><i/>{stage.label}</span>;
}

export function RequestsWorkspacePolished({ rows, stages, canCreate, canConfigure }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>("list");
  const [bucket, setBucket] = useState<Bucket>("active");
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [shareText, setShareText] = useState("Поделиться формой");
  const [editingStages, setEditingStages] = useState(stages);
  const [showSettings, setShowSettings] = useState(false);

  const filtered = useMemo(() => rows.filter((row) => {
    if (requestBucket(row) !== bucket) return false;
    if (!query.trim()) return true;
    const haystack = `${row.title} ${row.client} ${row.location} ${row.roles.map((role) => role.name).join(" ")} ${row.owner ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  }), [rows, bucket, query]);

  const visibleStages = useMemo(() => {
    if (bucket === "archive") return [];
    return stages
      .filter((stage) => stage.active && (bucket === "completed" ? stage.terminalKind !== "active" : stage.terminalKind === "active"))
      .sort((a,b) => a.sortOrder-b.sortOrder);
  }, [stages,bucket]);

  async function shareBlankForm() {
    setError(""); setShareText("Создаю ссылку…");
    try {
      const response = await fetch("/api/requests/intake-link", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expiresInDays: null }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Не удалось создать ссылку");
      const full = `${window.location.origin}${json.path}`;
      await navigator.clipboard.writeText(full);
      setShareText("Ссылка скопирована");
      setTimeout(() => setShareText("Поделиться формой"), 1800);
    } catch (shareError) {
      setShareText("Поделиться формой");
      setError(shareError instanceof Error ? shareError.message : "Не удалось создать ссылку");
    }
  }

  async function changeStage(row: RequestBoardRow, stageCode: string) {
    if (row.workflowStageCode === stageCode) return;
    let lossReason: string | null = null;
    if (stageCode === "not_agreed") {
      const answer = window.prompt("Почему предложение не согласовано?\nНапример: цена, другой подрядчик, потребность отменена, сроки, нет ответа.");
      if (!answer?.trim()) return;
      lossReason = answer.trim();
    }
    setBusyId(row.id); setError("");
    try {
      const response = await fetch(`/api/requests/${row.id}/stage`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stageCode, lossReason }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось изменить этап");
      router.refresh();
    } catch (stageError) {
      setError(stageError instanceof Error ? stageError.message : "Не удалось изменить этап");
    } finally {
      setBusyId("");
    }
  }

  async function savePipeline() {
    setError(""); setBusyId("pipeline");
    try {
      const response = await fetch("/api/requests/stages", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stages: editingStages }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось сохранить этапы");
      setShowSettings(false); router.refresh();
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "Не удалось сохранить этапы");
    } finally {
      setBusyId("");
    }
  }

  return <div className="requests-workspace requests-workspace-polished">
    <div className="requests-toolbar requests-toolbar-polished">
      <div className="requests-toolbar-left">
        <div className="segmented-control request-view-switcher">
          <button type="button" className={mode==="list"?"active":""} onClick={() => setMode("list")}>Список</button>
          <button type="button" className={mode==="board"?"active":""} onClick={() => setMode("board")}>Доска</button>
          <button type="button" className={mode==="analytics"?"active":""} onClick={() => setMode("analytics")}>Аналитика</button>
        </div>
        <div className="segmented-control request-bucket-switcher">
          <button type="button" className={bucket==="active"?"active":""} onClick={() => setBucket("active")}>Активные</button>
          <button type="button" className={bucket==="completed"?"active":""} onClick={() => setBucket("completed")}>Завершённые</button>
          <button type="button" className={bucket==="archive"?"active":""} onClick={() => setBucket("archive")}>Архив</button>
        </div>
      </div>
      <div className="requests-toolbar-actions">
        {mode!=="analytics"&&<input className="request-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по заявкам"/>}
        {canConfigure&&<button className="button" type="button" onClick={() => setShowSettings((value) => !value)}>Настроить этапы</button>}
        {canCreate&&<button className="button" type="button" onClick={shareBlankForm}>{shareText}</button>}
        {canCreate&&<Link className="button primary" href="/requests/new">+ Новая заявка</Link>}
      </div>
    </div>

    {error&&<div className="request-warning"><strong>Не удалось выполнить действие.</strong> {error}</div>}

    {showSettings&&canConfigure&&<div className="pipeline-settings pipeline-settings-polished">
      <div className="pipeline-settings-head"><div><strong>Этапы воронки заявок</strong><small>Можно изменить подпись, порядок, цветовой маркер и видимость. Системная логика этапов при этом не меняется.</small></div><button className="button primary" type="button" disabled={busyId==="pipeline"} onClick={savePipeline}>Сохранить</button></div>
      <div className="pipeline-settings-grid">{[...editingStages].sort((a,b)=>a.sortOrder-b.sortOrder).map((stage,index)=><div className="pipeline-settings-row" key={stage.code}>
        <span className="pipeline-drag-index">{index+1}</span>
        <input value={stage.label} onChange={(event)=>setEditingStages((current)=>current.map((item)=>item.code===stage.code?{...item,label:event.target.value}:item))}/>
        <select value={stage.color} onChange={(event)=>setEditingStages((current)=>current.map((item)=>item.code===stage.code?{...item,color:event.target.value}:item))}><option value="neutral">Нейтральный</option><option value="blue">Синий</option><option value="cyan">Бирюзовый</option><option value="violet">Фиолетовый</option><option value="amber">Жёлтый</option><option value="orange">Оранжевый</option><option value="pink">Розовый</option><option value="green">Зелёный</option><option value="red">Красный</option></select>
        <input aria-label="Порядок этапа" type="number" value={stage.sortOrder} onChange={(event)=>setEditingStages((current)=>current.map((item)=>item.code===stage.code?{...item,sortOrder:Number(event.target.value)||10}:item))}/>
        <label className="request-toggle"><input type="checkbox" checked={stage.active} disabled={["new","agreed","not_agreed"].includes(stage.code)} onChange={(event)=>setEditingStages((current)=>current.map((item)=>item.code===stage.code?{...item,active:event.target.checked}:item))}/><span>Показывать</span></label>
      </div>)}</div>
    </div>}

    {mode==="list"&&<RequestList rows={filtered} stages={stages}/>} 
    {mode==="board"&&bucket!=="archive"&&<RequestBoard rows={rows} filtered={filtered} stages={stages} visibleStages={visibleStages} busyId={busyId} onStage={changeStage}/>} 
    {mode==="board"&&bucket==="archive"&&<RequestList rows={filtered} stages={stages}/>} 
    {mode==="analytics"&&<RequestAnalytics rows={rows} stages={stages}/>} 
  </div>;
}

function RequestList({ rows, stages }: { rows: RequestBoardRow[]; stages: RequestStageDefinition[] }) {
  return <div className="request-table-wrap"><table className="data-table request-registry-table"><thead><tr><th>Заявка</th><th>Потребность</th><th>Этап</th><th>Ответственный</th><th>КП</th><th>Старт</th><th>Обновлено</th></tr></thead><tbody>{rows.length?rows.map((row)=><tr key={row.id}>
    <td><Link href={`/requests/${row.id}`} className="cell-title">{row.title}</Link><span className="cell-sub">{row.client} · {row.location||"локация уточняется"}</span></td>
    <td><strong>{row.headcount} чел.</strong><span className="cell-sub">{row.roles.slice(0,2).map((role)=>`${role.name} ${role.count}`).join(" · ")}{row.roles.length>2?` · +${row.roles.length-2}`:""}</span></td>
    <td><StageBadge stage={stageByCode(stages,row.workflowStageCode)}/>{row.lossReason&&<span className="cell-sub">{lossLabels[row.lossReason]??row.lossReason}</span>}</td>
    <td>{row.owner??"Не назначен"}<span className="cell-sub">{sourceLabel(row.source)}</span></td>
    <td>{row.proposalVersion?`№${row.proposalVersion}`:"—"}<span className="cell-sub">{row.proposalSentCount?`отправлено: ${row.proposalSentCount}`:"ещё не отправлялось"}</span></td>
    <td>{fmtDate(row.start)}</td><td>{fmtDate(row.updatedAt)}</td>
  </tr>):<tr><td colSpan={7}><div className="empty-inline">Заявок в этом разделе нет</div></td></tr>}</tbody></table></div>;
}

function RequestBoard({rows,filtered,stages,visibleStages,busyId,onStage}:{rows:RequestBoardRow[];filtered:RequestBoardRow[];stages:RequestStageDefinition[];visibleStages:RequestStageDefinition[];busyId:string;onStage:(row:RequestBoardRow,stage:string)=>Promise<void>}) {
  return <div className="request-kanban request-board-polished">{visibleStages.map((stage)=>{
    const stageRows=filtered.filter((row)=>row.workflowStageCode===stage.code);
    return <section className="request-kanban-column request-board-column" key={stage.code} onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{
      const id=event.dataTransfer.getData("text/request-id"); const row=rows.find((item)=>item.id===id); if(row) void onStage(row,stage.code);
    }}>
      <header><div><StageBadge stage={stage}/><span className="request-board-count">{stageRows.length}</span></div></header>
      <div className="request-kanban-cards">{stageRows.map((row)=><RequestBoardCard key={row.id} row={row} busy={busyId===row.id} stages={stages} onStage={onStage}/>)}</div>
    </section>;
  })}</div>;
}

function RequestBoardCard({ row, busy, stages, onStage }: { row: RequestBoardRow; busy: boolean; stages: RequestStageDefinition[]; onStage:(row:RequestBoardRow,stage:string)=>Promise<void> }) {
  return <article className={`request-kanban-card request-board-card${busy?" is-busy":""}`} draggable={!busy} onDragStart={(event)=>event.dataTransfer.setData("text/request-id",row.id)}>
    <div className="request-board-card-head"><Link href={`/requests/${row.id}`}><strong>{row.title}</strong></Link><span>{fmtDate(row.updatedAt)}</span></div>
    <div className="request-board-client">{row.client}<small>{row.location||"локация уточняется"}</small></div>
    <div className="request-board-facts"><span>{row.headcount} чел.</span><span>{row.roles.length} поз.</span>{row.proposalVersion>0&&<span>КП №{row.proposalVersion}</span>}</div>
    {row.proposalSentCount>0&&<div className="request-board-note">Отправок КП: <strong>{row.proposalSentCount}</strong></div>}
    <div className="request-kanban-footer request-board-footer"><span>{row.owner??"Без ответственного"}</span><select aria-label="Этап заявки" disabled={busy} value={row.workflowStageCode} onChange={(event)=>void onStage(row,event.target.value)}>{stages.filter((stage)=>stage.active).sort((a,b)=>a.sortOrder-b.sortOrder).map((stage)=><option key={stage.code} value={stage.code}>{stage.label}</option>)}</select></div>
  </article>;
}

function RequestAnalytics({ rows, stages }: { rows: RequestBoardRow[]; stages: RequestStageDefinition[] }) {
  const actual = rows.filter((row)=>!row.archivedAt);
  const activeStages = stages.filter((stage)=>stage.active).sort((a,b)=>a.sortOrder-b.sortOrder);
  const counts = activeStages.map((stage)=>actual.filter((row)=>row.workflowStageCode===stage.code).length);
  const max = Math.max(1,...counts);
  const losses = actual.filter((row)=>row.workflowStageCode==="not_agreed"&&row.lossReason).reduce<Record<string,number>>((acc,row)=>{const key=row.lossReason??"other";acc[key]=(acc[key]??0)+1;return acc;},{});
  const agreed = actual.filter((row)=>row.workflowStageCode==="agreed").length;
  const notAgreed = actual.filter((row)=>row.workflowStageCode==="not_agreed").length;
  const completed = agreed+notAgreed;
  return <div className="request-analytics-grid request-analytics-polished">
    <section className="request-analytics-panel request-funnel-panel"><header><strong>Воронка заявок</strong><small>Текущее распределение заявок по этапам. Для исторической конверсии используется история переходов.</small></header><div className="request-funnel-visual">{activeStages.map((stage,index)=>{const count=counts[index];const width=Math.max(44,Math.round(count/max*100));return <div className="request-funnel-stage-wrap" key={stage.code}><div className="request-funnel-stage" style={{width:`${width}%`}}><span>{stage.label}</span><strong>{count}</strong></div>{index<activeStages.length-1&&<i/>}</div>})}</div></section>
    <section className="request-analytics-panel"><header><strong>Результат</strong><small>Завершённые коммерческие циклы</small></header><div className="request-analytics-kpis"><div><strong>{completed}</strong><span>завершено</span></div><div><strong>{agreed}</strong><span>согласовано</span></div><div><strong>{completed?Math.round(agreed/completed*100):0}%</strong><span>доля согласованных</span></div></div><h4>Причины несогласования</h4><div className="loss-reasons">{Object.keys(losses).length?Object.entries(losses).sort((a,b)=>b[1]-a[1]).map(([key,value])=><div key={key}><span>{lossLabels[key]??key}</span><strong>{value}</strong></div>):<span className="request-muted">Пока нет накопленной статистики причин.</span>}</div></section>
  </div>;
}
