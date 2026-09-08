import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getRequestWorkspaceOptions } from "@/lib/commercial/request-workflow-server";
import { RequestIntakeWorkspaceV2 } from "@/components/RequestIntakeWorkspaceV2";
import { PageHeader } from "@/components/UI";

export default async function NewRequestPage() {
  const actor = await requireActor();
  if (!hasCapability(actor.access, "sales.request.create")) redirect("/requests");
  const options = await getRequestWorkspaceOptions(actor);
  return <>
    <PageHeader eyebrow="Коммерция → Заявки" title="Новая заявка" subtitle="Быстрый сбор потребности: заказчик, позиции, график, обеспечение, требования и коммерческие ориентиры." breadcrumbs={[{ label: "Коммерция" }, { label: "Заявки", href: "/requests" }, { label: "Новая заявка" }]}/>
    <RequestIntakeWorkspaceV2 options={options}/>
  </>;
}
