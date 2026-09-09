import { requireActor } from "@/lib/auth/server";
import { listCommercialProposals } from "@/lib/commercial/service";
import { PageHeader } from "@/components/UI";
import { ProposalsWorkspace } from "@/components/ProposalsWorkspace";

export default async function Proposals() {
  const actor = await requireActor();
  const rows = await listCommercialProposals(actor);

  return <>
    <PageHeader
      eyebrow="Коммерция"
      title="Коммерческие предложения"
      subtitle="Рабочие версии предложений: подготовка, внутреннее согласование, отправка заказчику, переговоры и решение клиента."
      breadcrumbs={[{ label: "Коммерция" }, { label: "Коммерческие предложения" }]}
    />
    <ProposalsWorkspace rows={rows}/>
  </>;
}
