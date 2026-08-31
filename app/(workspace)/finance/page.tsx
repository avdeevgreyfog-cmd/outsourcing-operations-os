import { requireActor } from "@/lib/auth/server";
import { listFinance } from "@/lib/data/service";
import { Metric, PageHeader, Section, Status } from "@/components/UI";
import { pct, rub } from "@/lib/ui/format";

export default async function Finance() {
  const actor = await requireActor();
  const rows = await listFinance(actor);
  const revenue = rows.reduce((sum, row) => sum + Number(row.revenue || 0), 0);
  const cost = rows.reduce((sum, row) => sum + Number(row.workerCost || 0) + Number(row.expenses || 0), 0);
  const contribution = rows.reduce((sum, row) => sum + Number(row.contribution || 0), 0);

  return <>
    <PageHeader eyebrow="Финансы" title="Прибыли и убытки по объектам" subtitle="Фактическая выручка строится из подтверждённых начислений клиенту, а затраты на персонал — из начислений сотрудникам. Табель не используется как единственный источник выплат."/>
    <div className="metrics-grid"><Metric label="Выручка" value={rub(revenue)}/><Metric label="Затраты на персонал и объект" value={rub(cost)}/><Metric label="Вклад в прибыль" value={rub(contribution)} tone={contribution >= 0 ? "good" : "bad"}/><Metric label="Средневзвешенная маржа" value={revenue ? pct(contribution / revenue * 100) : "0%"} tone={contribution > 0 ? "good" : "bad"}/></div>
    <Section><table className="data-table"><thead><tr><th>Объект</th><th>Выручка</th><th>Затраты на персонал</th><th>Расходы объекта</th><th>Вклад в прибыль</th><th>Маржа</th><th>План</th><th>Отклонение</th></tr></thead><tbody>{rows.map((row) => { const delta = Number(row.marginPct) - Number(row.planMarginPct ?? row.marginPct); return <tr key={row.id}><td className="cell-title">{row.object}</td><td className="num">{rub(row.revenue)}</td><td className="num">{rub(row.workerCost)}</td><td className="num">{rub(row.expenses)}</td><td className="num">{rub(row.contribution)}</td><td className="num">{pct(row.marginPct)}</td><td className="num">{row.planMarginPct == null ? "—" : pct(row.planMarginPct)}</td><td><Status tone={delta < 0 ? "bad" : "good"}>{delta >= 0 ? "+" : ""}{pct(delta)}</Status></td></tr> })}</tbody></table></Section>
  </>;
}
