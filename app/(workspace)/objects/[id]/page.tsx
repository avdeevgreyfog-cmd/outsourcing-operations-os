import { isGithubPagesDemo } from "@/lib/demo/pages";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { getTimesheet,listAccruals,listFinance,listIncidents,listLaunchTasks,listObjects,listPayments,listShifts,listWorkers } from "@/lib/data/service";
import { getHousingSnapshot,getInventorySnapshot,getObjectContacts,getOperationsReferenceData,listDailyPaymentProgress,listObjectDocuments,listObjectPpeTemplates,listOperationsAnalytics,listStaffingForecast,listSupplyRequests } from "@/lib/operations/service";
import { getObjectManagementOptions,listObjectHistory } from "@/lib/operations/object-management";
import { canReadRow,hasCapability } from "@/lib/core/access.mjs";
import { Empty,EntityTabs,Metric,Section,Status } from "@/components/UI";
import { StaticDemoQueryTabsController } from "@/components/StaticDemoQueryTabsController";
import { ObjectContactsWorkspace } from "@/components/ObjectContactsWorkspace";
import { ObjectSettingsWorkspace } from "@/components/ObjectSettingsWorkspace";
import { ObjectWorkforceWorkspace } from "@/components/ObjectWorkforceWorkspace";
import { ObjectSupplyWorkspace } from "@/components/ObjectSupplyWorkspace";
import { ObjectShiftsWorkspace } from "@/components/ObjectShiftsWorkspace";
import { ObjectStaffingWorkspace } from "@/components/ObjectStaffingWorkspace";
import { ObjectFinanceWorkspace } from "@/components/ObjectFinanceWorkspace";
import { ObjectDocumentsWorkspace } from "@/components/ObjectDocumentsWorkspace";
import { ObjectQualityWorkspace } from "@/components/ObjectQualityWorkspace";
import { TimesheetWorkspace } from "@/components/TimesheetWorkspace";
import { listRecruitingApplications } from "@/lib/recruiting/service";
import { listContracts } from "@/lib/commercial/contracts";
import { pct,rub } from "@/lib/ui/format";
import { absenceTypeLabel } from "@/lib/operations/workforce-status";

const labels:Record<string,string>={
  overview:"Обзор",
  launch:"Запуск",
  staffing:"Комплектация",
  workforce:"Персонал",
  shifts:"Смены",
  timesheets:"Табели",
  supply:"Обеспечение",
  quality:"Инциденты",
  contacts:"Контакты",
  finance:"Финансы",
  documents:"Документы",
  settings:"Настройки",
  history:"История",
};
const aliases:Record<string,string>={needs:"staffing",recruiting:"staffing",people:"workforce",incidents:"quality",expenses:"finance",activity:"history"};
const objectStatusLabels:Record<string,string>={prelaunch:"Подготовка к запуску",launch:"Запуск",active:"Активен",paused:"Приостановлен",completed:"Завершён",archived:"Архив"};
const riskLabels:Record<string,string>={normal:"Норма",watch:"Контроль",high:"Высокий",critical:"Критический"};

