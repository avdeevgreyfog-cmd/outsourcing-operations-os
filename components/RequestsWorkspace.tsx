"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { requestBucket, stageByCode, type RequestBoardRow, type RequestStageDefinition } from "@/lib/commercial/request-workflow";

type Props = { rows: RequestBoardRow[]; stages: RequestStageDefinition[]; canCreate: boolean; canConfigure: boolean };
type ViewMode = "list" | "kanban" | "analytics";
type Bucket = "active" | "completed" | "archive";

const lossLabels: Record<string,string> = {
  price: "Не устроила цена", competitor: "Выбран другой подрядчик", cancelled: "Потребность отменена", timing: "Не подошли сроки",
  conditions: "Не устроили условия", no_response: "Заказчик перестал отвечать", staffing: "Не смогли обеспечить персонал", other: "Другое",
};

function fmtDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU");
}

function StageBadge({ stage }: { stage: RequestStageDefinition }) {
  return <span className={`request-stage-badge request-stage-${stage.color}`}>{stage.label}</span>;
}

export function RequestsWorkspace({ rows, stages, canCreate, canConfigure }: Props) {
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
    return stages.filter((stage) => stage.active && (bucket === "completed" ? stage.terminalKind !== "active" : stage.terminalKind === "active")).sort((a,b) => a.sortOrder-b.sortOrder);
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
      setShareText("Поделиться формой"); setError(shareError instanceof Error ? shareError.message : "Не удалось создать ссылку");
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
    } catch (stageError) { setError(stageError instanceof Error ? stageError.message : "Не удалось изменить этап"); }
    finally { setBusyId(""); }
  }

  async function savePipeline() {
    setError(""); setBusyId("pipeline");
    try {
      const response = await fetch("/api/requests/stages", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stages: editingStages }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error ?? "Не удалось сохранить этапы");
      setShowSettings(false); router.refresh();
    } catch (settingsError) { setError(settingsError instanceof Error ? settingsError.message : "Не удалось сохранить этапы"); }
    finally { setBusyId(""); }
  }

  return <div className="requests-workspace">
    <div className="requests-toolbar">
      <div className="requests-toolbar-left">
        <div className="segmented-control">
          {(["list","kanban","analytics"] as const).map((item) => <button key={item} type="button" className={mode===item?"active":""} onClick={() => setMode(item)}>{item==="list"?"Список":item==="kanban"?"Kanban":"Аналитика"}</button>)}
        </div>
        <div className="segmented-control">
          {(["active","completed","archive"] as const).map((item) => <button key={item} type="button" className={bucket===item?"active":""} onClick={() => setBucket(item)}>{item==="active"?"Активные":item==="completed"?"Завершённые":"Архив"}</button>)}
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

    {showSettings&&canConfigure&&<div className="pipeline-settings">
      <div className="pipeline-settings-head"><div><strong>Этапы воронки заявок</strong><small>Системные коды остаются неизменными. Можно менять подпись, порядок, цвет и видимость.</small></div><button className="button primary" type="button" disabled={busyId==="pipeline"} onClick={savePipeline}>Сохранить</button></div>
      <div className="pipeline-settings-grid">{editingStages.sort((a,b)=>a.sortOrder-b.sortOrder).map((stage,index)=><div className="pipeline-settings-row" key={stage.code}>
        <span className="pipeline-drag-index">{index+1}</span>
        <input value={stage.label} onChange={(event)=>setEditingStages((current)=>current.map((item)=>item.code===stage.code?{...item,label:event.target.value}:item))}/>
        <select value={stage.color} onChange={(event)=>setEditingStages((current)=>current.map((item)=>item.code===stage.code?{...item,color:event.target.value}:item))}><option value="neutral">Серый</option><option value="blue">Синий</option><option value="cyan">Бирюзовый</option><option value="violet">Фиолетовый</option><option value="amber">Жёлтый</option><option value="orange">Оранжевый</option><option value="pink">Розовый</option><option value="green">Зелёный</option><option value="red">Красный</option></select>
        <input type="number" value={stage.sortOrder} onChange={(event)=>setEditingStages((current)=>current.map((item)=>item.code===stage.code?{...item,sortOrder:Number(event.target.value)||10}:item))}/>
        <label className="request-toggle"><input type="checkbox" checked={stage.active} disabled={["new","agreed","not_agreed"].includes(stage.code)} onChange={(event)=>setEditingStages((current)=>current.map((item)=>item.code===stage.code?{...item,active:event.target.checked}:item))}/><span>Показывать</span></label>
      </div>)}</div>
    </div>}

    {mode==="list"&&<RequestList rows={filtered} stages={stages}/>} 
    {mode==="kanban"&&bucket!=="archive"&&<div className="request-kanban">{visibleStages.map((stage)=><div className="request-kanban-column" key={stage.code} onDragOver={(event)=>event.preventDefault()} onDrop={(event)=>{
      const id=event.dataTransfer.getData("text/request-id"); const row=rows.find((item)=>item.id===id); if(row) void changeStage(row,stage.code);
    }}><header><StageBadge stage={stage}/><span>{filtered.filter((row)=>row.workflowStageCode===stage.code).length}</span></header><div className="request-kanban-cards">{filtered.filter((row)=>row.workflowStageCode===stage.code).map((row)=><RequestKanbanCard key={row.id} row={row} busy={busyId===row.id} stages={stages} onStage={changeStage}/>)}</div></div>)}</div>}
    {mode==="kanban"&&bucket==="archive"&&<RequestList rows={filtered} stages={stages}/>} 
    {mode==="analytics"&&<RequestAnalytics rows={rows} stages={stages}/>} 
  </div>;
}

