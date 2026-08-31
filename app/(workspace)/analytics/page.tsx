import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { listCandidates, listFinance, listObjects, listWorkers } from "@/lib/data/service";
import { PageHeader, Section, Status } from "@/components/UI";
import { PortfolioChart } from "@/components/PortfolioChart";
import { pct, rub } from "@/lib/ui/format";

const stageLabels: Record<string, string> = { new: "Новые", call: "Созвон", documents: "Документы", first_shift: "Первый выход" };

export default async function Analytics({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view = "portfolio" } = await searchParams;
  const actor = await requireActor();
  const rows = await listFinance(actor);
  const objects = await listObjects(actor);
  const workers = actor.access.capabilities.includes("worker.read") ? await listWorkers(actor) : [];
  const candidates = actor.access.capabilities.includes("recruiting.candidate.read") ? await listCandidates(actor) : [];
  const title = view === "comparison" ? "Сравнение объектов" : view === "workforce" ? "Подбор и персонал" : "Портфель";

  return <>
    <PageHeader eyebrow="Аналитика" title={title} subtitle="Показатели ограничены доступными правами и строятся из связанных операционных фактов." breadcrumbs={[{ label: "Аналитика" }, { label: title }]} actions={<div className="segmented"><Link className={view === "portfolio" ? "active" : ""} href="/analytics">Портфель</Link><Link className={view === "comparison" ? "active" : ""} href="/analytics?view=comparison">Сравнение</Link><Link className={view === "workforce" ? "active" : ""} href="/analytics?view=workforce">Подбор и персонал</Link></div>}/>
    {view === "portfolio" && <Section title="Выручка и вклад в прибыль по объектам" note="Фактические данные · последняя доступная версия"><PortfolioChart rows={rows.map((row) => ({ object: row.object, revenue: Number(row.revenue), contribution: Number(row.contribution) }))}/></Section>}
    {view === "comparison" && <Section title="Нормализованное сравнение" note="Финансовый факт и укомплектованность"><table className="data-table"><thead><tr><th>Объект</th><th>Выручка</th><th>Вклад в прибыль</th><th>Маржа</th><th>Укомплектованность</th><th>Дефицит</th><th>Риск</th></tr></thead><tbody>{objects.map((object) => { const finance = rows.find((row) => row.objectId === object.id); return <tr key={object.id}><td className="cell-title">{object.name}</td><td className="num">{finance ? rub(finance.revenue) : "—"}</td><td className="num">{finance ? rub(finance.contribution) : "—"}</td><td className="num">{finance ? pct(finance.marginPct) : "—"}</td><td><div style={{ minWidth: 120 }}><div className="progress"><span style={{ width: `${object.coverage}%` }}/></div><span className="cell-sub">{object.coverage}%</span></div></td><td className="num">{object.deficit}</td><td><Status tone={object.risk === "critical" ? "bad" : object.risk === "high" ? "warn" : "good"}>{object.risk ?? "normal"}</Status></td></tr> })}</tbody></table></Section>}
    {view === "workforce" && <div className="workspace-grid"><Section title="Сотрудники по объектам"><table className="data-table"><thead><tr><th>Объект</th><th>Сотрудники</th><th>Кандидаты</th><th>Укомплектованность</th></tr></thead><tbody>{objects.map((object) => <tr key={object.id}><td className="cell-title">{object.name}</td><td className="num">{workers.filter((worker) => worker.objectId === object.id).length}</td><td className="num">{candidates.filter((candidate) => candidate.objectId === object.id).length}</td><td className="num">{object.coverage}%</td></tr>)}</tbody></table></Section><Section title="Воронка подбора"><div className="stack-list">{Object.entries(stageLabels).map(([stage, label]) => <div className="stack-item" key={stage}><strong>{label}</strong><span>{candidates.filter((candidate) => candidate.stage === stage).length}</span></div>)}</div></Section></div>}
  </>;
}