export default async function ObjectWorkspace({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string;month?:string}>}) {
  const {id}=await params;
  const staticDemo=isGithubPagesDemo();
  const {tab:rawTab,month}=staticDemo?{}:await searchParams;
  const requested=rawTab?(aliases[rawTab]??rawTab):"overview";
  const actor=await requireActor();
  const objects=await listObjects(actor);
  const object=objects.find(row=>row.id===id);
  if(!object)notFound();

  const canNeeds=hasCapability(actor.access,"operations.need.read");
  const canEditNeeds=hasCapability(actor.access,"operations.need.edit");
  const canWorkers=hasCapability(actor.access,"worker.read");
  const canShifts=hasCapability(actor.access,"operations.shift.read");
  const canPnl=hasCapability(actor.access,"finance.pnl.read");
  const canAccruals=hasCapability(actor.access,"finance.worker_accrual.read");
  const canPayments=hasCapability(actor.access,"finance.payments.read");
  const canConfirmDaily=hasCapability(actor.access,"finance.daily_payment.confirm")&&canReadRow(actor.access,"finance.daily_payment.confirm",object,actor);
  const canRecordPayment=hasCapability(actor.access,"finance.object_payment.record")&&canReadRow(actor.access,"finance.object_payment.record",object,actor);
  const canFinanceAdjust=hasCapability(actor.access,"finance.worker_accrual.edit")&&canReadRow(actor.access,"finance.worker_accrual.edit",object,actor);
  const canEditWorkers=hasCapability(actor.access,"worker.edit");
  const canOffboard=hasCapability(actor.access,"worker.offboarding.manage")&&canReadRow(actor.access,"worker.offboarding.manage",object,actor);
  const canManageAssets=hasCapability(actor.access,"assets.manage")&&canReadRow(actor.access,"assets.manage",object,actor);
  const canEditShifts=hasCapability(actor.access,"operations.shift.edit")&&canReadRow(actor.access,"operations.shift.edit",object,actor);
  const canFinance=canPnl||canAccruals||canPayments;
  const canRecruiting=hasCapability(actor.access,"recruiting.candidate.read");
  const canTimesheets=hasCapability(actor.access,"time.timesheet.read");
  const canAssets=hasCapability(actor.access,"assets.read");
  const canHousing=hasCapability(actor.access,"supply.housing.read");
  const canProcurement=hasCapability(actor.access,"procurement.read");
  const canEditObject=canReadRow(actor.access,"operations.object.edit",object,actor);
  const canAssignObject=hasCapability(actor.access,"operations.object.assign");
  const objectManagementOptions=canEditObject?await getObjectManagementOptions(actor,{includeAssignments:canAssignObject}):null;
  const objectHistory=await listObjectHistory(actor,id,100);

  const [workers,shifts,finance,accruals,payments,dailyPayments,objectDocuments,ppeTemplates,candidates,launchTasks,incidents,analytics,forecast,inventory,housing,supplyRequests,objectContacts,objectTimesheet,timesheetOptions,workforceOptions]=await Promise.all([
    canWorkers?listWorkers(actor):Promise.resolve([]),
    canShifts?listShifts(actor):Promise.resolve([]),
    canPnl?listFinance(actor):Promise.resolve([]),
    canAccruals?listAccruals(actor):Promise.resolve([]),
    canPayments?listPayments(actor):Promise.resolve([]),
    canPayments?listDailyPaymentProgress(actor,id):Promise.resolve([]),
    listObjectDocuments(actor,id),
    canAssets?listObjectPpeTemplates(actor,id):Promise.resolve([]),
    canRecruiting?listRecruitingApplications(actor):Promise.resolve([]),
    listLaunchTasks(actor),
    listIncidents(actor),
    listOperationsAnalytics(actor),
    canNeeds?listStaffingForecast(actor,30):Promise.resolve([]),
    canAssets?getInventorySnapshot(actor):Promise.resolve({locations:[],items:[],balances:[]}),
    canHousing?getHousingSnapshot(actor):Promise.resolve({sites:[],stays:[]}),
    canProcurement?listSupplyRequests(actor):Promise.resolve([]),
    getObjectContacts(actor,id),
    canTimesheets?getTimesheet(actor,{objectId:id,month:month??null}):Promise.resolve(null),
    canTimesheets?getOperationsReferenceData(actor,"time.timesheet.read",{includeWorkers:false,includeSpecialties:false}):Promise.resolve({objects:[],specialties:[],workers:[]}),
    (canWorkers||canAssets)?getOperationsReferenceData(actor,canWorkers?"worker.read":"assets.read",{includeWorkers:false,includeSpecialties:true}):Promise.resolve({objects:[],specialties:[],workers:[]}),
  ]);

  const objectWorkers=workers.filter(row=>row.objectId===id);
  const objectShifts=shifts.filter(row=>row.objectId===id);
  const objectCandidates=candidates.filter(row=>row.objectId===id);
  const objectLaunchTasks=launchTasks.filter(row=>row.objectId===id);
  const objectIncidents=incidents.filter(row=>row.objectId===id);
  const objectForecast=forecast.filter(row=>row.objectId===id);
  const objectSpecialtyNames=new Set([
    ...objectForecast.map(row=>row.specialty),
    ...objectWorkers.map(row=>row.specialty).filter((value):value is string=>Boolean(value)),
  ]);
  const objectSupplySpecialties=workforceOptions.specialties.filter(row=>objectSpecialtyNames.has(row.name));
  const objectBalances=inventory.balances.filter(row=>row.objectId===id);
  const objectHousing=housing.sites.filter(row=>row.objectId===id);
  const objectSupplyRequests=supplyRequests.filter(row=>row.objectId===id);
  const objectAnalytics=analytics.find(row=>row.objectId===id);
  const objFinance=finance.find(row=>row.objectId===id)??null;
  const objectAccruals=accruals.filter(row=>row.objectId===id);
  const objectPayments=payments.filter(row=>row.objectId===id);
  const objectContracts=hasCapability(actor.access,"contract.read")?(await listContracts(actor)).filter(row=>row.objectId===id):[];
  const linkedObjectDocuments=[...(object.sourceRequestId?[{id:"request:"+object.sourceRequestId,label:"Исходная заявка",meta:"Коммерческий контур",href:"/requests/"+object.sourceRequestId}]:[]),...(object.sourceProposalId?[{id:"proposal:"+object.sourceProposalId,label:"Согласованное коммерческое предложение",meta:"Коммерческий контур",href:"/proposals/"+object.sourceProposalId}]:[]),...objectContracts.map(row=>({id:"contract:"+row.id,label:row.number?`Договор № ${row.number}`:row.title,meta:row.status==="signed"?"Подписан":"Договорной контур",href:"/contracts/"+row.id}))];

  const projectedAvailable=objectForecast.reduce((sum,row)=>sum+row.projectedAvailable,0);
  const projectedDeficit=objectForecast.reduce((sum,row)=>sum+row.projectedDeficit,0);
  const working=objectAnalytics?.working??object.filled;
  const required=objectAnalytics?.required??object.required;
  const todayAssigned=objectAnalytics?.todayAssigned??0;
  const todayDemand=objectAnalytics?.todayDemand??0;
  const noShows=objectAnalytics?.noShows??0;
  const openIncidents=objectIncidents.filter(row=>!["resolved","closed"].includes(row.status)).length;
  const lowStock=objectBalances.filter(row=>row.minQuantity>0&&row.quantity<=row.minQuantity);
  const openSupply=objectSupplyRequests.filter(row=>!["closed","rejected"].includes(row.status));
  const launchBlockers=objectLaunchTasks.filter(row=>row.status!=="done"&&(row.status==="blocked"||row.critical||["high","critical"].includes(row.risk)));
  const launchProgress=objectLaunchTasks.length?Math.round(objectLaunchTasks.reduce((sum,row)=>sum+Number(row.progress||0),0)/objectLaunchTasks.length):100;
  const currentDeficit=Math.max(required-working,0);
  const forecastAvailable=objectForecast.length?projectedAvailable:working;
  const effectiveForecastCovered=Math.max(required-projectedDeficit,0);
  const projectedSurplus=Math.max(forecastAvailable-effectiveForecastCovered,0);
  const plannedExitCount=objectForecast.reduce((sum,row)=>sum+row.plannedExits,0);
  const todayIso=new Date().toISOString().slice(0,10);
  const nextSevenEnd=addDaysIso(todayIso,7);
  const horizonEnd=addDaysIso(todayIso,30);
  const readyStarts7=objectCandidates.filter(row=>row.plannedStartDate&&row.plannedStartDate>=todayIso&&row.plannedStartDate<=nextSevenEnd&&["preparation","first_shift"].includes(row.stage)).length;
  const unreconciledObjectPayments=objectPayments.filter(row=>row.status==="paid"&&row.reconciliationStatus==="unreconciled"&&Number(row.amount||0)>0);
  const unreconciledObjectAmount=unreconciledObjectPayments.reduce((sum,row)=>sum+Number(row.amount||0),0);
  const documentAttentionCount=objectDocuments.filter(row=>row.status==="needs_update"||(row.status!=="archived"&&row.expiresAt!=null&&row.expiresAt<=addDaysIso(todayIso,30))).length;
  const upcomingShiftRows=objectShifts.filter(row=>(row.dateIso??"")>=todayIso&&(row.dateIso??"")<=nextSevenEnd).slice(0,6);
  const upcomingAbsences=objectWorkers
    .filter(row=>row.absenceFrom&&["confirmed","tentative"].includes(row.absenceStatus??"")&&row.absenceFrom<=horizonEnd&&(!row.absenceTo||row.absenceTo>=todayIso))
    .sort((a,b)=>(a.absenceFrom??"").localeCompare(b.absenceFrom??""));
  const operationalRisk=objectOperationalRisk(object.risk,projectedDeficit,noShows,openIncidents);
  const showLaunch=object.status==="prelaunch"||object.status==="launch"||objectLaunchTasks.some(row=>row.status!=="done");

  const visibleLabels={...labels};
  if(!showLaunch)delete visibleLabels.launch;
  if(!canNeeds)delete visibleLabels.staffing;
  if(!canWorkers)delete visibleLabels.workforce;
  if(!canShifts)delete visibleLabels.shifts;
  if(!canTimesheets)delete visibleLabels.timesheets;
  if(!(canAssets||canHousing||canProcurement))delete visibleLabels.supply;
  if(!canFinance)delete visibleLabels.finance;
  if(!canEditObject)delete visibleLabels.settings;
  const tab=visibleLabels[requested]?requested:"overview";
  const tabOrder=["overview",...(showLaunch?["launch"]:[]),"workforce","staffing","shifts","timesheets","supply","contacts","finance","documents","quality","settings","history"];
  const tabs=tabOrder.filter(key=>visibleLabels[key]).map(key=>({
    label:visibleLabels[key],
    href:`/objects/${id}?tab=${key}${month?`&month=${encodeURIComponent(month)}`:""}`,
    count:key==="staffing"?objectForecast.filter(row=>row.projectedDeficit>0).length:key==="workforce"?objectWorkers.length:key==="shifts"?objectShifts.length:key==="quality"?openIncidents:undefined,
  }));
  const panel=(key:string,content:ReactNode)=>{
    if(!visibleLabels[key]||(!staticDemo&&tab!==key))return null;
    return <div data-demo-tab-panel={key} style={{display:staticDemo&&key!=="overview"?"none":"contents"}}>{content}</div>;
  };


  const workspaceClass="object-workspace-compare object-workspace-pilot";
  const workspaceContent=<>
    <div className="object-pilot-breadcrumbs"><Link href="/objects">Объекты</Link><span>/</span><span>{object.code}</span></div>
    <div className="object-pilot-header">
      <div className="object-pilot-title">
        <div><Status tone={operationalRisk==="critical"?"bad":operationalRisk==="high"?"warn":object.status==="active"?"good":"info"}>{objectStatusLabels[object.status]??"В работе"}</Status><span className="object-pilot-code">{object.code}</span></div>
        <h1>{object.name}</h1>
        <p>{object.client} · {object.address??object.region}</p>
      </div>
      <div className="object-pilot-health"><strong>{required?Math.round(working/required*100)+"%":"—"}</strong><span>укомплектованность</span><small>{working} из {required||"—"} работают</small></div>
      <div className="object-pilot-meta">
        <div><span>Менеджер</span><strong>{object.ownerName??"—"}{object.additionalManagers?.length?` +${object.additionalManagers.length}`:""}</strong></div>
        <div><span>Юрлицо</span><strong>{object.legalEntity??"Не указано"}</strong></div>
        <div><span>Старт</span><strong>{object.targetStart??"—"}</strong></div>
        <div><span>Риск</span><strong>{riskLabels[operationalRisk]??"Контроль"}</strong></div>
      </div>
      <div className="object-primary-nav"><EntityTabs items={tabs} active={visibleLabels[tab]}/></div>
    </div>

    {panel("overview",<>
      <div className="metrics-grid object-operations-metrics object-overview-metrics">
        <Metric label="Работает / требуется" value={working+" / "+required} note={currentDeficit?`дефицит ${currentDeficit}`:"план закрыт"} tone={currentDeficit?"warn":"good"}/>
        <Metric label="Смена сегодня" value={todayAssigned+" / "+todayDemand} note={todayDemand?(noShows?`невыходов ${noShows}`:"по плану"):"смена не задана"} tone={todayDemand>todayAssigned||noShows?"warn":"good"}/>
        <Metric label="Готовы к выходу · 7 дней" value={readyStarts7} note={readyStarts7?"согласованные ближайшие выходы":"выходов не запланировано"}/>
        <Metric label="Через 30 дней" value={effectiveForecastCovered+" / "+required} note={projectedDeficit?`прогнозный дефицит ${projectedDeficit}`:"план покрыт"} tone={projectedDeficit?"warn":"good"}/>
      </div>

      <div className="workspace-grid object-overview-grid object-overview-grid-v2">
        <div className="object-overview-main">
          <Section title="Требует внимания" note="События, которые требуют действия менеджера объекта">
            <div className="stack-list object-overview-attention">
              {noShows>0&&<div className="stack-item is-critical"><div><strong>Невыходы на смену</strong><small>Сегодня зафиксировано {noShows}</small></div><Link className="button" href={"/objects/"+id+"?tab=quality"}>Разобрать</Link></div>}
              {objectShifts.filter(row=>row.deficit>0).slice(0,2).map(row=><div className="stack-item" key={row.id}><div><strong>{row.date} · {shiftKindLabel(row.kind)} · {row.specialty}</strong><small>Назначено {row.assigned} из {row.demand} · не хватает {row.deficit}</small></div><Link className="button" href={"/objects/"+id+"?tab=shifts"}>Смены</Link></div>)}
              {projectedDeficit>0&&<div className="stack-item"><div><strong>Прогнозный дефицит персонала</strong><small>{projectedDeficit} человек на горизонте 30 дней · закрыто {effectiveForecastCovered} из {required}</small></div><Link className="button" href={"/objects/"+id+"?tab=staffing"}>Комплектация</Link></div>}
              {unreconciledObjectPayments.length>0&&<div className="stack-item"><div><strong>Выплаты ожидают сверки</strong><small>{unreconciledObjectPayments.length} · {rub(unreconciledObjectAmount)}</small></div><Link className="button" href={"/objects/"+id+"?tab=finance"}>Финансы</Link></div>}
              {documentAttentionCount>0&&<div className="stack-item"><div><strong>Документы требуют внимания</strong><small>{documentAttentionCount} документов нужно проверить или обновить</small></div><Link className="button" href={"/objects/"+id+"?tab=documents"}>Документы</Link></div>}
              {openIncidents>0&&<div className="stack-item"><div><strong>Открытые инциденты</strong><small>{openIncidents} требуют контроля</small></div><Link className="button" href={"/objects/"+id+"?tab=quality"}>Инциденты</Link></div>}
              {lowStock.slice(0,2).map(row=><div className="stack-item" key={row.locationId+row.itemId+row.variant}><div><strong>Заканчивается {row.item}</strong><small>{row.location} · остаток {row.quantity} {row.unit} · минимум {row.minQuantity}</small></div><Link className="button" href={"/objects/"+id+"?tab=supply"}>Обеспечение</Link></div>)}
              {upcomingAbsences.length>0&&<div className="stack-item"><div><strong>Ближайшее отсутствие сотрудника</strong><small>{upcomingAbsences[0].fullName} · {absenceWindow(upcomingAbsences[0])}</small></div><Link className="button" href={"/objects/"+id+"?tab=workforce"}>Персонал</Link></div>}
              {showLaunch&&launchBlockers.slice(0,1).map(row=><div className="stack-item" key={row.id}><div><strong>Блокер запуска: {row.title}</strong><small>{row.owner} · прогресс {row.progress}%</small></div><Link className="button" href={"/objects/"+id+"?tab=launch"}>Запуск</Link></div>)}
              {!projectedDeficit&&!upcomingAbsences.length&&!objectShifts.some(row=>row.deficit>0)&&!noShows&&!openIncidents&&!lowStock.length&&!unreconciledObjectPayments.length&&!documentAttentionCount&&(!showLaunch||!launchBlockers.length)&&<div className="empty-inline">Операционных исключений, требующих действия, нет</div>}
            </div>
          </Section>

          <Section title="Ближайшие смены" note="План и обеспеченность на ближайшие 7 дней">
            <ShiftTable rows={upcomingShiftRows}/>
            {!upcomingShiftRows.length&&<Empty title="Смен нет" text="На ближайшие 7 дней смены не запланированы."/>}
          </Section>
        </div>

        <div className="object-overview-side">
          <Section title="Сегодня и ближайшие 7 дней" note="Что изменится в работе объекта">
            <div className="object-overview-timeline">
              {upcomingShiftRows.slice(0,4).map(row=><div key={row.id}><span>{row.date}</span><div><strong>{shiftKindLabel(row.kind)} · {row.specialty}</strong><small>{row.time} · назначено {row.assigned} из {row.demand}{row.deficit?` · дефицит ${row.deficit}`:""}</small></div></div>)}
              {objectCandidates.filter(row=>row.plannedStartDate&&row.plannedStartDate>=todayIso&&row.plannedStartDate<=nextSevenEnd&&["preparation","first_shift"].includes(row.stage)).slice(0,3).map(row=><div key={row.applicationId}><span>{shortDateRu(row.plannedStartDate!)}</span><div><strong>Выход: {row.fullName}</strong><small>{row.need}{row.plannedShiftKind?` · ${shiftKindLabel(row.plannedShiftKind)}`:""}</small></div></div>)}
              {upcomingAbsences.filter(row=>row.absenceFrom&&row.absenceFrom<=nextSevenEnd).slice(0,2).map(row=><div key={"absence:"+row.id}><span>{row.absenceFrom?shortDateRu(row.absenceFrom):"—"}</span><div><strong>{row.fullName}</strong><small>{absenceWindow(row)}</small></div></div>)}
              {!upcomingShiftRows.length&&!readyStarts7&&!upcomingAbsences.some(row=>row.absenceFrom&&row.absenceFrom<=nextSevenEnd)&&<div className="empty-inline">На ближайшие 7 дней изменений нет</div>}
            </div>
          </Section>

          <Section title="Состояние объекта" note="Переходите только туда, где есть отклонение">
            <div className="object-overview-contours">
              <Link href={"/objects/"+id+"?tab=staffing"}><span>Комплектация</span><strong className={projectedDeficit?"has-attention":""}>{projectedDeficit?`Дефицит ${projectedDeficit}`:"Без отклонений"}</strong></Link>
              {canTimesheets&&<Link href={"/objects/"+id+"?tab=timesheets"}><span>Табель</span><strong>{objectTimesheet?timesheetStatusLabel(objectTimesheet.status):"Нет табеля"}</strong></Link>}
              {(canAssets||canHousing||canProcurement)&&<Link href={"/objects/"+id+"?tab=supply"}><span>Обеспечение</span><strong className={lowStock.length||openSupply.length?"has-attention":""}>{lowStock.length?`Ниже минимума ${lowStock.length}`:openSupply.length?`Заявок в работе ${openSupply.length}`:"Без отклонений"}</strong></Link>}
              {canFinance&&<Link href={"/objects/"+id+"?tab=finance"}><span>Финансы</span><strong className={unreconciledObjectPayments.length?"has-attention":""}>{unreconciledObjectPayments.length?`На сверке ${rub(unreconciledObjectAmount)}`:"Без отклонений"}</strong></Link>}
              <Link href={"/objects/"+id+"?tab=documents"}><span>Документы</span><strong className={documentAttentionCount?"has-attention":""}>{documentAttentionCount?`Требуют внимания ${documentAttentionCount}`:"Без отклонений"}</strong></Link>
              <Link href={"/objects/"+id+"?tab=quality"}><span>Инциденты</span><strong className={openIncidents?"has-attention":""}>{openIncidents?`Открыто ${openIncidents}`:"Нет открытых"}</strong></Link>
            </div>
          </Section>

          <Section title="Контакт заказчика">
            {objectContacts.assigned[0]?<div className="object-overview-contact"><div><strong>{objectContacts.assigned[0].fullName}</strong><span>{objectContacts.assigned[0].position??"Должность не указана"}</span><small>{objectContacts.assigned[0].roles.slice(0,2).map(objectContactRoleLabel).join(" · ")||"Зона ответственности не указана"}</small></div><div><span>{objectContactChannel(objectContacts.assigned[0])}</span><Link href={"/objects/"+id+"?tab=contacts"}>Все контакты</Link></div></div>:<div className="empty-inline">Контакт заказчика не назначен</div>}
          </Section>
        </div>
      </div>
    </>)}

    {panel("launch",<>
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
    </>)}

    {panel("staffing",<ObjectStaffingWorkspace objectId={id} forecast={objectForecast} applications={objectCandidates} workers={objectWorkers} today={todayIso} canEditNeed={canEditNeeds} canFeedback={canEditObject} demo={actor.demo}/>)}

    {panel("workforce",<div className="object-module-shell"><div className="object-module-head"><div><h2>Персонал</h2><p>Сотрудники объекта, текущие состояния, графики, документы и обеспечение.</p></div></div><ObjectWorkforceWorkspace workers={objectWorkers} today={todayIso} objectId={id} objectName={object.name} objects={workforceOptions.objects} canEdit={canEditWorkers} canOffboard={canOffboard} canManageAssets={canManageAssets} demo={actor.demo} specialties={workforceOptions.specialties} pilot/>{!objectWorkers.length&&<Empty title="Назначений нет" text="На объект пока не назначены сотрудники."/>}</div>)}

    {panel("shifts",<div className="object-module-shell"><div className="object-module-head"><div><h2>Смены</h2><p>Планирование выходов, покрытие потребности и работа с отклонениями. Факт приходит из табеля.</p></div></div><ObjectShiftsWorkspace objectId={id} rows={objectShifts} workers={objectWorkers} today={todayIso} canEdit={canEditShifts} canPlanAbsence={canEditWorkers} demo={actor.demo} pilot/></div>)}

    {panel("timesheets",<div className="object-module-shell"><div className="object-module-head"><div><h2>Табели</h2><p>Фактические выходы и часы, фиксация согласованного табеля и отдельный финансовый контур.</p></div></div>{objectTimesheet?<TimesheetWorkspace data={objectTimesheet} options={timesheetOptions} sensitive={hasCapability(actor.access,"worker.compensation.read")} canEdit={hasCapability(actor.access,"time.time_entry.edit")} canSubmit={hasCapability(actor.access,"time.timesheet.submit")} canReview={hasCapability(actor.access,"time.timesheet.review")} canClose={hasCapability(actor.access,"finance.worker_accrual.edit")} embedded pilot/>:<Empty title="Нет доступного табеля" text="Для объекта пока нет сотрудников или доступного периода."/>}</div>)}

    {panel("supply",<ObjectSupplyWorkspace
      objectId={id}
      workers={objectWorkers}
      balances={objectBalances}
      inventoryItems={inventory.items}
      templates={ppeTemplates}
      specialties={objectSupplySpecialties}
      housing={objectHousing}
      requests={objectSupplyRequests}
      canAssets={canAssets}
      canHousing={canHousing}
      canProcurement={canProcurement}
      canManageAssets={canManageAssets}
      demo={actor.demo}
    />)}

    {panel("quality",<>
      <div className="metrics-grid"><Metric label="Открытые инциденты" value={openIncidents} tone={openIncidents?"warn":"good"}/><Metric label="Критические" value={objectIncidents.filter(row=>!["resolved","closed"].includes(row.status)&&row.severity==="critical").length} tone={objectIncidents.some(row=>!["resolved","closed"].includes(row.status)&&row.severity==="critical")?"bad":"good"}/><Metric label="Финансовые последствия" value={objectIncidents.filter(row=>Number(row.financialEffectAmount??0)>0&&row.financialEffectStatus==="proposed").length} tone={objectIncidents.some(row=>row.financialEffectStatus==="proposed")?"warn":"good"}/><Metric label="Невыходы сегодня" value={noShows} tone={noShows?"bad":"good"}/></div>
      <Section title="Инциденты и нарушения" note="Фиксируйте событие, сотрудника и последствия. Предлагаемая сумма не удерживается автоматически."><ObjectQualityWorkspace objectId={id} rows={objectIncidents} workers={objectWorkers} canEdit={canEditObject} canFinance={canFinanceAdjust} demo={actor.demo}/><div className="section-actions"><Link className="button" href={"/incidents?object="+id}>Общий журнал</Link></div></Section>
    </>)}

    {panel("contacts",<ObjectContactsWorkspace objectId={id} assigned={objectContacts.assigned} contacts={objectContacts.contacts} canEdit={canEditObject} demo={actor.demo}/>)}

    {panel("finance",<Section title="Финансы объекта" note="Операционный контроль начислений, выплат, ежедневной схемы и сверки с финансовым контуром."><ObjectFinanceWorkspace objectId={id} pnl={objFinance} accruals={objectAccruals} payments={objectPayments} daily={dailyPayments} incidents={objectIncidents} objectDefaultDailyPaymentShifts={object.defaultDailyPaymentShifts??0} canConfirmDaily={canConfirmDaily} canRecordPayment={canRecordPayment} canReconcilePayments={canFinanceAdjust} canEditWorker={canEditWorkers} demo={actor.demo}/><div className="section-actions"><Link className="button" href="/finance">Полный финансовый контур</Link></div></Section>)}

    {panel("documents",<Section title="Документы объекта" note="Рабочие документы объекта и ссылки на исходные коммерческие и договорные сущности без дублирования файлов."><ObjectDocumentsWorkspace objectId={id} rows={objectDocuments} linked={linkedObjectDocuments} canEdit={canEditObject} demo={actor.demo}/></Section>)}
    {objectManagementOptions&&panel("settings",<ObjectSettingsWorkspace object={object} options={objectManagementOptions} demo={actor.demo} canAssign={canAssignObject}/>)}
        {panel("history",<Section title="История объекта" note="Системные изменения объекта и ответственности. Комментарии пользователей ведутся отдельно.">{objectHistory.length?<div className="object-history-list">{objectHistory.map(item=><article key={item.id}><time>{item.createdAt}</time><div><strong>{objectHistoryLabel(item.verb,item.summary)}</strong><span>{item.actor}</span></div></article>)}</div>:<Empty title="История пока пуста" text="Значимые изменения объекта будут автоматически появляться здесь."/>}</Section>)}
  </>;
  return staticDemo
    ?<StaticDemoQueryTabsController enabled defaultTab="overview" className={workspaceClass}>{workspaceContent}</StaticDemoQueryTabsController>
    :<div className={workspaceClass}>{workspaceContent}</div>;
}

