import { githubPagesStaticParams } from "@/lib/demo/static-params";
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

export function generateStaticParams(){
  return isGithubPagesDemo()?githubPagesStaticParams.workers.map((id)=>({id})):[];
}

export default async function WorkerPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){
  const {id}=await params;
  const {tab:raw}=isGithubPagesDemo()?{}:await searchParams;
  const tab=raw&&labels[raw]?raw:"overview";
  const actor=await requireActor();
  const workers=await listWorkers(actor);
  const worker=workers.find(row=>row.id===id);
  if(!worker)notFound();

  const canEdit=hasCapability(actor.access,"worker.edit");
  const canOffboard=hasCapability(actor.access,"worker.offboarding.manage");
  const sensitive=hasCapability(actor.access,"worker.compensation.read");
  const payments=hasCapability(actor.access,"finance.payments.read");
  const [details,offboarding,options,shifts]=await Promise.all([
    getWorkerOperationsDetails(actor,id),
    getWorkerOffboardingContext(actor,id),
    getOperationsReferenceData(actor),
    hasCapability(actor.access,"operations.shift.read")?listShifts(actor).then(rows=>rows.filter(row=>row.objectId===worker.objectId)):Promise.resolve([]),
  ]);
  const tabs=Object.entries(labels)
    .filter(([key])=>!["accruals","payments"].includes(key)||sensitive&&(!key.includes("payments")||payments))
    .map(([key,label])=>({label,href:"/workers/"+id+"?tab="+key}));

  return <>
    <PageHeader eyebrow="Сотрудник" title={worker.fullName} subtitle={(worker.employment??"Оформление не указано")+" · "+(worker.object??"Без назначения")} breadcrumbs={[{label:"Операции"},{label:"Сотрудники",href:"/workers"},{label:worker.fullName}]}/>
    <EntityTabs items={tabs} active={labels[tab]}/>

    {tab==="overview"&&<>
      <div className="metrics-grid">
        <Metric label="Статус" value={worker.status==="active"?"Работает":worker.status} tone="good"/>
        <Metric label="Часов в периоде" value={(worker as typeof worker&{monthHours?:number}).monthHours??"—"}/>
        {sensitive&&<Metric label="Начислено" value={worker.accrued==null?"—":rub(worker.accrued)}/>}
        {sensitive&&<Metric label="К выплате" value={worker.payable==null?"—":rub(worker.payable)} tone={Number(worker.payable)>0?"warn":"good"}/>}
      </div>
      <div className="workspace-grid">
        <Section title="Текущий статус"><div style={{padding:"6px 15px 14px"}}>
          <KeyValue label="Объект" value={worker.object?<Link href={"/objects/"+worker.objectId}>{worker.object}</Link>:"Не назначен"}/>
          <KeyValue label="Оформление" value={worker.employment??"—"}/>
          <KeyValue label="Источник" value={worker.origin??worker.source??"—"}/>
          <KeyValue label="Первичный рекрутер" value={worker.originalRecruiter??"—"}/>
          {worker.originCandidateId&&<KeyValue label="История подбора" value={<Link href={"/candidates/"+worker.originCandidateId}>Открыть карточку кандидата</Link>}/>}
          {sensitive&&<KeyValue label="Действующая ставка" value={worker.rate==null?"—":rub(worker.rate)} sensitive/>}
        </div></Section>
        <Section title="Ближайшие смены">
          <div className="stack-list">{shifts.slice(0,4).map(row=><div className="stack-item" key={row.id}><div><strong>{row.date} · {row.kind}</strong><small>{row.object} · {row.time}</small></div><Status tone={row.deficit?"warn":"good"}>{row.status}</Status></div>)}</div>
          {!shifts.length&&<Empty title="Смен нет" text="В доступном периоде смены не найдены."/>}
        </Section>
      </div>
    </>}

    {tab==="employment"&&<WorkerEmploymentWorkspace workerId={id} workerStatus={worker.status} context={offboarding} canOffboard={canOffboard} demo={actor.demo}/>}
    {tab==="assignments"&&<WorkerAssignmentsWorkspace workerId={id} details={details} options={options} canEdit={canEdit} demo={actor.demo}/>}
    {tab==="schedule"&&<>
      <Section title="Ближайшие смены"><div className="stack-list">{shifts.map(row=><div className="stack-item" key={row.id}><div><strong>{row.date} · {row.time}</strong><small>{row.specialty} · {row.object}</small></div><Status tone="info">{row.kind}</Status></div>)}</div>{!shifts.length&&<Empty title="Смен нет" text="Для текущего назначения смены не найдены."/>}</Section>
      <div style={{marginTop:16}}><WorkerAbsencesWorkspace workerId={id} details={details} canEdit={canEdit} demo={actor.demo}/></div>
    </>}
    {tab==="accruals"&&<Section title="Начисления"><div style={{padding:16,maxWidth:560}}><KeyValue label="Начислено за доступный период" value={worker.accrued==null?"—":rub(worker.accrued)} sensitive/><KeyValue label="Ставка" value={worker.rate==null?"—":rub(worker.rate)} sensitive/></div></Section>}
    {tab==="payments"&&<Section title="Выплаты"><div style={{padding:16,maxWidth:560}}><KeyValue label="Выплачено" value={worker.paid==null?"—":rub(worker.paid)} sensitive/><KeyValue label="К выплате" value={worker.payable==null?"—":rub(worker.payable)} sensitive/></div></Section>}
    {tab==="housing"&&<Section title="Проживание"><Empty title="Откройте контур жилья" text="Текущие и исторические заселения ведутся в едином реестре жилья." action={<Link className="button" href={"/supply/housing?worker="+worker.id}>Открыть жильё</Link>}/></Section>}
    {tab==="assets"&&<Section title="Имущество и СИЗ"><Empty title="Откройте учёт имущества" text="Выдачи, возвраты и списания ведутся через единый журнал движений." action={<Link className="button" href={"/assets?worker="+worker.id}>Открыть запасы</Link>}/></Section>}
    {["timesheets","documents","incidents","history"].includes(tab)&&<Section title={labels[tab]}><Empty title="Записей нет" text="В доступном контуре сотрудника записи этого типа отсутствуют."/></Section>}
  </>;
}
