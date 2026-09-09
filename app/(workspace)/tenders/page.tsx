import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {listTenders} from "@/lib/tenders/service";
import {userTenderSamples} from "@/lib/tenders/demo-user-samples";
import {PageHeader} from "@/components/UI";
import {TendersWorkspace} from "@/components/TendersWorkspace";

export default async function TendersPage(){
  const actor=await requireActor();
  if(actor.demo&&!actor.access.capabilities.includes("sales.tender.read")) actor.access.capabilities.push("sales.tender.read");
  const rows=await listTenders(actor);
  const visibleRows=actor.demo?[...userTenderSamples,...rows]:rows;
  return <>
    <PageHeader eyebrow="Коммерция → Продажи" title="Тендеры" subtitle="Реестр закупок: добавление вручную или из Excel, анализ условий, расчёт, согласование, подготовка, подача и результат." breadcrumbs={[{label:"Коммерция"},{label:"Тендеры"}]}/>
    <TendersWorkspace
      rows={visibleRows}
      demo={actor.demo}
      canCreate={actor.demo||hasCapability(actor.access,"sales.tender.create")}
      canImport={actor.demo||hasCapability(actor.access,"sales.tender.import")}
      canEdit={hasCapability(actor.access,"sales.tender.edit")}
    />
  </>;
}
