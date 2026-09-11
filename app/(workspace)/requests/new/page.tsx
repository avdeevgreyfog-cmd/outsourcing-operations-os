import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getRequestWorkspaceOptions } from "@/lib/commercial/request-workflow-server";
import { RequestIntakeFinalShell } from "@/components/RequestIntakeFinalShell";
import { PageHeader } from "@/components/UI";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const actor = await requireActor();
  const query = await searchParams;
  if (!hasCapability(actor.access, "sales.request.create")) redirect("/requests");
  const options = await getRequestWorkspaceOptions(actor);
  return <>
    <PageHeader eyebrow="Коммерция → Заявки" title={query.draft ? "Редактирование заявки" : "Новая заявка"} subtitle="Быстрый сбор потребности: заказчик, позиции, график, обеспечение, требования и коммерческие ориентиры." breadcrumbs={[{ label: "Коммерция" }, { label: "Заявки", href: "/requests" }, { label: query.draft ? "Редактирование" : "Новая заявка" }]}/>
    <RequestIntakeFinalShell options={options} demo={actor.demo} demoRequestId={query.draft}/>
  </>;
}
