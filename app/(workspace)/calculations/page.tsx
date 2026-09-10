import Link from "next/link";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listCommercialCalculations } from "@/lib/commercial/calculation-list";
import { getCalculationModels } from "@/lib/commercial/calculation-models";
import { getRateReferencesForRoles } from "@/lib/commercial/calculation-workspace";
import { getCommercialRequest } from "@/lib/commercial/service";
import { getTender } from "@/lib/tenders/service";
import { PageHeader, Section } from "@/components/UI";
import { CalculationsRegistryWorkspace } from "@/components/CalculationsRegistryWorkspace";
import { CalculatorWorkspaceOperis } from "@/components/CalculatorWorkspaceOperis";

export default async function Calculations({searchParams}:{searchParams:Promise<{request?:string;tender?:string}>}) {
  const actor = await requireActor();
  const query = await searchParams;
  if (actor.demo && query.tender && !actor.access.capabilities.includes("sales.tender.read")) actor.access.capabilities.push("sales.tender.read");

  const rows = await listCommercialCalculations(actor);
  const requestedSourceType=query.request?"request":query.tender?"tender":null;
  const requestedSourceId=query.request??query.tender??null;
  if(requestedSourceType&&requestedSourceId){
    const existing=rows.filter(row=>row.sourceType===requestedSourceType&&row.sourceId===requestedSourceId).sort((a,b)=>b.calculationVersion-a.calculationVersion)[0];
    if(existing)redirect(`/calculations/${existing.calculationId}`);
  }

  const request = query.request ? await getCommercialRequest(actor, query.request) : null;
  const tender = !request && query.tender ? await getTender(actor, query.tender) : null;
  const source = request ?? tender;
  const sourceKind = request ? "Заявка" : tender ? "Тендер" : null;
  const sourceTitle = request?.title ?? tender?.title ?? null;
  const backHref = request ? `/requests/${request.id}` : tender ? `/tenders/${tender.id}?tab=calculations` : null;
  const vatMode = request?.vatMode ?? (typeof tender?.conditions?.vatMode === "string" ? tender.conditions.vatMode : null);
  const schedule = request?.schedule ?? {};
  const baseRoles = request
    ? request.roles.map((role) => ({id:role.id,specialtyId:role.specialtyId,specialty:role.specialty,count:role.count,schedule:role.schedule,targetClientRate:role.targetClientRate}))
    : tender
      ? tender.roles.map((role) => ({id:role.id,specialtyId:role.specialtyId,specialty:role.title,count:role.count ?? 1,schedule:role.schedule,targetClientRate:role.targetClientRate}))
      : [];
  const projectWorkers = baseRoles.reduce((sum, role) => sum + Number(role.count || 0), 0);
  const canCreate = hasCapability(actor.access, "calculation.scenario.create");
  const canEdit = hasCapability(actor.access, "calculation.scenario.edit");

  if (!source) {
    return <>
      <PageHeader
        eyebrow="Коммерция → Экономика"
        title="Расчёты экономики"
        subtitle="Рабочий реестр версий расчётов по заявкам и тендерам: себестоимость, клиентская ставка, маржа, согласование и история пересчётов."
        breadcrumbs={[{label:"Коммерция"},{label:"Экономика"},{label:"Расчёты"}]}
      />
      <CalculationsRegistryWorkspace rows={rows} canEdit={canEdit}/>
    </>;
  }

  const economicsDate=request?.startDate??new Date().toISOString().slice(0,10);
  const models=await getCalculationModels(actor,economicsDate);
  const rateReferences=hasCapability(actor.access,"calculation.rate_reference.read")
    ? await getRateReferencesForRoles(actor,baseRoles,request?.regionId??tender?.regionId??null,economicsDate)
    : {};
  const roles=baseRoles.map(role=>({...role,reference:rateReferences[role.id]??null}));

  return <>
    <PageHeader
      eyebrow="Коммерция → Экономика"
      title={`Новый расчёт · ${sourceTitle}`}
      subtitle="Создайте первый сценарий. После сохранения система откроет постоянную рабочую область расчёта и будет вести версии без перезаписи истории."
      breadcrumbs={[{label:"Коммерция"},{label:"Экономика"},{label:"Расчёты",href:"/calculations"},{label:sourceTitle ?? "Источник"}]}
      actions={backHref ? <Link className="button" href={backHref}>Вернуться к {request ? "заявке" : "тендеру"}</Link> : undefined}
    />

    <div className="summary-strip">
      <span>Источник <strong>{sourceKind}</strong></span><span>Позиции <strong>{roles.length}</strong></span><span>Численность <strong>{projectWorkers} чел.</strong></span><span>Дата экономики <strong>{new Intl.DateTimeFormat("ru-RU").format(new Date(`${economicsDate}T00:00:00`))}</strong></span>
    </div>

    {canCreate && roles.length > 0 && <Section title="Первый сценарий" note={`${sourceKind}: ${sourceTitle}. Параметры позиции и графика подставлены из источника; нормативы выбраны на дату экономики.`}>
      <div className="calculation-editor-wrap"><CalculatorWorkspaceOperis context={{sourceType:request?"request":"tender",sourceId:source.id,sourceLabel:sourceTitle??undefined,roles,models,vatMode,schedule,projectWorkers,economicsDate,allocationMode:"headcount",projectCosts:[]}}/></div>
    </Section>}

    {tender && roles.length === 0 && <Section title="Сначала добавьте позиции"><p className="muted calculation-section-text">Чтобы сохранить расчёт по тендеру, укажите хотя бы одну специальность или работу во вкладке «Анализ».</p></Section>}
  </>;
}
