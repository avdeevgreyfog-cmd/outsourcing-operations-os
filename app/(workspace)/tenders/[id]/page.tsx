import { isGithubPagesDemo } from "@/lib/demo/pages";
import Link from "next/link";
import type { ReactNode } from "react";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth/server";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {getTender,getTenderOptions} from "@/lib/tenders/service";
import {listTenderActivity} from "@/lib/tenders/activity";
import {tenderBillingLabels,tenderDecisionLabels,tenderDeadlineState,tenderResultLabels,tenderStageLabel,tenderCalculationStatusLabels,tenderApprovalStatusLabels,tenderApprovalProcessLabels,tenderEnumLabel} from "@/lib/tenders/model";
import {EntityTabs,KeyValue,PageHeader,Section,Status} from "@/components/UI";
import {TenderApprovalActions,TenderComments,TenderCoreEditor,TenderDocumentsPanel,TenderSubmissionEditor,TenderTeamEditor,TenderTradingPanel} from "@/components/TenderEntityPanels";
import {TenderAnalysisWorkspace} from "@/components/TenderAnalysisWorkspace";
import {StaticDemoQueryTabsController} from "@/components/StaticDemoQueryTabsController";

import {formatTenderDateTime} from "@/lib/tenders/datetime";

const tabs={overview:"Обзор",analysis:"Анализ",documents:"Документы",calculations:"Расчёты",approvals:"Согласования",submission:"Подача",trading:"Торги",history:"История"} as const;
function money(value:number|string|null){if(value==null)return "—";return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(Number(value));}
const day=formatTenderDateTime;
function tone(stage:string){if(stage==="completed")return "neutral" as const;if(["submitted","awaiting_result"].includes(stage))return "good" as const;if(["clarification","approval","preparation"].includes(stage))return "warn" as const;return "info" as const;}
function textCondition(value:unknown){return typeof value==="string"&&value.trim()?value.trim():"—";}
function guaranteedVolume(value:unknown){return value==="yes"?"Да":value==="no"?"Нет":value==="partial"?"Частично / минимальный объём":"Не определено";}


