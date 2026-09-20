import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { RecruitingFunnelWorkspace } from "@/components/RecruitingFunnelWorkspace";
import { getRecruitingOptions, getRecruitingPipeline, listRecruitingApplications, listRecruitingNeeds } from "@/lib/recruiting/service";

export default async function Recruiting({searchParams}:{searchParams:Promise<{need?:string;object?:string;specialty?:string;recruiter?:string;source?:string;queue?:string;stage?:string}>}){
  const actor=await requireActor();
  const {need,object,specialty,recruiter,source,queue,stage}=await searchParams;
  const [rows,needs,options,pipeline]=await Promise.all([
    listRecruitingApplications(actor),
    listRecruitingNeeds(actor),
    getRecruitingOptions(actor),
    getRecruitingPipeline(actor),
  ]);
  const canConfigurePipeline=hasCapability(actor.access,"recruiting.pipeline.configure");
  return <>
    <PageHeader eyebrow="Подбор" title="Воронка подбора" subtitle="Рабочий контур кандидатов: контакт, интервью, документы, подготовка, первый выход и удержание." breadcrumbs={[{label:"Люди"},{label:"Подбор"},{label:"Воронка"}]}/>
    <RecruitingFunnelWorkspace
      rows={rows}
      needs={needs}
      options={options}
      pipeline={pipeline}
      demo={actor.demo}
      canCreate={hasCapability(actor.access,"recruiting.candidate.create")}
      canEdit={hasCapability(actor.access,"recruiting.candidate.edit")}
      canConvert={hasCapability(actor.access,"recruiting.candidate.convert")}
      canConfigurePipeline={canConfigurePipeline}
      canConfigureSources={hasCapability(actor.access,"recruiting.sources.configure")}
      showResponsible={canConfigurePipeline||actor.access.allOrg}
      currentUserId={actor.userId}
      initialQueue={queue}
      initialStage={stage}
      initialNeed={need??null}
      initialObject={object??null}
      initialSpecialty={specialty??null}
      initialRecruiter={recruiter??null}
      initialSource={source??null}
    />
  </>;
}
