import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {getTender,getTenderOptions} from "@/lib/tenders/service";
import {listTenderActivity} from "@/lib/tenders/activity";
import {tenderBillingLabels,tenderDecisionLabels,tenderDeadlineState,tenderResultLabels,tenderStageLabel} from "@/lib/tenders/model";
import {EntityTabs,KeyValue,PageHeader,Section,Status,SummaryStrip} from "@/components/UI";
import {TenderAnalysisEditor,TenderApprovalActions,TenderComments,TenderCoreEditor,TenderDocumentsPanel,TenderSubmissionEditor,TenderTeamEditor} from "@/components/TenderEntityPanels";

const tabs={overview:"Обзор",analysis:"Анализ",documents:"Документы",calculations:"Расчёты",approvals:"Согласования",submission:"Подача",history:"История"} as const;
function money(value:number|string|null){if(value==null)return "—";return new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0}).format(Number(value));}
function day(value:string|null){if(!value)return "—";const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});}
function tone(stage:string){if(stage==="completed")return "neutral" as const;if(["submitted","awaiting_result"].includes(stage))return "good" as const;if(["clarification","approval","preparation"].includes(stage))return "warn" as const;return "info" as const;}

export default async function TenderPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){
  const {id}=await params;const query=await searchParams;const actor=await requireActor();
  if(actor.demo&&!actor.access.capabilities.includes("sales.tender.read"))actor.access.capabilities.push("sales.tender.read");
  const tender=await getTender(actor,id);if(!tender)notFound();
  const active=query.tab&&query.tab in tabs?query.tab as keyof typeof tabs:"overview";
  const canEdit=hasCapability(actor.access,"sales.tender.edit");const canResult=hasCapability(actor.access,"sales.tender.result");const canSubmit=hasCapability(actor.access,"sales.tender.submit");
  const [options,activity]=await Promise.all([getTenderOptions(actor),active==="history"?listTenderActivity(actor,id):Promise.resolve([])]);
  const deadline=tenderDeadlineState(tender.submissionDeadline);const ready=tender.requirementCount?Math.round(tender.readyRequirementCount/tender.requirementCount*100):100;
  const tabItems=Object.entries(tabs).map(([key,label])=>({label,href:`/tenders/${id}?tab=${key}`,count:key==="documents"?tender.requirementCount+tender.sourceDocuments.length:key==="calculations"?tender.calculations.length:key==="approvals"?tender.approvals.length:key==="history"?activity.length:undefined}));
  const actions=<><Link className="button" href="/tenders">К реестру</Link>{hasCapability(actor.access,"calculation.scenario.create")&&tender.roles.length>0&&<Link className="button primary" href={`/calculations?tender=${id}`}>Открыть расчёт</Link>}</>;
  return <>
    <PageHeader eyebrow="Тендер" title={tender.title} subtitle={`${tender.customer} · ${tender.platform??"площадка не указана"}${tender.procedureNumber?` · № ${tender.procedureNumber}`:""}`} breadcrumbs={[{label:"Коммерция"},{label:"Тендеры",href:"/tenders"},{label:tender.title}]} actions={actions}/>
    <EntityTabs items={tabItems} active={tabs[active]}/>
    {active==="overview"&&<>
      <SummaryStrip><span>Этап <strong>{tenderStageLabel(tender.stage)}</strong></span><span>Подача до <strong>{day(tender.submissionDeadline)}</strong></span><span>Осталось <strong>{deadline.label}</strong></span><span>Решение <strong>{tenderDecisionLabels[tender.decision]??tender.decision}</strong></span><span>Документы <strong>{ready}%</strong></span></SummaryStrip>
      <div className="request-entity-overview tender-overview-grid"><div className="request-entity-main">
        <Section title="Ключевые данные"><div className="request-entity-facts"><article><span>Заказчик</span><strong>{tender.customer}</strong><small>{tender.clientId?"Связан с клиентом OPERIS":"Внешний заказчик"}</small></article><article><span>Площадка</span><strong>{tender.platform??"—"}</strong><small>{tender.procedureNumber?`№ ${tender.procedureNumber}`:"Номер не указан"}</small>{tender.sourceUrl&&<a href={tender.sourceUrl} target="_blank" rel="noreferrer">Открыть закупку</a>}</article><article><span>Начальная цена</span><strong>{money(tender.initialPrice)}</strong><small>{tenderBillingLabels[tender.billingUnit]??tender.billingUnit}</small></article><article><span>Следующее действие</span><strong>{tender.nextActionText??"Не назначено"}</strong><small>{tender.nextActionAt?day(tender.nextActionAt):"Срок не указан"}</small></article><article><span>Позиции</span><strong>{tender.roleCount}</strong><small>Расчётов: {tender.calculationCount}</small></article><article><span>Документы</span><strong>{tender.readyRequirementCount} / {tender.requirementCount}</strong><small>{tender.blockerCount?`Требуют внимания: ${tender.blockerCount}`:"Блокеров нет"}</small></article></div></Section>
        <Section title="Аналитическое заключение"><p className="tender-overview-summary">{tender.analysisSummary??"Аналитическое заключение пока не заполнено."}</p></Section>
        <TenderComments tender={tender} canEdit={canEdit}/>
      </div><aside className="request-entity-side"><Section title="Рабочий контур"><div className="request-entity-side-body"><Status tone={tone(tender.stage)}>{tenderStageLabel(tender.stage)}</Status><KeyValue label="Ответственный" value={tender.owner??"Не назначен"}/><KeyValue label="Решение" value={tenderDecisionLabels[tender.decision]??tender.decision}/><KeyValue label="Приоритет" value={tender.priority==="high"?"Высокий":tender.priority==="low"?"Низкий":"Обычный"}/>{tender.result&&<KeyValue label="Результат" value={tenderResultLabels[tender.result]??tender.result}/>}</div></Section><TenderCoreEditor tender={tender} options={options} canEdit={canEdit} canResult={canResult}/><TenderTeamEditor tender={tender} options={options} canEdit={canEdit}/></aside></div>
    </>}
    {active==="analysis"&&<TenderAnalysisEditor tender={tender} options={options} canEdit={canEdit}/>} 
    {active==="documents"&&<TenderDocumentsPanel tender={tender} options={options} canEdit={canEdit}/>} 
    {active==="calculations"&&<Section title="Экономика тендера" actions={hasCapability(actor.access,"calculation.scenario.create")&&tender.roles.length?<Link className="button primary" href={`/calculations?tender=${id}`}>Новый расчёт</Link>:undefined}>{tender.calculations.length?<div className="grid-scroll"><table className="data-table"><thead><tr><th>Позиция</th><th>Сценарий</th><th>Модель</th><th>Ставка без НДС</th><th>С НДС</th><th>Маржа</th><th>Статус</th></tr></thead><tbody>{tender.calculations.map(x=><tr key={x.scenarioId}><td>{x.role}</td><td><Link href={`/calculations?tender=${id}#scenario-${x.scenarioId}`}>{x.name}</Link></td><td>{x.model}</td><td>{money(x.clientRate)}</td><td>{x.clientRateGross==null?"—":money(x.clientRateGross)}</td><td>{Number(x.marginPct).toFixed(1)}%</td><td>{x.status}</td></tr>)}</tbody></table></div>:<p className="muted">Расчётов пока нет. Добавьте позиции во вкладке «Анализ» и откройте общий калькулятор OPERIS.</p>}</Section>}
    {active==="approvals"&&<div className="tender-tab-stack"><TenderApprovalActions tender={tender} canEdit={canEdit}/><Section title="История согласований">{tender.approvals.length?<div className="grid-scroll"><table className="data-table"><thead><tr><th>Процесс</th><th>Инициатор</th><th>Согласующий</th><th>Отправлено</th><th>Статус</th><th>Комментарий</th></tr></thead><tbody>{tender.approvals.map(a=><tr key={a.id}><td>{a.processCode==="tender_participation"?"Участие":a.processCode==="tender_bid"?"Цена":"Подача"}</td><td>{a.requestedBy}</td><td>{a.approver??"—"}</td><td>{a.requestedAt}</td><td>{a.status}</td><td>{a.decisionComment??"—"}</td></tr>)}</tbody></table></div>:<p className="muted">Согласований пока нет.</p>}</Section></div>}
    {active==="submission"&&<TenderSubmissionEditor tender={tender} canEdit={canEdit} canSubmit={canSubmit}/>} 
    {active==="history"&&<Section title="История тендера">{activity.length?<div className="request-history-list">{activity.map(item=><article key={item.id}><div><strong>{item.summary}</strong><span>{item.actor??"Система"}</span></div><time>{item.createdAt}</time></article>)}</div>:<p className="muted">Событий пока нет.</p>}</Section>}
  </>;
}
