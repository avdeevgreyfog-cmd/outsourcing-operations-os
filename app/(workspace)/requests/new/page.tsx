import { isGithubPagesDemo } from "@/lib/demo/pages";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getRequestWorkspaceOptions } from "@/lib/commercial/request-workflow-server";
import { getRateMemorySpecialtyStats, mergeRateStats } from "@/lib/commercial/rate-references";
import { RequestIntakeFinalShell } from "@/components/RequestIntakeFinalShell";
import { getCommercialRequest } from "@/lib/commercial/service";
import { PageHeader } from "@/components/UI";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<{ draft?: string; preview?: string }> }) {
  const actor = await requireActor();
  const query = isGithubPagesDemo() ? {} : await searchParams;
  if(query.preview&&actor.demo)redirect(`/requests/${encodeURIComponent(query.preview)}`);
  if(query.draft){
    if(!hasCapability(actor.access,"sales.request.edit"))redirect("/requests");
    if(!actor.demo||await getCommercialRequest(actor,query.draft))redirect(`/requests/${encodeURIComponent(query.draft)}/edit`);
  }
  if (!query.draft && !hasCapability(actor.access, "sales.request.create")) redirect("/requests");
  let options = await getRequestWorkspaceOptions(actor);
  if (!actor.demo && hasCapability(actor.access,"calculation.rate_reference.read")) {
    const memory=await getRateMemorySpecialtyStats(actor);
    options={...options,specialties:options.specialties.map(item=>({...item,stats:mergeRateStats(item.stats,memory.get(item.id))}))};
  }
  return <>
    <PageHeader eyebrow="Коммерция → Заявки" title={query.draft ? "Редактирование заявки" : "Новая заявка"} subtitle="Быстрый сбор потребности: заказчик, позиции, график, обеспечение, требования и коммерческие ориентиры." breadcrumbs={[{ label: "Коммерция" }, { label: "Заявки", href: "/requests" }, { label: query.draft ? "Редактирование" : "Новая заявка" }]}/>
    <RequestIntakeFinalShell options={options} demo={actor.demo} demoRequestId={query.draft}/>
  </>;
}