function RequestList({ rows, stages }: { rows: RequestBoardRow[]; stages: RequestStageDefinition[] }) {
  return <div className="request-table-wrap"><table className="data-table request-registry-table"><thead><tr><th>Заявка</th><th>Потребность</th><th>Этап</th><th>Ответственный</th><th>КП</th><th>Старт</th><th>Обновлено</th></tr></thead><tbody>{rows.length?rows.map((row)=><tr key={row.id}>
    <td><Link href={`/requests/${row.id}`} className="cell-title">{row.title}</Link><span className="cell-sub">{row.client} · {row.location||"локация уточняется"}</span></td>
    <td><strong>{row.headcount} чел.</strong><span className="cell-sub">{row.roles.slice(0,2).map((role)=>`${role.name} ${role.count}`).join(" · ")}{row.roles.length>2?` · +${row.roles.length-2}`:""}</span></td>
    <td><StageBadge stage={stageByCode(stages,row.workflowStageCode)}/>{row.lossReason&&<span className="cell-sub">{lossLabels[row.lossReason]??row.lossReason}</span>}</td>
    <td>{row.owner??"Не назначен"}<span className="cell-sub">{row.source}</span></td>
    <td>{row.proposalVersion?`v${row.proposalVersion}`:"—"}<span className="cell-sub">{row.proposalSentCount?`отправлено: ${row.proposalSentCount}`:"ещё не отправлялось"}</span></td>
    <td>{fmtDate(row.start)}</td><td>{fmtDate(row.updatedAt)}</td>
  </tr>):<tr><td colSpan={7}><div className="empty-inline">Заявок в этом разделе нет</div></td></tr>}</tbody></table></div>;
}

function RequestKanbanCard({ row, busy, stages, onStage }: { row: RequestBoardRow; busy: boolean; stages: RequestStageDefinition[]; onStage:(row:RequestBoardRow,stage:string)=>Promise<void> }) {
  return <article className={`request-kanban-card${busy?" is-busy":""}`} draggable={!busy} onDragStart={(event)=>event.dataTransfer.setData("text/request-id",row.id)}>
    <Link href={`/requests/${row.id}`}><strong>{row.title}</strong></Link>
    <span>{row.client}</span>
    <div className="request-kanban-meta"><span>{row.headcount} чел.</span><span>{row.roles.length} поз.</span>{row.proposalVersion>0&&<span>КП v{row.proposalVersion}</span>}</div>
    {row.proposalSentCount>0&&<div className="request-kanban-note">КП отправлялось: {row.proposalSentCount} {row.proposalSentCount===1?"раз":"раза"}</div>}
    <div className="request-kanban-footer"><span>{row.owner??"Без ответственного"}</span><select aria-label="Этап заявки" disabled={busy} value={row.workflowStageCode} onChange={(event)=>void onStage(row,event.target.value)}>{stages.filter((stage)=>stage.active).sort((a,b)=>a.sortOrder-b.sortOrder).map((stage)=><option key={stage.code} value={stage.code}>{stage.label}</option>)}</select></div>
  </article>;
}

function RequestAnalytics({ rows, stages }: { rows: RequestBoardRow[]; stages: RequestStageDefinition[] }) {
  const actual = rows.filter((row)=>!row.archivedAt);
  const activeStages = stages.filter((stage)=>stage.active).sort((a,b)=>a.sortOrder-b.sortOrder);
  const max = Math.max(1,...activeStages.map((stage)=>actual.filter((row)=>row.workflowStageCode===stage.code).length));
  const losses = actual.filter((row)=>row.workflowStageCode==="not_agreed"&&row.lossReason).reduce<Record<string,number>>((acc,row)=>{const key=row.lossReason??"other";acc[key]=(acc[key]??0)+1;return acc;},{});
  const agreed = actual.filter((row)=>row.workflowStageCode==="agreed").length;
  const completed = agreed+actual.filter((row)=>row.workflowStageCode==="not_agreed").length;
  return <div className="request-analytics-grid">
    <section className="request-analytics-panel"><header><strong>Воронка заявок</strong><small>Текущее распределение по этапам</small></header><div className="request-funnel">{activeStages.map((stage)=>{const count=actual.filter((row)=>row.workflowStageCode===stage.code).length;return <div className="request-funnel-row" key={stage.code}><span>{stage.label}</span><div><i style={{width:`${Math.max(3,(count/max)*100)}%`}}/></div><strong>{count}</strong></div>})}</div></section>
    <section className="request-analytics-panel"><header><strong>Результат</strong><small>Завершённые коммерческие циклы</small></header><div className="request-analytics-kpis"><div><strong>{completed}</strong><span>завершено</span></div><div><strong>{agreed}</strong><span>согласовано</span></div><div><strong>{completed?Math.round(agreed/completed*100):0}%</strong><span>конверсия</span></div></div><h4>Причины несогласования</h4><div className="loss-reasons">{Object.keys(losses).length?Object.entries(losses).sort((a,b)=>b[1]-a[1]).map(([key,value])=><div key={key}><span>{lossLabels[key]??key}</span><strong>{value}</strong></div>):<span className="request-muted">Пока нет накопленной статистики причин.</span>}</div></section>
  </div>;
}
