import { githubPagesStaticParams } from "@/lib/demo/static-params";
import { isGithubPagesDemo } from "@/lib/demo/pages";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { listCandidates,listFinance,listIncidents,listLaunchTasks,listNeeds,listObjects,listShifts,listWorkers } from "@/lib/data/service";
import { getHousingSnapshot,getInventorySnapshot,getObjectContacts,listOperationsAnalytics,listStaffingForecast,listSupplyRequests } from "@/lib/operations/service";
import { hasCapability } from "@/lib/core/access.mjs";
import { Empty,EntityTabs,KeyValue,Metric,PageHeader,Section,Status } from "@/components/UI";
import { ObjectContactsWorkspace } from "@/components/ObjectContactsWorkspace";
import { pct,rub } from "@/lib/ui/format";

const labels:Record<string,string>={
  overview:"Обзор",
  launch:"Запуск",
  staffing:"Комплектация",
  workforce:"Персонал",
  shifts:"Смены",
  timesheets:"Табели",
  supply:"Обеспечение",
  quality:"Качество",
  contacts:"Контакты",
  finance:"Финансы",
  documents:"Документы",
  history:"История",
};
const aliases:Record<string,string>={needs:"staffing",recruiting:"staffing",people:"workforce",incidents:"quality",expenses:"finance",activity:"history"};
const objectStatusLabels:Record<string,string>={prelaunch:"Подготовка к запуску",launch:"Запуск",active:"Активен",paused:"Приостановлен",completed:"Завершён",archived:"Архив"};
const riskLabels:Record<string,string>={normal:"Норма",watch:"Контроль",high:"Высокий",critical:"Критический"};
const stageLabels:Record<string,string>={new:"Новый",screening:"Первичный контакт",interview:"Интервью",documents:"Документы",clearance:"Проверка",preparation:"Подготовка",first_shift:"Первый выход",hired:"Вышел"};

export function generateStaticParams(){
  return isGithubPagesDemo()?githubPagesStaticParams.objects.map(id=>({id})):[];
}

