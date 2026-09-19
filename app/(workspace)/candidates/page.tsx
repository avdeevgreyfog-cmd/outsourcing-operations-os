import { requireActor } from "@/lib/auth/server";
import { PageHeader } from "@/components/UI";
import { CandidatesWorkspace } from "@/components/CandidatesWorkspace";
import { hasCapability } from "@/lib/core/access.mjs";
import { listRecruitingApplications, getRecruitingOptions } from "@/lib/recruiting/service";

export default async function Candidates(){
  const actor=await requireActor();
  const [rows,options]=await Promise.all([listRecruitingApplications(actor),getRecruitingOptions(actor)]);
  return <>
    <PageHeader eyebrow="Подбор" title="Кандидаты" subtitle="Единая база людей: контакты, источники, текущие и исторические заявки на потребности." breadcrumbs={[{label:"Люди"},{label:"Подбор",href:"/recruiting"},{label:"Кандидаты"}]}/>
    <CandidatesWorkspace rows={rows} demo={actor.demo} exitReasons={options.exitReasons} canEdit={hasCapability(actor.access,"recruiting.candidate.edit")} canConvert={hasCapability(actor.access,"recruiting.candidate.convert")}/>
  </>;
}
