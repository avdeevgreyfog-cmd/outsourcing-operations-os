import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { RecruitingNeedsWorkspace } from "@/components/RecruitingNeedsWorkspace";
import { getRecruitingOptions, listRecruitingNeeds } from "@/lib/recruiting/service";

export default async function Needs(){
  const actor=await requireActor();
  const [rows,options]=await Promise.all([listRecruitingNeeds(actor),getRecruitingOptions(actor)]);
  const canCreate=actor.demo||hasCapability(actor.access,"operations.need.create");
  return <>
    <PageHeader eyebrow="Подбор" title="Потребности" subtitle="Единая очередь заявок на персонал из коммерции, объектов и ручного набора." breadcrumbs={[{label:"Люди"},{label:"Подбор"},{label:"Потребности"}]}/>
    <RecruitingNeedsWorkspace rows={rows} options={options} canCreate={canCreate} demo={actor.demo}/>
  </>;
}
