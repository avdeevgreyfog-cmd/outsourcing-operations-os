import { isGithubPagesDemo } from "@/lib/demo/pages";
import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { listShifts, listWorkers } from "@/lib/data/service";
import { hasCapability } from "@/lib/core/access.mjs";
import { getOperationsReferenceData, getWorkerOffboardingContext, getWorkerOperationsDetails } from "@/lib/operations/service";
import { WorkerAbsencesWorkspace, WorkerAssignmentsWorkspace } from "@/components/WorkerOperationsWorkspace";
import { WorkerDataEditor } from "@/components/WorkerDataEditor";
import { getWorkerEditorContext } from "@/lib/operations/worker-editor";
import { WorkerProfileTabs } from "@/components/WorkerProfileTabs";
import { getWorkerRecords } from "@/lib/operations/worker-records";
import { WorkerEmploymentWorkspace } from "@/components/WorkerEmploymentWorkspace";
import {WorkerConfirmationManager} from "@/components/WorkerConfirmationManager";
import { Empty, KeyValue, Metric, PageHeader, Section, Status } from "@/components/UI";
import { StaticDemoQueryTabsController } from "@/components/StaticDemoQueryTabsController";
import { rub } from "@/lib/ui/format";
import { employmentTypeLabel, shiftKindLabel } from "@/lib/ui/labels";

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
  const tab=(requestedTab==="assets"&&!canViewAssets)||(requestedTab==="housing"&&!canViewHousing)?"overview":requestedTab;
  const [details,offboarding,options,shifts,records,editor]=await Promise.all([
    getWorkerOperationsDetails(actor,id),
    getWorkerOffboardingContext(actor,id),
    getOperationsReferenceData(actor),
    hasCapability(actor.access,"operations.shift.read")?listShifts(actor).then(rows=>rows.filter(row=>row.objectId===worker.objectId)):Promise.resolve([]),
    staticDemo||["documents","incidents","history"].includes(tab)?getWorkerRecords(actor,worker):Promise.resolve({documents:[],incidents:[],history:[]}),
    staticDemo||["overview","employment","history"].includes(tab)?getWorkerEditorContext(actor,id):Promise.resolve(null),
  ]);
  const visibleTabKeys=Object.keys(labels).filter((key)=>{
    if(key==="assets")return canViewAssets;
    if(key==="housing")return canViewHousing;
    return !["accruals","payments"].includes(key)||sensitive&&(!key.includes("payments")||payments);
  });
  const tabs=visibleTabKeys.map(key=>({label:labels[key],href:"/workers/"+id+"?tab="+key}));
  const panel=(key:string,content:ReactNode)=>{
    if(!visibleTabKeys.includes(key)||(!staticDemo&&tab!==key))return null;
    return <div data-demo-tab-panel={key} style={{display:staticDemo&&key!=="overview"?"none":"contents"}}>{content}</div>;
  };

  const workspace=<>
    <PageHeader eyebrow="Сотрудник" title={worker.fullName} subtitle={(worker.employment?employmentTypeLabel(worker.employment):"Оформление не указано")+" · "+(worker.object??"Без назначения")} breadcrumbs={[{label:"Операции"},{label:"Сотрудники",href:"/workers"},{label:worker.fullName}]}/>
    <WorkerProfileTabs items={tabs} active={labels[tab]}/>

    {panel("overview",<>
      {editor&&<WorkerDataEditor context={editor} demo={actor.demo} block="profile"/>}
      <div className="metrics-grid">
        <Metric label="Статус" value={worker.status==="active"?"Работает":worker.status==="dismissed"?"Работа завершена":worker.status} tone="good"/>
        <Metric label="Часов в периоде" value={(worker as typeof worker&{monthHours?:number}).monthHours??"—"}/>
        {sensitive&&<Metric label="Начислено" value={worker.accrued==null?"—":rub(worker.accrued)}/>}
        {sensitive&&<Metric label="К выплате" value={worker.payable==null?"—":rub(worker.payable)} tone={Number(worker.payable)>0?"warn":"good"}/>}
      </div>
      <div className="workspace-grid">
        <Section title="Текущий статус"><div style={{padding:"6px 15px 14px"}}>
          <KeyValue label="Объект" value={worker.object?<Link href={"/objects/"+worker.objectId}>{worker.object}</Link>:"Не назначен"}/>
          <KeyValue label="Менеджер объекта" value={worker.managerName??"—"}/>
          <KeyValue label="Специальность" value={worker.specialty??"—"}/>
          <KeyValue label="Формат работы" value={worker.workMode==="rotation"?"Вахта":"Местный"}/>
          <KeyValue label="Сейчас" value={workerOperationalState(worker)}/>
          <KeyValue label="Возврат / изменение" value={workerAvailability(worker)}/>
          <KeyValue label="Оформление" value={employmentTypeLabel(worker.employment)}/>
          <KeyValue label="Источник" value={worker.origin??worker.source??"—"}/>
          <KeyValue label="Первичный рекрутер" value={worker.originalRecruiter??"—"}/>
          {worker.originCandidateId&&<KeyValue label="История подбора" value={<Link href={"/candidates/"+worker.originCandidateId}>Открыть карточку кандидата</Link>}/>}
          {sensitive&&<KeyValue label="Действующая ставка" value={workerRateLabel(worker)} sensitive/>}
        </div></Section>
        <Section title="Ближайшие смены">
          <div className="stack-list">{shifts.slice(0,4).map(row=><div className="stack-item" key={row.id}><div><strong>{row.date} · {shiftKindLabel(row.kind)}</strong><small>{row.object} · {row.time}</small></div><Status tone={row.deficit?"warn":"good"}>{row.status}</Status></div>)}</div>
          {!shifts.length&&<Empty title="Смен нет" text="В доступном периоде смены не найдены."/>}
        </Section>
      </div>
    </>)}

    {panel("employment",<>{editor&&<WorkerDataEditor context={editor} demo={actor.demo} block="employment"/>}<WorkerEmploymentWorkspace workerId={id} workerStatus={worker.status} context={offboarding} canOffboard={canOffboard} canAccessAssets={canViewAssets} demo={actor.demo}/></>)}
    {panel("assignments",<WorkerAssignmentsWorkspace workerId={id} details={details} options={options} canEdit={canEdit} demo={actor.demo} employmentDocumentsStatus={worker.employmentDocumentsStatus}/>)}
    {panel("schedule",<>
      <Section title="Ближайшие смены"><div className="stack-list">{shifts.map(row=><div className="stack-item" key={row.id}><div><strong>{row.date} · {row.time}</strong><small>{row.specialty} · {row.object}</small></div><Status tone="info">{shiftKindLabel(row.kind)}</Status></div>)}</div>{!shifts.length&&<Empty title="Смен нет" text="Для текущего назначения смены не найдены."/>}</Section>
      <div style={{marginTop:16}}><WorkerAbsencesWorkspace workerId={id} details={details} canEdit={canEdit} demo={actor.demo}/></div>
    </>)}
    {panel("accruals",<Section title="Начисления"><div style={{padding:16,maxWidth:560}}><KeyValue label="Начислено за доступный период" value={worker.accrued==null?"—":rub(worker.accrued)} sensitive/><KeyValue label="Ставка" value={worker.rate==null?"—":rub(worker.rate)} sensitive/></div></Section>)}
    {panel("payments",<Section title="Выплаты"><div style={{padding:16,maxWidth:560}}><KeyValue label="Выплачено" value={worker.paid==null?"—":rub(worker.paid)} sensitive/><KeyValue label="К выплате" value={worker.payable==null?"—":rub(worker.payable)} sensitive/></div></Section>)}
    {panel("housing",<Section title="Проживание" note="Текущие размещения сотрудника и быстрый переход к общему реестру жилья.">{worker.workMode!=="rotation"?<Empty title="Жильё не требуется" text="Текущее назначение сотрудника — местный формат работы."/>:offboarding.housing.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Жильё</th><th>Заезд</th><th>Выезд</th><th>Статус</th></tr></thead><tbody>{offboarding.housing.map(row=><tr key={row.id}><td className="cell-title">{row.site}</td><td>{row.checkIn}</td><td>{row.checkOut??"—"}</td><td><Status tone={row.status==="active"?"good":"info"}>{row.status==="active"?"Проживает":"Запланировано"}</Status></td></tr>)}</tbody></table></div>:<Empty title="Активного проживания нет" text="Для сотрудника нет текущего или планового заселения."/>}<div style={{padding:12}}><Link className="button" href={"/supply/housing?worker="+worker.id}>Открыть жильё</Link></div></Section>)}
    {panel("assets",<Section title="Имущество и СИЗ" note="Размерный профиль и возвратное имущество сотрудника."><div style={{padding:"6px 15px 14px"}}><KeyValue label="Размер одежды" value={worker.clothingSize??"—"}/><KeyValue label="Размер обуви" value={worker.shoeSize??"—"}/><KeyValue label="Рост" value={worker.heightCm?worker.heightCm+" см":"—"}/></div>{offboarding.outstandingAssets.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Позиция</th><th>Вариант / размер</th><th>Количество</th></tr></thead><tbody>{offboarding.outstandingAssets.map(row=><tr key={row.itemId+":"+row.variant}><td className="cell-title">{row.item}</td><td>{row.variant||"—"}</td><td className="num">{row.quantity} {row.unit}</td></tr>)}</tbody></table></div>:<Empty title="Имущество не числится" text="Возвратных позиций на сотруднике нет."/>}<div style={{padding:12}}><Link className="button" href={"/assets?worker="+worker.id+"&action="+(offboarding.outstandingAssets.length?"return":"issue")}>Выдать / вернуть / списать</Link></div></Section>)}
    {panel("timesheets",<Section title="Личный табель и доступ" note="Подтверждения выходов сотрудником и управление персональной ссылкой."><WorkerConfirmationManager objectId={worker.objectId??undefined} workerId={id} canEdit={hasCapability(actor.access,"operations.shift.edit")} canReconcile={hasCapability(actor.access,"time.time_entry.edit")} demo={actor.demo}/></Section>)}
    {panel("documents",<Section title="Документы" note="Отметки сотрудника и подтверждения менеджера по доступным объектам.">
      {records.documents.length?<div className="grid-scroll"><table className="data-table worker-records-table"><thead><tr><th>Документ</th><th>Объект</th><th>Состояние</th><th>Обновлено</th></tr></thead><tbody>{records.documents.map(row=><tr key={row.id}><td className="cell-title">{row.name}</td><td>{row.object}</td><td><Status tone={row.status==="checked"?"good":row.status==="reported"?"info":"neutral"}>{row.status==="checked"?"Проверен менеджером":row.status==="reported"?"Сотрудник сообщил о наличии":"Не подтверждён"}</Status></td><td>{recordDate(row.updatedAt)}</td></tr>)}</tbody></table></div>:<Empty title="Отметок по документам нет" text="По доступным объектам ещё нет записей о наличии и проверке документов."/>}
    </Section>)}
    {panel("incidents",<Section title="Инциденты" note="Записи, связанные с этим сотрудником на доступных объектах.">
      {records.incidents.length?<div className="grid-scroll"><table className="data-table worker-records-table"><thead><tr><th>Событие</th><th>Объект</th><th>Дата</th><th>Статус</th></tr></thead><tbody>{records.incidents.map(row=><tr key={row.id}><td className="cell-title">{row.title}</td><td>{row.object}</td><td>{recordDate(row.occurredAt)}</td><td><Status tone={row.status==="resolved"?"good":"info"}>{({open:"Открыт",in_progress:"В работе",resolved:"Закрыт",cancelled:"Отменён"} as Record<string,string>)[row.status]??"Требует уточнения"}</Status></td></tr>)}</tbody></table></div>:<Empty title="Инцидентов не найдено" text="С этим сотрудником нет связанных инцидентов в доступных объектах."/>}
    </Section>)}
    {panel("history",<><Section title="История сотрудника" note="Назначения на объекты и периоды оформления. Предыдущие записи сохраняются.">
      {records.history.length?<ol className="worker-records-history">{records.history.map(row=><li key={row.id}><time dateTime={row.date}>{recordDate(row.date)}</time><div><strong>{row.title}</strong>{row.object&&<span>{row.object}</span>}{row.detail&&<small>{row.detail}</small>}</div></li>)}</ol>:<Empty title="История пока не записана" text="Доступных назначений и периодов оформления не найдено."/>}
    </Section>{Boolean(editor?.events.length)&&<Section title="Изменения данных и оформления"><ol className="worker-records-history">{editor!.events.map(event=><li key={event.id}><time dateTime={event.date}>{recordDate(event.date)}</time><div><strong>{event.summary}</strong><span>{event.actor??"Пользователь"}</span>{event.reason&&<small>{event.reason}</small>}{event.detail&&<small>{event.detail}</small>}</div></li>)}</ol></Section>}</>)}
  </>;
  return staticDemo?<StaticDemoQueryTabsController enabled defaultTab="overview">{workspace}</StaticDemoQueryTabsController>:workspace;
}

