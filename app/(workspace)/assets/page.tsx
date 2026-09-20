import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { InventoryWorkspace } from "@/components/InventoryWorkspace";
import { getInventorySnapshot, getOperationsReferenceData } from "@/lib/operations/service";

export default async function Assets({searchParams}:{searchParams:Promise<{worker?:string}>}){
  const actor=await requireActor();
  const params=await searchParams;
  const [snapshot,options]=await Promise.all([getInventorySnapshot(actor),getOperationsReferenceData(actor)]);
  return <>
    <PageHeader eyebrow="Операции → Обеспечение" title="Запасы и имущество" subtitle="Распределённые места хранения, выдача сотрудникам, перемещения, возвраты и списания." breadcrumbs={[{label:"Операции"},{label:"Обеспечение"},{label:"Запасы и имущество"}]}/>
    <InventoryWorkspace snapshot={snapshot} options={options} canManage={hasCapability(actor.access,"assets.manage")} demo={actor.demo} initialWorkerId={params.worker??null}/>
  </>;
}
