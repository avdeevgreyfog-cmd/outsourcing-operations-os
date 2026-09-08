import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {listCommercialCalculations} from "@/lib/commercial/calculation-list";
import {getRequestCalculationCoverage} from "@/lib/commercial/calculations";
import {getCommercialOptions,getCommercialRequest,listRequestProposals} from "@/lib/commercial/service";
import {calculateRequestCompleteness,getRequestExternalState,getRequestIntake,type RequestExternalState} from "@/lib/commercial/request-intake";
import {RequestEditButton} from "@/components/CommercialRequestForms";
import {RequestExternalWorkflow} from "@/components/RequestExternalWorkflow";
import {CreateProposalButton} from "@/components/CommercialWorkflowActions";
import {KeyValue,PageHeader,Section,Status,SummaryStrip} from "@/components/UI";
import {requestSourceLabel,vatModeLabel,rub,pct} from "@/lib/ui/format";

function tone(status:string){if(["accepted","launched","approved"].includes(status))return "good" as const;if(["lost","archived","rejected"].includes(status))return "bad" as const;return "warn" as const}
function providerLabel(value:string){return ({client:"Заказчик",us:"Мы",worker:"Работник",not_required:"Не требуется",unknown:"Уточнить"} as Record<string,string>)[value]??value}
function billingLabel(value:string){return ({hour:"Человеко-час",shift:"Смена",worker_month:"Сотрудник / месяц",unit:"Единица",volume:"За объём",fixed:"Фикс за проект",mixed:"Смешанная",unknown:"Не определена"} as Record<string,string>)[value]??value}
function workerCategoryLabel(value:string){return ({rf:"РФ",eaeu:"ЕАЭС",foreign_with_docs:"Иностранные с разрешительными документами",client_rules:"По требованиям заказчика"} as Record<string,string>)[value]??value}

