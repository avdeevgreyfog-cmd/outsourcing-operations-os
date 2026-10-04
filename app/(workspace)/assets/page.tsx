import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { SupplyAssetsWorkspace } from "@/components/SupplyAssetsWorkspace";
import { getInventorySnapshot, getOperationsReferenceData, getWorkerOffboardingContext, listGlobalPpeTemplates } from "@/lib/operations/service";
import { listInventoryMovements, listWorkerAssetHoldings } from "@/lib/operations/supply-control";
import { isGithubPagesDemo } from "@/lib/demo/pages";

export default async function Assets({searchParams}:{searchParams:Promise<{worker?:string;action?:"issue"|"return";object?:string;view?:"stock"|"items"|"locations"|"holdings"|"movements"|"norms"}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const [snapshot,options,workerContext,templates,movements,holdings]=await Promise.all([getInventorySnapshot(actor),getOperationsReferenceData(actor,"assets.read"),params.worker?getWorkerOffboardingContext(actor,params.worker):Promise.resolve(null),listGlobalPpeTemplates(actor),listInventoryMovements(actor),listWorkerAssetHoldings(actor)]);
  const initialHolding=params.action==="return"?workerContext?.outstandingAssets[0]:null;
  return <>
    <PageHeader eyebrow="Операции → Обеспечение" title="Запасы и имущество" subtitle="Портфельный контроль запасов: места хранения, имущество на сотрудниках, движения и нормы выдачи по всем доступным объектам." breadcrumbs={[{label:"Операции"},{label:"Обеспечение"},{label:"Запасы и имущество"}]}/>
    <SupplyAssetsWorkspace snapshot={snapshot} options={options} templates={templates} movements={movements} holdings={holdings} canManage={hasCapability(actor.access,"assets.manage")} demo={actor.demo} initialWorkerId={params.worker??null} initialAction={params.action??null} initialItemId={initialHolding?.itemId??null} initialVariant={initialHolding?.variant??null} initialObjectId={params.object??null} initialView={["items","locations","holdings","movements","norms"].includes(params.view??"")?params.view as "items"|"locations"|"holdings"|"movements"|"norms":"stock"}/>
  </>;
}
