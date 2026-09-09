import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listCommercialCalculations } from "@/lib/commercial/calculation-list";
import { getCalculationModels } from "@/lib/commercial/calculation-models";
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
  const request = query.request ? await getCommercialRequest(actor, query.request) : null;
  const tender = !request && query.tender ? await getTender(actor, query.tender) : null;
  const source = request ?? tender;
  const models = source ? await getCalculationModels(actor) : [];
  const filtered = request ? rows.filter((item) => item.requestId === request.id) : tender ? rows.filter((item) => item.tenderId === tender.id) : rows;
  const sourceKind = request ? "Заявка" : tender ? "Тендер" : null;
  const sourceTitle = request?.title ?? tender?.title ?? null;
  const backHref = request ? `/requests/${request.id}` : tender ? `/tenders/${tender.id}?tab=calculations` : null;
  const vatMode = request?.vatMode ?? (typeof tender?.conditions?.vatMode === "string" ? tender.conditions.vatMode : null);
  const schedule = request?.schedule ?? {};
  const roles = request
    ? request.roles.map((role) => ({id:role.id,specialty:role.specialty,count:role.count,schedule:role.schedule,targetClientRate:role.targetClientRate}))
    : tender
      ? tender.roles.map((role) => ({id:role.id,specialty:role.title,count:role.count ?? 1,schedule:role.schedule,targetClientRate:role.targetClientRate}))
      : [];
  const projectWorkers = roles.reduce((sum, role) => sum + Number(role.count || 0), 0);
  const canCreate = hasCapability(actor.access, "calculation.scenario.create");
  const canEdit = hasCapability(actor.access, "calculation.scenario.edit");

  if (!source) {
    return <>
      <PageHeader
        eyebrow="Коммерция → Экономика"
        title="Расчёты экономики"
        subtitle="Рабочий реестр сценариев по заявкам и тендерам: себестоимость, клиентская ставка, маржа, согласование и исторические версии."
        breadcrumbs={[{label:"Коммерция"},{label:"Экономика"},{label:"Расчёты"}]}
      />
      <CalculationsRegistryWorkspace rows={rows} canEdit={canEdit}/>
      <div style={{height:20}}/>
      <Section title="Быстрый расчёт" subtitle="Моделирование без привязки к заявке или тендеру. Такой результат не попадает в коммерческий workflow.">
        <div style={{padding:16}}><CalculatorWorkspaceOperis/></div>
      </Section>
    </>;
  }

  return <>
    <PageHeader
      eyebrow="Коммерция → Экономика"
      title={`Расчёт · ${sourceTitle}`}
      subtitle="Экономика формируется по позициям источника. Сценарии сохраняются как отдельные исторические версии и проходят согласование без перезаписи принятого результата."
      breadcrumbs={[{label:"Коммерция"},{label:"Экономика"},{label:"Расчёты"},{label:sourceTitle ?? "Источник"}]}
      actions={backHref ? <Link className="button" href={backHref}>Вернуться к {request ? "заявке" : "тендеру"}</Link> : undefined}
    />

    <div className="summary-strip">
      <span>Источник <strong>{sourceKind}</strong></span>
      <span>Позиции <strong>{roles.length}</strong></span>
      <span>Численность <strong>{projectWorkers} чел.</strong></span>
      <span>Сценарии <strong>{filtered.length}</strong></span>
      <span>Принято <strong>{filtered.filter((item) => item.status === "accepted").length}</strong></span>
    </div>

    <Section title="Сценарии расчёта" subtitle="Сохранённые версии по всем позициям. Выберите несколько сценариев в представлении «Все сценарии», чтобы сравнить экономику.">
      <div style={{padding:16}}><CalculationsRegistryWorkspace rows={filtered} canEdit={canEdit} compact/></div>
    </Section>

    {canCreate && roles.length > 0 && <>
      <div style={{height:20}}/>
      <Section title="Новый сценарий" subtitle={`${sourceKind}: ${sourceTitle}. Позиция и рабочие параметры подставляются из источника; общепроектные статьи распределяются между позициями по численности.`}>
        <div style={{padding:16}}>
          <CalculatorWorkspaceOperis context={{
            sourceType: request ? "request" : "tender",
            sourceId: source.id,
            sourceLabel: sourceTitle ?? undefined,
            roles,
            models,
            vatMode,
            schedule,
            projectWorkers,
            economicsDate: request?.startDate ?? null,
          }}/>
        </div>
      </Section>
    </>}

    {tender && roles.length === 0 && <><div style={{height:20}}/><Section title="Сначала добавьте позиции"><p className="muted" style={{padding:"0 16px 16px"}}>Чтобы сохранить расчёт по тендеру, укажите хотя бы одну специальность или работу во вкладке «Анализ».</p></Section></>}
  </>;
}
