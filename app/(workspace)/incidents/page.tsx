import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { listIncidents } from "@/lib/data/service";
import { Empty,Metric,PageHeader,Section,Status } from "@/components/UI";

const severityLabels:Record<string,string>={critical:"Критический",high:"Высокий",medium:"Средний",low:"Низкий"};
const incidentStatusLabels:Record<string,string>={open:"Открыт",in_progress:"В работе",resolved:"Разрешён",closed:"Закрыт"};

export default async function Incidents(){
  const actor=await requireActor();
  const rows=await listIncidents(actor);
  return <>
    <PageHeader eyebrow="Операции → Качество" title="Инциденты" subtitle="Операционные события, ответственные и ход разрешения." breadcrumbs={[{label:"Операции"},{label:"Качество"},{label:"Инциденты"}]}/>
    <div className="metrics-grid">
      <Metric label="Открыто" value={rows.filter(x=>x.status==="open").length} tone="warn"/>
      <Metric label="Критических" value={rows.filter(x=>x.severity==="critical").length} tone="bad"/>
      <Metric label="Высокий приоритет" value={rows.filter(x=>x.severity==="high").length} tone="warn"/>
      <Metric label="Всего в контуре" value={rows.length}/>
    </div>
    <Section title="Журнал инцидентов" note="События по доступным объектам и сотрудникам." flush>
      {rows.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Инцидент</th><th>Объект</th><th>Сотрудник</th><th>Время</th><th>Ответственный</th><th>Приоритет</th><th>Статус</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td><strong className="cell-title">{x.title}</strong><span className="cell-sub">{x.description}</span></td><td><Link href={`/objects/${x.objectId}?tab=quality`}>{x.object}</Link></td><td>{x.worker??"—"}</td><td>{x.occurredAt}</td><td>{x.responsible??"—"}</td><td><Status tone={x.severity==="critical"?"bad":x.severity==="high"?"warn":"neutral"}>{severityLabels[x.severity]??"Обычный"}</Status></td><td><Status tone={x.status==="resolved"||x.status==="closed"?"good":"info"}>{incidentStatusLabels[x.status]??"Открыт"}</Status></td></tr>)}</tbody></table></div>:<Empty title="Инцидентов нет" text="В доступном контуре не зарегистрировано инцидентов."/>}
    </Section>
  </>;
}
