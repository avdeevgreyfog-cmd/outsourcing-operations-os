import {requireActor} from "@/lib/auth/server";
import {hasCapability} from "@/lib/core/access.mjs";
import {listCompanyDocuments} from "@/lib/tenders/company-documents";
import {getTenderOptions} from "@/lib/tenders/service";
import {PageHeader} from "@/components/UI";
import {CompanyDocumentsWorkspace} from "@/components/CompanyDocumentsWorkspace";

export default async function CompanyDocumentsPage(){
  const actor=await requireActor();const [rows,options]=await Promise.all([listCompanyDocuments(actor),getTenderOptions(actor)]);
  return <><PageHeader eyebrow="Организация → Документы" title="Документы компании" subtitle="Единая библиотека учредительных, налоговых, разрешительных и иных документов компании. Тендеры используют её как источник для чек-листа участия." breadcrumbs={[{label:"Организация"},{label:"Документы компании"}]}/><CompanyDocumentsWorkspace rows={rows} legalEntities={options.legalEntities} canManage={hasCapability(actor.access,"company.document.manage")}/></>;
}
