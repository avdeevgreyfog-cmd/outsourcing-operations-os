import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { WorkersWorkspace } from "@/components/WorkersWorkspace";
import { listWorkers } from "@/lib/data/service";
import { getOperationsReferenceData } from "@/lib/operations/service";

export default async function Workers(){
  const actor=await requireActor();
  const [rows,options]=await Promise.all([listWorkers(actor),getOperationsReferenceData(actor)]);
  return <>
    <PageHeader eyebrow="Операции → Персонал объектов" title="Сотрудники" subtitle="Действующий персонал объектов, назначения, расчётный статус и история работы." breadcrumbs={[{label:"Операции"},{label:"Персонал объектов"},{label:"Сотрудники"}]}/>
    <WorkersWorkspace rows={rows} options={options} sensitive={hasCapability(actor.access,"worker.compensation.read")} canEdit={hasCapability(actor.access,"worker.edit")} demo={actor.demo}/>
  </>;
}
