import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { CrewsWorkspace } from "@/components/CrewsWorkspace";
import { getOperationsReferenceData, listCrews } from "@/lib/operations/service";

export default async function Crews(){
  const actor=await requireActor();
  const [rows,options]=await Promise.all([listCrews(actor),getOperationsReferenceData(actor)]);
  return <>
    <PageHeader eyebrow="Операции → Персонал объектов" title="Бригады" subtitle="Составы бригад, бригадиры и доплаты в рамках доступных объектов." breadcrumbs={[{label:"Операции"},{label:"Персонал объектов"},{label:"Бригады"}]}/>
    <CrewsWorkspace rows={rows} options={options} canManage={hasCapability(actor.access,"operations.crew.manage")} demo={actor.demo}/>
  </>;
}
