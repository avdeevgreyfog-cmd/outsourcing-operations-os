import { requireActor } from "@/lib/auth/server";
import { listObjects } from "@/lib/data/service";
import { listOperationsAnalytics,listStaffingForecast } from "@/lib/operations/service";
import { getObjectManagementOptions, type ObjectManagementOptions } from "@/lib/operations/object-management";
import { Metric, PageHeader } from "@/components/UI";
import { ObjectPortfolioWorkspace } from "@/components/ObjectPortfolioWorkspace";
import { hasCapability } from "@/lib/core/access.mjs";

const emptyOptions:ObjectManagementOptions={clients:[],legalEntities:[],regions:[],managers:[],recruiters:[]};

export default async function Objects(){
  const actor=await requireActor();
  const canForecast=hasCapability(actor.access,"operations.need.read");
  const canCreate=hasCapability(actor.access,"operations.object.create");
  const [rows,analytics,forecast,options]=await Promise.all([
    listObjects(actor),
    listOperationsAnalytics(actor),
    canForecast?listStaffingForecast(actor,30):Promise.resolve([]),
    canCreate?getObjectManagementOptions(actor,{includeCreation:true}):Promise.resolve(emptyOptions),
  ]);
  const analyticsByObject=new Map(analytics.map(row=>[row.objectId,row]));
  const forecastDeficitByObject=new Map<string,number>();
  for(const row of forecast)forecastDeficitByObject.set(row.objectId,(forecastDeficitByObject.get(row.objectId)??0)+row.projectedDeficit);
  const enhancedRows=rows.map(row=>{
    const fact=analyticsByObject.get(row.id);
    const projectedDeficit=forecastDeficitByObject.get(row.id)??0;
    const signal=objectRisk(row.required,fact?.working??row.filled,projectedDeficit,fact?.noShows??0,fact?.openIncidents??0,row.unassignedNeedCount??0);
    if(!row.legalEntityId)signal.attention.push("Не указано наше юрлицо");
    if(!row.ownerUserId)signal.attention.push("Не назначен основной менеджер");
    return {...row,risk:signal.level,riskReasons:signal.reasons,attentionReasons:[...new Set(signal.attention)]};
  });
  const required=analytics.reduce((sum,row)=>sum+row.required,0);
  const working=analytics.reduce((sum,row)=>sum+row.working,0);
  const deficit=Math.max(required-working,0);
  const risky=enhancedRows.filter(row=>["high","critical"].includes(row.risk??"")).length;
  return <>
    <PageHeader eyebrow="Операции → Управление объектами" title="Объекты" subtitle="Портфель объектов: юридические лица, ответственные, комплектация и объяснимые операционные сигналы." breadcrumbs={[{label:"Операции"},{label:"Управление объектами"},{label:"Объекты"}]}/>
    <div className="metrics-grid">
      <Metric label="Объекты в контуре" value={rows.length}/>
      <Metric label="Сотрудников на объектах" value={working}/>
      <Metric label="Нужно найти" value={deficit} tone={deficit?"warn":"good"}/>
      <Metric label="Высокий риск" value={risky} tone={risky?"bad":"good"}/>
    </div>
    <ObjectPortfolioWorkspace objects={enhancedRows} analytics={analytics} options={options} canCreate={canCreate} demo={actor.demo}/>
  </>;
}

function objectRisk(required:number,working:number,projectedDeficit:number,noShows:number,openIncidents:number,unassignedNeeds:number){
  const rank:Record<string,number>={normal:0,watch:1,high:2,critical:3};
  let level="normal";
  const reasons:Array<{code:string;label:string;detail:string}>=[];
  const attention:string[]=[];
  const raise=(next:string)=>{if(rank[next]>rank[level])level=next};

  if(required>0){
    const coverage=Math.round(working/required*100);
    const deficit=Math.max(required-working,0);
    if(deficit>0)attention.push(`Текущий дефицит: ${deficit}`);
    if(coverage<60){raise("critical");reasons.push({code:"coverage",label:"Критическая комплектация",detail:`${working} из ${required} · ${coverage}%`});}
    else if(coverage<80){raise("high");reasons.push({code:"coverage",label:"Низкая комплектация",detail:`${working} из ${required} · ${coverage}%`});}
    else if(coverage<95){raise("watch");reasons.push({code:"coverage",label:"Комплектация требует контроля",detail:`${working} из ${required} · ${coverage}%`});}
  }else attention.push("План численности не задан");

  if(projectedDeficit>0){raise("high");reasons.push({code:"forecast",label:"Прогнозный дефицит",detail:`Через 30 дней не хватает ${projectedDeficit} чел.`});attention.push(`Прогнозный дефицит: ${projectedDeficit}`);}
  if(noShows>0){raise("high");reasons.push({code:"no_show",label:"Невыходы",detail:`Сегодня зафиксировано: ${noShows}`});attention.push(`Невыходы: ${noShows}`);}
  if(openIncidents>0){raise("watch");reasons.push({code:"incidents",label:"Открытые инциденты",detail:`Требуют контроля: ${openIncidents}`});attention.push(`Инциденты: ${openIncidents}`);}
  if(unassignedNeeds>0){raise("watch");reasons.push({code:"recruiting",label:"Подбор не распределён",detail:`Потребностей без назначенного рекрутера: ${unassignedNeeds}`});attention.push(`Без ответственного подбора: ${unassignedNeeds}`);}

  return {level,reasons,attention:[...new Set(attention)]};
}
