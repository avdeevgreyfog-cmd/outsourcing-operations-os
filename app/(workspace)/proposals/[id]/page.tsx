import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {getProposalDetail} from "@/lib/commercial/service";
import {ProposalWorkflowActions} from "@/components/CommercialWorkflowActions";
import {KeyValue,PageHeader,Section,Status,SummaryStrip} from "@/components/UI";
import {rub,vatModeLabel} from "@/lib/ui/format";

function tone(status:string){if(status==="accepted")return "good" as const;if(["client_rejected","rejected_internal"].includes(status))return "bad" as const;if(status==="draft")return "neutral" as const;return "warn" as const}

export default async function ProposalPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const actor=await requireActor();const proposal=await getProposalDetail(actor,id);if(!proposal)notFound();const roles=proposal.content.roles??[];
  return <>
    <PageHeader eyebrow="Коммерческое предложение" title={`${proposal.request} · v${proposal.version}`} subtitle={`${proposal.client} · версия зафиксирована на основе согласованных сценариев`} breadcrumbs={[{label:"Коммерция"},{label:"КП",href:"/proposals"},{label:`v${proposal.version}`}]} actions={<Link className="button" href={`/requests/${proposal.requestId}`}>Открыть заявку</Link>}/>
    <SummaryStrip><span>Статус <Status tone={tone(proposal.status)}>{proposal.status}</Status></span><span>Позиции <strong>{roles.length}</strong></span><span>Расчётный объём <strong>{rub(proposal.totalValue)}</strong></span></SummaryStrip>
    <div className="workspace-grid"><div>
      <Section title="Клиентское предложение" note="Snapshot этой версии не меняется при последующих пересчётах."><div className="grid-scroll"><table className="data-table"><thead><tr><th>Позиция</th><th>Численность</th><th>Ставка клиенту</th><th>Единица</th></tr></thead><tbody>{roles.map(item=><tr key={item.scenarioId}><td className="cell-title">{item.role}</td><td className="num">{item.count}</td><td className="num">{rub(item.rate)}</td><td>{item.unit==="hour"?"час":item.unit}</td></tr>)}</tbody></table></div></Section>
      <Section title="Условия"><div style={{padding:"6px 15px 14px"}}><KeyValue label="Локация" value={proposal.content.location??"—"}/><KeyValue label="Плановый старт" value={proposal.content.expectedStartDate??"—"}/><KeyValue label="НДС" value={proposal.content.vatMode?vatModeLabel(proposal.content.vatMode):"—"}/><KeyValue label="Создано" value={`${proposal.createdAt} · ${proposal.createdBy}`}/>{proposal.clientDecisionNote&&<KeyValue label="Комментарий клиента / переговоров" value={proposal.clientDecisionNote}/>}</div></Section>
    </div><aside><Section title="Workflow" note="Внутреннее согласование отделено от решения клиента."><div style={{padding:12}}><ProposalWorkflowActions proposalId={proposal.id} status={proposal.status} objectId={proposal.sourceObjectId} canSubmit={hasCapability(actor.access,"sales.proposal.submit")} canClientDecision={hasCapability(actor.access,"sales.proposal.client_decision")} canLaunch={hasCapability(actor.access,"sales.proposal.launch")}/></div></Section><Section title="Историчность"><div style={{padding:"6px 15px 14px"}}><KeyValue label="Согласовано внутри" value={proposal.approvedAt??"—"}/><KeyValue label="Отправлено клиенту" value={proposal.sentAt??"—"}/><KeyValue label="Принято клиентом" value={proposal.acceptedAt??"—"}/><KeyValue label="Передано в запуск" value={proposal.launchedAt??"—"}/></div></Section></aside></div>
  </>;
}
