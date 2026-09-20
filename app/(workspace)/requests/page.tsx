import { isGithubPagesDemo } from "@/lib/demo/pages";
import { requireActor } from "@/lib/auth/server";
import { hasCapability } from "@/lib/core/access.mjs";
import { listRequestBoard, listRequestStages, getRequestWorkspaceOptions, getRequestSnapshotTime } from "@/lib/commercial/request-workflow-server";
import { getRequestAnalytics, normalizeRequestAnalyticsFilters } from "@/lib/commercial/request-analytics";
import { canConfigureRequestAnalytics, getRequestAnalyticsMetricPreferences } from "@/lib/commercial/request-analytics-metrics";
import { RequestsWorkspaceFinal } from "@/components/RequestsWorkspaceFinal";
import { PageHeader } from "@/components/UI";

type SearchParams={
  view?:string;
  from?:string;
  to?:string;
  client?:string;
  owner?:string;
  region?:string;
  source?:string;
  specialty?:string;
};

export default async function RequestsPage({searchParams}:{searchParams:Promise<SearchParams>}) {
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  const analyticsFilters=normalizeRequestAnalyticsFilters(params);
  const [rows,stages,options,analytics,metricPreferences]=await Promise.all([
    listRequestBoard(actor),
    listRequestStages(actor),
    getRequestWorkspaceOptions(actor),
    getRequestAnalytics(actor,analyticsFilters),
    getRequestAnalyticsMetricPreferences(actor),
  ]);
  const initialMode=params.view==="analytics"?"analytics":params.view==="board"?"board":"list";
  return <>
    <PageHeader eyebrow="Коммерция" title="Заявки" subtitle="Рабочая воронка от первичной потребности до согласованного коммерческого предложения." breadcrumbs={[{label:"Коммерция"},{label:"Заявки"}]}/>
    <RequestsWorkspaceFinal
      rows={rows}
      stages={stages}
      options={options}
      analytics={analytics}
      metricPreferences={metricPreferences}
      canConfigureMetrics={canConfigureRequestAnalytics(actor)}
      initialMode={initialMode}
      canCreate={hasCapability(actor.access,"sales.request.create")}
      canConfigure={options.canConfigurePipeline}
      canEdit={hasCapability(actor.access,"sales.request.edit")}
      now={getRequestSnapshotTime()}
      demo={actor.demo}
    />
  </>;
}
