import {isGithubPagesDemo} from "@/lib/demo/pages";
import {requireActor} from "@/lib/auth/server";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {getClientEditOptions,listClients} from "@/lib/data/service";
import {redirect} from "next/navigation";
import {ClientsWorkspaceBaseline} from "@/components/ClientsWorkspaceBaseline";

export default async function Clients({searchParams}:{searchParams:Promise<{preview?:string;demoEdit?:string}>}){
  const actor=await requireActor();
  const rows=await listClients(actor);
  const query=isGithubPagesDemo()?{}:await searchParams;
  const preferenceScope=actor.organizationId+":"+actor.userId+":"+actor.roleCode+":"+(actor.demo?"demo":"live");
  if(actor.demo&&query.preview)redirect(`/clients/${encodeURIComponent(query.preview)}`);
  const editableIds=rows.filter(row=>canReadRow(actor.access,"sales.client.edit",row,actor)).map(row=>row.id);
  const editOptions=editableIds.length?await getClientEditOptions(actor):null;
  return <ClientsWorkspaceBaseline
    rows={rows}
    editableIds={editableIds}
    editOptions={editOptions}
    canEdit={hasCapability(actor.access,"sales.client.edit")}
    canCreate={hasCapability(actor.access,"sales.client.create")}
    demo={actor.demo}
    demoEditId={actor.demo?query.demoEdit:undefined}
    preferenceScope={preferenceScope}
  />;
}
