import { isGithubPagesDemo } from "@/lib/demo/pages";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { listAccruals, listPayments, listIncidents, listShifts, listWorkers } from "@/lib/data/service";
import { hasCapability } from "@/lib/core/access.mjs";
import { getOperationsReferenceData, getWorkerOffboardingContext, getWorkerOperationsDetails } from "@/lib/operations/service";
import { WorkerAbsencesWorkspace, WorkerAssignmentsWorkspace } from "@/components/WorkerOperationsWorkspace";
import { WorkerEmploymentWorkspace } from "@/components/WorkerEmploymentWorkspace";
import { Empty, EntityTabs, KeyValue, Section, Status } from "@/components/UI";
import { StaticDemoQueryTabsController } from "@/components/StaticDemoQueryTabsController";
import { rub } from "@/lib/ui/format";
import { PersonAvatar } from "@/components/registry/PersonAvatar";
import { documentsLabel, nextChange, operationalState, rateLabel, scheduleLabel, todayState, todayStateTone } from "@/components/registry/worker-labels";
import { shiftsForWorker, visibleWorkerTabs } from "@/lib/operations/worker-card.mjs";
import { listWorkerActivity } from "@/lib/operations/worker-activity";
import { employmentTypeLabel } from "@/lib/ui/labels";

const labels:Record<string,string>={
  overview:"Обзор",
  employment:"Оформление",
  assignments:"Назначения",
  schedule:"График и отсутствия",
  timesheets:"Табели",
  accruals:"Начисления",
  payments:"Выплаты",
  housing:"Проживание",
  assets:"Имущество и СИЗ",
  documents:"Документы",
  incidents:"Инциденты",
  history:"История",
};


