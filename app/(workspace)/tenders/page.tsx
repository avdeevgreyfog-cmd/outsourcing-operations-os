import { isGithubPagesDemo } from "@/lib/demo/pages";
import {requireActor} from "@/lib/auth/server";
import {canReadRow,hasCapability} from "@/lib/core/access.mjs";
import {getTenderOptions,listTenders,getTenderSnapshotTime} from "@/lib/tenders/service";
import {getTenderAnalytics,normalizeTenderAnalyticsFilters} from "@/lib/tenders/analytics";
import {canConfigureTenderAnalytics,getTenderAnalyticsMetricPreferences} from "@/lib/tenders/analytics-metrics";
import {userTenderSamples} from "@/lib/tenders/demo-user-samples";
import {PageHeader} from "@/components/UI";
import {TendersWorkspace} from "@/components/TendersWorkspace";

type SearchParams={
  view?:string;
  from?:string;
  to?:string;
  platform?:string;
  customer?:string;
  owner?:string;
  region?:string;
  source?:string;
  specialty?:string;
  decision?:string;
  result?:string;
  priority?:string;
  deadline?:string;
};

export default async function TendersPage({searchParams}:{searchParams:Promise<SearchParams>}){
  const actor=await requireActor();
  const params=isGithubPagesDemo()?{}:await searchParams;
  if(actor.demo&&!actor.access.capabilities.includes("sales.tender.read"))actor.access.capabilities.push("sales.tender.read");
  const analyticsFilters=normalizeTenderAnalyticsFilters(params);
  const [rows,options,analytics,metricPreferences]=await Promise.all([
    listTenders(actor),
    getTenderOptions(actor),
    getTenderAnalytics(actor,analyticsFilters),
    getTenderAnalyticsMetricPreferences(actor),
  ]);
  const visibleRows=actor.demo?[...userTenderSamples.filter(row=>canReadRow(actor.access,"sales.tender.read",row,actor)),...rows]:rows;
  const initialView=params.view==="analytics"?"analytics":params.view==="board"?"board":"list";
  return <>
    <PageHeader eyebrow="Коммерция → Продажи" title="Тендеры" subtitle="Реестр закупок: анализ условий, решение об участии, расчёт, согласование, подготовка, подача и результат." breadcrumbs={[{label:"Коммерция"},{label:"Тендеры"}]}/>
    <TendersWorkspace
      rows={visibleRows}
      options={options}
      analytics={analytics}
      metricPreferences={metricPreferences}
      canConfigureAnalytics={canConfigureTenderAnalytics(actor)}
      initialView={initialView}
      demo={actor.demo}
      now={getTenderSnapshotTime()}
      preferenceScope={`${actor.organizationId}:${actor.membershipId}:${actor.roleCode}:${actor.demo?"demo":"live"}:${actor.access.capabilities.filter(cap=>cap==="*"||cap.startsWith("sales.tender.")).sort().join(",")}:${actor.access.denies?.filter(cap=>cap.startsWith("sales.tender.")).sort().join(",")??""}:${actor.accessPreview?.targetType??"self"}:${actor.accessPreview?.targetId??"self"}`}
      canSubmit={hasCapability(actor.access,"sales.tender.submit")}
      editableIds={actor.demo?[]:visibleRows.filter(row=>canReadRow(actor.access,"sales.tender.edit",row,actor)).map(row=>row.id)}
      canCreate={actor.demo||hasCapability(actor.access,"sales.tender.create")}
      canImport={actor.demo||hasCapability(actor.access,"sales.tender.import")}
      canEdit={hasCapability(actor.access,"sales.tender.edit")}
    />
  </>;
}
