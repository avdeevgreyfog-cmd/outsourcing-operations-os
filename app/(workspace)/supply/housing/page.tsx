import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { HousingWorkspace } from "@/components/HousingWorkspace";
import { getHousingSnapshot, getOperationsReferenceData } from "@/lib/operations/service";

export default async function Housing(){
  const actor=await requireActor();
  const [snapshot,options]=await Promise.all([getHousingSnapshot(actor),getOperationsReferenceData(actor)]);
  return <>
    <PageHeader eyebrow="Операции → Обеспечение" title="Жильё" subtitle="Объекты проживания, вместимость, тарифы, заселения и плановые выезды." breadcrumbs={[{label:"Операции"},{label:"Обеспечение"},{label:"Жильё"}]}/>
    <HousingWorkspace snapshot={snapshot} options={options} canManage={hasCapability(actor.access,"supply.housing.manage")} demo={actor.demo}/>
  </>;
}
