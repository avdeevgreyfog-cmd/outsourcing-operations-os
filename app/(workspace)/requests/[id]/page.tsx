import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getCommercialRequest, listRequestProposals } from "@/lib/commercial/service";
import { listCommercialCalculations } from "@/lib/commercial/calculation-list";
import { getRequestCalculationCoverage } from "@/lib/commercial/calculations";
import { getRequestExternalState, getRequestIntake } from "@/lib/commercial/request-intake-server";
import { calculateRequestCompleteness } from "@/lib/commercial/request-intake";
import { getRequestWorkflowMeta, getRequestWorkspaceOptions, listRequestBoard, listRequestStages } from "@/lib/commercial/request-workflow-server";
import { stageByCode } from "@/lib/commercial/request-workflow";
import { RequestExternalWorkflow } from "@/components/RequestExternalWorkflow";
import { RequestShareHeaderButton } from "@/components/RequestShareHeaderButton";
import { RequestStageSelect } from "@/components/RequestStageSelect";
import { CreateProposalButton } from "@/components/CommercialWorkflowActions";
import { EntityTabs, KeyValue, PageHeader, Section, Status, SummaryStrip } from "@/components/UI";
import { rub, pct } from "@/lib/ui/format";

const tabLabels: Record<string, string> = {
  overview: "Обзор",
  positions: "Позиции",
  calculations: "Расчёты",
  proposals: "КП",
  approval: "Согласование",
  history: "История",
};

const workerCategoryLabels: Record<string, string> = {
  rf: "РФ",
  eaeu: "ЕАЭС",
  foreign_with_docs: "Иностранные граждане с разрешительными документами",
  client_rules: "По требованиям заказчика",
};

const documentCheckLabels: Record<string, string> = {
  security: "Служба безопасности",
  document_check: "Проверка документов",
  qualification: "Проверка квалификации",
  medical: "Медосмотр",
  medbook: "Медицинская книжка",
  labor_safety: "Охрана труда",
  industrial_safety: "Промышленная безопасность",
  certificates: "Удостоверения / допуски",
  pass_docs: "Документы для проходной",
};

const experienceLabels: Record<string, string> = {
  not_required: "не требуется",
  preferred: "желателен",
  required: "обязателен",
};

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  pending: "На согласовании",
  approved: "Согласовано",
  accepted: "Принято",
  rejected: "Отклонено",
  launched: "Запущено",
  active: "Активно",
  sent: "Отправлено",
  agreed: "Согласовано",
  not_agreed: "Не согласовано",
  archived: "Архив",
};

const lossLabels: Record<string, string> = {
  price: "Не устроила цена",
  competitor: "Выбран другой подрядчик",
  cancelled: "Потребность отменена",
  timing: "Не подошли сроки",
  conditions: "Не устроили условия",
  no_response: "Заказчик перестал отвечать",
  staffing: "Не смогли обеспечить персонал",
  other: "Другое",
};

function providerLabel(value: string) {
  if (value === "client") return "Заказчик";
  if (value === "not_required") return "Не требуется";
  if (value === "unknown") return "Не указано";
  return "Мы";
}

function billingLabel(value: string) {
  return ({
    hour: "Человеко-час",
    shift: "Смена",
    worker_month: "Сотрудник / месяц",
    unit: "Единица",
    volume: "За объём",
    fixed: "Фиксированная сумма за проект",
    mixed: "Смешанная схема",
    unknown: "Не определено",
  } as Record<string, string>)[value] ?? "Не определено";
}

function scheduleLabel(value: string) {
  const known = ({ rotation: "Вахта", on_demand: "По заявке", custom: "Другой" } as Record<string, string>)[value];
  return known || value || "Уточняется";
}

function statusLabel(value: string) {
  return statusLabels[value] ?? (/[A-Za-z_]/.test(value) ? "В работе" : value);
}

