import { isGithubPagesDemo } from "@/lib/demo/pages";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { listShifts, listWorkers } from "@/lib/data/service";
import { hasCapability } from "@/lib/core/access.mjs";
import { getOperationsReferenceData, getWorkerOffboardingContext, getWorkerOperationsDetails } from "@/lib/operations/service";
import { WorkerAbsencesWorkspace, WorkerAssignmentsWorkspace } from "@/components/WorkerOperationsWorkspace";
import { WorkerEmploymentWorkspace } from "@/components/WorkerEmploymentWorkspace";
import { Empty, EntityTabs, KeyValue, Metric, PageHeader, Section, Status } from "@/components/UI";
import { rub } from "@/lib/ui/format";
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
  const {tab:raw}=isGithubPagesDemo()?{}:await searchParams;
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
  const [details,offboarding,options,shifts]=await Promise.all([
    getWorkerOperationsDetails(actor,id),
    getWorkerOffboardingContext(actor,id),
    getOperationsReferenceData(actor),
    hasCapability(actor.access,"operations.shift.read")?listShifts(actor).then(rows=>rows.filter(row=>row.objectId===worker.objectId)):Promise.resolve([]),
  ]);
  const tabs=Object.entries(labels)
    .filter(([key])=>{
      if(key==="assets")return canViewAssets;
      if(key==="housing")return canViewHousing;
      return !["accruals","payments"].includes(key)||sensitive&&(!key.includes("payments")||payments);
    })
    .map(([key,label])=>({label,href:"/workers/"+id+"?tab="+key}));

  return <>
    <PageHeader eyebrow="Сотрудник" title={worker.fullName} subtitle={(worker.employment?employmentTypeLabel(worker.employment):"Оформление не указано")+" · "+(worker.object??"Без назначения")} breadcrumbs={[{label:"Операции"},{label:"Сотрудники",href:"/workers"},{label:worker.fullName}]}/>
    <EntityTabs items={tabs} active={labels[tab]}/>

    {tab==="overview"&&<>
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
          <div className="stack-list">{shifts.slice(0,4).map(row=><div className="stack-item" key={row.id}><div><strong>{row.date} · {row.kind}</strong><small>{row.object} · {row.time}</small></div><Status tone={row.deficit?"warn":"good"}>{row.status}</Status></div>)}</div>
          {!shifts.length&&<Empty title="Смен нет" text="В доступном периоде смены не найдены."/>}
        </Section>
      </div>
    </>}

    {tab==="employment"&&<WorkerEmploymentWorkspace workerId={id} workerStatus={worker.status} context={offboarding} canOffboard={canOffboard} canAccessAssets={canViewAssets} demo={actor.demo}/>}
    {tab==="assignments"&&<WorkerAssignmentsWorkspace workerId={id} details={details} options={options} canEdit={canEdit} demo={actor.demo} employmentDocumentsStatus={worker.employmentDocumentsStatus}/>}
    {tab==="schedule"&&<>
      <Section title="Ближайшие смены"><div className="stack-list">{shifts.map(row=><div className="stack-item" key={row.id}><div><strong>{row.date} · {row.time}</strong><small>{row.specialty} · {row.object}</small></div><Status tone="info">{row.kind}</Status></div>)}</div>{!shifts.length&&<Empty title="Смен нет" text="Для текущего назначения смены не найдены."/>}</Section>
      <div style={{marginTop:16}}><WorkerAbsencesWorkspace workerId={id} details={details} canEdit={canEdit} demo={actor.demo}/></div>
    </>}
    {tab==="accruals"&&<Section title="Начисления"><div style={{padding:16,maxWidth:560}}><KeyValue label="Начислено за доступный период" value={worker.accrued==null?"—":rub(worker.accrued)} sensitive/><KeyValue label="Ставка" value={worker.rate==null?"—":rub(worker.rate)} sensitive/></div></Section>}
    {tab==="payments"&&<Section title="Выплаты"><div style={{padding:16,maxWidth:560}}><KeyValue label="Выплачено" value={worker.paid==null?"—":rub(worker.paid)} sensitive/><KeyValue label="К выплате" value={worker.payable==null?"—":rub(worker.payable)} sensitive/></div></Section>}
    {tab==="housing"&&<Section title="Проживание" note="Текущие размещения сотрудника и быстрый переход к общему реестру жилья.">{worker.workMode!=="rotation"?<Empty title="Жильё не требуется" text="Текущее назначение сотрудника — местный формат работы."/>:offboarding.housing.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Жильё</th><th>Заезд</th><th>Выезд</th><th>Статус</th></tr></thead><tbody>{offboarding.housing.map(row=><tr key={row.id}><td className="cell-title">{row.site}</td><td>{row.checkIn}</td><td>{row.checkOut??"—"}</td><td><Status tone={row.status==="active"?"good":"info"}>{row.status==="active"?"Проживает":"Запланировано"}</Status></td></tr>)}</tbody></table></div>:<Empty title="Активного проживания нет" text="Для сотрудника нет текущего или планового заселения."/>}<div style={{padding:12}}><Link className="button" href={"/supply/housing?worker="+worker.id}>Открыть жильё</Link></div></Section>}
    {tab==="assets"&&<Section title="Имущество и СИЗ" note="Размерный профиль и возвратное имущество сотрудника."><div style={{padding:"6px 15px 14px"}}><KeyValue label="Размер одежды" value={worker.clothingSize??"—"}/><KeyValue label="Размер обуви" value={worker.shoeSize??"—"}/><KeyValue label="Рост" value={worker.heightCm?worker.heightCm+" см":"—"}/></div>{offboarding.outstandingAssets.length?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Позиция</th><th>Вариант / размер</th><th>Количество</th></tr></thead><tbody>{offboarding.outstandingAssets.map(row=><tr key={row.itemId+":"+row.variant}><td className="cell-title">{row.item}</td><td>{row.variant||"—"}</td><td className="num">{row.quantity} {row.unit}</td></tr>)}</tbody></table></div>:<Empty title="Имущество не числится" text="Возвратных позиций на сотруднике нет."/>}<div style={{padding:12}}><Link className="button" href={"/assets?worker="+worker.id+"&action="+(offboarding.outstandingAssets.length?"return":"issue")}>Выдать / вернуть / списать</Link></div></Section>}
    {["timesheets","documents","incidents","history"].includes(tab)&&<Section title={labels[tab]}><Empty title="Записей нет" text="В доступном контуре сотрудника записи этого типа отсутствуют."/></Section>}
  </>;
}

