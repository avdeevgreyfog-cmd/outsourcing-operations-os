import { requireActor } from "@/lib/auth/server";
import { getTimesheet } from "@/lib/data/service";
import { getOperationsReferenceData } from "@/lib/operations/service";
import { Empty, Metric, PageHeader, Section, Status } from "@/components/UI";
import { TimesheetWorkspace } from "@/components/TimesheetWorkspace";
import { hasCapability } from "@/lib/core/access.mjs";
import { isGithubPagesDemo } from "@/lib/demo/pages";

const statusLabels:Record<string,string>={draft:"Черновик",submitted:"Передан",approved:"Согласован",returned:"Возвращён",internal_submitted:"На внутренней проверке",internal_checked:"Проверен внутри",client_sent:"Отправлен клиенту",client_approved:"Подтверждён клиентом",closed:"Закрыт"};

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
    <PageHeader eyebrow="Операции → Персонал объектов" title="Табели" subtitle="Один фактический слой времени: внутренний рабочий вид и отдельная клиентская версия для согласования." breadcrumbs={[{label:"Операции"},{label:"Персонал объектов"},{label:"Табели"}]}/>
    <div className="metrics-grid">
      <Metric label="Период" value={data.period}/>
      <Metric label="Внутренний факт" value={data.internalHours+" ч"}/>
      <Metric label="Подтверждено клиентом" value={data.clientHours+" ч"}/>
      <Metric label="Расхождение" value={data.discrepancy+" ч"} tone={data.discrepancy?"warn":"good"}/>
    </div>
    <TimesheetWorkspace data={data} options={options} sensitive={sensitive} canEdit={hasCapability(actor.access,"time.time_entry.edit")} canSubmit={hasCapability(actor.access,"time.timesheet.submit")} canReview={hasCapability(actor.access,"time.timesheet.review")} canApproveClient={hasCapability(actor.access,"time.timesheet.approve_client")} canClose={hasCapability(actor.access,"finance.worker_accrual.edit")}/>
    <Section title="Сверка внутреннего факта с подтверждением клиента" note="Согласованная клиентская версия сохраняется отдельно и не перезаписывает внутренний факт.">
      <div className="timesheet-reconcile-content">
        <div className="reconcile"><div><span>Внутренний факт</span><strong>{data.internalHours} ч</strong></div><div><span>Разница</span><strong>{data.discrepancy}</strong></div><div><span>Подтверждено клиентом</span><strong>{data.clientHours} ч</strong></div><div><span>Статус</span><strong><Status tone={data.status==="approved"?"good":data.status==="submitted"?"warn":"neutral"}>{statusLabels[data.status]??"Черновик"}</Status></strong></div></div>
        {data.issue&&<div className="stack-item timesheet-reconcile-issue"><div><strong>{data.issue.worker} · {data.issue.date}</strong><small>{data.issue.reason} · ответственный {data.issue.owner}</small></div><Status tone="bad">Разница {data.issue.difference} ч</Status></div>}
      </div>
    </Section>
  </>;
}
