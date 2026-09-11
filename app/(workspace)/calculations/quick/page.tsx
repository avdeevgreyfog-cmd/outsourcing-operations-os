import Link from "next/link";
import { requireActor } from "@/lib/auth/server";
import { getCalculationModels } from "@/lib/commercial/calculation-models";
import { PageHeader, Section } from "@/components/UI";
import { CalculatorWorkspaceOperis } from "@/components/CalculatorWorkspaceOperis";

export default async function QuickCalculationPage(){
  const actor=await requireActor();
  const models=await getCalculationModels(actor);
  return <>
    <PageHeader eyebrow="Коммерция → Экономика" title="Быстрый расчёт" subtitle="Предварительно смоделируйте ставку, структуру себестоимости и прибыль. Для рабочего согласования создайте расчёт из заявки или тендера." breadcrumbs={[{label:"Коммерция"},{label:"Экономика"},{label:"Расчёты",href:"/calculations"},{label:"Быстрый расчёт"}]} actions={<Link className="button" href="/calculations">К реестру расчётов</Link>}/>
    <Section title="Предварительная экономика" note="Используются действующие на сегодня нормативы. Результат можно выгрузить в CSV, но он не меняет коммерческий процесс."><div className="calculation-editor-wrap"><CalculatorWorkspaceOperis models={models}/></div></Section>
  </>;
}
