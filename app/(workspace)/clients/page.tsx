import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listClients, listRequests, listObjects } from "@/lib/data/service";
import { PageHeader } from "@/components/UI";
import { ClientsWorkspaceBaseline } from "@/components/ClientsWorkspaceBaseline";

export default async function Clients() {
  const actor = await requireActor();
  const [clients, requests, objects] = await Promise.all([
    listClients(actor),
    hasCapability(actor.access,"sales.request.read") ? listRequests(actor) : Promise.resolve([]),
    hasCapability(actor.access,"operations.object.read") ? listObjects(actor) : Promise.resolve([]),
  ]);
  const rows = clients.map(client => ({...client, requests:requests.filter(row => row.clientId === client.id).length, objects:objects.filter(row => row.clientId === client.id).length}));

  return <>
    <PageHeader
      eyebrow="Коммерция"
      title="Клиенты"
      subtitle="Компании, контакты и связанный коммерческий контур."
      breadcrumbs={[{ label: "Коммерция" }, { label: "Клиенты" }]}
    />
    <ClientsWorkspaceBaseline rows={rows} canCreate={hasCapability(actor.access,"sales.client.create")}/>
  </>;
}
