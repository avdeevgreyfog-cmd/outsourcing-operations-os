import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { getCommercialOptions } from "@/lib/commercial/service";
import { RequestCreateWorkspace } from "@/components/CommercialRequestForms";
import { PageHeader } from "@/components/UI";

export default async function NewRequestPage() {
  const actor = await requireActor();
  if (!hasCapability(actor.access, "sales.request.create")) redirect("/requests");
  const options = await getCommercialOptions(actor);
  return <>
    <PageHeader
      eyebrow="Коммерция → Заявки"
      title="Новая заявка"
      subtitle="Быстрый черновик можно сохранить с минимальными данными, а остальное дополнить самостоятельно или отправить заказчику по внешней ссылке."
      breadcrumbs={[{ label: "Коммерция" }, { label: "Заявки", href: "/requests" }, { label: "Новая заявка" }]}
    />
    <RequestCreateWorkspace options={options} />
  </>;
}
