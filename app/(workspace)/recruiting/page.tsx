import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { RecruitingFunnelWorkspace } from "@/components/RecruitingFunnelWorkspace";
import { listRecruitingApplications, listRecruitingNeeds } from "@/lib/recruiting/service";

export default async function Recruiting({searchParams}:{searchParams:Promise<{need?:string;object?:string;specialty?:string;recruiter?:string}>}){
  const actor=await requireActor();
  const {need,object,specialty,recruiter}=await searchParams;
  const [rows,needs]=await Promise.all([listRecruitingApplications(actor),listRecruitingNeeds(actor)]);
  return <>
    <PageHeader eyebrow="Подбор" title="Воронка подбора" subtitle="Рабочая CRM кандидатов от первого контакта до фактического выхода." breadcrumbs={[{label:"Люди"},{label:"Подбор"},{label:"Воронка"}]}/>
    <RecruitingFunnelWorkspace rows={rows} needs={needs} demo={actor.demo} canCreate={actor.demo||hasCapability(actor.access,"recruiting.candidate.create")} initialNeed={need??null} initialObject={object??null} initialSpecialty={specialty??null} initialRecruiter={recruiter??null}/>
  </>;
}
