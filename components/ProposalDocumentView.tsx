import type { CSSProperties } from "react";
import { ProposalDocumentEditor } from "@/components/ProposalDocumentEditor";
import { KeyValue, Section } from "@/components/UI";
import { proposalPresentation, type CommercialProposalDetail } from "@/lib/commercial/proposal-document";
import type { ProposalTemplateRow } from "@/lib/commercial/proposal-template";
import { rub } from "@/lib/ui/format";

const unitLabels:Record<string,string>={hour:"чел./час",shift:"чел./смена",unit:"единица",worker_month:"чел./месяц",project_month:"проект/месяц",project_fixed:"проект",mixed:"сдельно",piece:"за единицу",piecework:"сдельно"};
type TemplateOption=Pick<ProposalTemplateRow,"id"|"name"|"kind"|"version"|"config">;

export function ProposalDocumentView({proposal,canEdit,templates=[]}:{proposal:CommercialProposalDetail;canEdit:boolean;templates?:TemplateOption[]}){
  const roles=proposal.content.roles??[];const presentation=proposalPresentation(proposal.content);const manager=proposal.content.manager;
  const showNet=presentation.priceDisplay!=="gross_only";const showGross=presentation.priceDisplay!=="net_only";
  return <div className="proposal-document-workspace proposal-document-price-led">
    <article className="proposal-sheet proposal-sheet-commercial" style={{"--proposal-accent":presentation.accent} as CSSProperties}>
      <header className="proposal-commercial-head"><div className="proposal-commercial-brand"><strong>КП №{proposal.version}</strong><span>{proposal.content.template?.name??"Стандарт OPERIS"}</span></div><div><strong>КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ</strong><span>{proposal.createdAt}</span></div></header>
      <div className="proposal-commercial-title"><h2>{presentation.documentTitle}</h2>{presentation.intro&&<p>{presentation.intro}</p>}</div>
      <section className="proposal-price-section"><h3>СТОИМОСТЬ УСЛУГ</h3><div className="proposal-price-rule"/><table className="proposal-sheet-table proposal-price-table"><thead><tr><th>Специальность</th><th>Количество</th><th>Единица расчёта</th>{showNet&&<th>Без НДС</th>}{showGross&&<th>С НДС</th>}</tr></thead><tbody>{roles.map(item=><tr key={item.scenarioId}><td>{item.role}</td><td>{item.count}</td><td>{unitLabels[item.unit]??item.unit}</td>{showNet&&<td>{rub(item.rateNet)}</td>}{showGross&&<td>{rub(item.rateGross)}</td>}</tr>)}</tbody></table><p className="proposal-vat-note">{showGross&&proposal.content.vatPct?`Ставка с НДС рассчитана по ставке ${proposal.content.vatPct}%. `:""}Количество и единица расчёта зафиксированы в текущей версии предложения.</p></section>
      {presentation.showIncluded&&!!proposal.content.included?.length&&<section className="proposal-optional-section"><h3>В СТОИМОСТЬ ВКЛЮЧЕНО</h3><div className="proposal-included-grid">{proposal.content.included.map((item,index)=><div key={`${item}-${index}`}><b>{String(index+1).padStart(2,"0")}</b><span>{item}</span></div>)}</div></section>}
      {presentation.showClientProvides&&!!proposal.content.clientProvides?.length&&<section className="proposal-optional-section"><h3>ПРЕДОСТАВЛЯЕТ ЗАКАЗЧИК</h3><div className="proposal-included-grid">{proposal.content.clientProvides.map((item,index)=><div key={`${item}-${index}`}><b>{String(index+1).padStart(2,"0")}</b><span>{item}</span></div>)}</div></section>}
      {presentation.showTerms&&proposal.content.terms&&<section className="proposal-optional-section proposal-terms-simple"><h3>УСЛОВИЯ СОТРУДНИЧЕСТВА</h3><p>{proposal.content.terms}</p>{proposal.content.additionalConditions&&<p>{proposal.content.additionalConditions}</p>}{proposal.content.comment&&<p>{proposal.content.comment}</p>}</section>}
      {presentation.showCta&&presentation.cta&&<div className="proposal-cta">{presentation.cta}</div>}
      {presentation.showManager&&manager&&<footer className="proposal-manager-footer"><span>Ответственный менеджер: <strong>{manager.name}</strong></span>{manager.phone&&<span>Телефон: <strong>{manager.phone}</strong></span>}{manager.email&&<span>Эл. почта: <strong>{manager.email}</strong></span>}{manager.telegram&&<span>Telegram: <strong>{manager.telegram}</strong></span>}</footer>}
    </article>
    <aside className="proposal-document-side"><Section title="Документ"><div className="proposal-side-body"><KeyValue label="Шаблон" value={proposal.content.template?.name??"Стандарт OPERIS"}/><KeyValue label="Цены" value={presentation.priceDisplay==="gross_only"?"Только с НДС":presentation.priceDisplay==="net_only"?"Только без НДС":"Без НДС + с НДС"}/><KeyValue label="Позиций" value={roles.length}/><KeyValue label="Доп. блоки" value={[presentation.showIncluded&&"Состав ставки",presentation.showClientProvides&&"Заказчик",presentation.showTerms&&"Условия"].filter(Boolean).join(" · ")||"Скрыты"}/>{canEdit&&<div className="proposal-document-edit"><ProposalDocumentEditor proposalId={proposal.id} content={proposal.content} templates={templates}/></div>}</div></Section><Section title="Клиентский результат"><div className="proposal-document-outline"><span>Главный акцент: ставки</span><span>Количество и единица расчёта</span><span>{presentation.showManager?"Контакт менеджера":"Контакт скрыт"}</span><span>Финальный формат: PDF</span></div></Section></aside>
  </div>;
}
