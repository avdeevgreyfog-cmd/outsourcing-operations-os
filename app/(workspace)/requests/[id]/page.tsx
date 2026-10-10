import {RequestEntityWorkspace} from "@/components/RequestEntityWorkspace";
import {isGithubPagesDemo} from "@/lib/demo/pages";
import {notFound} from "next/navigation";
import {requireActor} from "@/lib/auth/server";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {getCommercialRequest,listRequestProposals} from "@/lib/commercial/service";
import {listCommercialCalculations} from "@/lib/commercial/calculation-list";
import {getRequestCalculationCoverage} from "@/lib/commercial/calculations";
import {getRequestExternalState,getRequestIntake} from "@/lib/commercial/request-intake-server";
import {normalizeRequestIntake} from "@/lib/commercial/request-intake";
import {getRequestWorkflowMeta,getRequestWorkspaceOptions,listRequestBoard,listRequestStages} from "@/lib/commercial/request-workflow-server";

export default async function RequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const staticDemo = isGithubPagesDemo();
  const { tab: rawTab } = staticDemo ? {} : await searchParams;
  const requestedTab = rawTab && ["overview","positions","calculations","proposals","approval","history"].includes(rawTab) ? rawTab : "overview";
  const actor = await requireActor();
  const editCapability = hasCapability(actor.access, "sales.request.edit");

  const request=await getCommercialRequest(actor,id);
  if(!request&&!actor.demo)notFound();
  const canEdit=Boolean(editCapability&&(!request||canReadRow(actor.access,"sales.request.edit",request,actor)));
  const tab=requestedTab==="approval"&&!canEdit?"overview":requestedTab;
  const [intake, calculations, coverage, proposals, external, workflow, stages, workspaceOptions, board] = await Promise.all([
    request?getRequestIntake(actor, id):Promise.resolve(normalizeRequestIntake({})),
    hasCapability(actor.access, "calculation.scenario.read")
      ? listCommercialCalculations(actor).then((items) => items.filter((item) => item.requestId === id))
      : Promise.resolve([]),
    hasCapability(actor.access, "calculation.scenario.read") ? getRequestCalculationCoverage(actor, id) : Promise.resolve([]),
    hasCapability(actor.access, "sales.proposal.read") || hasCapability(actor.access, "sales.request.read")
      ? listRequestProposals(actor, id)
      : Promise.resolve([]),
    canEdit && request ? getRequestExternalState(actor, id) : Promise.resolve({ links: [], submissions: [] }),
    request?getRequestWorkflowMeta(actor, id):Promise.resolve({owner:null,observers:[],timeline:[]}),
    listRequestStages(actor),
    getRequestWorkspaceOptions(actor),
    listRequestBoard(actor),
  ]);


  const boardRow = board.find((item) => item.id === id);
  return <RequestEntityWorkspace id={id} tab={tab} staticDemo={staticDemo} demo={actor.demo} canEdit={canEdit} canCreateCalculation={hasCapability(actor.access,"calculation.scenario.create")} canCreateProposal={hasCapability(actor.access,"sales.proposal.create")} seed={request} seedIntake={intake} calculations={calculations} coverage={coverage} proposals={proposals} external={external} seedWorkflow={workflow} stages={stages} workspaceOptions={workspaceOptions} seedBoard={boardRow}/>;
}
