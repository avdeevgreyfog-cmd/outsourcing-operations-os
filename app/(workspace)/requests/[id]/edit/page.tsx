import { notFound, redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getCommercialOptions, getCommercialRequest } from "@/lib/commercial/service";
import { getRequestIntake } from "@/lib/commercial/request-intake-server";
import { RequestEditWorkspace } from "@/components/CommercialRequestForms";
import { PageHeader } from "@/components/UI";

export default async function EditRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor();
  if (!hasCapability(actor.access, "sales.request.edit")) redirect(`/requests/${id}`);
  const [request, options] = await Promise.all([getCommercialRequest(actor, id), getCommercialOptions(actor)]);
  if (!request) notFound();
  const intake = await getRequestIntake(actor, id);
  return <>
    <PageHeader
      eyebrow="Коммерция → Заявки"
      title={`Редактирование · ${request.title}`}
      subtitle="Общие условия задаются один раз, а исключения можно уточнить внутри конкретной позиции."
      breadcrumbs={[{ label: "Коммерция" }, { label: "Заявки", href: "/requests" }, { label: request.title, href: `/requests/${id}` }, { label: "Редактирование" }]}
    />
    <RequestEditWorkspace request={request} options={options} intake={intake} canArchive={hasCapability(actor.access, "sales.request.archive")} />
  </>;
}
