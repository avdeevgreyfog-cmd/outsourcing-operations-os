import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listLaunchTasks } from "@/lib/data/service";
import { listOperationsAnalytics, listStaffingForecast } from "@/lib/operations/service";
import { listRecruitingApplications } from "@/lib/recruiting/service";
import { listLaunchAssignees, listLaunchPlans, listLaunchSiteVisits, listLaunchStaffingWaves } from "@/lib/operations/launch-management";
import { listObjectOperationalFacts } from "@/lib/operations/object-facts";
import { Metric, PageHeader } from "@/components/UI";
import { LaunchExecutionWorkspace } from "@/components/LaunchExecutionWorkspace";
import { isGithubPagesDemo } from "@/lib/demo/pages";

const phaseLabels:Record<string,string>={preparation:"Подготовка",ready:"Готов к запуску",active:"Запуск / стабилизация",completed:"Завершён",cancelled:"Отменён"};

function parseDate(value:string){return new Date(value+"T00:00:00Z")}
function formatDate(value:string|null|undefined){
  if(!value)return "—";
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(parseDate(value));
}
function daysTo(value:string){return Math.round((parseDate(value).getTime()-parseDate(new Date().toISOString().slice(0,10)).getTime())/86_400_000)}

export default async function Launches({searchParams}:{searchParams:Promise<{object?:string;tab?:string;scope?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const canEdit=hasCapability(actor.access,"operations.object.edit");
  const canReadRecruiting=hasCapability(actor.access,"recruiting.candidate.read");
  const canReadNeeds=hasCapability(actor.access,"operations.need.read");

  const [plans,tasks,analytics,waves,visits,applications,forecast,assignees,objectFacts]=await Promise.all([
    listLaunchPlans(actor),
    listLaunchTasks(actor),
    listOperationsAnalytics(actor),
    listLaunchStaffingWaves(actor),
    listLaunchSiteVisits(actor),
    canReadRecruiting?listRecruitingApplications(actor):Promise.resolve([]),
    canReadNeeds?listStaffingForecast(actor,30):Promise.resolve([]),
    listLaunchAssignees(actor),
    listObjectOperationalFacts(actor),
  ]);

  const scope=params.scope==="archive"?"archive":"active";
  const visiblePlans=plans.filter(row=>scope==="archive"?["completed","cancelled"].includes(row.phase):!["completed","cancelled"].includes(row.phase));
  const fallback=visiblePlans[0]??plans[0]??null;
  const selectedPlan=(params.object?plans.find(row=>row.objectId===params.object):null)??fallback;
  const selectedTasks=selectedPlan?tasks.filter(row=>(row.launchId&&row.launchId===selectedPlan.id)||(!row.launchId&&row.objectId===selectedPlan.objectId)):[];
  const selectedWaves=selectedPlan?waves.filter(row=>row.launchId===selectedPlan.id||row.objectId===selectedPlan.objectId):[];
  const selectedVisits=selectedPlan?visits.filter(row=>row.launchId===selectedPlan.id||row.objectId===selectedPlan.objectId):[];
  const selectedAnalytics=selectedPlan?analytics.find(row=>row.objectId===selectedPlan.objectId)??null:null;
  const selectedApplications=selectedPlan?applications.filter(row=>row.objectId===selectedPlan.objectId):[];
  const selectedForecast=selectedPlan?forecast.filter(row=>row.objectId===selectedPlan.objectId):[];
  const selectedFacts=selectedPlan?objectFacts.filter(row=>row.objectId===selectedPlan.objectId):[];

  const summaries=visiblePlans.map(plan=>{
    const rows=tasks.filter(row=>(row.launchId&&row.launchId===plan.id)||(!row.launchId&&row.objectId===plan.objectId));
    const planWaves=waves.filter(row=>row.launchId===plan.id||row.objectId===plan.objectId);
    const fact=analytics.find(row=>row.objectId===plan.objectId);
    const taskBlockers=rows.filter(row=>row.status!=="done"&&row.status!=="cancelled"&&(row.blocksLaunch||row.status==="blocked")).length;
    const visitBlocker=!visits.some(item=>(item.launchId===plan.id||item.objectId===plan.objectId)&&item.visitType==="primary"&&item.status==="completed");
    const nextTask=rows.filter(row=>row.status!=="done"&&row.status!=="cancelled"&&row.endDate).sort((a,b)=>(a.endDate??"").localeCompare(b.endDate??""))[0]??null;
    const sortedWaves=[...planWaves].sort((a,b)=>a.targetDate.localeCompare(b.targetDate));
    const latestWave=sortedWaves.length?sortedWaves[sortedWaves.length-1]:undefined;
    const staffingPlan=latestWave?planWaves.reduce((sum,row)=>sum+(row.status==="cancelled"?0:row.plannedCount),0):(fact?.required??0);
    const staffingReady=(fact?.working??0)+(fact?.preparing??0);
    const staffingGap=Math.max(staffingPlan-staffingReady,0);
    const blockers=taskBlockers+(plan.contractGate==="blocked"?1:0)+(visitBlocker?1:0)+(staffingGap>0?1:0);
    const taskRows=rows.filter(row=>row.status!=="cancelled");
    const taskScore=taskRows.length?Math.round(taskRows.reduce((sum,row)=>sum+Number(row.progress||0),0)/taskRows.length):0;
    const staffingScore=staffingPlan?Math.min(100,Math.round(staffingReady/staffingPlan*100)):100;
    const primaryVisit=visits.find(item=>(item.launchId===plan.id||item.objectId===plan.objectId)&&item.visitType==="primary"&&item.status!=="cancelled")??null;
    const applicable=primaryVisit?.checklist.filter(item=>!item.hidden&&item.status!=="na")??[];
    const visitScore=primaryVisit?(applicable.length?Math.round(applicable.filter(item=>item.status==="confirmed").length/applicable.length*100):0):100;
    const readiness=Math.round(taskScore*.45+staffingScore*.4+visitScore*.15);
    const forecastDelta=plan.forecastDate?Math.round((parseDate(plan.forecastDate).getTime()-parseDate(plan.targetDate).getTime())/86_400_000):0;
    return {plan,blockers,nextTask,staffingPlan,staffingReady,forecastDelta,readiness};
  });

  const upcoming=plans.filter(row=>!["completed","cancelled"].includes(row.phase)&&daysTo(row.targetDate)>=0&&daysTo(row.targetDate)<=14).length;
  const allBlockers=plans.reduce((sum,plan)=>{
    if(["completed","cancelled"].includes(plan.phase))return sum;
    const taskCount=tasks.filter(row=>((row.launchId&&row.launchId===plan.id)||(!row.launchId&&row.objectId===plan.objectId))&&row.status!=="done"&&row.status!=="cancelled"&&(row.blocksLaunch||row.status==="blocked")).length;
    const visitCount=visits.some(item=>(item.launchId===plan.id||item.objectId===plan.objectId)&&item.visitType==="primary"&&item.status==="completed")?0:1;
    const planWaves=waves.filter(row=>row.launchId===plan.id||row.objectId===plan.objectId).filter(row=>row.status!=="cancelled");
    const fact=analytics.find(row=>row.objectId===plan.objectId);
    const staffingPlan=planWaves.length?planWaves.reduce((total,row)=>total+row.plannedCount,0):(fact?.required??0);
    const staffingReady=(fact?.working??0)+(fact?.preparing??0);
    return sum+taskCount+visitCount+(plan.contractGate==="blocked"?1:0)+(staffingPlan>staffingReady?1:0);
  },0);
  const delayed=plans.filter(row=>row.forecastDate&&row.forecastDate>row.targetDate&&!["completed","cancelled"].includes(row.phase)).length;
  const activeCount=plans.filter(row=>!["completed","cancelled"].includes(row.phase)).length;
  const initialTab=(["summary","plan","staffing","visit","issues"].includes(params.tab??"")?params.tab:"summary") as "summary"|"plan"|"staffing"|"visit"|"issues";

  return <div className="launch-execution-page">
    <PageHeader eyebrow="Операции → Управление объектами" title="План запусков" subtitle="Единый график подготовки объекта: задачи, выезды, обеспечение, волны вывода персонала, блокеры и переход к штатной работе." breadcrumbs={[{label:"Операции"},{label:"Управление объектами"},{label:"План запусков"}]}/>

    <div className="metrics-grid launch-portfolio-metrics">
      <Metric label="В подготовке" value={activeCount}/>
      <Metric label="Ближайшие 14 дней" value={upcoming}/>
      <Metric label="Открытые блокеры" value={allBlockers}/>
      <Metric label="С переносом срока" value={delayed}/>
    </div>

    <div className="launch-portfolio-switch">
      <div className="entity-tabs">
        <Link className={scope==="active"?"active":""} href="/launches?scope=active">В работе <span>{activeCount}</span></Link>
        <Link className={scope==="archive"?"active":""} href="/launches?scope=archive">Архив <span>{plans.length-activeCount}</span></Link>
      </div>
    </div>

    <section className="section section-flush launch-portfolio">
      <div className="request-table-wrap"><table className="data-table launch-portfolio-table">
        <thead><tr><th>Объект</th><th>Менеджер</th><th>Фаза</th><th>Срок запуска</th><th>Готовность</th><th>Персонал</th><th>Блокеры</th><th>Следующий шаг</th></tr></thead>
        <tbody>{summaries.map(({plan,blockers,nextTask,staffingPlan,staffingReady,forecastDelta,readiness})=><tr key={plan.id} className={selectedPlan?.id===plan.id?"is-selected":""}>
          <td><Link className="cell-title" href={"/launches?scope="+scope+"&object="+plan.objectId}>{plan.object}</Link><span className="cell-sub">{plan.client}</span></td>
          <td>{plan.ownerName??"Не назначен"}</td>
          <td><span className="launch-phase-text">{phaseLabels[plan.phase]??plan.phase}</span></td>
          <td><strong>{formatDate(plan.targetDate)}</strong>{plan.actualStartDate?<span className="cell-sub">факт {formatDate(plan.actualStartDate)}</span>:forecastDelta>0?<span className="cell-sub">прогноз +{forecastDelta} дн.</span>:<span className="cell-sub">{daysTo(plan.targetDate)>=0?"через "+daysTo(plan.targetDate)+" дн.":"дата прошла"}</span>}</td>
          <td><div className="launch-portfolio-progress"><div className="progress"><span style={{width:Math.min(100,readiness)+"%"}}/></div><span>{readiness}%</span></div></td>
          <td><strong>{staffingReady} / {staffingPlan}</strong><span className="cell-sub">{Math.max(staffingPlan-staffingReady,0)?("не хватает "+Math.max(staffingPlan-staffingReady,0)):"по плану"}</span></td>
          <td><span className={blockers?"launch-blocker-count":""}>{blockers||"—"}</span></td>
          <td>{nextTask?<><strong>{nextTask.title}</strong><span className="cell-sub">{nextTask.endDate?formatDate(nextTask.endDate):nextTask.end}</span></>:<span className="cell-sub">Нет незавершённых задач</span>}</td>
        </tr>)}</tbody>
      </table>{!summaries.length&&<div className="empty-inline">{scope==="archive"?"Завершённых запусков пока нет":"Активных планов запуска нет"}</div>}</div>
    </section>

    {selectedPlan&&<LaunchExecutionWorkspace plan={selectedPlan} tasks={selectedTasks} waves={selectedWaves} visits={selectedVisits} analytics={selectedAnalytics} applications={selectedApplications} forecast={selectedForecast} facts={selectedFacts} assignees={assignees} recruitingVisible={canReadRecruiting} canEdit={canEdit} demo={actor.demo} initialTab={initialTab}/>}
  </div>;
}
