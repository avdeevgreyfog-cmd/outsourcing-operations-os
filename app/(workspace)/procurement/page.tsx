import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { SupplyRequestsWorkspace } from "@/components/SupplyRequestsWorkspace";
import { getInternalRequestReferenceData, getInventorySnapshot, getOperationsReferenceData, listSupplyRequests, type InventorySnapshot } from "@/lib/operations/service";
import { listSupplyPartners } from "@/lib/operations/supply-control";
import { isGithubPagesDemo } from "@/lib/demo/pages";

const emptyInventory:InventorySnapshot={locations:[],items:[],variants:[],prices:[],balances:[]};

export default async function ProcurementPage({searchParams}:{searchParams:Promise<{item?:string;location?:string;object?:string;quantity?:string;create?:string}>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const canReadAssets=hasCapability(actor.access,"assets.read");
  const canReadSuppliers=hasCapability(actor.access,"supplier.read");
  const [rows,options,inventory,partners,references]=await Promise.all([
    listSupplyRequests(actor),
    getOperationsReferenceData(actor,"procurement.read",{includeWorkers:false}),
    canReadAssets?getInventorySnapshot(actor):Promise.resolve(emptyInventory),
    canReadSuppliers?listSupplyPartners(actor):Promise.resolve([]),
    getInternalRequestReferenceData(actor),
  ]);
  return <>
    <PageHeader
      eyebrow="Рабочее пространство"
      title="Внутренние заявки"
      subtitle="Единое окно для закупок, услуг, компенсаций и оплат: от потребности и согласования до исполнения и фактического расхода."
      breadcrumbs={[{label:"Главная"},{label:"Рабочее пространство"},{label:"Внутренние заявки"}]}
    />
    <SupplyRequestsWorkspace
      rows={rows}
      options={options}
      inventory={inventory}
      partners={partners}
      references={references}
      canCreate={hasCapability(actor.access,"procurement.create")}
      canManage={hasCapability(actor.access,"procurement.manage")}
      canFinance={hasCapability(actor.access,"procurement.finance")}
      demo={actor.demo}
      initialItemId={params.item??null}
      initialLocationId={params.location??null}
      initialObjectId={params.object??null}
      initialQuantity={params.quantity??null}
      openInitially={params.create==="1"}
    />
  </>;
}