export default async function RequestPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const actor=await requireActor();
  const [request,options]=await Promise.all([getCommercialRequest(actor,id),getCommercialOptions(actor)]);if(!request)notFound();
  const canEdit=hasCapability(actor.access,"sales.request.edit");
  const [intake,calculations,coverage,proposals,external]=await Promise.all([
    getRequestIntake(actor,id),
    hasCapability(actor.access,"calculation.scenario.read")?(await listCommercialCalculations(actor)).filter(x=>x.requestId===id):[],
    hasCapability(actor.access,"calculation.scenario.read")?getRequestCalculationCoverage(actor,id):Promise.resolve([]),
    (hasCapability(actor.access,"sales.proposal.read")||hasCapability(actor.access,"sales.request.read"))?listRequestProposals(actor,id):Promise.resolve([]),
    canEdit?getRequestExternalState(actor,id):Promise.resolve({links:[],submissions:[]} as RequestExternalState),
  ]);
  const completeness=calculateRequestCompleteness(request,intake);
  const acceptedRoleIds=new Set(coverage.map(item=>item.requestRoleId));
  const archived=request.archivedAt!=null;const locked=["accepted","launched"].includes(request.status);
  const displayStatus=archived?"archived":request.status;
  const readyForProposal=!archived&&!locked&&request.roles.length>0&&request.roles.every(role=>acceptedRoleIds.has(role.id));
  const actions=<>{canEdit&&<RequestEditButton request={request} options={options} canArchive={hasCapability(actor.access,"sales.request.archive")}/>} {hasCapability(actor.access,"calculation.scenario.create")&&!archived&&!locked&&<Link href={`/calculations?request=${id}`} className="button primary">Открыть расчёт</Link>}</>;
  const contactValue=[intake.contact.phone,intake.contact.email,intake.contact.messenger].filter(Boolean).join(" · ")||"Контакты не указаны";
  const schedulePattern=intake.schedule.pattern==="custom"?intake.schedule.customPattern:intake.schedule.pattern;
  return <>
    <PageHeader eyebrow="Заявка" title={request.title} subtitle={`${intake.companyName||request.client} · ${request.location||intake.object.city||"локация уточняется"}`} breadcrumbs={[{label:"Коммерция"},{label:"Заявки",href:"/requests"},{label:request.title}]} actions={actions}/>
    <SummaryStrip><span>Этап <Status tone={tone(displayStatus)}>{displayStatus}</Status></span><span>Полнота <strong>{completeness.percent}%</strong></span><span>Позиции <strong>{request.roles.length}</strong></span><span>Расчёты <strong>{calculations.length}</strong></span><span>Версии КП <strong>{proposals.length}</strong></span></SummaryStrip>

    {!completeness.ready&&!archived&&!locked&&<div className="request-warning" style={{marginBottom:16}}><strong>Перед финальным расчётом стоит уточнить:</strong> {completeness.missing.slice(0,5).join(" · ")}{completeness.missing.length>5?` · ещё ${completeness.missing.length-5}`:""}</div>}

    <div className="workspace-grid"><div>
      <Section title="Сводка заявки" note="Ключевая информация для менеджера перед расчётом."><div style={{padding:14}} className="request-overview-grid">
        <div className="request-overview-card"><h3>Заказчик и контакт</h3><strong>{intake.companyName||request.client||"Не указан"}</strong><small>{intake.contact.name||"Контакт не указан"}</small><small>{contactValue}</small></div>
        <div className="request-overview-card"><h3>Объект</h3><strong>{intake.object.siteName||intake.object.city||request.location||"Не указан"}</strong><small>{request.region??"Регион не указан"}{intake.object.landmark?` · ${intake.object.landmark}`:""}</small><small>Старт: {request.startDate??"уточняется"} · {request.durationText??"срок не указан"}</small></div>
        <div className="request-overview-card"><h3>График</h3><strong>{schedulePattern||"Не указан"}</strong><small>{intake.schedule.presenceHours?`${intake.schedule.presenceHours} ч присутствия`:"Присутствие не указано"} · {intake.schedule.paidHours?`${intake.schedule.paidHours} ч оплачивается`:"оплачиваемые часы не указаны"}</small><small>Обед: {intake.schedule.lunchPaid?"оплачивается":"не оплачивается"}</small></div>
        <div className="request-overview-card"><h3>Объём</h3><strong>{request.roles.reduce((sum,role)=>sum+role.count,0)} чел. по позициям</strong><small>{intake.volume.demandType==="fixed"?"Фиксированная потребность":intake.volume.demandType==="variable"?"Плавающая потребность":intake.volume.demandType==="on_demand"?"По заявке заказчика":"Характер потребности уточняется"}</small><small>{intake.volume.startHeadcount?`Первый выход: ${intake.volume.startHeadcount} чел.`:"Первый выход не указан"}</small></div>
        <div className="request-overview-card"><h3>Коммерческий ориентир</h3><strong>{intake.commercial.clientLimit?`${rub(intake.commercial.clientLimit)} ${intake.commercial.clientLimitVatMode==="with_vat"?"с НДС":"без НДС"}`:"Лимит не указан"}</strong><small>{billingLabel(intake.commercial.billingUnit)}</small>{intake.commercial.desiredWorkerNet&&<small>Зарплата сотруднику: {rub(intake.commercial.desiredWorkerNet)} / {intake.commercial.desiredWorkerNetUnit}</small>}</div>
        <div className="request-overview-card"><h3>Работники</h3><strong>{intake.compliance.workerCategories.length?intake.compliance.workerCategories.map(workerCategoryLabel).join(" · "):"Категории не определены"}</strong><small>Проверка СБ: {intake.compliance.securityCheck==="required"?"требуется":intake.compliance.securityCheck==="not_required"?"не требуется":"уточнить"}</small><small>{intake.compliance.documentChecks.length?`Проверок / документов: ${intake.compliance.documentChecks.length}`:"Доп. проверки не указаны"}</small></div>
      </div></Section>

      <Section title="Позиции" note="Позиция наследует общий график, если для неё не сохранено отдельное исключение."><div className="grid-scroll"><table className="data-table"><thead><tr><th>Специальность</th><th>Численность</th><th>Условия</th><th>Ориентир заказчика</th><th>Экономика</th></tr></thead><tbody>{request.roles.length?request.roles.map(role=>{
        const ownSchedule=Object.keys(role.schedule??{}).length>0;const req=role.requirements??{};
        return <tr key={role.id}><td><strong className="cell-title">{role.specialty}</strong><span className="cell-sub">{typeof req.grade==="string"&&req.grade?req.grade:typeof req.experience==="string"&&req.experience?req.experience:"Без доп. квалификации"}</span></td><td className="num">{role.count}</td><td>{ownSchedule?<span>Свой график</span>:<span>Общий график</span>}{typeof req.description==="string"&&req.description&&<span className="cell-sub">{req.description}</span>}</td><td className="num">{role.targetClientRate?rub(Number(role.targetClientRate)):"—"}</td><td><Status tone={acceptedRoleIds.has(role.id)?"good":"warn"}>{acceptedRoleIds.has(role.id)?"согласовано":"нужен расчёт"}</Status></td></tr>;
      }):<tr><td colSpan={5}><div className="empty-inline">Позиции пока не добавлены</div></td></tr>}</tbody></table></div></Section>

      <Section title="Обеспечение и логистика" note="Стоимость статей, которые берём на себя, хранится в заявке и доступна для коммерческого расчёта."><div style={{padding:"6px 15px 14px"}}><KeyValue label="Проживание" value={providerLabel(intake.provision.housing.provider)}/><KeyValue label="Проезд" value={providerLabel(intake.provision.travel.provider)}/><KeyValue label="Развозка" value={providerLabel(intake.provision.shuttle.provider)}/><KeyValue label="Питание" value={providerLabel(intake.provision.meals.provider)}/><KeyValue label="Спецодежда" value={providerLabel(intake.provision.workwear.provider)}/><KeyValue label="СИЗ" value={providerLabel(intake.provision.ppe.provider)}/><KeyValue label="Инструмент" value={providerLabel(intake.provision.tools.provider)}/><KeyValue label="Медосмотр" value={providerLabel(intake.provision.medical.provider)}/></div></Section>

      {canEdit&&<Section title="Поделиться и получить уточнения" note="Получатель не видит CRM, маржу и внутреннюю себестоимость. Его версия попадёт на проверку."><div style={{padding:14}}><RequestExternalWorkflow requestId={id} state={external} canEdit={canEdit&&!archived&&!locked}/></div></Section>}
    </div><div>
      <Section title="Основные реквизиты"><div style={{padding:"6px 15px 14px"}}><KeyValue label="Клиент в CRM" value={request.client||"Не привязан"}/><KeyValue label="Регион" value={request.region??"—"}/><KeyValue label="Локация" value={request.location||"—"}/><KeyValue label="Старт" value={request.startDate??"Не указан"}/><KeyValue label="Длительность" value={request.durationText??"—"}/><KeyValue label="НДС" value={request.vatMode?vatModeLabel(request.vatMode):"Не указано"}/><KeyValue label="Источник" value={requestSourceLabel(request.source)}/></div></Section>
      <Section title="Расчёты" note="Согласованные сценарии не перезаписываются; при изменении условий создаётся новый сценарий."><div className="stack-list">{calculations.length?calculations.map(x=><div className="stack-item" key={x.id}><div><strong>{x.name}</strong><small>{x.role} · {x.model} · {rub(x.clientRate)} без НДС · маржа {pct(x.marginPct)}</small></div><Status tone={tone(x.status)}>{x.status}</Status></div>):<div className="empty-inline">Расчётов пока нет</div>}</div>{hasCapability(actor.access,"calculation.scenario.create")&&!archived&&!locked&&<div style={{padding:12}}><Link href={`/calculations?request=${id}`} className="button">Создать / пересчитать</Link></div>}</Section>
      <Section title="Коммерческие предложения" note="Каждая версия фиксирует именно те согласованные сценарии, из которых была создана."><div className="stack-list">{proposals.length?proposals.map(item=><Link className="stack-item" href={`/proposals/${item.id}`} key={item.id}><div><strong>КП v{item.version}</strong><small>{item.createdAt} · {item.createdBy}</small></div><Status tone={tone(item.status)}>{item.status}</Status></Link>):<div className="empty-inline">Версий КП пока нет</div>}</div>{readyForProposal&&hasCapability(actor.access,"sales.proposal.create")&&<div style={{padding:12}}><CreateProposalButton requestId={id}/></div>}</Section>
      {(baseComment(request.comments)||Object.values(intake.sectionComments).some(Boolean))&&<Section title="Комментарии"><div style={{padding:"6px 15px 14px"}}>{request.comments&&<p style={{fontSize:12,lineHeight:1.55}}>{request.comments}</p>}{Object.entries(intake.sectionComments).filter(([,value])=>value).map(([key,value])=><KeyValue key={key} label={key} value={value}/>)}</div></Section>}
    </div></div>
  </>;
}

function baseComment(value:string|null){return Boolean(value&&value.trim())}
