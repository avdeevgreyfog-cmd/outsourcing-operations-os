import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { SupplyRequestsWorkspace } from "@/components/SupplyRequestsWorkspace";
import { getInventorySnapshot, getOperationsReferenceData, listSupplyRequests } from "@/lib/operations/service";
import { isGithubPagesDemo } from "@/lib/demo/pages";

export default async function ProcurementPage({searchParams}:{searchParams:Promise<{item?:string;location?:string;object?:string;create?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const [rows,options,inventory]=await Promise.all([
    listSupplyRequests(actor),
    getOperationsReferenceData(actor,"procurement.read",{includeWorkers:false}),
    getInventorySnapshot(actor),
  ]);
  return <>
    <PageHeader eyebrow="Операции → Обеспечение" title="Заявки на обеспечение" subtitle="Закупки, оплаты, компенсации и услуги с привязкой к объекту, запасу и сроку потребности." breadcrumbs={[{label:"Операции"},{label:"Обеспечение"},{label:"Заявки на обеспечение"}]}/>
    <SupplyRequestsWorkspace rows={rows} options={options} inventory={inventory} canManage={hasCapability(actor.access,"procurement.manage")} demo={actor.demo} initialItemId={params.item??null} initialLocationId={params.location??null} initialObjectId={params.object??null} openInitially={params.create==="1"}/>
  </>;
}
