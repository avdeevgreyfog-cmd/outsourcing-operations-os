import { requireActor } from "@/lib/auth/server";
import { requireCapability } from "@/lib/access/server";
import { listProposalTemplates } from "@/lib/commercial/proposal-template";
import { PageHeader } from "@/components/UI";
import { ProposalTemplateManager } from "@/components/ProposalTemplateManager";

export default async function DocumentTemplatesPage(){
  const actor=await requireActor();requireCapability(actor,"admin.modules.manage");
  const templates=await listProposalTemplates(actor);
  return <>
    <PageHeader eyebrow="Настройки" title="Шаблоны документов" subtitle="Настройте стандартное коммерческое предложение или загрузите собственный Word-шаблон. Клиентский результат формируется как PDF." breadcrumbs={[{label:"Администрирование"},{label:"Шаблоны документов"}]}/>
    <ProposalTemplateManager initialTemplates={templates}/>
  </>;
}
