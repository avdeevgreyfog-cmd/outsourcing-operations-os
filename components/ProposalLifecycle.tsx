import Link from "next/link";
import { ProposalWorkflowActions } from "@/components/CommercialWorkflowActions";
import { Section } from "@/components/UI";
import type { CommercialProposalDetail } from "@/lib/commercial/proposal-document";
import { proposalDate } from "@/lib/commercial/proposal-ui";

function lifecycle(proposal: CommercialProposalDetail) {
  return [
    { title: "Создана версия КП", detail: `КП №${proposal.version} · ${proposal.createdBy}`, at: proposal.createdAt, done: true },
    { title: "Внутреннее согласование", detail: proposal.status === "rejected_internal" ? "Отклонено внутри" : "Версия направлена на внутреннюю проверку", at: proposal.approvedAt, done: Boolean(proposal.approvedAt) || proposal.status === "internal_review" || proposal.status === "rejected_internal" },
    { title: "Согласовано внутри", detail: "Предложение разрешено к отправке заказчику", at: proposal.approvedAt, done: Boolean(proposal.approvedAt) },
    { title: "Отправлено заказчику", detail: "Клиентская версия зафиксирована и отправлена", at: proposal.sentAt, done: Boolean(proposal.sentAt) },
    { title: "Решение клиента", detail: proposal.status === "client_rejected" ? "Клиент отказался от предложения" : proposal.status === "revision_requested" ? "Клиент запросил доработку" : "Предложение принято клиентом", at: proposal.acceptedAt, done: Boolean(proposal.acceptedAt) || ["client_rejected", "revision_requested"].includes(proposal.status) },
    { title: "Начата подготовка", detail: "Созданы объект в подготовке, потребности подбора, план запуска и черновик договора", at: proposal.launchedAt, done: Boolean(proposal.sourceObjectId) },
  ].filter((item) => item.done);
}

export function ProposalApprovalView({ proposal, canSubmit, canClientDecision, canLaunch }: { proposal: CommercialProposalDetail; canSubmit: boolean; canClientDecision: boolean; canLaunch: boolean }) {
  const items = lifecycle(proposal);
  return <div className="proposal-approval-layout">
    <Section title="Жизненный цикл" note="Внутренняя проверка отделена от решения заказчика; после принятия КП подготовка объекта идёт параллельно договорной работе.">
      <div className="proposal-lifecycle">{items.map((item, index) => <article key={`${item.title}-${index}`}><i>{index + 1}</i><div><strong>{item.title}</strong><span>{item.detail}</span><small>{item.at ? proposalDate(item.at) : "Текущий этап"}</small></div></article>)}</div>
    </Section>
    <aside>
      <Section title="Действия">
        <div className="proposal-side-body">
          <ProposalWorkflowActions proposalId={proposal.id} status={proposal.status} objectId={proposal.sourceObjectId} canSubmit={canSubmit} canClientDecision={canClientDecision} canLaunch={canLaunch}/>
          {proposal.status === "internal_review" && <Link className="button" href="/approvals">Открыть согласования</Link>}
        </div>
      </Section>
      {proposal.clientDecisionNote && <Section title="Комментарий клиента"><div className="proposal-client-note">{proposal.clientDecisionNote}</div></Section>}
    </aside>
  </div>;
}

export function ProposalHistoryView({ proposal }: { proposal: CommercialProposalDetail }) {
  const items = lifecycle(proposal).reverse();
  return <div className="proposal-history-wrap"><Section title="История КП" note={`Версия №${proposal.version}`}><div className="proposal-history">{items.map((item, index) => <article key={`${item.title}-${index}`}><i/><div><header><strong>{item.title}</strong><span>{item.at ? proposalDate(item.at) : "Текущий этап"}</span></header><p>{item.detail}</p></div></article>)}</div></Section></div>;
}