export default async function WorkerPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){
  const {id}=await params;
  const staticDemo=isGithubPagesDemo();
  const {tab:raw}=staticDemo?{}:await searchParams;
  const requestedTab=raw&&labels[raw]?raw:"overview";
  const actor=await requireActor();
  const workers=await listWorkers(actor);
  const worker=workers.find(row=>row.id===id);
  if(!worker)notFound();

  const canEdit=hasCapability(actor.access,"worker.edit");
  const canOffboard=hasCapability(actor.access,"worker.offboarding.manage");
  const canViewAssets=hasCapability(actor.access,"assets.read");
  const canViewHousing=hasCapability(actor.access,"supply.housing.read");
  const sensitive=hasCapability(actor.access,"worker.compensation.read");
  const payments=hasCapability(actor.access,"finance.payments.read");
  const canViewAccruals=sensitive&&hasCapability(actor.access,"finance.worker_accrual.read");
  const canViewIncidents=hasCapability(actor.access,"operations.object.read");
  const canViewTimesheets=hasCapability(actor.access,"time.timesheet.read");
  const visibleTabKeys=visibleWorkerTabs(Object.keys(labels),{assets:canViewAssets,housing:canViewHousing,sensitive,accruals:canViewAccruals,payments,incidents:canViewIncidents,timesheets:canViewTimesheets});
  const tab=visibleTabKeys.includes(requestedTab)?requestedTab:"overview";
  const [rawDetails,offboarding,options,allShifts,accruals,paymentRows,incidents,activity]=await Promise.all([
    getWorkerOperationsDetails(actor,id),
    getWorkerOffboardingContext(actor,id),
    getOperationsReferenceData(actor),
    hasCapability(actor.access,"operations.shift.read")?listShifts(actor):Promise.resolve([]),
    canViewAccruals&&(tab==="accruals"||staticDemo)?listAccruals(actor).then(rows=>rows.filter(row=>row.workerId===id)):Promise.resolve([]),
    sensitive&&payments&&(tab==="payments"||staticDemo)?listPayments(actor).then(rows=>rows.filter(row=>row.workerId===id)):Promise.resolve([]),
    canViewIncidents&&(tab==="incidents"||staticDemo)?listIncidents(actor).then(rows=>rows.filter(row=>row.workerId===id)):Promise.resolve([]),
    tab==="history"||staticDemo?listWorkerActivity(actor,id):Promise.resolve([]),
  ]);
  const details=sensitive?rawDetails:{...rawDetails,assignments:rawDetails.assignments.map(row=>({...row,dayRate:null,nightRate:null}))};
  const today=new Date().toISOString().slice(0,10);
  const shifts=shiftsForWorker(allShifts,id).filter(row=>row.dateIso&&row.dateIso>=today);
  const tabs=visibleTabKeys.map(key=>({label:labels[key],href:"/workers/"+id+"?tab="+key}));
  const panel=(key:string,content:ReactNode)=>{
    if(!visibleTabKeys.includes(key)||(!staticDemo&&tab!==key))return null;
    return <div data-demo-tab-panel={key} style={{display:staticDemo&&key!=="overview"?"none":"contents"}}>{content}</div>;
  };

  const workspace=<>
    <div className="worker-entity-header">
      <nav className="operis-registry-crumb" aria-label="Хлебные крошки"><span>Операции</span><span> / </span><Link href="/workers">Сотрудники</Link><span> / </span><span>{worker.fullName}</span></nav>
      <div className="worker-entity-identity"><PersonAvatar size={64}/><div><h1>{worker.fullName}</h1><p>{worker.specialty??"Специальность не указана"} · {worker.object??"Без назначения"}</p><Status tone={worker.status==="dismissed"?"neutral":todayStateTone(worker)}>{operationalState(worker)}</Status></div><Link className="button worker-back" href="/workers">К реестру</Link></div>
    </div>
    <EntityTabs items={tabs} active={labels[tab]}/>

    {panel("overview",<>
      <div className="worker-entity-summary" aria-label="Текущее состояние">
        <div><span>Сегодня</span><strong>{todayState(worker)}</strong><small>{worker.todayShiftTime??"Время смены не указано"}</small></div>
        <div><span>График</span><strong>{scheduleLabel(worker)}</strong><small>{worker.workMode==="rotation"?"Вахта":worker.workMode==="local"?"Местный персонал":"Формат не указан"}</small></div>
        <div><span>Документы</span><strong>{documentsLabel(worker.employmentDocumentsStatus)}</strong><small><Link href={"/workers/"+id+"?tab=documents"}>Открыть оформление</Link></small></div>
        <div><span>Ближайшее изменение</span><strong>{nextChange(worker)}</strong><small>По сохранённым планам</small></div>
      </div>
      <div className="workspace-grid">
        <Section title="Назначение и ответственность"><div className="worker-entity-facts">
          <KeyValue label="Объект" value={worker.object&&worker.objectId?<Link href={"/objects/"+worker.objectId}>{worker.object}</Link>:"Не назначен"}/>
          <KeyValue label="Менеджер объекта" value={worker.managerName??"—"}/>
          <KeyValue label="Специальность" value={worker.specialty??"—"}/>
          <KeyValue label="Дата начала" value={worker.startDate?displayDate(worker.startDate):"—"}/>
          <KeyValue label="Оформление" value={employmentTypeLabel(worker.employment)}/>
          {sensitive&&<KeyValue label="Действующая ставка" value={rateLabel(worker)} sensitive/>}
          <div className="worker-entity-links"><Link href={"/workers/"+id+"?tab=assignments"}>История и настройки назначения</Link><Link href={"/workers/"+id+"?tab=employment"}>Оформление и завершение работы</Link></div>
        </div></Section>
        <Section title="Контакты и подбор"><div className="worker-entity-facts">
          <KeyValue label="Телефон" value={worker.phone?<a href={"tel:"+worker.phone.replace(/[^+\d]/g,"")}>{worker.phone}</a>:"—"}/>
          <KeyValue label="Источник" value={worker.origin??worker.source??"—"}/>
          <KeyValue label="Первичный рекрутер" value={worker.originalRecruiter??"—"}/>
          {worker.originCandidateId&&<KeyValue label="История подбора" value={<Link href={"/candidates/"+worker.originCandidateId}>Карточка кандидата</Link>}/>}
          <p className="worker-entity-note">Контакты показаны из профиля сотрудника.</p>
        </div></Section>
        <Section title="Ближайшие смены" note="Личные назначения и резерв сотрудника.">
          <div className="stack-list">{shifts.slice(0,4).map(row=><div className="stack-item" key={row.id}><div><strong>{row.date} · {shiftKindLabel(row.kind)}</strong><small>{row.object} · {row.time}</small></div><Status tone={row.reserveWorkerIds.includes(id)?"warn":"info"}>{row.reserveWorkerIds.includes(id)?"Резерв":"Назначен"}</Status></div>)}</div>
          {!shifts.length&&<Empty title="Ближайших смен нет" text="Личные назначения и резерв в доступном периоде не найдены."/>}
        </Section>
        <Section title="Рабочие условия"><div className="worker-entity-facts">
          <KeyValue label="Первые ежедневные выплаты" value={worker.dailyPaymentShifts==null?"—":`${worker.dailyPaymentShifts} смен`}/>
          <KeyValue label="Адаптация" value={worker.transitionDays==null?"—":`${worker.transitionDays} дней`}/>
          {canViewAssets&&<><KeyValue label="Одежда / обувь" value={[worker.clothingSize,worker.shoeSize].filter(Boolean).join(" / ")||"—"}/><KeyValue label="Недостающие СИЗ" value={worker.ppeMissingNames?.length?worker.ppeMissingNames.join(", "):"Не указаны"}/><Link href={"/workers/"+id+"?tab=assets"}>Имущество и обеспечение</Link></>}
        </div></Section>
      </div>
      {sensitive&&<Section title="Финансовая сводка" note="Суммы из действующего реестра; детализация по периодам доступна в финансовых вкладках."><div className="worker-entity-facts"><KeyValue label="Начислено" value={worker.accrued==null?"—":rub(worker.accrued)} sensitive/><KeyValue label="Выплачено" value={worker.paid==null?"—":rub(worker.paid)} sensitive/><KeyValue label="К выплате" value={worker.payable==null?"—":rub(worker.payable)} sensitive/></div></Section>}
    </>)}

    {panel("employment",<WorkerEmploymentWorkspace workerId={id} workerStatus={worker.status} context={offboarding} canOffboard={canOffboard} canAccessAssets={canViewAssets} canAccessHousing={canViewHousing} demo={actor.demo}/>)}
    {panel("assignments",<WorkerAssignmentsWorkspace workerId={id} details={details} options={options} canEdit={canEdit} demo={actor.demo} employmentDocumentsStatus={worker.employmentDocumentsStatus} sensitive={sensitive}/>)}
    {panel("schedule",<>
      <Section title="Ближайшие смены"><div className="stack-list">{shifts.map(row=><div className="stack-item" key={row.id}><div><strong>{row.date} · {row.time}</strong><small>{row.specialty} · {row.object}</small></div><Status tone={row.reserveWorkerIds.includes(id)?"warn":"info"}>{row.reserveWorkerIds.includes(id)?"Резерв":shiftKindLabel(row.kind)}</Status></div>)}</div>{!shifts.length&&<Empty title="Смен нет" text="Для текущего назначения смены не найдены."/>}</Section>
      <div style={{marginTop:16}}><WorkerAbsencesWorkspace workerId={id} details={details} canEdit={canEdit} demo={actor.demo}/></div>
    </>)}
    {panel("accruals",<Section title="Начисления" note="Сохранённые начисления сотрудника по доступным объектам и периодам.">
      {accruals.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Период</th><th>Объект</th><th>База</th><th>Премия</th><th>Корректировка</th><th>Итого</th><th>Статус</th></tr></thead><tbody>{accruals.map(row=><tr key={row.id}><td>{row.period}</td><td>{row.object}</td><td className="num">{rub(row.base)}</td><td className="num">{rub(row.premium)}</td><td className="num">{rub(row.adjustment)}</td><td className="num">{rub(row.total)}</td><td>{recordStatusLabel(row.status)}</td></tr>)}</tbody></table></div>:<Empty title="Начисления не найдены" text="В доступном финансовом контуре нет сохранённых начислений сотрудника."/>}
    </Section>)}
    {panel("payments",<Section title="Выплаты" note="Авансы, ежедневные и обычные выплаты. Плановые платежи показаны отдельно от фактических.">
      {paymentRows.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Дата</th><th>Тип</th><th>Объект</th><th>Сумма</th><th>Основание</th><th>Статус</th></tr></thead><tbody>{paymentRows.map(row=><tr key={row.id}><td>{row.date??"—"}</td><td>{row.purpose==="daily_shift"?"За смену":row.kind==="advance"?"Аванс":"Выплата"}</td><td>{row.object??"—"}</td><td className="num">{rub(row.amount)}</td><td>{row.reference??"—"}</td><td><Status tone={row.status==="paid"?"good":"neutral"}>{recordStatusLabel(row.status)}</Status></td></tr>)}</tbody></table></div>:<Empty title="Выплаты не найдены" text="В доступном финансовом контуре нет записей о выплатах сотруднику."/>}
    </Section>)}
    {panel("housing",<Section title="Проживание" note="Текущие размещения сотрудника и быстрый переход к общему реестру жилья.">{worker.workMode!=="rotation"?<Empty title="Жильё не требуется" text="Текущее назначение сотрудника — местный формат работы."/>:offboarding.housing.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Жильё</th><th>Заезд</th><th>Выезд</th><th>Статус</th></tr></thead><tbody>{offboarding.housing.map(row=><tr key={row.id}><td className="cell-title">{row.site}</td><td>{row.checkIn}</td><td>{row.checkOut??"—"}</td><td><Status tone={row.status==="active"?"good":"info"}>{row.status==="active"?"Проживает":"Запланировано"}</Status></td></tr>)}</tbody></table></div>:<Empty title="Активного проживания нет" text="Для сотрудника нет текущего или планового заселения."/>}<div style={{padding:12}}><Link className="button" href={"/supply/housing?worker="+worker.id}>Открыть жильё</Link></div></Section>)}
    {panel("assets",<Section title="Имущество и СИЗ" note="Размерный профиль и возвратное имущество сотрудника."><div style={{padding:"6px 15px 14px"}}><KeyValue label="Размер одежды" value={worker.clothingSize??"—"}/><KeyValue label="Размер обуви" value={worker.shoeSize??"—"}/><KeyValue label="Рост" value={worker.heightCm?worker.heightCm+" см":"—"}/></div>{offboarding.outstandingAssets.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Позиция</th><th>Вариант / размер</th><th>Количество</th></tr></thead><tbody>{offboarding.outstandingAssets.map(row=><tr key={row.itemId+":"+row.variant}><td className="cell-title">{row.item}</td><td>{row.variant||"—"}</td><td className="num">{row.quantity} {row.unit}</td></tr>)}</tbody></table></div>:<Empty title="Имущество не числится" text="Возвратных позиций на сотруднике нет."/>}<div style={{padding:12}}><Link className="button" href={"/assets?worker="+worker.id+"&action="+(offboarding.outstandingAssets.length?"return":"issue")}>Выдать / вернуть / списать</Link></div></Section>)}
    {panel("documents",<Section title="Документы и оформление" note="Состояние оформления из действующего профиля сотрудника."><div className="worker-entity-facts"><KeyValue label="Готовность" value={documentsLabel(worker.employmentDocumentsStatus)}/><KeyValue label="Тип оформления" value={employmentTypeLabel(worker.employment)}/><KeyValue label="Действует с" value={offboarding.relationFrom??"—"}/><p className="worker-entity-note">Хранение и загрузка файлов документов в карточке пока не подключены. Статус оформления задаётся в настройках назначения.</p>{canEdit&&<Link className="button" href={"/workers/"+id+"?tab=assignments"}>Открыть настройки назначения</Link>}</div></Section>)}
    {panel("timesheets",<Section title="Табели" note="Учёт часов ведётся в табеле объекта."><div className="worker-entity-facts">{details.assignments.length?<div className="stack-list">{Array.from(new Map(details.assignments.map(row=>[row.objectId,row])).values()).map(row=><div className="stack-item" key={row.objectId}><div><strong>{row.object}</strong><small>{row.specialty??"—"}</small></div><Link className="button" href={"/timesheets?object="+row.objectId}>Открыть табель</Link></div>)}</div>:<Empty title="Назначений нет" text="Для перехода к табелю необходимо назначение на объект."/>}<p className="worker-entity-note">Открывается текущий период объекта. Исторические периоды доступны в самом табеле.</p></div></Section>)}
    {panel("incidents",<Section title="Инциденты" note="Только события, связанные с сотрудником по его идентификатору.">{incidents.length?<div className="stack-list">{incidents.map(row=><div className="stack-item" key={row.id}><div><strong>{row.title}</strong><small>{row.occurredAt} · {row.object}</small><p>{row.description}</p></div><Status>{recordStatusLabel(row.status)}</Status></div>)}</div>:<Empty title="Инциденты не найдены" text="В доступных объектах нет зарегистрированных событий по этому сотруднику."/>}</Section>)}
    {panel("history",<Section title="История изменений" note="Последние 100 системных событий сотрудника. История назначений доступна в отдельной вкладке.">{activity.length?<div className="stack-list">{activity.map(row=><div className="stack-item" key={row.id}><div><strong>{row.summary}</strong><small>{row.createdAt} · {row.actor??"Система"}</small></div></div>)}</div>:<Empty title="Системные события не найдены" text={actor.demo?"В демо-режиме журнал реальных изменений не формируется.":"По сотруднику пока нет сохранённых системных событий."}/>}</Section>)}
  </>;
  return <div className="worker-entity-workspace">{staticDemo?<StaticDemoQueryTabsController enabled defaultTab="overview">{workspace}</StaticDemoQueryTabsController>:workspace}</div>;
}

function recordStatusLabel(value:string){return ({draft:"Черновик",planned:"Запланировано",approved:"Утверждено",paid:"Выплачено",cancelled:"Отменено",pending:"Ожидает",open:"Открыт",in_progress:"В работе",resolved:"Разрешён",closed:"Закрыт"} as Record<string,string>)[value]??"Неизвестный статус"}

function shiftKindLabel(value:string){return ({day:"Дневная смена",night:"Ночная смена",mixed:"День / ночь"} as Record<string,string>)[value]??"Смена"}
function displayDate(value:string){return /^\d{4}-\d{2}-\d{2}$/.test(value)?value.split("-").reverse().join("."):value}