function workerOperationalState(worker:{status:string;absenceStatus?:string|null;absenceType?:string|null;absenceFrom?:string|null;absenceTo?:string|null}){if(worker.status==="dismissed")return"Работа завершена";const today=new Date().toISOString().slice(0,10);const current=worker.absenceStatus==="confirmed"&&Boolean(worker.absenceFrom&&worker.absenceFrom<=today&&(!worker.absenceTo||worker.absenceTo>=today));if(!current)return"Работает";return ({intershift:"Межвахта",vacation:"Отпуск",sick:"Больничный",personal:"Личное отсутствие",other:"Отсутствие"} as Record<string,string>)[worker.absenceType??""]??"Отсутствует"}
function workerAvailability(worker:{absenceStatus?:string|null;absenceType?:string|null;absenceFrom?:string|null;absenceTo?:string|null}){if(!worker.absenceFrom)return"—";const today=new Date().toISOString().slice(0,10);const labels:Record<string,string>={intershift:"межвахта",vacation:"отпуск",sick:"больничный",personal:"отсутствие",other:"отсутствие"};if(worker.absenceStatus==="confirmed"&&worker.absenceFrom<=today&&(!worker.absenceTo||worker.absenceTo>=today)){if(!worker.absenceTo)return"Дата возврата открыта";const date=new Date(worker.absenceTo+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+1);return"Возврат "+new Intl.DateTimeFormat("ru-RU").format(date)}return(labels[worker.absenceType??""]??"изменение")+" с "+new Intl.DateTimeFormat("ru-RU").format(new Date(worker.absenceFrom+"T00:00:00"))}
function workerRateLabel(worker:{rate:number|string|null;rateUnit?:string|null;paidHoursPerShift?:number|string|null}){if(worker.rate==null)return"—";if(worker.rateUnit==="shift"&&Number(worker.paidHoursPerShift)>0)return rub(worker.rate)+"/смену · "+rub(Number(worker.rate)/Number(worker.paidHoursPerShift))+"/ч";return rub(worker.rate)+(worker.rateUnit==="shift"?"/смену":worker.rateUnit==="month"?"/мес":"/ч")}