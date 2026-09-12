import { requireActor } from "@/lib/auth/server";
import { PageHeader } from "@/components/UI";
import { CandidatesWorkspace } from "@/components/CandidatesWorkspace";
import { listRecruitingApplications } from "@/lib/recruiting/service";

export default async function Candidates(){
  const actor=await requireActor();
  const rows=await listRecruitingApplications(actor);
  return <>
    <PageHeader eyebrow="Подбор" title="Кандидаты" subtitle="Единая база людей: контакты, источники, текущие и исторические заявки на потребности." breadcrumbs={[{label:"Люди"},{label:"Подбор",href:"/recruiting"},{label:"Кандидаты"}]}/>
    <CandidatesWorkspace rows={rows} demo={actor.demo}/>
  </>;
}
