import { requireActor } from "@/lib/auth/server";
import { listObjects } from "@/lib/data/service";
import { listOperationsAnalytics } from "@/lib/operations/service";
import { Metric, PageHeader } from "@/components/UI";
import { ObjectPortfolioWorkspace } from "@/components/ObjectPortfolioWorkspace";

export default async function Objects(){
  const actor=await requireActor();
  const [rows,analytics]=await Promise.all([listObjects(actor),listOperationsAnalytics(actor)]);
  const required=analytics.reduce((sum,row)=>sum+row.required,0);
  const working=analytics.reduce((sum,row)=>sum+row.working,0);
  const deficit=Math.max(required-working,0);
  const risky=rows.filter(row=>["high","critical"].includes(row.risk??"")).length;
  return <>
    <PageHeader eyebrow="Операции → Управление объектами" title="Объекты" subtitle="Портфель объектов: текущее состояние, ответственные, численность и операционные риски." breadcrumbs={[{label:"Операции"},{label:"Управление объектами"},{label:"Объекты"}]}/>
    <div className="metrics-grid">
      <Metric label="Объекты в контуре" value={rows.length}/>
      <Metric label="Работает" value={working}/>
      <Metric label="Дефицит" value={deficit} tone={deficit?"warn":"good"}/>
      <Metric label="Требуют внимания" value={risky} tone={risky?"bad":"good"}/>
    </div>
    <ObjectPortfolioWorkspace objects={rows} analytics={analytics}/>
  </>;
}
