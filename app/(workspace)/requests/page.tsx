import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listRequestBoard, listRequestStages, getRequestWorkspaceOptions, getRequestSnapshotTime } from "@/lib/commercial/request-workflow-server";
import { RequestsWorkspaceFinal } from "@/components/RequestsWorkspaceFinal";
import { PageHeader } from "@/components/UI";

export default async function RequestsPage() {
  const actor = await requireActor();
  const [rows,stages,options] = await Promise.all([listRequestBoard(actor),listRequestStages(actor),getRequestWorkspaceOptions(actor)]);
  return <>
    <PageHeader eyebrow="Коммерция" title="Заявки" subtitle="Рабочая воронка от первичной потребности до согласованного коммерческого предложения." breadcrumbs={[{label:"Коммерция"},{label:"Заявки"}]}/>
    <RequestsWorkspaceFinal rows={rows} stages={stages} canCreate={hasCapability(actor.access,"sales.request.create")} canConfigure={options.canConfigurePipeline} canEdit={hasCapability(actor.access,"sales.request.edit")} now={getRequestSnapshotTime()} demo={actor.demo}/>
  </>;
}