function workerOperationalState(worker:{status:string;absenceStatus?:string|null;absenceType?:string|null;absenceFrom?:string|null;absenceTo?:string|null}){if(worker.status==="dismissed")return"Работа завершена";const today=new Date().toISOString().slice(0,10);const current=worker.absenceStatus==="confirmed"&&Boolean(worker.absenceFrom&&worker.absenceFrom<=today&&(!worker.absenceTo||worker.absenceTo>=today));if(!current)return"Работает";return ({intershift:"Межвахта",vacation:"Отпуск",sick:"Больничный",personal:"Личное отсутствие",other:"Отсутствие"} as Record<string,string>)[worker.absenceType??""]??"Отсутствует"}
function workerAvailability(worker:{absenceStatus?:string|null;absenceType?:string|null;absenceFrom?:string|null;absenceTo?:string|null}){if(!worker.absenceFrom)return"—";const today=new Date().toISOString().slice(0,10);const labels:Record<string,string>={intershift:"межвахта",vacation:"отпуск",sick:"больничный",personal:"отсутствие",other:"отсутствие"};if(worker.absenceStatus==="confirmed"&&worker.absenceFrom<=today&&(!worker.absenceTo||worker.absenceTo>=today)){if(!worker.absenceTo)return"Дата возврата открыта";const date=new Date(worker.absenceTo+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+1);return"Возврат "+new Intl.DateTimeFormat("ru-RU").format(date)}return(labels[worker.absenceType??""]??"изменение")+" с "+new Intl.DateTimeFormat("ru-RU").format(new Date(worker.absenceFrom+"T00:00:00"))}
function workerRateLabel(worker:{rate:number|string|null;rateUnit?:string|null;paidHoursPerShift?:number|string|null}){if(worker.rate==null)return"—";if(worker.rateUnit==="shift"&&Number(worker.paidHoursPerShift)>0)return rub(worker.rate)+"/смену · "+rub(Number(worker.rate)/Number(worker.paidHoursPerShift))+"/ч";return rub(worker.rate)+(worker.rateUnit==="shift"?"/смену":worker.rateUnit==="month"?"/мес":"/ч")}
function recordDate(value:string){
  if(!value)return"—";
  const date=new Date(value.length===10?value+"T00:00:00Z":value);
  return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow"}).format(date);
}
