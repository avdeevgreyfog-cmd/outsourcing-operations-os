import { requireActor } from "@/lib/auth/server";
import { isGithubPagesDemo } from "@/lib/demo/pages";
import {OperationsLayout} from "@/components/operations/OperationsLayout";
import { CandidatesWorkspace } from "@/components/CandidatesWorkspace";
import { hasCapability } from "@/lib/core/access.mjs";
import { listRecruitingApplications, getRecruitingOptions, listRecruitingNeeds, listCandidateDirectory } from "@/lib/recruiting/service";

export default async function Candidates({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const initialQueue=typeof params.queue==="string"?params.queue:"all";
  const [rows,options,needs,directory]=await Promise.all([listRecruitingApplications(actor),getRecruitingOptions(actor),listRecruitingNeeds(actor),listCandidateDirectory(actor)]);
  return <OperationsLayout>
    <CandidatesWorkspace rows={rows} directory={directory} needs={needs} options={options} initialQueue={initialQueue} demo={actor.demo} canCreate={hasCapability(actor.access,"recruiting.candidate.create")} canEdit={hasCapability(actor.access,"recruiting.candidate.edit")}/>
  </OperationsLayout>;
}
