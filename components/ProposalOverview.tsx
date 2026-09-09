import Link from "next/link";
import { KeyValue, Section, Status, SummaryStrip } from "@/components/UI";
import type { CommercialProposalDetail } from "@/lib/commercial/proposal-document";
import { proposalDate, proposalDay, proposalStatusLabel, proposalTone, proposalUnitLabels } from "@/lib/commercial/proposal-ui";
import { rub, vatModeLabel } from "@/lib/ui/format";

export function ProposalOverview({ proposal }: { proposal: CommercialProposalDetail }) {
  const roles = proposal.content.roles ?? [];
  return <>
    <SummaryStrip>
      <span>Статус <Status tone={proposalTone(proposal.status)}>{proposalStatusLabel(proposal.status)}</Status></span>
      <span>Версия <strong>№{proposal.version}</strong></span>
      <span>Позиции <strong>{roles.length}</strong></span>
      <span>Расчётный объём <strong>{Number(proposal.totalValue) ? rub(proposal.totalValue) : "—"}</strong></span>
      {proposal.content.validUntil && <span>Действует до <strong>{proposalDay(proposal.content.validUntil)}</strong></span>}
    </SummaryStrip>

    <div className="proposal-entity-overview">
      <div className="proposal-entity-main">
        <Section title="Коммерческие условия">
          <div className="proposal-facts">
            <article><span>Заказчик</span><strong>{proposal.content.company ?? proposal.client}</strong><small>{proposal.client}</small></article>
            <article><span>Объект / предложение</span><strong>{proposal.content.objectName ?? proposal.request}</strong><small>{proposal.content.location ?? "Локация не указана"}</small></article>
            <article><span>Плановый старт</span><strong>{proposalDay(proposal.content.expectedStartDate)}</strong><small>{proposal.content.projectDuration ?? "Срок проекта не указан"}</small></article>
            <article><span>График / объём</span><strong>{proposal.content.schedule ?? "Уточняется"}</strong><small>{roles.reduce((sum, item) => sum + Number(item.count || 0), 0)} человек в предложении</small></article>
            <article><span>НДС</span><strong>{proposal.content.vatMode ? vatModeLabel(proposal.content.vatMode) : "Не указан"}</strong><small>{proposal.content.vatPct ? `${proposal.content.vatPct}%` : "Ставка НДС не указана"}</small></article>
            <article><span>Описание</span><strong>{proposal.content.description ?? "Без дополнительного описания"}</strong></article>
          </div>
        </Section>

        <Section title="Позиции и ставки" note={`${roles.length} позиций в зафиксированной версии`}>
          <div className="grid-scroll"><table className="data-table proposal-rate-table"><thead><tr><th>Позиция</th><th>Численность</th><th>Без НДС</th><th>С НДС</th><th>Единица</th></tr></thead><tbody>{roles.length ? roles.map((item) => <tr key={item.scenarioId}><td className="cell-title">{item.role}</td><td className="num">{item.count}</td><td className="num">{rub(item.rateNet)}</td><td className="num">{rub(item.rateGross)}</td><td>{proposalUnitLabels[item.unit] ?? "единица"}</td></tr>) : <tr><td colSpan={5}><div className="commercial-empty">Позиции не добавлены</div></td></tr>}</tbody></table></div>
        </Section>
      </div>

      <aside className="proposal-entity-side">
        <Section title="Статус предложения">
          <div className="proposal-side-body">
            <Status tone={proposalTone(proposal.status)}>{proposalStatusLabel(proposal.status)}</Status>
            <KeyValue label="Создано" value={`${proposal.createdAt} · ${proposal.createdBy}`}/>
            <KeyValue label="Согласовано внутри" value={proposalDate(proposal.approvedAt)}/>
            <KeyValue label="Отправлено клиенту" value={proposalDate(proposal.sentAt)}/>
            <KeyValue label="Принято клиентом" value={proposalDate(proposal.acceptedAt)}/>
            {proposal.clientDecisionNote && <KeyValue label="Комментарий" value={proposal.clientDecisionNote}/>} 
            <Link className="proposal-side-link" href={`/proposals/${proposal.id}?tab=approval`}>Открыть согласование →</Link>
          </div>
        </Section>
        <Section title="Связанные материалы">
          <div className="proposal-side-links">
            <Link href={`/requests/${proposal.requestId}`}>Заявка <span>{proposal.request}</span></Link>
            <Link href={`/proposals/${proposal.id}?tab=document`}>Документ <span>КП №{proposal.version}</span></Link>
            {proposal.sourceObjectId && <Link href={`/objects/${proposal.sourceObjectId}`}>Объект <span>Открыть созданный объект</span></Link>}
          </div>
        </Section>
      </aside>
    </div>
  </>;
}
