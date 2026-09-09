import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listCommercialCalculations } from "@/lib/commercial/calculation-list";
import { getCalculationModels } from "@/lib/commercial/calculation-models";
import { getCommercialRequest } from "@/lib/commercial/service";
import { PageHeader, Section, Status } from "@/components/UI";
import { CalculatorWorkspace } from "@/components/CalculatorWorkspace";
import { SubmitApprovalButton } from "@/components/CommercialWorkflowActions";
import { rub, pct } from "@/lib/ui/format";

function tone(status: string) {
  if (status === "accepted") return "good" as const;
  if (status === "rejected") return "bad" as const;
  if (status === "superseded") return "neutral" as const;
  return "warn" as const;
}

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  pending: "На согласовании",
  accepted: "Принято",
  rejected: "Отклонено",
  superseded: "Заменено новой версией",
  approved: "Согласовано",
};

function statusLabel(value: string) {
  return statusLabels[value] ?? (/[A-Za-z_]/.test(value) ? "Другой статус" : value);
}

const billingLabels: Record<string, string> = {
  hour: "час",
  shift: "смена",
  unit: "единица",
  worker_month: "сотрудник / месяц",
  project_month: "проект / месяц",
  project_fixed: "фиксированная сумма за проект",
  mixed: "смешанная",
};

export default async function Calculations({ searchParams }: { searchParams: Promise<{ request?: string }> }) {
  const actor = await requireActor();
  const query = await searchParams;
  const rows = await listCommercialCalculations(actor);
  const request = query.request ? await getCommercialRequest(actor, query.request) : null;
  const models = request ? await getCalculationModels(actor) : [];
  const filtered = request ? rows.filter((item) => item.requestId === request.id) : rows;

  return <>
    <PageHeader
      eyebrow="Коммерция → Экономика"
      title={request ? `Расчёт · ${request.title}` : "Расчёты"}
      subtitle="Сценарии считаются в выбранной модели и по зафиксированной версии правил. Согласованные версии не редактируются задним числом."
      actions={request ? <Link className="button" href={`/requests/${request.id}`}>Вернуться к заявке</Link> : undefined}
    />
    <Section title="Сценарии по заявкам">
      <div className="grid-scroll"><table className="data-table"><thead><tr><th>Заявка / роль</th><th>Модель</th><th>Сотруднику</th><th>Себестоимость / ч</th><th>Клиентская ставка</th><th>Маржа</th><th>Статус</th><th></th></tr></thead><tbody>{filtered.map((x) => <tr key={x.id} id={`scenario-${x.id}`} className="calculation-scenario-row">
        <td><strong className="cell-title">{x.request} · {x.role}</strong><span className="cell-sub">{x.name} · {billingLabels[x.billingUnit] ?? "другая схема"}</span></td>
        <td>{x.model}<span className="cell-sub">{x.ruleVersion ? `Правила №${x.ruleVersion}` : "Без версии правил"}</span></td>
        <td className="num">{rub(x.workerNet)}</td>
        <td className="num">{rub(x.totalCost)}</td>
        <td className="num">{rub(x.clientRate)}<span className="cell-sub">без НДС</span></td>
        <td className="num">{pct(x.marginPct)}</td>
        <td><Status tone={tone(x.status)}>{statusLabel(x.status)}</Status></td>
        <td>{hasCapability(actor.access, "calculation.scenario.edit") && ["draft", "rejected"].includes(x.status) && <SubmitApprovalButton subjectType="calculation_scenario" subjectId={x.id} />}</td>
      </tr>)}</tbody></table></div>
    </Section>

    {request && hasCapability(actor.access, "calculation.scenario.create") && <>
      <div style={{ height: 16 }} />
      <PageHeader eyebrow="Новый сценарий" title="Новый расчёт" subtitle={`Заявка: ${request.title}. Данные по численности, графику и НДС подставляются из заявки; экономика сохраняется отдельной версией.`} />
      <CalculatorWorkspace context={{
        requestId: request.id,
        roles: request.roles.map((role) => ({ id: role.id, specialty: role.specialty, count: role.count, schedule: role.schedule, targetClientRate: role.targetClientRate })),
        models,
        vatMode: request.vatMode,
        schedule: request.schedule,
      }} />
    </>}

    {!request && <>
      <div style={{ height: 16 }} />
      <PageHeader eyebrow="Режим моделирования" title="Быстрый расчёт" subtitle="Этот режим предназначен для моделирования. Для сохранения сценария в коммерческий цикл откройте расчёт из заявки." />
      <CalculatorWorkspace />
    </>}
  </>;
}
