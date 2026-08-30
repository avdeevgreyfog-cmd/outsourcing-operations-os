import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { listObjects,listNeeds,listWorkers,listShifts,listFinance } from "@/lib/data/service";
import { hasCapability } from "@/lib/core/access.mjs";
import { Metric,PageHeader,Section,Status } from "@/components/UI";
import { pct,rub } from "@/lib/ui/format";

export default async function ObjectWorkspace({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const actor=await requireActor();
  const objects=await listObjects(actor);
  const object=objects.find((row)=>row.id===id);
  if(!object) notFound();

  const [needs,workers,shifts,finance]=await Promise.all([
    hasCapability(actor.access,"operations.need.read")?listNeeds(actor):Promise.resolve([]),
    hasCapability(actor.access,"worker.read")?listWorkers(actor):Promise.resolve([]),
    hasCapability(actor.access,"operations.shift.read")?listShifts(actor):Promise.resolve([]),
    hasCapability(actor.access,"finance.pnl.read")?listFinance(actor):Promise.resolve([]),
  ]);
  const objectNeeds=needs.filter((row)=>row.objectId===id);
  const objectWorkers=workers.filter((row)=>row.objectId===id);
  const objectShifts=shifts.filter((row)=>row.objectId===id);
  const objFinance=finance.find((row)=>row.objectId===id);
  const margin=object.marginForecast??objFinance?.marginPct;

  return <>
    <PageHeader eyebrow={`Объект · ${object.code}`} title={object.name} subtitle={`${object.client} · ${object.region}`}/>
    <div className="object-hero"><div><Status tone={object.risk==="critical"?"bad":object.risk==="high"?"warn":"good"}>{object.status}</Status><div className="object-meta"><div><span>Клиент</span><strong>{object.client}</strong></div><div><span>Регион</span><strong>{object.region}</strong></div><div><span>Target start</span><strong>{object.targetStart}</strong></div><div><span>Дефицит</span><strong>{object.deficit}</strong></div></div></div><div className="health"><strong>{object.coverage}%</strong><span>staffing coverage</span></div></div>
    <div className="tabs"><span className="active">Обзор</span><span>Потребности</span><span>Подбор</span><span>Люди</span><span>Смены</span><span>Табели</span><span>Инциденты</span><span>Финансы</span><span>Activity</span></div>
    <div className="metrics-grid"><Metric label="Потребность" value={object.required}/><Metric label="Назначено" value={object.filled}/><Metric label="Дефицит" value={object.deficit} tone={object.deficit?"bad":"good"}/><Metric label="Forecast margin" value={margin!=null?pct(margin):"—"} tone={margin!=null&&Number(margin)<15?"warn":"good"}/></div>
    <div className="workspace-grid"><div>
      {hasCapability(actor.access,"operations.need.read")&&<Section title="Потребности" note="Связаны с recruiting attribution"><table className="data-table"><thead><tr><th>Позиция</th><th>Нужно</th><th>Закрыто</th><th>Дефицит</th><th>Дедлайн</th></tr></thead><tbody>{objectNeeds.map((row)=><tr key={row.id}><td className="cell-title">{row.specialty}</td><td className="num">{row.required}</td><td className="num">{row.filled}</td><td className="num">{row.deficit}</td><td>{row.deadline}</td></tr>)}</tbody></table></Section>}
      {hasCapability(actor.access,"operations.shift.read")&&<Section title="Ближайшие смены"><table className="data-table"><thead><tr><th>Смена</th><th>Позиция</th><th>Demand</th><th>Assigned</th><th>Deficit</th></tr></thead><tbody>{objectShifts.map((row)=><tr key={row.id}><td>{row.date} · {row.kind}</td><td>{row.specialty}</td><td className="num">{row.demand}</td><td className="num">{row.assigned}</td><td className="num">{row.deficit}</td></tr>)}</tbody></table></Section>}
    </div><div>
      {hasCapability(actor.access,"worker.read")&&<Section title="Люди на объекте"><div className="stack-list">{objectWorkers.map((row)=><div className="stack-item" key={row.id}><div><strong>{row.fullName}</strong><small>{row.employment??row.status}</small></div><Status tone="good">{row.status}</Status></div>)}</div></Section>}
      {objFinance&&<Section title="Финансовый факт"><div style={{padding:14}}><div className="calc-kv"><span>Выручка</span><strong>{rub(objFinance.revenue)}</strong></div><div className="calc-kv"><span>Worker cost</span><strong>{rub(objFinance.workerCost)}</strong></div><div className="calc-kv"><span>Object expenses</span><strong>{rub(objFinance.expenses)}</strong></div><div className="calc-kv"><span>Contribution</span><strong>{rub(objFinance.contribution)}</strong></div></div></Section>}
    </div></div>
  </>;
}
