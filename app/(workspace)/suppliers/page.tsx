import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { SupplyPartnersWorkspace } from "@/components/SupplyPartnersWorkspace";
import { listSupplyPartners } from "@/lib/operations/supply-control";

export default async function SuppliersPage(){
  const actor=await requireActor();
  const rows=await listSupplyPartners(actor);
  return <>
    <PageHeader eyebrow="Операции → Обеспечение" title="Поставщики и подрядчики" subtitle="Единый справочник организаций, которые предоставляют жильё, транспорт, медицину, спецодежду, оборудование и другие услуги." breadcrumbs={[{label:"Операции"},{label:"Обеспечение"},{label:"Поставщики и подрядчики"}]}/>
    <SupplyPartnersWorkspace rows={rows} canManage={hasCapability(actor.access,"supplier.manage")} demo={actor.demo}/>
  </>;
}
