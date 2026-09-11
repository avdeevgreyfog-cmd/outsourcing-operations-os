import { requireActor } from "@/lib/auth/server";
import { listContracts } from "@/lib/commercial/contracts";
import { PageHeader } from "@/components/UI";
import { ContractsWorkspace } from "@/components/ContractsWorkspace";

export default async function ContractsPage(){
  const actor=await requireActor();
  const rows=await listContracts(actor);
  return <>
    <PageHeader eyebrow="Коммерция → Заключение сделки" title="Договоры" subtitle="Договорная работа после принятого КП: версии условий, внутреннее согласование, подписание и контроль допуска фактического запуска." breadcrumbs={[{label:"Коммерция"},{label:"Заключение сделки"},{label:"Договоры"}]}/>
    <ContractsWorkspace rows={rows}/>
  </>;
}
