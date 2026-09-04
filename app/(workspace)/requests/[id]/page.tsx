import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {listCalculations} from "@/lib/data/service";
import {getRequestCalculationCoverage} from "@/lib/commercial/calculations";
import {getCommercialOptions,getCommercialRequest,listRequestProposals} from "@/lib/commercial/service";
import {RequestEditButton} from "@/components/CommercialRequestForms";
import {CreateProposalButton} from "@/components/CommercialWorkflowActions";
import {KeyValue,PageHeader,Section,Status,SummaryStrip} from "@/components/UI";

function tone(status:string){if(["accepted","launched","approved"].includes(status))return "good" as const;if(["lost","archived","rejected"].includes(status))return "bad" as const;return "warn" as const}

export default async function RequestPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const actor=await requireActor();
  const [request,options]=await Promise.all([getCommercialRequest(actor,id),getCommercialOptions(actor)]);if(!request)notFound();
  const calculations=hasCapability(actor.access,"calculation.scenario.read")?(await listCalculations(actor)).filter(x=>x.requestId===id):[];
  const coverage=hasCapability(actor.access,"calculation.scenario.read")?await getRequestCalculationCoverage(actor,id):[];
  const acceptedRoleIds=new Set(coverage.map(item=>item.requestRoleId));
  const proposals=(hasCapability(actor.access,"sales.proposal.read")||hasCapability(actor.access,"sales.request.read"))?await listRequestProposals(actor,id):[];
  const archived=request.archivedAt!=null;const locked=["accepted","launched"].includes(request.status);
  const displayStatus=archived?"archived":request.status;
  const readyForProposal=!archived&&!locked&&request.roles.length>0&&request.roles.every(role=>acceptedRoleIds.has(role.id));
  const actions=<>{hasCapability(actor.access,"sales.request.edit")&&<RequestEditButton request={request} options={options} canArchive={hasCapability(actor.access,"sales.request.archive")}/>} {hasCapability(actor.access,"calculation.scenario.create")&&!archived&&!locked&&<Link href={`/calculations?request=${id}`} className="button primary">Открыть расчёт</Link>}</>;
  return <>
    <PageHeader eyebrow="Заявка" title={request.title} subtitle={`${request.client} · ${request.location}`} breadcrumbs={[{label:"Коммерция"},{label:"Заявки",href:"/requests"},{label:request.title}]} actions={actions}/>
    <SummaryStrip><span>Этап <Status tone={tone(displayStatus)}>{displayStatus}</Status></span>{archived&&<span>Бизнес-этап <Status tone={tone(request.status)}>{request.status}</Status></span>}<span>Позиции <strong>{request.roles.length}</strong></span><span>Расчёты <strong>{calculations.length}</strong></span><span>Версии КП <strong>{proposals.length}</strong></span></SummaryStrip>
    <div className="workspace-grid"><div>
      <Section title="Основные условия"><div style={{padding:"6px 15px 14px"}}><KeyValue label="Клиент" value={request.client}/><KeyValue label="Регион" value={request.region??"—"}/><KeyValue label="Локация" value={request.location}/><KeyValue label="Старт" value={request.startDate??"Не указан"}/><KeyValue label="Длительность" value={request.durationText??"—"}/><KeyValue label="Проживание" value={request.housingRule??"Не указано"}/><KeyValue label="НДС" value={request.vatMode??"Не указано"}/><KeyValue label="Источник" value={request.source}/></div></Section>
      <Section title="Позиции"><div className="grid-scroll"><table className="data-table"><thead><tr><th>Специальность</th><th>Численность</th><th>Текущая согласованная экономика</th></tr></thead><tbody>{request.roles.map(role=><tr key={role.id}><td className="cell-title">{role.specialty}</td><td className="num">{role.count}</td><td><Status tone={acceptedRoleIds.has(role.id)?"good":"warn"}>{acceptedRoleIds.has(role.id)?"accepted":"calculation"}</Status></td></tr>)}</tbody></table></div></Section>
    </div><div>
      <Section title="Расчёты" note="Согласованные сценарии не перезаписываются; при изменении условий создаётся новый сценарий."><div className="stack-list">{calculations.length?calculations.map(x=><div className="stack-item" key={x.id}><div><strong>{x.name}</strong><small>{x.role} · {x.model}</small></div><Status tone={tone(x.status)}>{x.status}</Status></div>):<div className="empty-inline">Расчётов пока нет</div>}</div>{hasCapability(actor.access,"calculation.scenario.create")&&!archived&&!locked&&<div style={{padding:12}}><Link href={`/calculations?request=${id}`} className="button">Создать / пересчитать</Link></div>}</Section>
      <Section title="Коммерческие предложения" note="Каждая версия фиксирует именно те согласованные сценарии, из которых была создана."><div className="stack-list">{proposals.length?proposals.map(item=><Link className="stack-item" href={`/proposals/${item.id}`} key={item.id}><div><strong>КП v{item.version}</strong><small>{item.createdAt} · {item.createdBy}</small></div><Status tone={tone(item.status)}>{item.status}</Status></Link>):<div className="empty-inline">Версий КП пока нет</div>}</div>{readyForProposal&&hasCapability(actor.access,"sales.proposal.create")&&<div style={{padding:12}}><CreateProposalButton requestId={id}/></div>}</Section>
    </div></div>
  </>;
}
