import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listRequestBoard, listRequestStages, getRequestWorkspaceOptions } from "@/lib/commercial/request-workflow-server";
import { RequestsWorkspace } from "@/components/RequestsWorkspace";
import { PageHeader } from "@/components/UI";

export default async function RequestsPage() {
  const actor = await requireActor();
  const [rows,stages,options] = await Promise.all([listRequestBoard(actor),listRequestStages(actor),getRequestWorkspaceOptions(actor)]);
  return <>
    <PageHeader eyebrow="Коммерция" title="Заявки" subtitle="Рабочая воронка от первичной потребности до согласованного коммерческого предложения." breadcrumbs={[{label:"Коммерция"},{label:"Заявки"}]}/>
    <RequestsWorkspace rows={rows} stages={stages} canCreate={hasCapability(actor.access,"sales.request.create")} canConfigure={options.canConfigurePipeline}/>
  </>;
}
