import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { listFinance,listLaunchTasks } from "@/lib/data/service";
import { getOperationsAnalyticsSummary,listOperationsAnalytics } from "@/lib/operations/service";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader,Metric,Section,Status } from "@/components/UI";
import { pct,rub } from "@/lib/ui/format";
import { isGithubPagesDemo } from "@/lib/demo/pages";

const statusLabels:Record<string,string>={draft:"Черновик",submitted:"На согласовании",approved:"Согласован",returned:"Возвращён"};
const riskTone=(deficit:number,noShows:number,incidents:number)=>incidents>3||deficit>10?"bad":deficit>0||noShows>0||incidents>0?"warn":"good";

export default async function OperationsAnalytics({searchParams}:{searchParams:Promise<{view?:string;object?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const canFinance=hasCapability(actor.access,"finance.pnl.read");
  const [allRows,summary,launchTasks,finance]=await Promise.all([
    listOperationsAnalytics(actor),
    getOperationsAnalyticsSummary(actor),
    listLaunchTasks(actor),
    canFinance?listFinance(actor):Promise.resolve([]),
  ]);
  const objectIds=new Set(allRows.map(row=>row.objectId));
  const objectFilter=params.object&&objectIds.has(params.object)?params.object:null;
  const rows=objectFilter?allRows.filter(row=>row.objectId===objectFilter):allRows;
  const view=["overview","staffing","launches","attendance","timesheets","quality","economics"].includes(params.view??"")?params.view!:"overview";
  const filteredLaunchTasks=objectFilter?launchTasks.filter(row=>row.objectId===objectFilter):launchTasks;
  const filteredFinance=objectFilter?finance.filter(row=>row.objectId===objectFilter):finance;

  const required=rows.reduce((sum,row)=>sum+row.required,0);
  const working=rows.reduce((sum,row)=>sum+row.working,0);
  const coverage=required?Math.round(working/required*100):100;
  const noShows=rows.reduce((sum,row)=>sum+row.noShows,0);
  const incidents=rows.reduce((sum,row)=>sum+row.openIncidents,0);
  const tabs=[
    {key:"overview",label:"Обзор"},
    {key:"staffing",label:"Комплектация"},
    {key:"launches",label:"Запуски"},
    {key:"attendance",label:"Невыходы и время"},
    {key:"timesheets",label:"Табели"},
    {key:"quality",label:"Качество"},
    ...(canFinance?[{key:"economics",label:"Экономика"}]:[]),
  ];

  const launchObjects=[...new Set(filteredLaunchTasks.map(row=>row.objectId))].map(objectId=>{
    const scope=filteredLaunchTasks.filter(row=>row.objectId===objectId);
    const progress=scope[0]?.launchProgress??(scope.length?Math.round(scope.reduce((sum,row)=>sum+row.progress,0)/scope.length):0);
    return {
      objectId,
      object:scope[0]?.object??"Объект",
      target:scope[0]?.launchTarget??"—",
      forecast:scope[0]?.launchForecast??"—",
      progress:Number(progress),
      blockers:scope.filter(row=>row.status!=="done"&&(row.status==="blocked"||row.critical||["high","critical"].includes(row.risk))).length,
      risk:scope[0]?.launchRisk??"normal",
    };
  });

  const weekly=summary.weeklyNoShows;
  const maxWeekly=Math.max(1,...weekly.map(row=>row.value));
  const points=weekly.map((row,index)=>{
    const x=weekly.length<=1?50:index/(weekly.length-1)*100;
    const y=100-row.value/maxWeekly*80;
    return x+","+y;
  }).join(" ");

  return <>
    <PageHeader eyebrow="Операции → Управление объектами" title="Аналитика объектов" subtitle="Результаты и тенденции по доступному операционному контуру: комплектация, запуски, невыходы, табели, качество и экономика." breadcrumbs={[{label:"Операции"},{label:"Управление объектами"},{label:"Аналитика объектов"}]}/>

    <div className="analytics-context-bar">
      <div className="segmented workspace-tabs">{tabs.map(item=><Link key={item.key} className={view===item.key?"active":""} href={"/operations/analytics?view="+item.key+(objectFilter?"&object="+objectFilter:"")}>{item.label}</Link>)}</div>
      <div className="page-actions">{objectFilter?<><span className="cell-sub">Фильтр: {allRows.find(row=>row.objectId===objectFilter)?.object}</span><Link className="button" href={"/operations/analytics?view="+view}>Все объекты</Link></>:<span className="cell-sub">Весь доступный контур · {rows.length} объектов</span>}</div>
    </div>

    <div className="metrics-grid">
      <Metric label="Объекты" value={rows.length}/>
      <Metric label="Средняя укомплектованность" value={coverage+"%"} tone={coverage<80?"warn":"good"}/>
      <Metric label="Невыходы сегодня" value={noShows} tone={noShows?"warn":"good"}/>
      <Metric label="Открытые инциденты" value={incidents} tone={incidents?"warn":"good"}/>
    </div>

    {view==="overview"&&<>
      <div className="analytics-dashboard-grid">
        <Section title="Укомплектованность по объектам">
          <div className="analytics-ranking">{[...rows].sort((a,b)=>(b.required?b.working/b.required:1)-(a.required?a.working/a.required:1)).map(row=>{
            const value=row.required?Math.round(row.working/row.required*100):100;
            return <Link href={"/operations/analytics?view=overview&object="+row.objectId} className="analytics-ranking-row" key={row.objectId}><span>{row.object}</span><div className="progress"><i style={{width:Math.min(100,value)+"%"}}/></div><strong>{value}%</strong></Link>
          })}</div>
        </Section>
        <Section title="Невыходы по неделям" note="Последние шесть недель по доступным объектам">
          <div className="analytics-line-chart">
            <svg viewBox="0 0 100 110" preserveAspectRatio="none" aria-label="Динамика невыходов"><polyline points={points} fill="none" vectorEffect="non-scaling-stroke"/>{weekly.map((row,index)=>{const x=weekly.length<=1?50:index/(weekly.length-1)*100;const y=100-row.value/maxWeekly*80;return <circle key={row.label} cx={x} cy={y} r="1.6" vectorEffect="non-scaling-stroke"/>})}</svg>
            <div className="analytics-chart-labels">{weekly.map(row=><span key={row.label}>{row.label}</span>)}</div>
          </div>
        </Section>
      </div>

      <div className="analytics-dashboard-grid analytics-dashboard-grid-bottom">
        <Section title="Объекты с наибольшим вниманием">
          <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Объект</th><th>Комплектация</th><th>Невыходы</th><th>Инциденты</th><th>Риск</th></tr></thead><tbody>{[...rows].sort((a,b)=>(b.deficit+b.noShows+b.openIncidents)-(a.deficit+a.noShows+a.openIncidents)).slice(0,6).map(row=><tr key={row.objectId}><td><Link className="cell-title" href={"/objects/"+row.objectId}>{row.object}</Link><span className="cell-sub">{row.manager??row.region}</span></td><td className="num">{row.required?Math.round(row.working/row.required*100):100}%</td><td className="num">{row.noShows||"—"}</td><td className="num">{row.openIncidents||"—"}</td><td><Status tone={riskTone(row.deficit,row.noShows,row.openIncidents)}>{riskTone(row.deficit,row.noShows,row.openIncidents)==="bad"?"Высокий":riskTone(row.deficit,row.noShows,row.openIncidents)==="warn"?"Контроль":"Норма"}</Status></td></tr>)}</tbody></table></div>
        </Section>
        <Section title="Состояние процессов">
          <div className="analytics-process-grid">
            <div><span>Запуски в работе</span><strong>{summary.launches.inProgress}</strong><small>{summary.launches.late} с отклонением</small></div>
            <div><span>Запуски завершены в срок</span><strong>{summary.launches.onTime}</strong><small>из {summary.launches.total}</small></div>
            <div><span>Инциденты за 30 дней</span><strong>{summary.incidents30d}</strong><small>в доступном контуре</small></div>
            <div><span>Часы текущего месяца</span><strong>{rows.reduce((sum,row)=>sum+Number(row.monthHours),0).toLocaleString("ru-RU")}</strong><small>внутренний факт</small></div>
          </div>
        </Section>
      </div>
    </>}

    {view==="staffing"&&<Section title="Комплектация по объектам" note="Текущая численность, готовящиеся сотрудники и фактический дефицит.">
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Объект</th><th>Менеджер</th><th>План</th><th>Работает</th><th>Готовятся</th><th>Укомплектованность</th><th>Дефицит</th><th>Действие</th></tr></thead><tbody>{[...rows].sort((a,b)=>b.deficit-a.deficit).map(row=>{const value=row.required?Math.round(row.working/row.required*100):100;return <tr key={row.objectId}><td><Link className="cell-title" href={"/objects/"+row.objectId+"?tab=staffing"}>{row.object}</Link><span className="cell-sub">{row.client} · {row.region}</span></td><td>{row.manager??"—"}</td><td className="num">{row.required}</td><td className="num">{row.working}</td><td className="num">{row.preparing}</td><td><div className="object-coverage"><div className="progress"><span style={{width:Math.min(100,value)+"%"}}/></div><span>{value}%</span></div></td><td className="num"><Status tone={row.deficit?"warn":"good"}>{row.deficit}</Status></td><td><Link className="button" href={"/staffing-plan?object="+row.objectId}>План</Link></td></tr>})}</tbody></table></div>
    </Section>}

    {view==="launches"&&<Section title="Запуски объектов" note="Сроки, готовность и критические блокеры.">
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Объект</th><th>Плановый старт</th><th>Прогноз</th><th>Готовность</th><th>Блокеры</th><th>Риск</th></tr></thead><tbody>{launchObjects.map(row=><tr key={row.objectId}><td><Link className="cell-title" href={"/launches?object="+row.objectId}>{row.object}</Link></td><td>{row.target}</td><td>{row.forecast}</td><td><div className="object-coverage"><div className="progress"><span style={{width:Math.min(100,row.progress)+"%"}}/></div><span>{row.progress}%</span></div></td><td className="num">{row.blockers||"—"}</td><td><Status tone={row.risk==="critical"?"bad":row.risk==="high"||row.risk==="watch"?"warn":"good"}>{row.risk==="critical"?"Критический":row.risk==="high"?"Высокий":row.risk==="watch"?"Контроль":"Норма"}</Status></td></tr>)}</tbody></table></div>
    </Section>}

    {view==="attendance"&&<>
      <Section title="Невыходы по неделям"><div className="analytics-line-chart analytics-line-chart-large"><svg viewBox="0 0 100 110" preserveAspectRatio="none"><polyline points={points} fill="none" vectorEffect="non-scaling-stroke"/>{weekly.map((row,index)=>{const x=weekly.length<=1?50:index/(weekly.length-1)*100;const y=100-row.value/maxWeekly*80;return <circle key={row.label} cx={x} cy={y} r="1.5" vectorEffect="non-scaling-stroke"/>})}</svg><div className="analytics-chart-labels">{weekly.map(row=><span key={row.label}>{row.label}<small>{row.value}</small></span>)}</div></div></Section>
      <Section title="Факт времени по объектам"><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Объект</th><th>Часы месяца</th><th>Смена сегодня</th><th>Невыходы</th></tr></thead><tbody>{[...rows].sort((a,b)=>Number(b.monthHours)-Number(a.monthHours)).map(row=><tr key={row.objectId}><td><Link className="cell-title" href={"/objects/"+row.objectId+"?tab=shifts"}>{row.object}</Link></td><td className="num">{Number(row.monthHours).toLocaleString("ru-RU")}</td><td className="num">{row.todayAssigned} / {row.todayDemand}</td><td className="num"><Status tone={row.noShows?"warn":"good"}>{row.noShows||"—"}</Status></td></tr>)}</tbody></table></div></Section>
    </>}

    {view==="timesheets"&&<Section title="Статусы клиентских табелей" note="Последняя клиентская версия по каждому объекту за текущий месяц.">
      <div className="analytics-status-grid">{["draft","submitted","approved","returned"].map(status=>{const count=summary.timesheetStatuses.find(row=>row.status===status)?.count??0;return <div key={status}><span>{statusLabels[status]}</span><strong>{count}</strong></div>})}</div>
      <div className="section-actions"><Link className="button primary" href="/timesheets">Открыть табели</Link></div>
    </Section>}

    {view==="quality"&&<Section title="Качество по объектам" note="Инциденты и невыходы как операционные сигналы.">
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Объект</th><th>Открытые инциденты</th><th>Невыходы сегодня</th><th>Смена сегодня</th><th>Состояние</th></tr></thead><tbody>{[...rows].sort((a,b)=>(b.openIncidents+b.noShows)-(a.openIncidents+a.noShows)).map(row=><tr key={row.objectId}><td><Link className="cell-title" href={"/objects/"+row.objectId+"?tab=quality"}>{row.object}</Link></td><td className="num">{row.openIncidents||"—"}</td><td className="num">{row.noShows||"—"}</td><td className="num">{row.todayAssigned} / {row.todayDemand}</td><td><Status tone={riskTone(0,row.noShows,row.openIncidents)}>{row.openIncidents||row.noShows?"Требует внимания":"Норма"}</Status></td></tr>)}</tbody></table></div>
    </Section>}

    {view==="economics"&&canFinance&&<Section title="Экономика объектов" note="Финансовый факт остаётся единым с модулем Финансы; здесь только сравнительный операционный срез.">
      <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Объект</th><th>Выручка</th><th>Персонал</th><th>Расходы</th><th>Вклад</th><th>Маржа</th></tr></thead><tbody>{filteredFinance.map(row=><tr key={row.id}><td><Link className="cell-title" href={"/objects/"+row.objectId+"?tab=finance"}>{row.object}</Link></td><td className="num">{rub(row.revenue)}</td><td className="num">{rub(row.workerCost)}</td><td className="num">{rub(row.expenses)}</td><td className="num">{rub(row.contribution)}</td><td className="num"><Status tone={Number(row.marginPct)<15?"warn":"good"}>{pct(row.marginPct)}</Status></td></tr>)}</tbody></table></div>
    </Section>}
  </>;
}
