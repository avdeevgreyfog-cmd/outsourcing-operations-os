import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { PageHeader } from "@/components/UI";
import { RecruitingNeedsWorkspace } from "@/components/RecruitingNeedsWorkspace";
import { getRecruitingOptions, listRecruitingNeeds } from "@/lib/recruiting/service";
import { getRecruitingAnalytics, normalizeRecruitingAnalyticsFilters } from "@/lib/recruiting/analytics";

type SearchParams = {
  view?: string;
  from?: string;
  to?: string;
  compareFrom?: string;
  compareTo?: string;
  object?: string;
  specialty?: string;
  recruiter?: string;
  source?: string;
};

export default async function Needs({searchParams}:{searchParams:Promise<SearchParams>}){
  const actor=await requireActor();
  const params=await searchParams;
  const analyticsFilters=normalizeRecruitingAnalyticsFilters(params);
  const [rows,options,analytics]=await Promise.all([
    listRecruitingNeeds(actor),
    getRecruitingOptions(actor),
    getRecruitingAnalytics(actor,analyticsFilters),
  ]);
  const canCreate=hasCapability(actor.access,"operations.need.create");
  const canManage=hasCapability(actor.access,"operations.need.edit");
  const initialView=params.view==="analytics"?"analytics":params.view==="needs"?"needs":"objects";
  return <>
    <PageHeader eyebrow="Подбор" title="Потребности" subtitle="Рабочий центр подбора: объекты, дефицит персонала, ответственные, кандидаты и готовность к выходу." breadcrumbs={[{label:"Люди"},{label:"Подбор"},{label:"Потребности"}]}/>
    <RecruitingNeedsWorkspace rows={rows} options={options} analytics={analytics} initialView={initialView} canCreate={canCreate} canManage={canManage} demo={actor.demo}/>
  </>;
}
