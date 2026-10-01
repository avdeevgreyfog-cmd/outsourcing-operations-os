import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { SupplyRequestsWorkspace } from "@/components/SupplyRequestsWorkspace";
import { getInventorySnapshot, getOperationsReferenceData, listSupplyRequests } from "@/lib/operations/service";
import { listSupplyPartners } from "@/lib/operations/supply-control";
import { isGithubPagesDemo } from "@/lib/demo/pages";

export default async function ProcurementPage({searchParams}:{searchParams:Promise<{item?:string;location?:string;object?:string;quantity?:string;create?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const [rows,options,inventory,partners]=await Promise.all([
    listSupplyRequests(actor),
    getOperationsReferenceData(actor,"procurement.read",{includeWorkers:false}),
    getInventorySnapshot(actor),
    hasCapability(actor.access,"supplier.read")?listSupplyPartners(actor):Promise.resolve([]),
  ]);
  return <>
    <PageHeader eyebrow="Операции → Обеспечение" title="Заявки на обеспечение" subtitle="Портфельная очередь запросов по всем доступным объектам: согласование, исполнение, сроки, суммы и связанные подрядчики." breadcrumbs={[{label:"Операции"},{label:"Обеспечение"},{label:"Заявки на обеспечение"}]}/>
    <SupplyRequestsWorkspace rows={rows} options={options} inventory={inventory} partners={partners} canManage={hasCapability(actor.access,"procurement.manage")} demo={actor.demo} initialItemId={params.item??null} initialLocationId={params.location??null} initialObjectId={params.object??null} initialQuantity={params.quantity??null} openInitially={params.create==="1"}/>
  </>;
}
