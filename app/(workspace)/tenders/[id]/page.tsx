import {TenderEntityWorkspace} from "@/components/TenderEntityWorkspace";
import {isGithubPagesDemo} from "@/lib/demo/pages";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth/server";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {getTender,getTenderOptions,getTenderSnapshotTime} from "@/lib/tenders/service";
import {listTenderActivity} from "@/lib/tenders/activity";


export default async function TenderPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string;edit?:string}>}){
  const staticDemo=isGithubPagesDemo();
  const {id}=await params;const query=staticDemo?{}:await searchParams;const actor=await requireActor();
  if(actor.demo&&!actor.access.capabilities.includes("sales.tender.read"))actor.access.capabilities.push("sales.tender.read");
  const tender=await getTender(actor,id);if(!tender&&!actor.demo)notFound();
  const active=query.tab??"overview";
  const canEdit=Boolean(tender)&&!actor.demo&&canReadRow(actor.access,"sales.tender.edit",tender!,actor);const canResult=canEdit&&hasCapability(actor.access,"sales.tender.result");const canSubmit=canEdit&&hasCapability(actor.access,"sales.tender.submit");const canLaunch=Boolean(tender)&&!actor.demo&&canReadRow(actor.access,"sales.tender.launch",tender!,actor);const canReadCalculations=hasCapability(actor.access,"calculation.scenario.read");
  const [options,activity]=await Promise.all([getTenderOptions(actor),tender&&(active==="history"||staticDemo)?listTenderActivity(actor,id):Promise.resolve([])]);
  return <TenderEntityWorkspace id={id} staticDemo={staticDemo} demo={actor.demo} scope={`${actor.organizationId}:${actor.membershipId}:${actor.roleCode}`} query={query} seed={tender} options={options} activity={activity} canEdit={canEdit} demoCanEdit={actor.demo&&hasCapability(actor.access,"sales.tender.edit")} canResult={canResult} canSubmit={canSubmit} canLaunch={canLaunch} canReadCalculations={canReadCalculations} canCreateCalculation={hasCapability(actor.access,"calculation.scenario.create")} now={getTenderSnapshotTime()}/>;
}
