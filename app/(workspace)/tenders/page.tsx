import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {listTenders} from "@/lib/tenders/service";
import {PageHeader} from "@/components/UI";
import {TendersWorkspace} from "@/components/TendersWorkspace";

export default async function TendersPage(){
  const actor=await requireActor();const rows=await listTenders(actor);
  return <><PageHeader eyebrow="Коммерция → Продажи" title="Тендеры" subtitle="Параллельный коммерческий контур для закупок: загрузка, анализ, расчёт, согласование, подготовка, подача и результат." breadcrumbs={[{label:"Коммерция"},{label:"Тендеры"}]}/><TendersWorkspace rows={rows} canCreate={hasCapability(actor.access,"sales.tender.create")} canImport={hasCapability(actor.access,"sales.tender.import")} canEdit={hasCapability(actor.access,"sales.tender.edit")}/></>;
}
