import {ClientEntityWorkspace} from "@/components/ClientEntityWorkspace";
import {isGithubPagesDemo} from "@/lib/demo/pages";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth/server";
import {listClientActivity,getClientEditOptions,listCalculations,listClientContacts,listClients,listFinance,listObjects,listProposals,listRequests} from "@/lib/data/service";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {listTenders} from "@/lib/tenders/service";

export default async function ClientPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){
  const {id}=await params;
  const staticDemo=isGithubPagesDemo();
  const {tab:rawTab}=staticDemo?{}:await searchParams;
  const actor=await requireActor();
  const canReadRequests=hasCapability(actor.access,"sales.request.read");
  const canReadTenders=hasCapability(actor.access,"sales.tender.read");
  const canReadObjects=hasCapability(actor.access,"operations.object.read");
  const canReadCalculations=hasCapability(actor.access,"calculation.scenario.read");
  const canReadFinance=hasCapability(actor.access,"finance.pnl.read");
  const canReadProposals=hasCapability(actor.access,"sales.proposal.read")&&canReadRequests;
  const clients=await listClients(actor);
  const client=clients.find(item=>item.id===id);
  if(!client&&!actor.demo)notFound();
  const canEdit=Boolean(client)&&!actor.demo&&canReadRow(actor.access,"sales.client.edit",client!,actor);
  const clientEditOptions=(canEdit||(actor.demo&&hasCapability(actor.access,"sales.client.edit")))?await getClientEditOptions(actor):null;

  const [requests,objects,calculations,finance,contacts,proposals,tenders,activity]=await Promise.all([
    canReadRequests?listRequests(actor):Promise.resolve([]),
    canReadObjects?listObjects(actor):Promise.resolve([]),
    canReadCalculations?listCalculations(actor):Promise.resolve([]),
    canReadFinance?listFinance(actor):Promise.resolve([]),
    listClientContacts(actor,id),
    canReadProposals?listProposals(actor):Promise.resolve([]),
    canReadTenders?listTenders(actor):Promise.resolve([]),
    listClientActivity(actor,id),
  ]);

  const relatedRequests=requests.filter(item=>item.clientId===id);
  const relatedObjects=objects.filter(item=>item.clientId===id);
  const requestIds=new Set(relatedRequests.map(item=>item.id));
  const objectIds=new Set(relatedObjects.map(item=>item.id));

  return <ClientEntityWorkspace activity={activity} id={id} rawTab={rawTab} staticDemo={staticDemo} demo={actor.demo} scope={`${actor.organizationId}:${actor.userId}:${actor.roleCode}:demo`} demoCanEdit={actor.demo&&(client?canReadRow(actor.access,"sales.client.edit",client,actor):hasCapability(actor.access,"sales.client.edit"))} client={client??null} canEdit={canEdit} clientEditOptions={clientEditOptions} canReadRequests={canReadRequests} canReadTenders={canReadTenders} canReadObjects={canReadObjects} canReadCalculations={canReadCalculations} canReadFinance={canReadFinance} canReadProposals={canReadProposals} requests={relatedRequests} objects={relatedObjects} calculations={calculations.filter(item=>requestIds.has(item.requestId))} finance={finance.filter(item=>objectIds.has(item.objectId))} contacts={contacts} proposals={proposals.filter(item=>requestIds.has(item.requestId))} tenders={tenders.filter(item=>item.clientId===id)}/>;
}
