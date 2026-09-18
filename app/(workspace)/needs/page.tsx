import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { RecruitingNeedsWorkspace } from "@/components/RecruitingNeedsWorkspace";
import { getRecruitingOptions, listRecruitingNeeds } from "@/lib/recruiting/service";

export default async function Needs(){
  const actor=await requireActor();
  const [rows,options]=await Promise.all([listRecruitingNeeds(actor),getRecruitingOptions(actor)]);
  const canCreate=hasCapability(actor.access,"operations.need.create");
  const canManage=hasCapability(actor.access,"operations.need.edit");
  return <>
    <PageHeader eyebrow="Подбор" title="Потребности" subtitle="Рабочий центр подбора: объекты, дефицит персонала, ответственные, кандидаты и готовность к выходу." breadcrumbs={[{label:"Люди"},{label:"Подбор"},{label:"Потребности"}]}/>
    <RecruitingNeedsWorkspace rows={rows} options={options} canCreate={canCreate} canManage={canManage} demo={actor.demo}/>
  </>;
}
