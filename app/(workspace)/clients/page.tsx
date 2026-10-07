import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {listClients} from "@/lib/data/service";
import {ClientsWorkspaceBaseline} from "@/components/ClientsWorkspaceBaseline";

export default async function Clients(){
  const actor=await requireActor();
  const rows=await listClients(actor);
  return <ClientsWorkspaceBaseline
    rows={rows}
    canCreate={hasCapability(actor.access,"sales.client.create")}
    demo={actor.demo}
    preferenceScope={actor.organizationId+":"+actor.userId+":"+actor.roleCode+":"+(actor.demo?"demo":"live")}
  />;
}
