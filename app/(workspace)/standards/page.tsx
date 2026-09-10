import { requireActor } from "@/lib/auth/server";
import { getCalculationModels } from "@/lib/commercial/calculation-models";
import { PageHeader } from "@/components/UI";
import { CalculationStandardsWorkspace } from "@/components/CalculationStandardsWorkspace";

export default async function StandardsPage() {
  const actor = await requireActor();
  const models = await getCalculationModels(actor);
  return <><PageHeader eyebrow="Коммерция → Экономика" title="Нормативы" subtitle="Единый справочник правил, расходов и графиков для воспроизводимых расчётов. Каждая версия привязывается к дате экономики и сохраняется в истории." breadcrumbs={[{label:"Коммерция"},{label:"Экономика"},{label:"Нормативы"}]} /><CalculationStandardsWorkspace models={models} /></>;
}
