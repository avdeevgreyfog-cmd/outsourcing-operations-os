import { requireActor } from "@/lib/auth/server";
import { getTimesheet } from "@/lib/data/service";
import { getOperationsReferenceData } from "@/lib/operations/service";
import { Empty, Metric, PageHeader, Section, Status } from "@/components/UI";
import { TimesheetWorkspace } from "@/components/TimesheetWorkspace";
import { hasCapability } from "@/lib/core/access.mjs";
import { isGithubPagesDemo } from "@/lib/demo/pages";

const statusLabels:Record<string,string>={draft:"В работе",submitted:"В работе",approved:"Зафиксирован",fixed:"Зафиксирован",returned:"Корректировка",internal_submitted:"На проверке",internal_checked:"На проверке",client_sent:"На согласовании",client_approved:"Зафиксирован",closed:"Зафиксирован"};

export default async function Timesheets({searchParams}:{searchParams:Promise<{object?:string;month?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const [data,options]=await Promise.all([
    getTimesheet(actor,{objectId:params.object??null,month:params.month??null}),
    getOperationsReferenceData(actor,"time.timesheet.read",{includeWorkers:false,includeSpecialties:false}),
  ]);
  if(!data)return <><PageHeader eyebrow="Операции" title="Табели"/><Empty title="Нет доступного табеля" text="Нет доступного объекта или сотрудников в выбранном контуре."/></>;
  const sensitive=hasCapability(actor.access,"worker.compensation.read");
  return <>
    <PageHeader eyebrow="Операции → Персонал объектов" title="Табели" subtitle="Рабочий табель ведёт менеджер. После согласования с заказчиком факт фиксируется и открывается заново только руководителем." breadcrumbs={[{label:"Операции"},{label:"Персонал объектов"},{label:"Табели"}]}/>
    <div className="metrics-grid">
      <Metric label="Период" value={data.period}/>
      <Metric label="Внутренний факт" value={data.internalHours+" ч"}/>
      <Metric label="Зафиксированный факт" value={data.clientHours+" ч"}/>
      <Metric label="Расхождение" value={data.discrepancy+" ч"} tone={data.discrepancy?"warn":"good"}/>
    </div>
    <TimesheetWorkspace data={data} options={options} sensitive={sensitive} canEdit={hasCapability(actor.access,"time.time_entry.edit")} canSubmit={hasCapability(actor.access,"time.timesheet.submit")} canReview={hasCapability(actor.access,"time.timesheet.review")} canClose={hasCapability(actor.access,"finance.worker_accrual.edit")}/>
    <Section title="Контроль зафиксированного факта" note="Каждая повторная фиксация создаёт новую версию. Финансовые выплаты и корректировки ведутся отдельно от фактических часов.">
      <div className="timesheet-reconcile-content">
        <div className="reconcile"><div><span>Внутренний факт</span><strong>{data.internalHours} ч</strong></div><div><span>Разница</span><strong>{data.discrepancy}</strong></div><div><span>Подтверждено клиентом</span><strong>{data.clientHours} ч</strong></div><div><span>Статус</span><strong><Status tone={["fixed","closed","client_approved","approved"].includes(data.status)?"good":data.status==="returned"?"warn":"neutral"}>{statusLabels[data.status]??"В работе"}</Status></strong></div></div>
        {data.issue&&<div className="stack-item timesheet-reconcile-issue"><div><strong>{data.issue.worker} · {data.issue.date}</strong><small>{data.issue.reason} · ответственный {data.issue.owner}</small></div><Status tone="bad">Разница {data.issue.difference} ч</Status></div>}
      </div>
    </Section>
  </>;
}