function ReadinessRow({label,value}:{label:string;value:number}){
  return <div className="readiness-row"><div><strong>{label}</strong><span>{value}%</span></div><div className="progress"><span style={{width:Math.max(0,Math.min(100,value))+"%"}}/></div></div>;
}
function ShiftTable({rows}:{rows:Awaited<ReturnType<typeof listShifts>>}){
  return <div className="request-table-wrap"><table className="data-table object-overview-shifts"><thead><tr><th>Смена</th><th>Позиция</th><th>План</th><th>Назначено</th><th>Подтверждено</th><th>Резерв</th><th>Дефицит</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><strong>{row.date} · {shiftKindLabel(row.kind)}</strong><span className="cell-sub">{row.time}</span></td><td>{row.specialty}</td><td className="num">{row.demand}</td><td className="num">{row.assigned}</td><td className="num">{row.confirmed??"—"}</td><td className="num">{row.reserve}</td><td className="num"><span className={"object-shift-deficit"+(row.deficit?" has-deficit":"")}>{row.deficit?`−${row.deficit}`:"0"}</span></td></tr>)}</tbody></table></div>;
}
function objectOperationalRisk(base:string|null|undefined,projectedDeficit:number,noShows:number,openIncidents:number){
  const rank:Record<string,number>={normal:0,watch:1,high:2,critical:3};
  let value=rank[base??"normal"]==null?"normal":base??"normal";
  if(openIncidents>0&&rank[value]<rank.watch)value="watch";
  if((projectedDeficit>0||noShows>0)&&rank[value]<rank.high)value="high";
  return value;
}
function addDaysIso(value:string,days:number){const date=new Date(value+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
function shortDateRu(value:string){return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"))}
function shiftKindLabel(value:string|null|undefined){return ({day:"День",night:"Ночь",mixed:"День / ночь"} as Record<string,string>)[value??""]??"Смена"}
function timesheetStatusLabel(value:string|null|undefined){return ({draft:"Черновик",submitted:"Передан",approved:"Согласован",returned:"Возвращён",internal_submitted:"На внутренней проверке",internal_checked:"Проверен внутри",client_sent:"Отправлен клиенту",client_approved:"Подтверждён клиентом",closed:"Закрыт"} as Record<string,string>)[value??""]??"Статус не указан"}
function absenceWindow(row:{absenceType?:string|null;absenceStatus?:string|null;absenceFrom?:string|null;absenceTo?:string|null}){
  if(!row.absenceFrom)return absenceTypeLabel(row.absenceType);
  const from=new Intl.DateTimeFormat("ru-RU").format(new Date(row.absenceFrom+"T00:00:00"));
  const to=row.absenceTo?new Intl.DateTimeFormat("ru-RU").format(new Date(row.absenceTo+"T00:00:00")):null;
  return absenceTypeLabel(row.absenceType)+" · "+from+(to?"–"+to:"");
}
const objectContactRoleLabels:Record<string,string>={operations:"Операционные вопросы",timesheet:"Табель",security:"СБ / пропуска",warehouse_ppe:"Склад / СИЗ",documents:"Документы",finance:"Финансы",approval:"Согласования",contract_signer:"Подписание договора",closing_signer:"Закрывающие",other:"Другое"};
function objectContactRoleLabel(role:string){return objectContactRoleLabels[role]??"Другое"}
function objectContactChannel(contact:{preferredChannel:string|null;phone:string|null;email:string|null;telegram:string|null;whatsapp:string|null;maxContact:string|null}){
  if(contact.preferredChannel==="telegram"&&contact.telegram)return contact.telegram;
  if(contact.preferredChannel==="whatsapp"&&contact.whatsapp)return contact.whatsapp;
  if(contact.preferredChannel==="max"&&contact.maxContact)return contact.maxContact;
  if(contact.preferredChannel==="email"&&contact.email)return contact.email;
  return contact.phone??contact.telegram??contact.whatsapp??contact.email??contact.maxContact??"—";
}


function objectHistoryLabel(verb:string,summary:string){
  if(summary)return summary;
  return ({
    created_manual:"Объект добавлен вручную",
    created_from_proposal:"Объект создан из согласованного КП",
    manager_handover:"Передан основному менеджеру",
    settings_updated:"Обновлены настройки объекта",
  } as Record<string,string>)[verb]??"Изменён объект";
}