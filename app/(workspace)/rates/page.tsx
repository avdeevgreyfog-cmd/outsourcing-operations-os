import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listRateMemory } from "@/lib/commercial/rate-references";
import { PageHeader } from "@/components/UI";
import { RatesWorkspace } from "@/components/RatesWorkspace";

export default async function RatesPage() {
  const actor = await requireActor();
  const rows = await listRateMemory(actor);
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0,10);
  return <>
    <PageHeader
      eyebrow="Коммерция → Экономика"
      title="База ставок"
      subtitle="Коммерческая память компании: выплаты сотрудникам, себестоимость и ставки клиенту по специальностям, регионам и условиям."
      breadcrumbs={[{label:"Коммерция"},{label:"Экономика"},{label:"База ставок"}]}
    />
    <RatesWorkspace initialRows={rows} demo={actor.demo} canManage={hasCapability(actor.access,"calculation.rate_reference.edit")} now={now} today={today}/>
  </>;
}
