import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listCommercialCalculations } from "@/lib/commercial/calculation-list";
import { getCalculationModels } from "@/lib/commercial/calculation-models";
import { getCommercialRequest, listApprovals } from "@/lib/commercial/service";
import { getTender } from "@/lib/tenders/service";
import { getCalculationScenarioSeed, getCalculationWorkspaceMeta, getRateReferencesForRoles, type CalculationWorkspaceMeta } from "@/lib/commercial/calculation-workspace";
import { getCalculationStandards } from "@/lib/commercial/calculation-standards";
import { PageHeader, Section, Status, EntityTabs } from "@/components/UI";
import { CalculationsRegistryWorkspace } from "@/components/CalculationsRegistryWorkspace";
import { CalculatorWorkspaceOperis } from "@/components/CalculatorWorkspaceOperis";
import { CalculationVersionButton } from "@/components/CalculationVersionButton";
import { pct, rub } from "@/lib/ui/format";

const tabs=[
  {key:"overview",label:"Обзор"},{key:"scenarios",label:"Сценарии"},{key:"compare",label:"Сравнение"},{key:"approval",label:"Согласование"},{key:"history",label:"История"},
] as const;
function safeTab(value?:string){return tabs.some(item=>item.key===value)?value as typeof tabs[number]["key"]:"overview";}
function safeDate(value?:string){return value&&/^\d{4}-\d{2}-\d{2}$/.test(value)?value:null;}
function dateLabel(value:string|null|undefined){if(!value)return "—";const date=new Date(`${value}T00:00:00`);return Number.isNaN(date.getTime())?value:new Intl.DateTimeFormat("ru-RU").format(date);}
function statusTone(status:string){if(status==="approved"||status==="accepted")return "good" as const;if(status==="review"||status==="pending")return "warn" as const;if(status==="rejected")return "bad" as const;return "neutral" as const;}

