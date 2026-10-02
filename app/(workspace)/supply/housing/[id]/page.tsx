import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getOperationsReferenceData } from "@/lib/operations/service";
import { getHousingControlSnapshot } from "@/lib/operations/housing-control";
import { listHousingContracts, listSupplyPartners } from "@/lib/operations/supply-control";
import { HousingSiteWorkspace } from "@/components/HousingSiteWorkspace";

const allowedTabs=["overview","units","residents","contract","payments","documents","history"] as const;
type HousingTab=(typeof allowedTabs)[number];

export default async function HousingSitePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){
  const {id}=await params;
  const {tab:rawTab}=await searchParams;
  const tab=(allowedTabs.includes(rawTab as HousingTab)?rawTab:"overview") as HousingTab;
  const actor=await requireActor();
  const [snapshot,options,contracts,partners]=await Promise.all([
    getHousingControlSnapshot(actor),
    getOperationsReferenceData(actor,"supply.housing.read"),
    listHousingContracts(actor),
    hasCapability(actor.access,"supplier.read")?listSupplyPartners(actor):Promise.resolve([]),
  ]);
  const site=snapshot.sites.find(row=>row.id===id);
  if(!site)notFound();
  return <HousingSiteWorkspace site={site} snapshot={snapshot} options={options} contracts={contracts} partners={partners} tab={tab} canManage={hasCapability(actor.access,"supply.housing.manage")} demo={actor.demo}/>;
}
