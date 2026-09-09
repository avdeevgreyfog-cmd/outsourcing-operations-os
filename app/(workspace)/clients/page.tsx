import { requireActor } from "@/lib/auth/server";
import { listClients } from "@/lib/data/service";
import { PageHeader } from "@/components/UI";
import { ClientsWorkspaceBaseline } from "@/components/ClientsWorkspaceBaseline";

export default async function Clients() {
  const actor = await requireActor();
  const rows = await listClients(actor);

  return <>
    <PageHeader
      eyebrow="Коммерция"
      title="Клиенты"
      subtitle="Компании, контакты и связанный коммерческий контур."
      breadcrumbs={[{ label: "Коммерция" }, { label: "Клиенты" }]}
    />
    <ClientsWorkspaceBaseline rows={rows}/>
  </>;
}