function lossLabel(value: string | null | undefined) {
  if (!value) return "";
  return lossLabels[value] ?? (/[A-Za-z_]/.test(value) ? "Другая причина" : value);
}

function timelineText(value: string) {
  const replacements: Record<string, string> = {
    new: "Новая",
    clarification: "Уточнение условий",
    ready_calc: "Готова к расчёту",
    calculation: "Расчёт",
    proposal_prep: "Подготовка КП",
    proposal_client: "КП у заказчика",
    negotiation: "Переговоры / доработка",
    agreed: "Согласовано",
    not_agreed: "Не согласовано",
    draft: "Черновик",
    pending: "На согласовании",
    accepted: "Принято",
    rejected: "Отклонено",
    sent: "Отправлено",
    approved: "Согласовано",
  };
  let result = value;
  for (const [code, label] of Object.entries(replacements)) result = result.replaceAll(code, label);
  return result.replace(/\bv(\d+)\b/g, "№$1");
}

function fmtDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtDay(value: string | null | undefined) {
  if (!value) return "Старт уточняется";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}

function tone(status: string) {
  if (["accepted", "agreed", "launched", "approved"].includes(status)) return "good" as const;
  if (["rejected", "not_agreed", "archived"].includes(status)) return "bad" as const;
  return "warn" as const;
}

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const tab = rawTab && tabLabels[rawTab] ? rawTab : "overview";
  const actor = await requireActor();
  const canEdit = hasCapability(actor.access, "sales.request.edit");

  const [request, intake, calculations, coverage, proposals, external, workflow, stages, workspaceOptions, board] = await Promise.all([
    getCommercialRequest(actor, id),
    getRequestIntake(actor, id),
    hasCapability(actor.access, "calculation.scenario.read")
      ? listCommercialCalculations(actor).then((items) => items.filter((item) => item.requestId === id))
      : Promise.resolve([]),
    hasCapability(actor.access, "calculation.scenario.read") ? getRequestCalculationCoverage(actor, id) : Promise.resolve([]),
    hasCapability(actor.access, "sales.proposal.read") || hasCapability(actor.access, "sales.request.read")
      ? listRequestProposals(actor, id)
      : Promise.resolve([]),
    canEdit ? getRequestExternalState(actor, id) : Promise.resolve({ links: [], submissions: [] }),
    getRequestWorkflowMeta(actor, id),
    listRequestStages(actor),
    getRequestWorkspaceOptions(actor),
    listRequestBoard(actor),
  ]);

  if (!request) notFound();

  const boardRow = board.find((item) => item.id === id);
  const stageCode = boardRow?.workflowStageCode ?? "new";
  const stage = stageByCode(stages, stageCode);
  const completeness = calculateRequestCompleteness(request, intake);
  const acceptedRoleIds = new Set(coverage.map((item) => item.requestRoleId));
  const archived = Boolean(request.archivedAt);
  const locked = ["accepted", "launched"].includes(request.status);
  const readyForProposal = !archived && !locked && request.roles.length > 0 && request.roles.every((role) => acceptedRoleIds.has(role.id));
  const total = request.roles.reduce((sum, role) => sum + role.count, 0);
  const yandex = request.location ? `https://yandex.ru/maps/?text=${encodeURIComponent(request.location)}` : "";
  const lastActivity = workflow.timeline.length ? workflow.timeline[workflow.timeline.length - 1] : null;

  const tabs = Object.entries(tabLabels).map(([key, label]) => ({
    label,
    href: `/requests/${id}?tab=${key}`,
    count:
      key === "positions" ? request.roles.length
      : key === "calculations" ? calculations.length
      : key === "proposals" ? proposals.length
      : key === "approval" ? (canEdit ? external.submissions.length : undefined)
      : key === "history" ? workflow.timeline.length
      : undefined,
  }));

  const actions = <>
    {canEdit && !archived && !locked && <Link className="button" href={`/requests/${id}/edit`}>Редактировать</Link>}
    {canEdit && !archived && !locked && <RequestShareHeaderButton requestId={id}/>} 
    {hasCapability(actor.access, "calculation.scenario.create") && !archived && !locked && <Link href={`/calculations?request=${id}`} className="button primary">Открыть расчёт</Link>}
  </>;

  const stagePanel = <Section title="Этап и ответственность">
    <div className="request-entity-side-body">
      {canEdit && !archived
        ? <RequestStageSelect requestId={id} value={stageCode} stages={stages} disabled={locked}/>
        : <Status tone={tone(stageCode)}>{stage.label}</Status>}
      <KeyValue label="Ответственный" value={workflow.owner ?? "Не назначен"}/>
      <KeyValue label="Наблюдатели" value={workflow.observers.length ? workflow.observers.map((item) => item.name).join(", ") : "Нет"}/>
      {boardRow?.lossReason && <KeyValue label="Причина" value={lossLabel(boardRow.lossReason)}/>}
    </div>
  </Section>;

  return <>
    <PageHeader
      eyebrow="Заявка"
      title={request.title}
      subtitle={`${intake.companyName || request.client || "Клиент не привязан"} · ${request.location || intake.object.city || "локация уточняется"}`}
      breadcrumbs={[{ label: "Коммерция" }, { label: "Заявки", href: "/requests" }, { label: request.title }]}
      actions={actions}
    />

    <EntityTabs items={tabs} active={tabLabels[tab]}/>

    {tab === "overview" && <>
      <SummaryStrip>
        <span>Этап <strong>{stage.label}</strong></span>
        <span>Потребность <strong>{total} чел.</strong></span>
        <span>Позиции <strong>{request.roles.length}</strong></span>
        <span>Полнота <strong>{completeness.percent}%</strong></span>
        <span>КП <strong>{boardRow?.proposalVersion ? `№${boardRow.proposalVersion}` : "—"}</strong></span>
        <span>Ответственный <strong>{workflow.owner ?? "не назначен"}</strong></span>
      </SummaryStrip>

      {!completeness.ready && !archived && !locked && <div className="request-warning request-entity-warning">
        <strong>Желательно уточнить до расчёта:</strong> {completeness.missing.join(" · ")}
      </div>}

      <div className="request-entity-overview">
        <div className="request-entity-main">
          <Section title="Ключевые условия">
            <div className="request-entity-facts">
              <article>
                <span>Заказчик</span>
                <strong>{intake.companyName || request.client || "—"}</strong>
                <small>{intake.contact.name || "Контакт не указан"}</small>
                <small>{[intake.contact.phone, intake.contact.email, ...intake.contact.messengers.map((item) => item.value)].filter(Boolean).join(" · ") || "Контакты не указаны"}</small>
              </article>
              <article>
                <span>Объект</span>
                <strong>{intake.object.siteName || intake.object.city || request.location || "—"}</strong>
                <small>{request.region ?? "Регион не определён"}</small>
                {yandex && <a target="_blank" rel="noreferrer" href={yandex}>Открыть на Яндекс Картах</a>}
              </article>
              <article>
                <span>Старт и срок</span>
                <strong>{fmtDay(request.startDate)}</strong>
                <small>{request.durationText || "Срок не указан"}</small>
              </article>
              <article>
                <span>График</span>
                <strong>{intake.schedule.pattern === "custom" ? intake.schedule.customPattern : scheduleLabel(intake.schedule.pattern)}</strong>
                <small>{intake.schedule.paidHours ? `${intake.schedule.paidHours} оплачиваемых часов` : "Оплачиваемые часы не указаны"}</small>
              </article>
              <article>
                <span>Доступность</span>
                <strong>{({ easy: "Удобно", public_walk: "Транспорт + пешком", difficult: "Сложный маршрут", car_only: "Только автомобиль", shuttle: "Нужна развозка", unknown: "Уточняется" } as Record<string, string>)[intake.object.accessType] ?? "Уточняется"}</strong>
                <small>{intake.object.accessComment || "Комментарий не указан"}</small>
              </article>
              <article>
                <span>Коммерческий ориентир</span>
                <strong>{intake.commercial.clientLimit ? `${rub(intake.commercial.clientLimit)} ${intake.commercial.clientLimitVatMode === "with_vat" ? "с НДС" : "без НДС"}` : "Лимит не указан"}</strong>
                <small>{billingLabel(intake.commercial.billingUnit)}</small>
              </article>
            </div>
          </Section>

          <div className="request-entity-overview-grid">
            <Section title="Обеспечение и логистика">
              <div className="request-entity-condition-list">
                {(["housing", "travel", "shuttle", "meals", "workwear", "ppe", "tools", "consumables"] as const).map((key) => <div key={key}>
                  <span>{({ housing: "Проживание", travel: "Билеты / проезд", shuttle: "Развозка", meals: "Питание", workwear: "Спецодежда", ppe: "СИЗ", tools: "Инструмент", consumables: "Расходняк" } as const)[key]}</span>
                  <strong>{providerLabel(intake.provision[key].provider)}</strong>
                  {intake.provision[key].comment && <small>{intake.provision[key].comment}</small>}
                </div>)}
                <div><span>Бригадир</span><strong>{providerLabel(intake.logistics.brigadierProvider)}</strong></div>
              </div>
            </Section>

            <Section title="Требования к работникам">
              <div className="request-entity-condition-list request-entity-condition-list-wide">
                <div>
                  <span>Категории работников</span>
                  <strong>{intake.compliance.workerCategories.length ? intake.compliance.workerCategories.map((value) => workerCategoryLabels[value] ?? "Другая категория").join(" · ") : "Уточняется"}</strong>
                </div>
                <div>
                  <span>Проверки / документы</span>
                  <strong>{intake.compliance.documentChecks.length ? `${intake.compliance.documentChecks.length} требований` : "Не отмечены"}</strong>
                  <small>{intake.compliance.documentChecks.map((value) => documentCheckLabels[value] ?? "Другое требование").join(" · ")}</small>
                </div>
                {intake.compliance.comment && <div><span>Комментарий</span><strong>{intake.compliance.comment}</strong></div>}
              </div>
            </Section>
          </div>
        </div>

        <aside className="request-entity-side">
          {stagePanel}
          <Section title="Коммерческий контур">
            <div className="request-entity-side-body">
              <KeyValue label="Расчёты" value={<Link href={`/requests/${id}?tab=calculations`}>{calculations.length}</Link>}/>
              <KeyValue label="Коммерческие предложения" value={<Link href={`/requests/${id}?tab=proposals`}>{proposals.length}</Link>}/>
              <KeyValue label="Согласование" value={<Link href={`/requests/${id}?tab=approval`}>{canEdit ? external.submissions.length : "Открыть"}</Link>}/>
              <KeyValue label="Последнее изменение" value={lastActivity ? fmtDate(lastActivity.at) : "Нет событий"}/>
            </div>
          </Section>
        </aside>
      </div>
    </>}

    {tab === "positions" && <div className="request-entity-tab-content">
      <Section title="Позиции" note={`${total} человек · ${request.roles.length} позиций`}>
        <div className="request-position-list request-position-list-tab">{request.roles.map((role) => {
          const requirements = role.requirements ?? {};
          const stat = workspaceOptions.specialties.find((item) => item.id === role.specialtyId);
          const experience = experienceLabels[String(requirements.experienceMode ?? "")] ?? "не указан";
          return <article key={role.id}>
            <div className="request-position-main">
              <div><strong>{role.specialty}</strong><span>{role.count} чел. · {Object.keys(role.schedule ?? {}).length ? "свой график" : "общий график"}</span></div>
              <Status tone={acceptedRoleIds.has(role.id) ? "good" : "warn"}>{acceptedRoleIds.has(role.id) ? "расчёт согласован" : "нужен расчёт"}</Status>
            </div>
            <div className="request-position-details">
              <span>Опыт: {experience}{requirements.experienceMin ? ` · ${String(requirements.experienceMin)}` : ""}</span>
              {Boolean(requirements.grade) && <span>Квалификация: {String(requirements.grade)}</span>}
              {Boolean(requirements.certificates) && <span>Допуски: {String(requirements.certificates)}</span>}
              {Boolean(requirements.description) && <span>{String(requirements.description)}</span>}
            </div>
            {stat && stat.stats.sampleCount > 0 && <small className="request-rate-inline">История: {rub(stat.stats.clientRateMin ?? 0)}–{rub(stat.stats.clientRateMax ?? 0)} / ч · {stat.stats.sampleCount} расчётов</small>}
          </article>;
        })}</div>
      </Section>
    </div>}

    {tab === "calculations" && <div className="request-entity-tab-content">
      <Section title="Расчёты" note="Согласованные сценарии не перезаписываются при изменении условий заявки.">
        <div className="stack-list request-entity-stack">{calculations.length ? calculations.map((item) => <div className="stack-item" key={item.id}>
          <div><strong>{item.name}</strong><small>{item.role} · {rub(item.clientRate)} без НДС · маржа {pct(item.marginPct)}</small></div>
          <Status tone={tone(item.status)}>{statusLabel(item.status)}</Status>
        </div>) : <div className="empty-inline">Расчётов пока нет</div>}</div>
        {hasCapability(actor.access, "calculation.scenario.create") && !archived && !locked && <div className="request-entity-section-actions"><Link href={`/calculations?request=${id}`} className="button primary">Создать расчёт</Link></div>}
      </Section>
    </div>}

    {tab === "proposals" && <div className="request-entity-tab-content">
      <Section title="Коммерческие предложения" note={boardRow?.proposalSentCount ? `Отправлено версий: ${boardRow.proposalSentCount}` : "Отправленные версии фиксируются и не перезаписываются."}>
        <div className="stack-list request-entity-stack">{proposals.length ? proposals.map((item) => <Link className="stack-item" href={`/proposals/${item.id}`} key={item.id}>
          <div><strong>КП №{item.version}</strong><small>{item.createdAt} · {item.createdBy}</small></div>
          <Status tone={tone(item.status)}>{statusLabel(item.status)}</Status>
        </Link>) : <div className="empty-inline">Версий КП пока нет</div>}</div>
        {readyForProposal && hasCapability(actor.access, "sales.proposal.create") && <div className="request-entity-section-actions"><CreateProposalButton requestId={id}/></div>}
      </Section>
    </div>}

    {tab === "approval" && <div className="request-entity-tab-content request-entity-approval">
      {canEdit
        ? <Section title="Согласование и уточнения" note="Заказчик видит только внешнюю форму без внутренних ставок, истории расчётов и маржи."><div className="request-entity-external"><RequestExternalWorkflow requestId={id} state={external} canEdit={!archived && !locked}/></div></Section>
        : <Section title="Согласование и уточнения"><div className="empty-inline">У вас нет прав на управление внешним согласованием этой заявки.</div></Section>}
    </div>}

    {tab === "history" && <div className="request-entity-tab-content">
      <Section title="История заявки" note={`${workflow.timeline.length} событий`}>
        <div className="request-timeline request-entity-timeline">{workflow.timeline.length ? workflow.timeline.slice().reverse().map((item) => <article key={item.id}>
          <i/>
          <div><header><strong>{timelineText(item.title)}</strong><span>{fmtDate(item.at)}</span></header><p>{timelineText(item.detail)}</p><small>{item.actor}</small></div>
        </article>) : <div className="empty-inline">История пока пуста</div>}</div>
      </Section>
    </div>}
  </>;
}
