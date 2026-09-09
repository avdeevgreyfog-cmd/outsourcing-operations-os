import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getCommercialProposalDetail } from "@/lib/commercial/proposal-document";
import { listProposalTemplates } from "@/lib/commercial/proposal-template";
import { ProposalDocumentEditor } from "@/components/ProposalDocumentEditor";
import { ProposalDocumentView } from "@/components/ProposalDocumentView";
import { ProposalOverview } from "@/components/ProposalOverview";
import { ProposalApprovalView, ProposalHistoryView } from "@/components/ProposalLifecycle";
import { EntityTabs, PageHeader } from "@/components/UI";

const tabLabels: Record<string, string> = {overview:"Обзор",document:"Документ",approval:"Согласование",history:"История"};

export default async function ProposalPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{tab?:string}>}){
  const {id}=await params;const {tab:rawTab}=await searchParams;const tab=rawTab&&tabLabels[rawTab]?rawTab:"overview";
  const actor=await requireActor();const proposal=await getCommercialProposalDetail(actor,id);if(!proposal)notFound();
  const canEdit=proposal.status==="draft"&&hasCapability(actor.access,"sales.proposal.edit");
  const canSubmit=hasCapability(actor.access,"sales.proposal.submit");const canClientDecision=hasCapability(actor.access,"sales.proposal.client_decision");const canLaunch=hasCapability(actor.access,"sales.proposal.launch");
  const templates=canEdit?await listProposalTemplates(actor):[];
  const templateOptions=templates.map(({id,name,kind,version,config})=>({id,name,kind,version,config}));
  const tabs=Object.entries(tabLabels).map(([key,label])=>({label,href:`/proposals/${proposal.id}?tab=${key}`}));
  const actions=<><Link className="button" href={`/requests/${proposal.requestId}`}>Открыть заявку</Link>{canEdit&&<ProposalDocumentEditor proposalId={proposal.id} content={proposal.content} templates={templateOptions}/>}<Link className="button primary" href={`/proposals/${proposal.id}/print`} target="_blank">PDF / печать</Link></>;
  return <><PageHeader eyebrow="Коммерческое предложение" title={`КП №${proposal.version} · ${proposal.request}`} subtitle={`${proposal.client} · клиентская версия на основе согласованных расчётов`} breadcrumbs={[{label:"Коммерция"},{label:"Коммерческие предложения",href:"/proposals"},{label:`КП №${proposal.version}`}]} actions={actions}/><EntityTabs items={tabs} active={tabLabels[tab]}/>{tab==="overview"&&<ProposalOverview proposal={proposal}/>} {tab==="document"&&<ProposalDocumentView proposal={proposal} canEdit={canEdit} templates={templateOptions}/>} {tab==="approval"&&<ProposalApprovalView proposal={proposal} canSubmit={canSubmit} canClientDecision={canClientDecision} canLaunch={canLaunch}/>} {tab==="history"&&<ProposalHistoryView proposal={proposal}/>}</>;
}