export default async function ObjectWorkspace({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}) {
  const {id}=await params;
  const {tab:rawTab}=isGithubPagesDemo()?{}:await searchParams;
  const requested=rawTab?(aliases[rawTab]??rawTab):"overview";
  const actor=await requireActor();
  const objects=await listObjects(actor);
  const object=objects.find(row=>row.id===id);
  if(!object)notFound();

  const canNeeds=hasCapability(actor.access,"operations.need.read");
  const canWorkers=hasCapability(actor.access,"worker.read");
  const canShifts=hasCapability(actor.access,"operations.shift.read");
  const canFinance=hasCapability(actor.access,"finance.pnl.read");
  const canRecruiting=hasCapability(actor.access,"recruiting.candidate.read");
  const canTimesheets=hasCapability(actor.access,"time.timesheet.read");
  const canAssets=hasCapability(actor.access,"assets.read");
  const canHousing=hasCapability(actor.access,"supply.housing.read");
  const canProcurement=hasCapability(actor.access,"procurement.read");
  const canEditObject=hasCapability(actor.access,"operations.object.edit");

  const [needs,workers,shifts,finance,candidates,launchTasks,incidents,analytics,forecast,inventory,housing,supplyRequests,objectContacts]=await Promise.all([
    canNeeds?listNeeds(actor):Promise.resolve([]),
    canWorkers?listWorkers(actor):Promise.resolve([]),
    canShifts?listShifts(actor):Promise.resolve([]),
    canFinance?listFinance(actor):Promise.resolve([]),
    canRecruiting?listCandidates(actor):Promise.resolve([]),
    listLaunchTasks(actor),
    listIncidents(actor),
    listOperationsAnalytics(actor),
    canNeeds?listStaffingForecast(actor,30):Promise.resolve([]),
    canAssets?getInventorySnapshot(actor):Promise.resolve({locations:[],items:[],balances:[]}),
    canHousing?getHousingSnapshot(actor):Promise.resolve({sites:[],stays:[]}),
    canProcurement?listSupplyRequests(actor):Promise.resolve([]),
    getObjectContacts(actor,id),
  ]);

  const objectWorkers=workers.filter(row=>row.objectId===id);
  const objectShifts=shifts.filter(row=>row.objectId===id);
  const objectCandidates=candidates.filter(row=>row.objectId===id);
  const objectLaunchTasks=launchTasks.filter(row=>row.objectId===id);
  const objectIncidents=incidents.filter(row=>row.objectId===id);
  const objectForecast=forecast.filter(row=>row.objectId===id);
  const objectBalances=inventory.balances.filter(row=>row.objectId===id);
  const objectHousing=housing.sites.filter(row=>row.objectId===id);
  const objectSupplyRequests=supplyRequests.filter(row=>row.objectId===id);
  const objectAnalytics=analytics.find(row=>row.objectId===id);
  const objFinance=finance.find(row=>row.objectId===id);

  const projectedAvailable=objectForecast.reduce((sum,row)=>sum+row.projectedAvailable,0);
  const projectedDeficit=objectForecast.reduce((sum,row)=>sum+row.projectedDeficit,0);
  const working=objectAnalytics?.working??object.filled;
  const required=objectAnalytics?.required??object.required;
  const todayAssigned=objectAnalytics?.todayAssigned??0;
  const todayDemand=objectAnalytics?.todayDemand??0;
  const noShows=objectAnalytics?.noShows??0;
  const openIncidents=objectIncidents.filter(row=>row.status!=="resolved").length;
  const lowStock=objectBalances.filter(row=>row.minQuantity>0&&row.quantity<=row.minQuantity);
  const openSupply=objectSupplyRequests.filter(row=>!["closed","rejected"].includes(row.status));
  const launchBlockers=objectLaunchTasks.filter(row=>row.status!=="done"&&(row.status==="blocked"||row.critical||["high","critical"].includes(row.risk)));
  const launchProgress=objectLaunchTasks.length?Math.round(objectLaunchTasks.reduce((sum,row)=>sum+Number(row.progress||0),0)/objectLaunchTasks.length):100;

  const visibleLabels={...labels};
  if(!canNeeds)delete visibleLabels.staffing;
  if(!canWorkers)delete visibleLabels.workforce;
  if(!canShifts)delete visibleLabels.shifts;
  if(!canTimesheets)delete visibleLabels.timesheets;
  if(!(canAssets||canHousing||canProcurement))delete visibleLabels.supply;
  if(!canFinance)delete visibleLabels.finance;
  const tab=visibleLabels[requested]?requested:"overview";
  const tabs=Object.entries(visibleLabels).map(([key,label])=>({
    label,
    href:`/objects/${id}?tab=${key}`,
    count:key==="staffing"?objectForecast.filter(row=>row.projectedDeficit>0).length:key==="workforce"?objectWorkers.length:key==="shifts"?objectShifts.length:key==="quality"?openIncidents:undefined,
  }));

  const candidateStages=Object.entries(objectCandidates.reduce<Record<string,number>>((acc,row)=>{acc[row.stage]=(acc[row.stage]??0)+1;return acc},{}));

  return <>
    <PageHeader eyebrow={"Объект · "+object.code} title={object.name} subtitle={object.client+" · "+object.region} breadcrumbs={[{label:"Операции"},{label:"Объекты",href:"/objects"},{label:object.name}]}/>
    <div className="object-hero">
      <div>
        <Status tone={object.risk==="critical"?"bad":object.risk==="high"?"warn":object.status==="active"?"good":"info"}>{objectStatusLabels[object.status]??"В работе"}</Status>
        <div className="object-meta">
          <div><span>Клиент</span><strong>{object.client}</strong></div>
          <div><span>Регион</span><strong>{object.region}</strong></div>
          <div><span>Менеджер</span><strong>{object.ownerName??"—"}</strong></div>
          <div><span>Старт</span><strong>{object.targetStart??"—"}</strong></div>
          <div><span>Риск</span><strong>{riskLabels[object.risk??"normal"]??"Контроль"}</strong></div>
        </div>
      </div>
      <div className="health"><strong>{required?Math.round(working/required*100):100}%</strong><span>укомплектованность</span></div>
    </div>
    <EntityTabs items={tabs} active={visibleLabels[tab]}/>

    {tab==="overview"&&<>
      <div className="metrics-grid">
        <Metric label="Работает / требуется" value={working+" / "+required}/>
        <Metric label="Прогноз на 30 дней" value={projectedAvailable||working} note={projectedDeficit?"дефицит "+projectedDeficit:"план покрыт"} tone={projectedDeficit?"warn":"good"}/>
        <Metric label="Смена сегодня" value={todayAssigned+" / "+todayDemand} tone={todayDemand>todayAssigned?"warn":"good"}/>
        <Metric label="Невыходы сегодня" value={noShows} tone={noShows?"bad":"good"}/>
      </div>
      <div className="workspace-grid object-overview-grid">
        <div>
          <Section title="Требует внимания" note="Исключения, которые требуют действия менеджера объекта">
            <div className="stack-list">
              {projectedDeficit>0&&<div className="stack-item"><div><strong className="priority-critical">Прогнозный дефицит персонала</strong><small>{projectedDeficit} человек на горизонте 30 дней</small></div><Link className="button" href={"/objects/"+id+"?tab=staffing"}>Комплектация</Link></div>}
              {objectShifts.filter(row=>row.deficit>0).slice(0,3).map(row=><div className="stack-item" key={row.id}><div><strong>{row.date} · {row.specialty}</strong><small>На смену назначено {row.assigned} из {row.demand}</small></div><Status tone="warn">−{row.deficit}</Status></div>)}
              {noShows>0&&<div className="stack-item"><div><strong className="priority-critical">Невыходы на смену</strong><small>Сегодня зафиксировано {noShows}</small></div><Link className="button" href={"/objects/"+id+"?tab=quality"}>Открыть</Link></div>}
              {lowStock.slice(0,2).map(row=><div className="stack-item" key={row.locationId+row.itemId+row.variant}><div><strong>Заканчивается {row.item}</strong><small>{row.location} · остаток {row.quantity} {row.unit} · минимум {row.minQuantity}</small></div><Link className="button" href={"/assets?object="+id}>Запасы</Link></div>)}
              {launchBlockers.slice(0,2).map(row=><div className="stack-item" key={row.id}><div><strong>Блокер запуска: {row.title}</strong><small>{row.owner} · прогресс {row.progress}%</small></div><Link className="button" href={"/objects/"+id+"?tab=launch"}>Запуск</Link></div>)}
              {!projectedDeficit&&!objectShifts.some(row=>row.deficit>0)&&!noShows&&!lowStock.length&&!launchBlockers.length&&<div className="empty-inline">Критических операционных исключений нет</div>}
            </div>
          </Section>
          <Section title="Ближайшие смены"><ShiftTable rows={objectShifts.slice(0,5)}/>{!objectShifts.length&&<Empty title="Смен нет" text="На доступном горизонте смены не запланированы."/>}</Section>
        </div>
        <div>
          <Section title="Состояние объекта">
            <div style={{padding:"6px 15px 14px"}}>
              <KeyValue label="Плановая численность" value={required}/>
              <KeyValue label="Работает" value={working}/>
              <KeyValue label="Готовятся к выходу" value={objectAnalytics?.preparing??0}/>
              <KeyValue label="Открытые инциденты" value={openIncidents}/>
              <KeyValue label="Открытые заявки на обеспечение" value={openSupply.length}/>
              <KeyValue label="Готовность плана запуска" value={launchProgress+"%"}/>
            </div>
          </Section>
          <Section title="Быстрые действия">
            <div className="object-quick-links">
              {canNeeds&&<Link href={"/staffing-plan?object="+id}>План комплектации <span>→</span></Link>}
              {canTimesheets&&<Link href={"/timesheets?object="+id}>Табель объекта <span>→</span></Link>}
              {canAssets&&<Link href={"/assets?object="+id}>Запасы и имущество <span>→</span></Link>}
              {canHousing&&<Link href={"/supply/housing?object="+id}>Жильё <span>→</span></Link>}
              <Link href={"/operations/analytics?object="+id}>Аналитика объекта <span>→</span></Link>
            </div>
          </Section>
          {objFinance&&<Section title="Финансовый факт"><div style={{padding:"6px 15px 14px"}}><KeyValue label="Выручка" value={rub(objFinance.revenue)} sensitive/><KeyValue label="Затраты на персонал" value={rub(objFinance.workerCost)} sensitive/><KeyValue label="Расходы объекта" value={rub(objFinance.expenses)} sensitive/><KeyValue label="Маржа" value={pct(objFinance.marginPct)} sensitive/></div></Section>}
        </div>
      </div>
    </>}

    {tab==="launch"&&<>
      <div className="metrics-grid">
        <Metric label="Готовность плана" value={launchProgress+"%"}/>
        <Metric label="Задачи" value={objectLaunchTasks.length}/>
        <Metric label="Критические блокеры" value={launchBlockers.length} tone={launchBlockers.length?"bad":"good"}/>
        <Metric label="Контрольные точки" value={objectLaunchTasks.filter(row=>row.milestone).length}/>
      </div>
      <div className="workspace-grid">
        <Section title="Готовность к запуску" note="План запуска использует фактическое состояние комплектации и операционных контуров.">
          <div className="readiness-list">
            <ReadinessRow label="План задач" value={launchProgress}/>
            <ReadinessRow label="Комплектация" value={required?Math.min(100,Math.round((working+(objectAnalytics?.preparing??0))/required*100)):100}/>
            <ReadinessRow label="Первая / текущая смена" value={todayDemand?Math.min(100,Math.round(todayAssigned/todayDemand*100)):100}/>
            <ReadinessRow label="Обеспечение" value={lowStock.length?Math.max(0,100-lowStock.length*15):100}/>
          </div>
        </Section>
        <Section title="Блокеры">
          <div className="stack-list">{launchBlockers.slice(0,8).map(row=><div className="stack-item" key={row.id}><div><strong>{row.title}</strong><small>{row.owner} · {row.start}–{row.end}</small></div><Status tone={row.risk==="critical"?"bad":"warn"}>{riskLabels[row.risk]??"Контроль"}</Status></div>)}</div>
          {!launchBlockers.length&&<div className="empty-inline">Критических блокеров нет</div>}
        </Section>
      </div>
      <Section title="Контрольные задачи" note="Полный Gantt, baseline и риски доступны в плане запусков.">
        <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Задача</th><th>Ответственный</th><th>План</th><th>Прогресс</th><th>Статус</th><th>Риск</th></tr></thead><tbody>{objectLaunchTasks.slice(0,12).map(row=><tr key={row.id}><td className="cell-title">{row.title}</td><td>{row.owner}</td><td>{row.start+"–"+row.end}</td><td className="num">{row.progress}%</td><td><Status tone={row.status==="done"?"good":row.status==="blocked"?"bad":"info"}>{row.status==="done"?"Готово":row.status==="blocked"?"Заблокировано":"В работе"}</Status></td><td><Status tone={row.risk==="critical"?"bad":row.risk==="high"?"warn":"neutral"}>{riskLabels[row.risk]??"Норма"}</Status></td></tr>)}</tbody></table></div>
        <div className="section-actions"><Link className="button primary" href={"/launches?object="+id}>Открыть полный план запуска</Link></div>
      </Section>
    </>}

    {tab==="staffing"&&<>
      <div className="metrics-grid">
        <Metric label="План" value={required}/>
        <Metric label="Работает" value={working}/>
        <Metric label="Прогноз через 30 дней" value={projectedAvailable||working}/>
        <Metric label="Прогнозный дефицит" value={projectedDeficit} tone={projectedDeficit?"warn":"good"}/>
      </div>
      <Section title="План по профессиям" note="Комплектация отвечает за план численности. Потребности и подбор — исполнительные контуры закрытия дефицита.">
        <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Профессия</th><th>План</th><th>Работает</th><th>Готовятся</th><th>Подтв. отсутствия</th><th>Плановые выходы</th><th>Риск отсутствий</th><th>Прогноз</th><th>Дефицит</th></tr></thead><tbody>{objectForecast.map(row=><tr key={row.specialtyId}><td className="cell-title">{row.specialty}</td><td className="num">{row.required}</td><td className="num">{row.working}</td><td className="num">{row.preparing}</td><td className="num">{row.confirmedAbsences||"—"}</td><td className="num">{row.plannedExits||"—"}</td><td className="num">{row.tentativeAbsences||"—"}</td><td className="num">{row.projectedAvailable}</td><td className="num"><Status tone={row.projectedDeficit?"warn":"good"}>{row.projectedDeficit}</Status></td></tr>)}</tbody></table></div>
        {!objectForecast.length&&<Empty title="План комплектации не сформирован" text="Для объекта нет активных потребностей по профессиям."/>}
        <div className="section-actions"><Link className="button" href={"/needs?object="+id}>Потребности</Link><Link className="button" href={"/recruiting?object="+id}>Подбор по объекту</Link><Link className="button primary" href={"/staffing-plan?object="+id}>Открыть план комплектации</Link></div>
      </Section>
      {candidateStages.length>0&&<Section title="Воронка подготовки" note="Сводно по кандидатам этого объекта, без дублирования самой воронки подбора."><div className="candidate-stage-strip">{candidateStages.map(([stage,count])=><div key={stage}><span>{stageLabels[stage]??stage}</span><strong>{count}</strong></div>)}</div></Section>}
    </>}

    {tab==="workforce"&&<>
      <div className="metrics-grid"><Metric label="Сотрудники на объекте" value={objectWorkers.length}/><Metric label="Местные" value={objectWorkers.filter(row=>row.workMode!=="rotation").length}/><Metric label="Вахта" value={objectWorkers.filter(row=>row.workMode==="rotation").length}/><Metric label="Сейчас отсутствуют" value={objectWorkers.filter(row=>objectWorkerState(row)!=="Работает").length} tone={objectWorkers.some(row=>objectWorkerState(row)!=="Работает")?"warn":undefined}/></div>
      <Section title="Сотрудники">
        <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Сотрудник</th><th>Специальность</th><th>Формат</th><th>Сейчас</th><th>Возврат / изменение</th><th>Ставка</th><th>Оформление</th></tr></thead><tbody>{objectWorkers.map(row=><tr key={row.id}><td><Link className="cell-title" href={"/workers/"+row.id}>{row.fullName}</Link></td><td>{row.specialty??"—"}</td><td>{row.workMode==="rotation"?"Вахта":"Местный"}</td><td><Status tone={objectWorkerState(row)==="Работает"?"good":"info"}>{objectWorkerState(row)}</Status></td><td>{objectWorkerAvailability(row)}</td><td className="num">{objectWorkerRate(row)}</td><td>{row.employment??"—"}</td></tr>)}</tbody></table></div>
        {!objectWorkers.length&&<Empty title="Назначений нет" text="На объект не назначены доступные вам сотрудники."/>}
      </Section>
      
    </>}

    {tab==="shifts"&&<Section title="Смены объекта"><ShiftTable rows={objectShifts}/>{!objectShifts.length&&<Empty title="Смен нет" text="На объекте пока нет запланированных смен."/>}<div className="section-actions"><Link className="button primary" href="/shifts">Открыть графики и смены</Link></div></Section>}

    {tab==="timesheets"&&<Section title="Табели объекта" note="Внутренний факт и клиентская версия используют один источник времени."><Empty title="Рабочее место табеля" text="Откройте табель сразу с фильтром по этому объекту." action={<Link className="button primary" href={"/timesheets?object="+id}>Открыть табель объекта</Link>}/></Section>}

    {tab==="supply"&&<>
      <div className="metrics-grid">
        <Metric label="Мест проживания" value={objectHousing.reduce((sum,row)=>sum+row.capacity,0)}/>
        <Metric label="Занято" value={objectHousing.reduce((sum,row)=>sum+row.occupied,0)}/>
        <Metric label="Позиции ниже минимума" value={lowStock.length} tone={lowStock.length?"warn":"good"}/>
        <Metric label="Открытые заявки" value={openSupply.length} tone={openSupply.length?"warn":undefined}/>
      </div>
      <div className="workspace-grid">
        {canHousing&&<Section title="Жильё"><div className="stack-list">{objectHousing.map(row=><div className="stack-item" key={row.id}><div><strong>{row.name}</strong><small>{row.occupied} занято · {row.available} свободно · {rub(row.monthlyForecast)}/мес</small></div><Status tone={row.available>0?"good":"warn"}>{row.capacity} мест</Status></div>)}</div>{!objectHousing.length&&<div className="empty-inline">Жильё к объекту не привязано</div>}<div className="section-actions"><Link className="button" href={"/supply/housing?object="+id}>Открыть жильё</Link></div></Section>}
        {canAssets&&<Section title="Запасы на объекте"><div className="stack-list">{objectBalances.filter(row=>row.minQuantity>0).slice(0,8).map(row=><div className="stack-item" key={row.locationId+row.itemId+row.variant}><div><strong>{row.item}{row.variant?" · "+row.variant:""}</strong><small>{row.location} · минимум {row.minQuantity}</small></div><Status tone={row.quantity<=row.minQuantity?"warn":"good"}>{row.quantity} {row.unit}</Status></div>)}</div>{!objectBalances.length&&<div className="empty-inline">Остатки на объекте не заведены</div>}<div className="section-actions"><Link className="button" href={"/assets?object="+id}>Открыть запасы</Link></div></Section>}
      </div>
      {canProcurement&&<Section title="Заявки на обеспечение"><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Заявка</th><th>Тип</th><th>Количество</th><th>Сумма</th><th>Статус</th></tr></thead><tbody>{objectSupplyRequests.slice(0,10).map(row=><tr key={row.id}><td className="cell-title">{row.title}</td><td>{row.requestType==="purchase"?"Закупка":row.requestType==="payment"?"Оплата":row.requestType==="compensation"?"Компенсация":"Услуга"}</td><td className="num">{row.quantity==null?"—":row.quantity+" "+(row.unit??"")}</td><td className="num">{row.amount==null?"—":rub(row.amount)}</td><td><Status tone={row.status==="closed"?"good":row.status==="rejected"?"bad":"info"}>{row.status==="submitted"?"Подана":row.status==="approved"?"Согласована":row.status==="in_progress"?"В работе":row.status==="received"?"Исполнено":row.status==="closed"?"Закрыта":row.status==="rejected"?"Отклонена":row.status}</Status></td></tr>)}</tbody></table></div><div className="section-actions"><Link className="button primary" href={"/procurement?object="+id}>Заявки на обеспечение</Link></div></Section>}
    </>}

    {tab==="quality"&&<>
      <div className="metrics-grid"><Metric label="Открытые инциденты" value={openIncidents} tone={openIncidents?"warn":"good"}/><Metric label="Критические" value={objectIncidents.filter(row=>row.status!=="resolved"&&row.severity==="critical").length} tone="bad"/><Metric label="Всего записей" value={objectIncidents.length}/><Metric label="Невыходы сегодня" value={noShows} tone={noShows?"bad":"good"}/></div>
      <Section title="Инциденты и качество"><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Инцидент</th><th>Дата</th><th>Сотрудник</th><th>Ответственный</th><th>Критичность</th><th>Статус</th></tr></thead><tbody>{objectIncidents.map(row=><tr key={row.id}><td><strong className="cell-title">{row.title}</strong><span className="cell-sub">{row.description}</span></td><td>{row.occurredAt}</td><td>{row.worker??"—"}</td><td>{row.responsible??"—"}</td><td><Status tone={row.severity==="critical"?"bad":row.severity==="high"?"warn":"neutral"}>{row.severity==="critical"?"Критическая":row.severity==="high"?"Высокая":"Обычная"}</Status></td><td>{row.status==="resolved"?"Закрыт":"Открыт"}</td></tr>)}</tbody></table></div>{!objectIncidents.length&&<Empty title="Инцидентов нет" text="По объекту не зафиксировано инцидентов."/>}<div className="section-actions"><Link className="button" href={"/incidents?object="+id}>Открыть все инциденты</Link></div></Section>
    </>}

    {tab==="contacts"&&<ObjectContactsWorkspace objectId={id} assigned={objectContacts.assigned} contacts={objectContacts.contacts} canEdit={canEditObject} demo={actor.demo}/>}

    {tab==="finance"&&objFinance&&<><div className="metrics-grid"><Metric label="Выручка" value={rub(objFinance.revenue)}/><Metric label="Персонал" value={rub(objFinance.workerCost)}/><Metric label="Прямые расходы" value={rub(objFinance.expenses)}/><Metric label="Маржа" value={pct(objFinance.marginPct)} tone={Number(objFinance.marginPct)<15?"warn":"good"}/></div><Section title="Финансовый факт"><div style={{padding:16,maxWidth:640}}><KeyValue label="Выручка" value={rub(objFinance.revenue)} sensitive/><KeyValue label="Затраты на персонал" value={rub(objFinance.workerCost)} sensitive/><KeyValue label="Прямые расходы" value={rub(objFinance.expenses)} sensitive/><KeyValue label="Вклад в прибыль" value={rub(objFinance.contribution)} sensitive/><KeyValue label="Маржа" value={pct(objFinance.marginPct)} sensitive/></div></Section></>}

    {tab==="documents"&&<Section title="Документы объекта"><Empty title="Документы объекта" text="Здесь останутся только объектовые документы и сроки; документы сотрудников ведутся в их карточках и контуре допусков."/></Section>}
    {tab==="history"&&<Section title="История объекта"><Empty title="Системная история" text="Изменения запуска, назначений, численности, обеспечения и других связанных процессов будут собираться здесь одной лентой."/></Section>}
  </>;
}

