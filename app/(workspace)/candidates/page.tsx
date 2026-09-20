import { requireActor } from "@/lib/auth/server";
import { PageHeader } from "@/components/UI";
import { CandidatesWorkspace } from "@/components/CandidatesWorkspace";
import { hasCapability } from "@/lib/core/access.mjs";
import { getRecruitingOptions, listCandidateDirectory, listRecruitingApplications, listRecruitingNeeds } from "@/lib/recruiting/service";

export default async function Candidates(){
  const actor=await requireActor();
  const [people,applications,needs,options]=await Promise.all([
    listCandidateDirectory(actor),
    listRecruitingApplications(actor),
    listRecruitingNeeds(actor),
    getRecruitingOptions(actor),
  ]);
  return <>
    <PageHeader eyebrow="Подбор" title="Кандидаты" subtitle="Единая база людей: контакты, источники, все заявки и история подбора независимо от текущего статуса." breadcrumbs={[{label:"Люди"},{label:"Подбор",href:"/recruiting"},{label:"Кандидаты"}]}/>
    <CandidatesWorkspace
      people={people}
      applications={applications}
      needs={needs}
      options={options}
      demo={actor.demo}
      canEdit={hasCapability(actor.access,"recruiting.candidate.edit")}
      canConvert={hasCapability(actor.access,"recruiting.candidate.convert")}
      canImport={hasCapability(actor.access,"recruiting.candidate.import")}
    />
  </>;
}
