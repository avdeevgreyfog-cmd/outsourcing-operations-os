import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { SupplyAssetsWorkspace } from "@/components/SupplyAssetsWorkspace";
import { getInventorySnapshot, getOperationsReferenceData, getWorkerOffboardingContext, listGlobalPpeTemplates } from "@/lib/operations/service";
import { isGithubPagesDemo } from "@/lib/demo/pages";

export default async function Assets({searchParams}:{searchParams:Promise<{worker?:string;action?:"issue"|"return";object?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const [snapshot,options,workerContext,templates]=await Promise.all([getInventorySnapshot(actor),getOperationsReferenceData(actor,"assets.read"),params.worker?getWorkerOffboardingContext(actor,params.worker):Promise.resolve(null),listGlobalPpeTemplates(actor)]);
  const initialHolding=params.action==="return"?workerContext?.outstandingAssets[0]:null;
  return <>
    <PageHeader eyebrow="Операции → Обеспечение" title="Запасы и имущество" subtitle="Распределённые места хранения, выдача сотрудникам, перемещения, возвраты и списания." breadcrumbs={[{label:"Операции"},{label:"Обеспечение"},{label:"Запасы и имущество"}]}/>
    <SupplyAssetsWorkspace snapshot={snapshot} options={options} templates={templates} canManage={hasCapability(actor.access,"assets.manage")} demo={actor.demo} initialWorkerId={params.worker??null} initialAction={params.action??null} initialItemId={initialHolding?.itemId??null} initialVariant={initialHolding?.variant??null} initialObjectId={params.object??null}/>
  </>;
}
