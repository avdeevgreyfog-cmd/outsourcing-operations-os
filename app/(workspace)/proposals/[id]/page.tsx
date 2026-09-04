import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {getCommercialProposalDetail} from "@/lib/commercial/proposal-document";
import {ProposalWorkflowActions} from "@/components/CommercialWorkflowActions";
import {ProposalDocumentEditor} from "@/components/ProposalDocumentEditor";
import {KeyValue,PageHeader,Section,Status,SummaryStrip} from "@/components/UI";
import {rub,vatModeLabel} from "@/lib/ui/format";

function tone(status:string){if(["accepted","launched","approved"].includes(status))return "good" as const;if(["client_rejected","rejected_internal"].includes(status))return "bad" as const;if(status==="draft")return "neutral" as const;return "warn" as const}
const unitLabels:Record<string,string>={hour:"час",shift:"смена",unit:"единица",worker_month:"сотрудник / месяц",project_month:"проект / месяц",project_fixed:"проект",mixed:"переменная единица"};

export default async function ProposalPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const actor=await requireActor();const proposal=await getCommercialProposalDetail(actor,id);if(!proposal)notFound();const roles=proposal.content.roles??[];
  const actions=<>
    <Link className="button" href={`/requests/${proposal.requestId}`}>Открыть заявку</Link>
    {proposal.status==="draft"&&hasCapability(actor.access,"sales.proposal.edit")&&<ProposalDocumentEditor proposalId={proposal.id} content={proposal.content}/>} 
    <Link className="button" href={`/proposals/${proposal.id}/print`} target="_blank">PDF / печать</Link>
    <a className="button" href={`/api/proposals/${proposal.id}/export?format=docx`}>DOCX</a>
  </>;
  return <>
    <PageHeader eyebrow="Коммерческое предложение" title={`${proposal.request} · v${proposal.version}`} subtitle={`${proposal.client} · клиентская версия зафиксирована на основе согласованных сценариев`} breadcrumbs={[{label:"Коммерция"},{label:"КП",href:"/proposals"},{label:`v${proposal.version}`}]} actions={actions}/>
    <SummaryStrip><span>Статус <Status tone={tone(proposal.status)}>{proposal.status}</Status></span><span>Позиции <strong>{roles.length}</strong></span><span>Расчётный месячный объём <strong>{rub(proposal.totalValue)}</strong></span>{proposal.content.validUntil&&<span>Действует до <strong>{proposal.content.validUntil}</strong></span>}</SummaryStrip>
    <div className="workspace-grid"><div>
      <Section title="Клиентское предложение" note="В документе нет себестоимости, внутренней зарплатной экономики, маржи и правил согласования."><div style={{padding:"6px 15px 14px"}}><KeyValue label="Компания" value={proposal.content.company??proposal.client}/><KeyValue label="Объект / предложение" value={proposal.content.objectName??proposal.request}/><KeyValue label="Описание" value={proposal.content.description??"—"}/><KeyValue label="Локация" value={proposal.content.location??"—"}/><KeyValue label="Плановый старт" value={proposal.content.expectedStartDate??"—"}/><KeyValue label="График / объём" value={proposal.content.schedule??"—"}/><KeyValue label="НДС" value={proposal.content.vatMode?`${vatModeLabel(proposal.content.vatMode)}${proposal.content.vatPct?` · ${proposal.content.vatPct}%`:""}`:"—"}/></div><div className="grid-scroll"><table className="data-table"><thead><tr><th>Позиция</th><th>Численность</th><th>Без НДС</th><th>С НДС</th><th>Единица</th></tr></thead><tbody>{roles.map(item=><tr key={item.scenarioId}><td className="cell-title">{item.role}</td><td className="num">{item.count}</td><td className="num">{rub(item.rateNet)}</td><td className="num">{rub(item.rateGross)}</td><td>{unitLabels[item.unit]??item.unit}</td></tr>)}</tbody></table></div></Section>
      <Section title="Что включено в ставку"><div className="stack-list">{proposal.content.included?.length?proposal.content.included.map((item,index)=><div className="stack-item" key={`${item}-${index}`}><div><strong>{String(index+1).padStart(2,"0")}</strong><small>{item}</small></div></div>):<div className="empty-inline">Не заполнено</div>}</div></Section>
      <Section title="Предоставляет заказчик"><div className="stack-list">{proposal.content.clientProvides?.length?proposal.content.clientProvides.map((item,index)=><div className="stack-item" key={`${item}-${index}`}><div><strong>{String(index+1).padStart(2,"0")}</strong><small>{item}</small></div></div>):<div className="empty-inline">Отдельные условия не указаны</div>}</div></Section>
      <Section title="Условия сотрудничества"><div style={{padding:"6px 15px 14px"}}><KeyValue label="Основные условия" value={proposal.content.terms??"—"}/><KeyValue label="Дополнительные условия" value={proposal.content.additionalConditions??"—"}/>{proposal.content.comment&&<KeyValue label="Комментарий в КП" value={proposal.content.comment}/>}<KeyValue label="Создано" value={`${proposal.createdAt} · ${proposal.createdBy}`}/>{proposal.clientDecisionNote&&<KeyValue label="Комментарий клиента / переговоров" value={proposal.clientDecisionNote}/>}</div></Section>
    </div><aside><Section title="Workflow" note="Внутреннее согласование отделено от решения клиента."><div style={{padding:12}}><ProposalWorkflowActions proposalId={proposal.id} status={proposal.status} objectId={proposal.sourceObjectId} canSubmit={hasCapability(actor.access,"sales.proposal.submit")} canClientDecision={hasCapability(actor.access,"sales.proposal.client_decision")} canLaunch={hasCapability(actor.access,"sales.proposal.launch")}/></div></Section><Section title="Историчность"><div style={{padding:"6px 15px 14px"}}><KeyValue label="Согласовано внутри" value={proposal.approvedAt??"—"}/><KeyValue label="Отправлено клиенту" value={proposal.sentAt??"—"}/><KeyValue label="Принято клиентом" value={proposal.acceptedAt??"—"}/><KeyValue label="Передано в запуск" value={proposal.launchedAt??"—"}/></div></Section></aside></div>
  </>;
}
