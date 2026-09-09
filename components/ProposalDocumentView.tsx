import { ProposalDocumentEditor } from "@/components/ProposalDocumentEditor";
import { KeyValue, Section } from "@/components/UI";
import type { CommercialProposalDetail } from "@/lib/commercial/proposal-document";
import { proposalDay, proposalUnitLabels } from "@/lib/commercial/proposal-ui";
import { rub } from "@/lib/ui/format";

export function ProposalDocumentView({ proposal, canEdit }: { proposal: CommercialProposalDetail; canEdit: boolean }) {
  const roles = proposal.content.roles ?? [];
  return <div className="proposal-document-workspace">
    <article className="proposal-sheet">
      <header className="proposal-sheet-head">
        <div><span>Коммерческое предложение</span><strong>КП №{proposal.version}</strong></div>
        <small>{proposal.createdAt}</small>
      </header>

      <div className="proposal-sheet-title">
        <span>Для компании</span>
        <h2>{proposal.content.company ?? proposal.client}</h2>
        <p>{proposal.content.objectName ?? proposal.request}</p>
      </div>

      {proposal.content.description && <p className="proposal-sheet-description">{proposal.content.description}</p>}

      <div className="proposal-sheet-meta">
        <div><span>Локация</span><strong>{proposal.content.location ?? "—"}</strong></div>
        <div><span>Старт</span><strong>{proposalDay(proposal.content.expectedStartDate)}</strong></div>
        <div><span>График</span><strong>{proposal.content.schedule ?? "—"}</strong></div>
        <div><span>Действует до</span><strong>{proposalDay(proposal.content.validUntil)}</strong></div>
      </div>

      <table className="proposal-sheet-table">
        <thead><tr><th>Позиция</th><th>Кол-во</th><th>Без НДС</th><th>С НДС</th><th>Единица</th></tr></thead>
        <tbody>{roles.map((item) => <tr key={item.scenarioId}><td>{item.role}</td><td>{item.count}</td><td>{rub(item.rateNet)}</td><td>{rub(item.rateGross)}</td><td>{proposalUnitLabels[item.unit] ?? "единица"}</td></tr>)}</tbody>
      </table>

      <div className="proposal-sheet-columns">
        <section>
          <h3>В стоимость включено</h3>
          {proposal.content.included?.length ? <ul>{proposal.content.included.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>Отдельные условия не указаны.</p>}
        </section>
        <section>
          <h3>Предоставляет заказчик</h3>
          {proposal.content.clientProvides?.length ? <ul>{proposal.content.clientProvides.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>Отдельные условия не указаны.</p>}
        </section>
      </div>

      <section className="proposal-sheet-terms">
        <h3>Условия сотрудничества</h3>
        <p>{proposal.content.terms ?? "Основные условия не указаны."}</p>
        {proposal.content.additionalConditions && <p>{proposal.content.additionalConditions}</p>}
        {proposal.content.comment && <p><strong>Комментарий:</strong> {proposal.content.comment}</p>}
      </section>
    </article>

    <aside className="proposal-document-side">
      <Section title="Документ">
        <div className="proposal-side-body">
          <KeyValue label="Состояние" value={canEdit ? "Можно редактировать" : "Версия зафиксирована"}/>
          <KeyValue label="Позиций" value={roles.length}/>
          <KeyValue label="Сумма" value={Number(proposal.totalValue) ? rub(proposal.totalValue) : "—"}/>
          <KeyValue label="Срок действия" value={proposalDay(proposal.content.validUntil)}/>
          {canEdit && <div className="proposal-document-edit"><ProposalDocumentEditor proposalId={proposal.id} content={proposal.content}/></div>}
        </div>
      </Section>
      <Section title="Состав документа">
        <div className="proposal-document-outline">
          <span>Основная информация</span><span>Позиции и ставки</span><span>Что включено в ставку</span><span>Предоставляет заказчик</span><span>Условия сотрудничества</span>
        </div>
      </Section>
    </aside>
  </div>;
}
