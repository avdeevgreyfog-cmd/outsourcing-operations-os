import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { getCommandCenter } from "@/lib/data/service";
import { Metric, PageHeader, Section, Status } from "@/components/UI";
import { rub } from "@/lib/ui/format";

export default async function CommandCenter() {
  const actor = await requireActor();
  const data = await getCommandCenter(actor);
  const deficit = data.needs.reduce((s,n)=>s+Number(n.deficit||0),0);
  const risky = data.objects.filter((o)=>["high","critical"].includes(o.risk)).length;
  const contribution = data.finance.reduce((s,x)=>s+Number(x.contribution||0),0);
  const openCandidates = data.candidates.filter((x)=>x.stage!=="first_shift").length;
  return <>
    <PageHeader eyebrow="Command center" title={`Добрый день, ${actor.displayName.split(" ")[0]}`} subtitle="Главная собирается из тех данных и действий, которые доступны по эффективным правам и scope текущего пользователя." />
    <div className="metrics-grid">
      {data.objects.length>0 && <Metric label="Объекты в контуре" value={data.objects.length} note={`${risky} требуют внимания`} tone={risky?"warn":"good"}/>} 
      {data.needs.length>0 && <Metric label="Дефицит персонала" value={deficit} note={`${data.needs.length} активных потребности`} tone={deficit?"bad":"good"}/>} 
      {data.candidates.length>0 && <Metric label="Кандидаты в работе" value={openCandidates} note="в доступном scope"/>}
      {data.finance.length>0 && <Metric label="Contribution" value={rub(contribution)} note="по доступному портфелю" tone={contribution>0?"good":"bad"}/>} 
      {data.requests.length>0 && data.objects.length===0 && <Metric label="Заявки" value={data.requests.length} note="коммерческий контур"/>}
      {data.tasks.length>0 && <Metric label="Мои открытые задачи" value={data.tasks.length} note="с учётом scope" tone="warn"/>}
    </div>
    <div className="workspace-grid">
      <div>
        {data.objects.length>0 && <Section title="Портфель объектов" note="Coverage, дефицит и операционный риск"><table className="data-table"><thead><tr><th>Объект</th><th>Клиент</th><th>Регион</th><th>Coverage</th><th>Дефицит</th><th>Статус</th></tr></thead><tbody>{data.objects.slice(0,6).map((o)=><tr key={o.id}><td><Link className="cell-title" href={`/objects/${o.id}`}>{o.name}</Link><span className="cell-sub">{o.code}</span></td><td>{o.client}</td><td>{o.region}</td><td><div className="progress"><span style={{width:`${Math.min(100,Number(o.coverage))}%`}}/></div><span className="cell-sub">{o.coverage}%</span></td><td className="num">{o.deficit}</td><td><Status tone={o.risk==="critical"?"bad":o.risk==="high"?"warn":"good"}>{o.status}</Status></td></tr>)}</tbody></table></Section>}
        {data.requests.length>0 && data.objects.length===0 && <Section title="Заявки в работе"><table className="data-table"><thead><tr><th>Заявка</th><th>Клиент</th><th>Старт</th><th>Статус</th></tr></thead><tbody>{data.requests.map((r)=><tr key={r.id}><td className="cell-title">{r.title}</td><td>{r.client}</td><td>{r.start}</td><td><Status tone="info">{r.status}</Status></td></tr>)}</tbody></table></Section>}
      </div>
      <div>
        <Section title="Требует действия" note="Только назначенные / доступные задачи"><div className="stack-list">{data.tasks.length?data.tasks.slice(0,6).map((t)=><div className="stack-item" key={t.id}><div><strong className={`priority-${t.priority}`}>{t.title}</strong><small>{t.entity}</small></div><div className="num"><strong>{t.due}</strong><small>{t.priority}</small></div></div>):<div className="empty"><strong>Очередь пуста</strong><span>Нет доступных открытых задач</span></div>}</div></Section>
        {data.candidates.length>0 && <Section title="Подбор" note="Следующее действие по кандидатам"><div className="stack-list">{data.candidates.slice(0,5).map((c)=><div className="stack-item" key={c.id}><div><strong>{c.fullName}</strong><small>{c.object} · {c.need}</small></div><Status tone="info">{c.nextAction??"—"}</Status></div>)}</div></Section>}
      </div>
    </div>
  </>;
}
