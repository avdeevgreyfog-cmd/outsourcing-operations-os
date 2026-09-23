import { requireActor } from "@/lib/auth/server";
import { listObjects } from "@/lib/data/service";
import { listOperationsAnalytics,listStaffingForecast } from "@/lib/operations/service";
import { Metric, PageHeader } from "@/components/UI";
import { ObjectPortfolioWorkspace } from "@/components/ObjectPortfolioWorkspace";
import { hasCapability } from "@/lib/core/access.mjs";

export default async function Objects(){
  const actor=await requireActor();
  const canForecast=hasCapability(actor.access,"operations.need.read");
  const [rows,analytics,forecast]=await Promise.all([listObjects(actor),listOperationsAnalytics(actor),canForecast?listStaffingForecast(actor,30):Promise.resolve([])]);
  const analyticsByObject=new Map(analytics.map(row=>[row.objectId,row]));
  const forecastDeficitByObject=new Map<string,number>();
  for(const row of forecast)forecastDeficitByObject.set(row.objectId,(forecastDeficitByObject.get(row.objectId)??0)+row.projectedDeficit);
  const enhancedRows=rows.map(row=>{
    const fact=analyticsByObject.get(row.id);
    const projectedDeficit=forecastDeficitByObject.get(row.id)??0;
    return {...row,risk:elevateRisk(row.risk,projectedDeficit>0||Boolean(fact?.noShows),"high",Boolean(fact?.openIncidents),"watch")};
  });
  const required=analytics.reduce((sum,row)=>sum+row.required,0);
  const working=analytics.reduce((sum,row)=>sum+row.working,0);
  const deficit=Math.max(required-working,0);
  const risky=enhancedRows.filter(row=>["high","critical"].includes(row.risk??"")).length;
  return <>
    <PageHeader eyebrow="Операции → Управление объектами" title="Объекты" subtitle="Портфель объектов: текущее состояние, ответственные, численность и операционные риски." breadcrumbs={[{label:"Операции"},{label:"Управление объектами"},{label:"Объекты"}]}/>
    <div className="metrics-grid">
      <Metric label="Объекты в контуре" value={rows.length}/>
      <Metric label="Сотрудников на объектах" value={working}/>
      <Metric label="Дефицит" value={deficit} tone={deficit?"warn":"good"}/>
      <Metric label="Требуют внимания" value={risky} tone={risky?"bad":"good"}/>
    </div>
    <ObjectPortfolioWorkspace objects={enhancedRows} analytics={analytics}/>
  </>;
}

function elevateRisk(base:string|null|undefined,highSignal:boolean,highLevel:"high",watchSignal:boolean,watchLevel:"watch"){
  const rank:Record<string,number>={normal:0,watch:1,high:2,critical:3};
  let value=rank[base??"normal"]==null?"normal":base??"normal";
  if(watchSignal&&rank[value]<rank[watchLevel])value=watchLevel;
  if(highSignal&&rank[value]<rank[highLevel])value=highLevel;
  return value;
}