export default async function CalculationWorkspace({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string;seed?:string;date?:string}>}){
  const actor=await requireActor();
  const {id}=await params;const query=await searchParams;const activeTab=safeTab(query.tab);
  const allRows=await listCommercialCalculations(actor);const rows=allRows.filter(row=>row.calculationId===id);
  const storedMeta=actor.demo?null:await getCalculationWorkspaceMeta(actor,id);
  const first=rows[0];
  const derivedMeta:CalculationWorkspaceMeta|null=first?{
    id:first.calculationId,organizationId:first.organizationId,sourceType:first.sourceType,sourceId:first.sourceId,source:first.source,requestId:first.requestId,tenderId:first.tenderId,
    version:first.calculationVersion,status:first.calculationStatus,economicsDate:first.economicsDate??new Date().toISOString().slice(0,10),projectCosts:first.projectCosts??[],allocationMode:first.allocationMode==="labor_hours"?"labor_hours":"headcount",supersedesCalculationId:null,
    ownerUserId:first.ownerUserId??null,createdByUserId:first.createdByUserId??actor.userId,teamId:first.teamId??null,regionId:first.regionId??null,clientId:first.clientId??null,createdAt:first.createdAt,
  }:null;
  const meta=storedMeta??derivedMeta;if(!meta)notFound();

  const request=meta.requestId?await getCommercialRequest(actor,meta.requestId):null;
  const tender=!request&&meta.tenderId?await getTender(actor,meta.tenderId):null;
  const source=request??tender;if(!source&&actor.demo===false)notFound();
  const sourceTitle=request?.title??tender?.title??meta.source;const sourceKind=request?"Заявка":tender?"Тендер":"Источник";
  const sourceHref=request?`/requests/${request.id}`:tender?`/tenders/${tender.id}?tab=calculations`:"/calculations";
  const economicsDate=safeDate(query.date)??meta.economicsDate;
  const [models, standards]=await Promise.all([getCalculationModels(actor,economicsDate),getCalculationStandards(actor,economicsDate)]);
  const baseRoles=request
    ? request.roles.map(role=>({id:role.id,specialtyId:role.specialtyId,specialty:role.specialty,count:role.count,schedule:role.schedule,targetClientRate:role.targetClientRate}))
    : tender
      ? tender.roles.map(role=>({id:role.id,specialtyId:role.specialtyId,specialty:role.title,count:role.count??1,schedule:role.schedule,targetClientRate:role.targetClientRate}))
      : [];
  const rateReferences=hasCapability(actor.access,"calculation.rate_reference.read")
    ? await getRateReferencesForRoles(actor,baseRoles,request?.regionId??tender?.regionId??meta.regionId,economicsDate)
    : {};
  const roles=baseRoles.map(role=>({...role,reference:rateReferences[role.id]??null}));
  const projectWorkers=roles.reduce((sum,role)=>sum+Number(role.count||0),0);
  const vatMode=request?.vatMode??(typeof tender?.conditions?.vatMode==="string"?tender.conditions.vatMode:null);
  const schedule=request?.schedule??{};
  const canCreate=hasCapability(actor.access,"calculation.scenario.create")&&!actor.demo;
  const canEdit=hasCapability(actor.access,"calculation.scenario.edit")&&!actor.demo;
  const canReadApprovals=hasCapability(actor.access,"approval.read");
  const seed=query.seed&&!actor.demo?await getCalculationScenarioSeed(actor,query.seed):null;
  const validSeed=seed?.calculationId===meta.id?seed:null;
  const scenarioIds=new Set(rows.map(row=>row.id));
  const approvals=canReadApprovals?(await listApprovals(actor)).filter(item=>item.subjectType==="calculation_scenario"&&scenarioIds.has(item.subjectId)):[];
  const roleStats=roles.map(role=>{
    const roleRows=rows.filter(row=>row.sourceRoleId===role.id).sort((a,b)=>b.scenarioVersion-a.scenarioVersion);const accepted=roleRows.find(row=>row.status==="accepted");const latest=roleRows[0];return {role,rows:roleRows,accepted,latest};
  });
  const acceptedRoles=roleStats.filter(item=>item.accepted).length;
  const warningCount=rows.reduce((sum,row)=>sum+row.warnings.length,0);
  const contribution=roleStats.reduce((sum,item)=>sum+Number(item.accepted?.monthlyContribution??0),0);
  const avgMargin=roleStats.filter(item=>item.accepted).length?roleStats.reduce((sum,item)=>sum+Number(item.accepted?.marginPct??0),0)/roleStats.filter(item=>item.accepted).length:null;
  const immutable=["approved","superseded"].includes(meta.status);

  return <>
    <PageHeader
      eyebrow="Коммерция → Экономика"
      title={`Расчёт v${meta.version} · ${sourceTitle}`}
      subtitle="Единая рабочая область экономики по всем позициям. Сценарии и согласованные версии сохраняются исторически и не перезаписываются."
      breadcrumbs={[{label:"Коммерция"},{label:"Экономика"},{label:"Расчёты",href:"/calculations"},{label:`v${meta.version} · ${sourceTitle}`} ]}
      actions={<><Link className="button" href={sourceHref}>Открыть {sourceKind.toLowerCase()}</Link>{hasCapability(actor.access,"calculation.scenario.create")&&<CalculationVersionButton calculationId={meta.id} disabled={actor.demo}/>}</>}
    />

    <div className="summary-strip calculation-summary-strip">
      <span>Версия <strong>v{meta.version}</strong></span><span>Статус <Status tone={statusTone(meta.status)}>{meta.status}</Status></span><span>Дата экономики <strong>{dateLabel(economicsDate)}</strong></span><span>Позиции <strong>{roles.length}</strong></span><span>Принято <strong>{acceptedRoles}/{roles.length}</strong></span><span>Сигналы <strong>{warningCount}</strong></span>{contribution!==0&&<span>Вклад / мес. <strong>{rub(contribution)}</strong></span>}
    </div>

    <EntityTabs active={tabs.find(item=>item.key===activeTab)?.label??"Обзор"} items={tabs.map(item=>({label:item.label,href:`/calculations/${meta.id}?tab=${item.key}`}))}/>

    {activeTab==="overview"&&<>
      <div className="calculation-overview-grid">
        <Section title="Позиции и готовность" note="Для КП по каждой позиции должен быть принят актуальный сценарий.">
          <div className="request-table-wrap"><table className="data-table calculation-role-table"><thead><tr><th>Позиция</th><th>Сценарии</th><th>Принятый сценарий</th><th>Ставка</th><th>Маржа</th><th>Состояние</th></tr></thead><tbody>{roleStats.map(item=><tr key={item.role.id}><td><strong>{item.role.specialty}</strong><span className="cell-sub">{item.role.count} чел.</span></td><td className="num">{item.rows.length}</td><td>{item.accepted?`${item.accepted.name} · v${item.accepted.scenarioVersion}`:"—"}</td><td className="num">{item.accepted?rub(item.accepted.clientRate):"—"}</td><td className="num">{item.accepted?pct(item.accepted.marginPct):"—"}</td><td>{item.accepted?<Status tone="good">accepted</Status>:item.latest?<Status tone={statusTone(item.latest.status)}>{item.latest.status}</Status>:<Status>Не рассчитано</Status>}</td></tr>)}</tbody></table></div>
        </Section>
        <Section title="Контекст экономики" note="Правила подбираются на выбранную дату. Изменение даты не переписывает старые snapshots.">
          <div className="calculation-context-panel">
            <form method="get" action={`/calculations/${meta.id}`} className="calculation-date-form"><input type="hidden" name="tab" value="overview"/><label>Дата экономики<input type="date" name="date" defaultValue={economicsDate}/></label><button className="button" type="submit">Применить дату</button></form>
            <div className="calculation-context-facts"><span>Источник<strong>{sourceKind}</strong></span><span>Распределение общих расходов<strong>{meta.allocationMode==="labor_hours"?"По трудочасам":"По численности"}</strong></span><span>Принятая маржа<strong>{avgMargin==null?"—":pct(avgMargin)}</strong></span><span>Общепроектных статей<strong>{meta.projectCosts.length}</strong></span></div>
          </div>
        </Section>
      </div>

      {!immutable&&canCreate&&roles.length>0&&<><div className="calculation-workspace-gap"/><Section title={validSeed?`Новая версия сценария · ${validSeed.name}`:"Новый сценарий"} note={validSeed?"Параметры взяты из сохранённого сценария. После сохранения появится новая историческая версия.":"Позиция, график, нормативы и рыночный ориентир подставляются из связанных данных. Значения можно скорректировать перед сохранением."}><div className="calculation-editor-wrap"><CalculatorWorkspaceOperis context={{calculationId:meta.id,sourceType:meta.sourceType,sourceId:meta.sourceId,sourceLabel:sourceTitle,roles,models,vatMode,schedule,projectWorkers,economicsDate,allocationMode:meta.allocationMode,projectCosts:meta.projectCosts,expenseStandards:standards.expenses,scheduleStandards:standards.schedules}} seed={validSeed}/></div></Section></>}
      {immutable&&<div className="calculation-lock-note"><strong>Эта версия расчёта зафиксирована.</strong><span>Для переговоров или пересчёта создайте новую версию. Принятые сценарии останутся в истории без изменений.</span></div>}
    </>}

    {activeTab==="scenarios"&&<Section title="Сценарии" note="Все сценарии этой версии расчёта. Черновик можно отправить на согласование или использовать как основу для следующей версии сценария."><div className="calculation-section-body"><CalculationsRegistryWorkspace rows={rows} canEdit={canEdit} compact defaultView="scenarios"/></div></Section>}

    {activeTab==="compare"&&<Section title="Сравнение сценариев" note="Выберите от двух до четырёх сценариев. Система показывает экономику и отклонения, но не назначает «лучший» вариант только по максимальной марже."><div className="calculation-section-body"><CalculationsRegistryWorkspace rows={rows} canEdit={false} compact defaultView="scenarios"/></div></Section>}

    {activeTab==="approval"&&<Section title="Согласование" note="Решения относятся к конкретным сценариям и сохраняются отдельно от комментариев и бизнес-статусов.">{canReadApprovals?<div className="request-table-wrap"><table className="data-table"><thead><tr><th>Сценарий</th><th>Статус</th><th>Инициатор</th><th>Согласующий</th><th>Отправлено</th><th>Комментарий решения</th></tr></thead><tbody>{approvals.length?approvals.map(item=>{const scenario=rows.find(row=>row.id===item.subjectId);return <tr key={item.id}><td><strong>{scenario?.name??item.subject}</strong><span className="cell-sub">{scenario?`${scenario.role} · v${scenario.scenarioVersion}`:""}</span></td><td><Status tone={statusTone(item.status)}>{item.status}</Status></td><td>{item.requestedBy}</td><td>{item.approver??"—"}</td><td>{item.requestedAt}</td><td>{item.decisionComment??"—"}</td></tr>}):<tr><td colSpan={6} className="muted">Согласований по сценариям этой версии пока нет.</td></tr>}</tbody></table></div>:<p className="muted calculation-section-text">У вашей роли нет доступа к реестру согласований. Действия с доступными сценариями остаются в разделе «Сценарии».</p>}</Section>}

    {activeTab==="history"&&<Section title="История версий" note="История строится по неизменяемым snapshots сценариев и связям «предыдущая версия → новая версия»."><div className="request-table-wrap"><table className="data-table calculation-history-table"><thead><tr><th>Позиция</th><th>Сценарий</th><th>Версия</th><th>Модель</th><th>Ставка клиенту</th><th>Маржа</th><th>Статус</th><th>Создан</th></tr></thead><tbody>{[...rows].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(row=><tr key={row.id}><td>{row.role}</td><td><strong>{row.name}</strong><span className="cell-sub">{row.supersedesScenarioId?"Создан из предыдущего сценария":"Исходный сценарий"}</span></td><td>v{row.scenarioVersion}</td><td>{row.model}<span className="cell-sub">Правила {row.ruleVersion?`№${row.ruleVersion}`:"не зафиксированы"}</span></td><td className="num">{rub(row.clientRate)}</td><td className="num">{pct(row.marginPct)}</td><td><Status tone={statusTone(row.status)}>{row.status}</Status></td><td>{new Intl.DateTimeFormat("ru-RU",{dateStyle:"short",timeStyle:"short"}).format(new Date(row.createdAt))}</td></tr>)}</tbody></table></div></Section>}
  </>;
}
