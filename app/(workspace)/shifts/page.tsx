import {requireActor} from "@/lib/auth/server";
import {listShifts} from "@/lib/data/service";
import {getOperationsReferenceData} from "@/lib/operations/service";
import {hasCapability} from "@/lib/core/access.mjs";
import {PageHeader} from "@/components/UI";
import {ResourceScheduler} from "@/components/ResourceScheduler";

export default async function Shifts(){
  const actor=await requireActor();
  const [rows,options]=await Promise.all([
    listShifts(actor),
    getOperationsReferenceData(actor,"operations.shift.read"),
  ]);
  return <>
    <PageHeader eyebrow="Операции → Персонал объектов" title="Графики и смены" subtitle="Диспетчерская по всем доступным объектам: недельное покрытие смен, назначения сотрудников, подтверждения, резерв и дефицит." breadcrumbs={[{label:"Операции"},{label:"Персонал объектов"},{label:"Графики и смены"}]}/>
    <ResourceScheduler rows={rows} options={options} canEdit={hasCapability(actor.access,"operations.shift.edit")}/>
  </>;
}
