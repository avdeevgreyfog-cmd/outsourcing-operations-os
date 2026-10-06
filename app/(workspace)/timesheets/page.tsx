import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { getTimesheet } from "@/lib/data/service";
import { getOperationsReferenceData } from "@/lib/operations/service";
import { Empty, Metric, PageHeader, Section, Status } from "@/components/UI";
import { TimesheetWorkspace } from "@/components/TimesheetWorkspace";
import { TimesheetPortfolioWorkspace } from "@/components/TimesheetPortfolioWorkspace";
import { hasCapability } from "@/lib/core/access.mjs";
import { isGithubPagesDemo } from "@/lib/demo/pages";
import { listTimesheetPortfolio } from "@/lib/operations/personnel-portfolio";

const statusLabels:Record<string,string>={draft:"В работе",submitted:"В работе",approved:"Зафиксирован",fixed:"Зафиксирован",returned:"Корректировка",internal_submitted:"На проверке",internal_checked:"На проверке",client_sent:"На согласовании",client_approved:"Зафиксирован",closed:"Зафиксирован"};

export default async function Timesheets({searchParams}:{searchParams:Promise<{object?:string;month?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const month=params.month&&/^\d{4}-\d{2}$/.test(params.month)?params.month:new Date().toISOString().slice(0,7);

  if(!params.object){
    const rows=await listTimesheetPortfolio(actor,month);
    return <>
      <PageHeader eyebrow="Операции → Персонал объектов" title="Табели" subtitle="Контроль табелей по всем доступным объектам: внутренний факт, клиентское согласование, расхождения и статус закрытия." breadcrumbs={[{label:"Операции"},{label:"Персонал объектов"},{label:"Табели"}]}/>
      <TimesheetPortfolioWorkspace rows={rows} month={month}/>
    </>;
  }

  const [data,options]=await Promise.all([
    getTimesheet(actor,{objectId:params.object,month}),
    getOperationsReferenceData(actor,"time.timesheet.read",{includeWorkers:false,includeSpecialties:false}),
  ]);
  if(!data)return <><PageHeader eyebrow="Операции → Персонал объектов" title="Табели"/><Empty title="Нет доступного табеля" text="Объект недоступен в вашем контуре или по нему нет данных за выбранный период."/></>;
  const sensitive=hasCapability(actor.access,"worker.compensation.read");
  return <>
    <PageHeader eyebrow="Операции → Персонал объектов" title={"Табель · "+data.object} subtitle="Рабочий табель конкретного объекта. После согласования с заказчиком факт фиксируется и открывается заново только руководителем." breadcrumbs={[{label:"Операции"},{label:"Персонал объектов"},{label:"Табели",href:"/timesheets?month="+month},{label:data.object}]} actions={<Link className="button" href={"/timesheets?month="+month}>Все табели</Link>}/>
    <div className="metrics-grid">
      <Metric label="Сотрудников" value={new Set(data.rows.filter(row=>row.rowKind!=="candidate").map(row=>row.workerId)).size}/>
      <Metric label="Внутренний факт" value={data.internalHours+" ч"}/>
      <Metric label="Клиент подтвердил" value={data.clientSnapshot?data.clientHours+" ч":"—"}/>
      <Metric label="Расхождение" value={data.clientSnapshot?data.discrepancy+" ч":"—"} tone={data.clientSnapshot&&data.discrepancy?"warn":"good"}/>
    </div>
    <TimesheetWorkspace data={data} options={options} sensitive={sensitive} canEdit={hasCapability(actor.access,"time.time_entry.edit")} canSubmit={hasCapability(actor.access,"time.timesheet.submit")} canReview={hasCapability(actor.access,"time.timesheet.review")} canClose={hasCapability(actor.access,"finance.worker_accrual.edit")}/>
    <Section title="Контроль зафиксированного факта" note="Каждая повторная фиксация создаёт новую версию. Финансовые выплаты и корректировки ведутся отдельно от фактических часов.">
      <div className="timesheet-reconcile-content">
        <div className="reconcile"><div><span>Внутренний факт</span><strong>{data.internalHours} ч</strong></div><div><span>Разница</span><strong>{data.clientSnapshot?data.discrepancy:"—"}</strong></div><div><span>Подтверждено клиентом</span><strong>{data.clientSnapshot?data.clientHours+" ч":"—"}</strong></div><div><span>Статус</span><strong><Status tone={["fixed","closed","client_approved","approved"].includes(data.status)?"good":data.status==="returned"?"warn":"neutral"}>{statusLabels[data.status]??"В работе"}</Status></strong></div></div>
        {data.issue&&<div className="stack-item timesheet-reconcile-issue"><div><strong>{data.issue.worker} · {data.issue.date}</strong><small>{data.issue.reason} · ответственный {data.issue.owner}</small></div><Status tone="bad">Разница {data.issue.difference} ч</Status></div>}
      </div>
    </Section>
  </>;
}