function ReadinessRow({label,value}:{label:string;value:number}){
  return <div className="readiness-row"><div><strong>{label}</strong><span>{value}%</span></div><div className="progress"><span style={{width:Math.max(0,Math.min(100,value))+"%"}}/></div></div>;
}
function ShiftTable({rows}:{rows:Awaited<ReturnType<typeof listShifts>>}){
  return <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Смена</th><th>Позиция</th><th>Потребность</th><th>Назначено</th><th>Резерв</th><th>Дефицит</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.date} · {row.kind}</strong><span className="cell-sub">{row.time}</span></td><td>{row.specialty}</td><td className="num">{row.demand}</td><td className="num">{row.assigned}</td><td className="num">{row.reserve}</td><td className="num"><Status tone={row.deficit?"warn":"good"}>{row.deficit}</Status></td></tr>)}</tbody></table></div>;
}

function objectWorkerState(row:{status:string;absenceStatus?:string|null;absenceType?:string|null;absenceFrom?:string|null;absenceTo?:string|null}){if(row.status==="dismissed")return"Работа завершена";const today=new Date().toISOString().slice(0,10);if(row.absenceStatus==="confirmed"&&row.absenceFrom&&row.absenceFrom<=today&&(!row.absenceTo||row.absenceTo>=today))return({intershift:"Межвахта",vacation:"Отпуск",sick:"Больничный",personal:"Личное отсутствие",other:"Отсутствие"} as Record<string,string>)[row.absenceType??""]??"Отсутствует";return"Работает"}
function objectWorkerAvailability(row:{absenceStatus?:string|null;absenceType?:string|null;absenceFrom?:string|null;absenceTo?:string|null}){if(!row.absenceFrom)return"—";const today=new Date().toISOString().slice(0,10);if(row.absenceStatus==="confirmed"&&row.absenceFrom<=today&&(!row.absenceTo||row.absenceTo>=today)){if(!row.absenceTo)return"Возврат не определён";const d=new Date(row.absenceTo+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+1);return"Возврат "+new Intl.DateTimeFormat("ru-RU").format(d)}return(({intershift:"Межвахта",vacation:"Отпуск",sick:"Больничный",personal:"Отсутствие",other:"Отсутствие"} as Record<string,string>)[row.absenceType??""]??"Изменение")+" с "+new Intl.DateTimeFormat("ru-RU").format(new Date(row.absenceFrom+"T00:00:00"))}
function objectWorkerRate(row:{rate:number|string|null;rateUnit?:string|null;paidHoursPerShift?:number|string|null}){if(row.rate==null)return"—";if(row.rateUnit==="shift"&&Number(row.paidHoursPerShift)>0)return rub(row.rate)+"/см · "+rub(Number(row.rate)/Number(row.paidHoursPerShift))+"/ч";return rub(row.rate)+(row.rateUnit==="shift"?"/см":row.rateUnit==="month"?"/мес":"/ч")}
