import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { PageHeader, Metric, Section, Status } from "@/components/UI";
import { listOperationsAnalytics } from "@/lib/operations/service";

export default async function OperationsAnalytics(){
  const actor=await requireActor();
  const rows=await listOperationsAnalytics(actor);
  const required=rows.reduce((sum,row)=>sum+row.required,0);
  const working=rows.reduce((sum,row)=>sum+row.working,0);
  const deficit=rows.reduce((sum,row)=>sum+row.deficit,0);
  const noShows=rows.reduce((sum,row)=>sum+row.noShows,0);
  return <>
    <PageHeader eyebrow="Операции" title="Аналитика объектов" subtitle="Операционная сводка в рамках доступных объектов: персонал, смены, время и риски." breadcrumbs={[{label:"Операции"},{label:"Аналитика"}]}/>
    <div className="metrics-grid">
      <Metric label="Плановая численность" value={required}/>
      <Metric label="Работает" value={working}/>
      <Metric label="Дефицит" value={deficit} tone={deficit?"warn":"good"}/>
      <Metric label="Невыходы сегодня" value={noShows} tone={noShows?"bad":"good"}/>
    </div>
    <Section title="Объекты" note="Руководитель видит весь доступный контур, менеджер объекта — только назначенные ему объекты.">
      <div className="grid-scroll"><table className="data-table">
        <thead><tr><th>Объект</th><th>Менеджер</th><th>План</th><th>Работает</th><th>Готовятся</th><th>Дефицит</th><th>Сегодня</th><th>Невыходы</th><th>Часы месяца</th><th>Инциденты</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.objectId}>
          <td><Link className="cell-title" href={`/objects/${row.objectId}`}>{row.object}</Link><span className="cell-sub">{row.client} · {row.region}</span></td>
          <td>{row.manager??"—"}</td>
          <td className="num">{row.required}</td>
          <td className="num">{row.working}</td>
          <td className="num">{row.preparing}</td>
          <td className="num"><Status tone={row.deficit?"warn":"good"}>{row.deficit}</Status></td>
          <td className="num">{row.todayAssigned} / {row.todayDemand}</td>
          <td className="num">{row.noShows||"—"}</td>
          <td className="num">{row.monthHours}</td>
          <td className="num">{row.openIncidents||"—"}</td>
        </tr>)}</tbody>
      </table></div>
    </Section>
  </>;
}
