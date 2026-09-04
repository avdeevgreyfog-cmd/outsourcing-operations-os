import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listCalculations } from "@/lib/data/service";
import { getCommercialOptions, getCommercialRequest } from "@/lib/commercial/service";
import { PageHeader,Section,Status } from "@/components/UI";
import { CalculatorWorkspace } from "@/components/CalculatorWorkspace";
import { SubmitApprovalButton } from "@/components/CommercialWorkflowActions";
import { modelLabel,rub,pct } from "@/lib/ui/format";

function tone(status:string){if(status==="accepted")return "good" as const;if(status==="rejected")return "bad" as const;if(status==="superseded")return "neutral" as const;return "warn" as const}

export default async function Calculations({searchParams}:{searchParams:Promise<{request?:string}>}){
  const actor=await requireActor();const query=await searchParams;const rows=await listCalculations(actor);
  const request=query.request?await getCommercialRequest(actor,query.request):null;
  const options=request?await getCommercialOptions(actor):null;
  const filtered=request?rows.filter(item=>item.requestId===request.id):rows;
  return <>
    <PageHeader eyebrow="Коммерция → Экономика" title={request?`Расчёт · ${request.title}`:"Расчёты"} subtitle="Каждый сценарий сохраняется отдельно. Согласованная версия не редактируется задним числом и может быть заменена только новой согласованной версией." actions={request?<Link className="button" href={`/requests/${request.id}`}>Вернуться к заявке</Link>:undefined}/>
    <Section title="Сценарии по заявкам"><div className="grid-scroll"><table className="data-table"><thead><tr><th>Заявка / роль</th><th>Модель</th><th>Сотруднику</th><th>Себестоимость</th><th>Клиент</th><th>Маржа</th><th>Статус</th><th></th></tr></thead><tbody>{filtered.map((x)=><tr key={x.id}><td><strong className="cell-title">{x.request} · {x.role}</strong><span className="cell-sub">{x.name}</span></td><td>{modelLabel(x.model)}</td><td className="num">{rub(x.workerNet)}</td><td className="num">{rub(x.totalCost)}</td><td className="num">{rub(x.clientRate)}</td><td className="num">{pct(x.marginPct)}</td><td><Status tone={tone(x.status)}>{x.status}</Status></td><td>{hasCapability(actor.access,"calculation.scenario.edit")&&["draft","rejected"].includes(x.status)&&<SubmitApprovalButton subjectType="calculation_scenario" subjectId={x.id}/>}</td></tr>)}</tbody></table></div></Section>
    {request&&options&&hasCapability(actor.access,"calculation.scenario.create")&&<><div style={{height:16}}/><PageHeader eyebrow="Новый сценарий" title="Новый расчёт" subtitle={`Заявка: ${request.title}. Выберите позицию, модель, затраты и целевую маржу, затем сохраните сценарий.`}/><CalculatorWorkspace context={{requestId:request.id,roles:request.roles.map(role=>({id:role.id,specialty:role.specialty,count:role.count})),models:options.models}}/></>}
    {!request&&<><div style={{height:16}}/><PageHeader eyebrow="Режим моделирования" title="Новый расчёт" subtitle="Для сохранения сценария в коммерческий процесс откройте расчёт из конкретной заявки."/><CalculatorWorkspace/></>}
  </>;
}
