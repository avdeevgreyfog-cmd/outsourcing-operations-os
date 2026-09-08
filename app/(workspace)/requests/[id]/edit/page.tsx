import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getCommercialRequest } from "@/lib/commercial/service";
import { getRequestIntake } from "@/lib/commercial/request-intake-server";
import { getRequestWorkflowMeta, getRequestWorkspaceOptions } from "@/lib/commercial/request-workflow-server";
import { RequestIntakeWorkspacePolished } from "@/components/RequestIntakeWorkspacePolished";
import { PageHeader } from "@/components/UI";

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  if (!hasCapability(actor.access, "sales.request.edit")) redirect(`/requests/${id}`);
  const [request,options,intake,workflowMeta] = await Promise.all([
    getCommercialRequest(actor,id), getRequestWorkspaceOptions(actor), getRequestIntake(actor,id), getRequestWorkflowMeta(actor,id),
  ]);
  if (!request) notFound();
  return <>
    <PageHeader eyebrow="Коммерция → Заявки" title={`Редактирование · ${request.title}`} subtitle="Общие условия задаются один раз; исключения и требования уточняются внутри конкретных позиций." breadcrumbs={[{ label:"Коммерция"},{label:"Заявки",href:"/requests"},{label:request.title,href:`/requests/${id}`},{label:"Редактирование"}]}/>
    <RequestIntakeWorkspacePolished request={request} options={options} intake={intake} workflowMeta={workflowMeta}/>
  </>;
}
