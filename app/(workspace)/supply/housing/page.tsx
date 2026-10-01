import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { HousingWorkspace } from "@/components/HousingWorkspace";
import { getHousingSnapshot, getOperationsReferenceData } from "@/lib/operations/service";
import { listHousingContracts, listSupplyPartners } from "@/lib/operations/supply-control";
import { isGithubPagesDemo } from "@/lib/demo/pages";

export default async function Housing({searchParams}:{searchParams:Promise<{worker?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const [snapshot,options,contracts,partners]=await Promise.all([getHousingSnapshot(actor),getOperationsReferenceData(actor,"supply.housing.read"),listHousingContracts(actor),hasCapability(actor.access,"supplier.read")?listSupplyPartners(actor):Promise.resolve([])]);
  return <>
    <PageHeader eyebrow="Операции → Обеспечение" title="Жильё" subtitle="Портфельный контроль жилья: бронирования, занятость, заселения, договоры, сроки и оплаты по всем доступным объектам." breadcrumbs={[{label:"Операции"},{label:"Обеспечение"},{label:"Жильё"}]}/>
    <HousingWorkspace snapshot={snapshot} options={options} contracts={contracts} partners={partners} canManage={hasCapability(actor.access,"supply.housing.manage")} demo={actor.demo} initialWorkerId={params.worker??null}/>
  </>;
}
