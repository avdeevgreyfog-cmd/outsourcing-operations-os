import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getContractDetail } from "@/lib/commercial/contracts";
import { ContractDetailWorkspace } from "@/components/ContractDetailWorkspace";
import { PageHeader } from "@/components/UI";

export default async function ContractPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const actor=await requireActor();const contract=await getContractDetail(actor,id);if(!contract)notFound();
  const actions=<><Link className="button" href={`/requests/${contract.requestId}`}>Открыть заявку</Link>{contract.proposalId&&<Link className="button" href={`/proposals/${contract.proposalId}`}>Открыть КП</Link>}{contract.objectId&&<Link className="button primary" href={`/objects/${contract.objectId}`}>Открыть объект</Link>}</>;
  return <>
    <PageHeader eyebrow="Договор" title={contract.number||contract.title} subtitle={`${contract.client} · ${contract.request}`} breadcrumbs={[{label:"Коммерция"},{label:"Договоры",href:"/contracts"},{label:contract.number||`v${contract.version}`}]} actions={actions}/>
    <ContractDetailWorkspace contract={contract} canEdit={hasCapability(actor.access,"contract.edit")} canSubmit={hasCapability(actor.access,"contract.submit")} canSign={hasCapability(actor.access,"contract.sign")} canException={hasCapability(actor.access,"contract.launch_exception")}/>
  </>;
}
