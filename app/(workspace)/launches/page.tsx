import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { listLaunchTasks, listObjects } from "@/lib/data/service";
import { listOperationsAnalytics } from "@/lib/operations/service";
import { Metric, PageHeader, Section, Status } from "@/components/UI";
import { LaunchGantt } from "@/components/LaunchGantt";
import { isGithubPagesDemo } from "@/lib/demo/pages";

const riskLabels:Record<string,string>={normal:"Норма",watch:"Контроль",high:"Высокий",critical:"Критический"};
const statusLabels:Record<string,string>={planned:"Подготовка",in_progress:"В работе",blocked:"Заблокировано",done:"Готово",cancelled:"Отменено"};

export default async function Launches({searchParams}:{searchParams:Promise<{object?:string;view?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const [rows,objects,analytics]=await Promise.all([listLaunchTasks(actor),listObjects(actor),listOperationsAnalytics(actor)]);
  const objectIds=[...new Set(rows.map(row=>row.objectId))];
  const selectedId=(params.object&&objectIds.includes(params.object))?params.object:objectIds[0]??objects[0]?.id;
  const view=["summary","plan","gantt","risks"].includes(params.view??"")?params.view!:"summary";
  const selectedRows=rows.filter(row=>row.objectId===selectedId);
  const selectedObject=objects.find(row=>row.id===selectedId);
  const selectedAnalytics=analytics.find(row=>row.objectId===selectedId);
  const summaries=objectIds.map(objectId=>{
    const tasks=rows.filter(row=>row.objectId===objectId);
    const object=objects.find(row=>row.id===objectId);
    const progress=Math.round(tasks.reduce((sum,row)=>sum+Number(row.progress||0),0)/Math.max(tasks.length,1));
    const critical=tasks.filter(row=>row.status!=="done"&&(row.critical||["high","critical"].includes(row.risk))).length;
    const meta=tasks[0];
    const launchProgress=meta?.launchProgress??progress;
    return {objectId,object:object?.name??meta?.object??"Объект",client:object?.client??"—",target:meta?.launchTarget??object?.targetStart??"—",forecast:meta?.launchForecast??"—",progress:Number(launchProgress),risk:meta?.launchRisk??object?.risk??"normal",critical};
  });
  const launchProgress=selectedRows[0]?.launchProgress??(selectedRows.length?Math.round(selectedRows.reduce((sum,row)=>sum+row.progress,0)/selectedRows.length):0);
  const blockers=selectedRows.filter(row=>row.status==="blocked"||row.status!=="done"&&(row.critical||["high","critical"].includes(row.risk)));
  const staffingReady=selectedAnalytics?.required?Math.min(100,Math.round(((selectedAnalytics.working+selectedAnalytics.preparing)/selectedAnalytics.required)*100)):100;
  const operationalReady=selectedAnalytics?.todayDemand?Math.min(100,Math.round(selectedAnalytics.todayAssigned/selectedAnalytics.todayDemand*100)):100;
  const dimensions=[
    {label:"План и контрольные задачи",value:Number(launchProgress),tone:Number(launchProgress)>=90?"good":Number(launchProgress)>=70?"info":"warn"},
    {label:"Комплектация персоналом",value:staffingReady,tone:staffingReady>=90?"good":staffingReady>=70?"info":"warn"},
    {label:"Операционная готовность смен",value:operationalReady,tone:operationalReady>=90?"good":operationalReady>=70?"info":"warn"},
    {label:"Критические зависимости",value:blockers.length?Math.max(0,100-blockers.length*15):100,tone:blockers.length?"warn":"good"},
  ] as const;
  const readiness=Math.round(dimensions.reduce((sum,row)=>sum+row.value,0)/dimensions.length);
  const tabs=["summary","plan","gantt","risks"].map(key=>({key,label:key==="summary"?"Сводка":key==="plan"?"План":key==="gantt"?"Gantt":"Риски"}));

  return <>
    <PageHeader eyebrow="Операции → Управление объектами" title="План запусков" subtitle="Подготовка новых объектов, контроль готовности, зависимостей и критических блокеров до выхода на стабильную работу." breadcrumbs={[{label:"Операции"},{label:"Управление объектами"},{label:"План запусков"}]}/>
    <div className="metrics-grid">
      <Metric label="Запуски в контуре" value={summaries.length}/>
      <Metric label="В работе" value={summaries.filter(row=>row.progress<100).length}/>
      <Metric label="Критические блокеры" value={summaries.reduce((sum,row)=>sum+row.critical,0)} tone={summaries.some(row=>row.critical)?"bad":"good"}/>
      <Metric label="Средняя готовность" value={(summaries.length?Math.round(summaries.reduce((sum,row)=>sum+row.progress,0)/summaries.length):0)+"%"}/>
    </div>

    <Section title="Запуски" note="Выберите объект, чтобы открыть его readiness, план задач, Gantt и риски.">
      <div className="request-table-wrap"><table className="data-table">
        <thead><tr><th>Объект</th><th>Клиент</th><th>Плановый старт</th><th>Прогноз</th><th>Готовность</th><th>Риск</th><th>Блокеры</th></tr></thead>
        <tbody>{summaries.map(row=><tr key={row.objectId}>
          <td><Link className="cell-title" href={"/launches?object="+row.objectId}>{row.object}</Link></td><td>{row.client}</td><td>{row.target}</td><td>{row.forecast}</td>
          <td><div className="object-coverage"><div className="progress"><span style={{width:Math.min(100,row.progress)+"%"}}/></div><span>{row.progress}%</span></div></td>
          <td><Status tone={row.risk==="critical"?"bad":row.risk==="high"||row.risk==="watch"?"warn":"good"}>{riskLabels[row.risk]??"Контроль"}</Status></td>
          <td className="num">{row.critical||"—"}</td>
        </tr>)}</tbody>
      </table>{!summaries.length&&<div className="empty-inline">Планы запуска ещё не созданы</div>}</div>
    </Section>

    {selectedObject&&<section className="section launch-workspace">
      <div className="section-head">
        <div><div className="eyebrow">План запуска</div><h2>{selectedObject.name}</h2><p>{selectedObject.client} · плановый старт {selectedRows[0]?.launchTarget??selectedObject.targetStart??"—"}</p></div>
        <div className="launch-readiness-head"><span>Готовность запуска</span><strong>{readiness}%</strong></div>
      </div>
      <div className="entity-tabs launch-tabs">{tabs.map(item=><Link key={item.key} className={view===item.key?"active":""} href={"/launches?object="+selectedObject.id+"&view="+item.key}>{item.label}</Link>)}</div>

      {view==="summary"&&<div className="launch-summary-grid">
        <Section title="Готовность по направлениям">
          <div className="readiness-list">{dimensions.map(item=><div className="readiness-row" key={item.label}><div><strong>{item.label}</strong><span>{item.value}%</span></div><div className="progress"><span style={{width:item.value+"%"}}/></div></div>)}</div>
        </Section>
        <Section title="Критические блокеры" note={blockers.length?"Требуют решения до запуска":"Критических блокеров нет"}>
          <div className="stack-list">{blockers.slice(0,6).map(row=><div className="stack-item" key={row.id}><div><strong>{row.title}</strong><small>{row.owner} · план {row.start}–{row.end}</small></div><Status tone={row.risk==="critical"?"bad":"warn"}>{riskLabels[row.risk]??"Контроль"}</Status></div>)}</div>
          {!blockers.length&&<div className="empty-inline">Критических блокеров нет</div>}
        </Section>
        <Section title="Контрольные точки">
          <div className="stack-list">{selectedRows.filter(row=>row.milestone).slice(0,8).map(row=><div className="stack-item" key={row.id}><div><strong>{row.title}</strong><small>{row.start} · {row.owner}</small></div><Status tone={row.status==="done"?"good":"info"}>{statusLabels[row.status]??"В работе"}</Status></div>)}</div>
          {!selectedRows.some(row=>row.milestone)&&<div className="empty-inline">Контрольные точки не заданы</div>}
        </Section>
        <Section title="Операционная готовность">
          <div className="launch-operational-grid launch-operational-grid-content">
            <div><span>Плановая численность</span><strong>{selectedAnalytics?.required??0}</strong></div>
            <div><span>Работает</span><strong>{selectedAnalytics?.working??0}</strong></div>
            <div><span>Готовятся</span><strong>{selectedAnalytics?.preparing??0}</strong></div>
            <div><span>Дефицит</span><strong>{selectedAnalytics?.deficit??0}</strong></div>
          </div>
        </Section>
      </div>}

      {view==="plan"&&<div className="request-table-wrap"><table className="data-table">
        <thead><tr><th>Задача</th><th>Ответственный</th><th>Baseline</th><th>Текущий план</th><th>Прогресс</th><th>Статус</th><th>Риск</th></tr></thead>
        <tbody>{selectedRows.map(row=><tr key={row.id}><td className="launch-task-cell" style={{paddingLeft:14+row.level*18}}><strong className="cell-title">{row.title}</strong>{row.critical&&<span className="cell-sub">Критический путь</span>}</td><td>{row.owner}</td><td>{(row.baselineStart??"—")+"–"+(row.baselineEnd??"—")}</td><td>{row.start+"–"+row.end}</td><td className="num">{row.progress}%</td><td><Status tone={row.status==="done"?"good":row.status==="blocked"?"bad":"info"}>{statusLabels[row.status]??"В работе"}</Status></td><td><Status tone={row.risk==="critical"?"bad":row.risk==="high"?"warn":"neutral"}>{riskLabels[row.risk]??"Норма"}</Status></td></tr>)}</tbody>
      </table></div>}

      {view==="gantt"&&<LaunchGantt rows={selectedRows}/>}
      {view==="risks"&&<div className="stack-list launch-risk-list">{selectedRows.filter(row=>row.status!=="done"&&row.risk!=="normal").map(row=><div className="stack-item" key={row.id}><div><strong>{row.title}</strong><small>{row.owner} · {row.start}–{row.end} · прогресс {row.progress}%</small></div><Status tone={row.risk==="critical"?"bad":"warn"}>{riskLabels[row.risk]??"Контроль"}</Status></div>)}</div>}
    </section>}
  </>;
}