export default async function TenderPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){
  const staticDemo=isGithubPagesDemo();
  const {id}=await params;const query=staticDemo?{}:await searchParams;const actor=await requireActor();
  if(actor.demo&&!actor.access.capabilities.includes("sales.tender.read"))actor.access.capabilities.push("sales.tender.read");
  const tender=await getTender(actor,id);if(!tender)notFound();
  const active=query.tab&&query.tab in tabs?query.tab as keyof typeof tabs:"overview";
  const canEdit=!actor.demo&&canReadRow(actor.access,"sales.tender.edit",tender,actor);const canResult=canEdit&&hasCapability(actor.access,"sales.tender.result");const canSubmit=canEdit&&hasCapability(actor.access,"sales.tender.submit");const canReadCalculations=hasCapability(actor.access,"calculation.scenario.read");
  const [options,activity]=await Promise.all([getTenderOptions(actor),active==="history"||staticDemo?listTenderActivity(actor,id):Promise.resolve([])]);
  const deadline=tenderDeadlineState(tender.submissionDeadline);const ready=tender.requirementCount?Math.round(tender.readyRequirementCount/tender.requirementCount*100):null;
  const tabItems=Object.entries(tabs).map(([key,label])=>({label,href:`/tenders/${id}?tab=${key}`,count:key==="documents"?tender.requirementCount+tender.sourceDocuments.length:key==="calculations"&&canReadCalculations?tender.calculations.length:key==="approvals"?tender.approvals.length:key==="trading"?tender.bidRounds.length:key==="history"?activity.length:undefined}));
  const actions=<><Link className="button" href="/tenders">К реестру</Link>{hasCapability(actor.access,"calculation.scenario.create")&&tender.roles.length>0&&<Link className="button primary" href={`/calculations?tender=${id}`}>Открыть расчёт</Link>}</>;
  const panel=(key:string,content:ReactNode)=>{
    if(!(key in tabs)||(!staticDemo&&active!==key))return null;
    return <div data-demo-tab-panel={key} style={{display:staticDemo&&key!=="overview"?"none":"contents"}}>{content}</div>;
  };
  const workspace=<div className="tender-entity">
    <PageHeader eyebrow="Тендер" title={tender.title} subtitle={`${tender.customer} · ${tender.platform??"площадка не указана"}${tender.procedureNumber?` · № ${tender.procedureNumber}`:""}`} breadcrumbs={[{label:"Коммерция"},{label:"Тендеры",href:"/tenders"},{label:tender.title}]} actions={actions}/>
    {actor.demo&&<p className="muted" role="note">Демонстрационная карточка. Изменение бизнес-данных недоступно.</p>}
    <EntityTabs items={tabItems} active={tabs[active]}/>
    {panel("overview",<>

      <div className="request-entity-overview tender-overview-grid"><div className="request-entity-main">
        <Section title="Ключевые данные"><div className="request-entity-facts"><article><span>Заказчик</span><strong>{tender.customer}</strong><small>{tender.clientId?"Связан с клиентом OPERIS":"Внешний заказчик"}</small></article><article><span>Площадка</span><strong>{tender.platform??"—"}</strong><small>{tender.procedureNumber?`№ ${tender.procedureNumber}`:"Номер не указан"}</small>{tender.sourceUrl&&<a href={tender.sourceUrl} target="_blank" rel="noreferrer">Открыть закупку</a>}</article><article><span>Начальная цена</span><strong>{money(tender.initialPrice)}</strong><small>{tenderEnumLabel(tenderBillingLabels,tender.billingUnit)}</small></article><article><span>Следующее действие</span><strong>{tender.nextActionText??"Не назначено"}</strong><small>{tender.nextActionAt?day(tender.nextActionAt):"Срок не указан"}</small></article><article><span>Позиции</span><strong>{tender.roleCount}</strong><small>Расчётов: {tender.calculationCount}</small></article><article><span>Документы</span><strong>{tender.readyRequirementCount} / {tender.requirementCount}</strong><small>{tender.requirementCount? (tender.blockerCount?`Требуют внимания: ${tender.blockerCount}`:"Блокеров нет") :"Требования не заданы"}</small></article></div></Section>
        <Section title="Сводка анализа"><div className="request-entity-facts tender-analysis-facts"><article><span>Предмет закупки</span><strong>{textCondition(tender.conditions.subject)}</strong><small>{textCondition(tender.conditions.workFormat)}</small></article><article><span>Регион / место</span><strong>{textCondition(tender.conditions.region)}</strong><small>График: {textCondition(tender.conditions.schedule)}</small></article><article><span>Гарантированный объём</span><strong>{guaranteedVolume(tender.conditions.guaranteedVolume)}</strong><small>{textCondition(tender.conditions.requestLeadTime)==="—"?"Срок заявки на персонал не определён":`Заявка на персонал: ${textCondition(tender.conditions.requestLeadTime)}`}</small></article><article><span>Участие</span><strong>{textCondition(tender.conditions.bidSecurity)==="—"?"Обеспечение не определено":textCondition(tender.conditions.bidSecurity)}</strong><small>{textCondition(tender.conditions.contractSecurity)==="—"?"Обеспечение договора не определено":`Договор: ${textCondition(tender.conditions.contractSecurity)}`}</small></article></div></Section>
        <Section title="Аналитическое заключение"><p className="tender-overview-summary">{tender.analysisSummary??"Аналитическое заключение пока не заполнено."}</p>{textCondition(tender.conditions.openQuestions)!=="—"&&<div className="tender-open-questions"><strong>Требует уточнения</strong><p>{textCondition(tender.conditions.openQuestions)}</p></div>}</Section>
        <TenderCoreEditor tender={tender} options={options} canEdit={canEdit} canResult={canResult} canSubmit={canSubmit} mode="core"/><TenderTeamEditor tender={tender} options={options} canEdit={canEdit}/><TenderComments tender={tender} canEdit={canEdit}/>
      </div><aside className="request-entity-side"><Section title="Рабочий контур"><div className="request-entity-side-body"><Status tone={tone(tender.stage)}>{tenderStageLabel(tender.stage)}</Status><KeyValue label="Подача до" value={day(tender.submissionDeadline)}/><KeyValue label="Срок" value={tender.stage==="completed"?"Тендер завершён":deadline.label}/><KeyValue label="Ответственный" value={tender.owner??"Не назначен"}/><KeyValue label="Решение" value={tenderEnumLabel(tenderDecisionLabels,tender.decision)}/><KeyValue label="Потенциал" value={tender.potential==="high"?"Высокий":tender.potential==="low"?"Низкий":"Средний"}/><KeyValue label="Приоритет" value={tender.priority==="high"?"Высокий":tender.priority==="low"?"Низкий":"Обычный"}/><KeyValue label="Готовность документов" value={ready===null?"Требования не заданы":`${ready}%`}/>{tender.result&&<KeyValue label="Результат" value={tenderEnumLabel(tenderResultLabels,tender.result)}/>}</div></Section><TenderCoreEditor tender={tender} options={options} canEdit={canEdit} canResult={canResult} canSubmit={canSubmit} mode="workflow"/></aside></div>
    </>)}
    {panel("analysis",<TenderAnalysisWorkspace tender={tender} options={options} canEdit={canEdit}/>)} 
    {panel("documents",<TenderDocumentsPanel tender={tender} options={options} canEdit={canEdit}/>)} 
    {panel("calculations",<Section title="Экономика тендера" actions={hasCapability(actor.access,"calculation.scenario.create")&&tender.roles.length?<Link className="button primary" href={`/calculations?tender=${id}`}>Новый расчёт</Link>:undefined}>{!canReadCalculations?<p className="muted">Нет доступа к расчётам экономики тендера.</p>:tender.calculations.length?<div className="grid-scroll"><table className="data-table"><thead><tr><th>Позиция</th><th>Сценарий</th><th>Модель</th><th>Ставка без НДС</th><th>С НДС</th><th>Маржа</th><th>Единица</th><th>Статус</th></tr></thead><tbody>{tender.calculations.map(item=><tr key={item.scenarioId}><td>{item.role}</td><td><Link href={`/calculations?tender=${id}#scenario-${item.scenarioId}`}>{item.name}</Link></td><td>{item.model}</td><td>{money(item.clientRate)}</td><td>{item.clientRateGross==null?"—":money(item.clientRateGross)}</td><td>{item.marginPct==null?"—":`${Number(item.marginPct).toFixed(1)}%`}</td><td>{tenderEnumLabel(tenderBillingLabels,item.billingUnit)}</td><td><Status>{tenderEnumLabel(tenderCalculationStatusLabels,item.status,"Статус уточняется")}</Status></td></tr>)}</tbody></table></div>:<p className="muted">Расчётов пока нет. Добавьте позиции во вкладке «Анализ» и откройте общий калькулятор OPERIS.</p>}</Section>)}
    {panel("approvals",<div className="tender-tab-stack"><TenderApprovalActions tender={tender} canEdit={canEdit}/><Section title="История согласований">{tender.approvals.length?<div className="grid-scroll"><table className="data-table"><thead><tr><th>Процесс</th><th>Инициатор</th><th>Согласующий</th><th>Отправлено</th><th>Статус</th><th>Комментарий</th></tr></thead><tbody>{tender.approvals.map(item=><tr key={item.id}><td>{tenderEnumLabel(tenderApprovalProcessLabels,item.processCode,"Согласование")}</td><td>{item.requestedBy}</td><td>{item.approver??"—"}</td><td>{item.requestedAt}</td><td><Status>{tenderEnumLabel(tenderApprovalStatusLabels,item.status,"Статус уточняется")}</Status></td><td>{item.decisionComment??"—"}</td></tr>)}</tbody></table></div>:<p className="muted">Согласований пока нет.</p>}</Section></div>)}
    {panel("submission",<TenderSubmissionEditor tender={tender} canEdit={canEdit} canSubmit={canSubmit}/>)} 
    {panel("trading",<TenderTradingPanel tender={tender} canSubmit={canSubmit} canReadEconomics={canReadCalculations}/>)} 
    {panel("history",<Section title="История тендера">{activity.length?<div className="request-history-list">{activity.map(item=><article key={item.id}><div><strong>{item.summary}</strong><span>{item.actor??"Система"}</span></div><time>{item.createdAt}</time></article>)}</div>:<p className="muted">Событий пока нет.</p>}</Section>)}
  </div>;
  return staticDemo?<StaticDemoQueryTabsController enabled defaultTab="overview">{workspace}</StaticDemoQueryTabsController>:workspace;
}
