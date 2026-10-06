import {requireActor} from "@/lib/auth/server";
import {listShifts} from "@/lib/data/service";
import {getOperationsReferenceData} from "@/lib/operations/service";
import {hasCapability} from "@/lib/core/access.mjs";
import {Metric,PageHeader} from "@/components/UI";
import {ResourceScheduler} from "@/components/ResourceScheduler";
import {rub} from "@/lib/ui/format";

export default async function Shifts(){
  const actor=await requireActor();
  const [rows,options]=await Promise.all([
    listShifts(actor),
    getOperationsReferenceData(actor,"operations.shift.read"),
  ]);
  const demand=rows.reduce((s,x)=>s+Number(x.demand||0),0);
  const assigned=rows.reduce((s,x)=>s+Number(x.assigned||0),0);
  const deficit=rows.reduce((s,x)=>s+Math.max(0,Number(x.deficit||0)),0);
  return <>
    <PageHeader eyebrow="Операции → Персонал объектов" title="Графики и смены" subtitle="Построение циклов смен, назначения, резерв, контроль отсутствий и дефицита." breadcrumbs={[{label:"Операции"},{label:"Персонал объектов"},{label:"Графики и смены"}]}/>
    <div className="metrics-grid"><Metric label="Потребность" value={demand}/><Metric label="Назначено" value={assigned}/><Metric label="Дефицит" value={deficit} tone={deficit?"bad":"good"}/><Metric label="Плановая стоимость" value={rub(rows.reduce((s,x)=>s+Number(x.cost||0),0))}/></div>
    <ResourceScheduler rows={rows} options={options} canEdit={hasCapability(actor.access,"operations.shift.edit")}/>
  </>;
}
