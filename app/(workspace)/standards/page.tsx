import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getCalculationModels } from "@/lib/commercial/calculation-models";
import { getCalculationStandards } from "@/lib/commercial/calculation-standards";
import { PageHeader } from "@/components/UI";
import { CalculationStandardsWorkspace } from "@/components/CalculationStandardsWorkspace";

export default async function StandardsPage() {
  const actor = await requireActor();
  if (!hasCapability(actor.access, "calculation.rules.read")) notFound();
  const [models, standards] = await Promise.all([getCalculationModels(actor), getCalculationStandards(actor)]);
  return <><PageHeader eyebrow="Коммерция → Экономика" title="Нормативы" subtitle="Настраиваемые модели расчёта, расходы и графики. Каждая новая версия применяется только к новым сценариям." breadcrumbs={[{label:"Коммерция"},{label:"Экономика"},{label:"Нормативы"}]} /><CalculationStandardsWorkspace models={models} expenses={standards.expenses} schedules={standards.schedules} canManage={hasCapability(actor.access,"calculation.rules.manage")} /></>;
}
