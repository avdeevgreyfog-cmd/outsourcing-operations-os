import Link from "next/link";
import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {listApprovals} from "@/lib/commercial/service";
import {ApprovalDecisionButtons} from "@/components/CommercialWorkflowActions";
import {Empty,PageHeader,Section,Status,SummaryStrip} from "@/components/UI";

export default async function ApprovalsPage(){
  const actor=await requireActor();const rows=await listApprovals(actor);const pending=rows.filter(item=>item.status==="pending");
  const mayDecide=hasCapability(actor.access,"approval.decide");const allOrg=actor.access.allOrg||actor.access.scopes["approval.decide"]?.some(scope=>scope.type==="all_org");
  return <>
    <PageHeader eyebrow="Команда" title="Согласования" subtitle="Единая очередь решений по расчётам и коммерческим предложениям. Решение фиксируется в истории и изменяет состояние связанной сущности." breadcrumbs={[{label:"Главная"},{label:"Команда"},{label:"Согласования"}]}/>
    <SummaryStrip><span>Ожидают решения <strong>{pending.length}</strong></span><span>Всего в выборке <strong>{rows.length}</strong></span></SummaryStrip>
    <Section title="Очередь согласований">{rows.length?<div className="grid-scroll"><table className="data-table"><thead><tr><th>Предмет</th><th>Инициатор</th><th>Согласующий</th><th>Отправлено</th><th>Статус</th><th>Решение</th></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td>{item.subjectType==="proposal"?<Link className="cell-title" href={`/proposals/${item.subjectId}`}>{item.subject}</Link>:<Link className="cell-title" href={item.requestId?`/calculations?request=${item.requestId}`:"/calculations"}>{item.subject}</Link>}</td><td>{item.requestedBy}</td><td>{item.approver??"Не определён"}</td><td>{item.requestedAt}</td><td><Status tone={item.status==="approved"?"good":item.status==="rejected"?"bad":"warn"}>{item.status}</Status>{item.decisionComment&&<span className="cell-sub">{item.decisionComment}</span>}</td><td>{item.status==="pending"&&mayDecide&&(allOrg||item.approverUserId===actor.userId)?<ApprovalDecisionButtons approvalId={item.id}/>:"—"}</td></tr>)}</tbody></table></div>:<Empty title="Очередь пуста" text="Новые расчёты и КП появятся здесь после отправки на согласование."/>}</Section>
  </>;
}
