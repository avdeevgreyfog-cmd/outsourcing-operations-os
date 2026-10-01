import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { TransportWorkspace } from "@/components/TransportWorkspace";
import { getOperationsReferenceData } from "@/lib/operations/service";
import { listSupplyPartners, listTransportOperations } from "@/lib/operations/supply-control";

export default async function TransportPage(){
  const actor=await requireActor();
  const [rows,options,partners]=await Promise.all([
    listTransportOperations(actor),
    getOperationsReferenceData(actor,"supply.transport.read"),
    hasCapability(actor.access,"supplier.read")?listSupplyPartners(actor):Promise.resolve([]),
  ]);
  return <>
    <PageHeader eyebrow="Операции → Обеспечение" title="Транспорт" subtitle="Поездки сотрудников и заказной транспорт по всем доступным объектам: маршруты, бронирования, подрядчики, стоимость и платёжный контроль." breadcrumbs={[{label:"Операции"},{label:"Обеспечение"},{label:"Транспорт"}]}/>
    <TransportWorkspace rows={rows} options={options} partners={partners} canManage={hasCapability(actor.access,"supply.transport.manage")} demo={actor.demo}/>
  </>;
}
