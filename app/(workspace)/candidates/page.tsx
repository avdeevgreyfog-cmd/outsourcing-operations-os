import { requireActor } from "@/lib/auth/server";
import { PageHeader } from "@/components/UI";
import { CandidatesWorkspace } from "@/components/CandidatesWorkspace";
import { hasCapability } from "@/lib/core/access.mjs";
import { listRecruitingApplications, getRecruitingOptions, listRecruitingNeeds, listCandidateDirectory } from "@/lib/recruiting/service";

export default async function Candidates({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireActor();
  const params=await searchParams;
  const initialQueue=typeof params.queue==="string"?params.queue:"all";
  const [rows,options,needs,directory]=await Promise.all([listRecruitingApplications(actor),getRecruitingOptions(actor),listRecruitingNeeds(actor),listCandidateDirectory(actor)]);
  return <>
    <PageHeader eyebrow="Подбор" title="Кандидаты" subtitle="Единая база людей: контакты, источники, текущие и исторические заявки на потребности." breadcrumbs={[{label:"Люди"},{label:"Подбор",href:"/recruiting"},{label:"Кандидаты"}]}/>
    <CandidatesWorkspace rows={rows} directory={directory} needs={needs} options={options} initialQueue={initialQueue} demo={actor.demo} exitReasons={options.exitReasons} canCreate={hasCapability(actor.access,"recruiting.candidate.create")} canEdit={hasCapability(actor.access,"recruiting.candidate.edit")} canConvert={hasCapability(actor.access,"recruiting.candidate.convert")}/>
  </>;
}
