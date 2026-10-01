import Link from "next/link";
import { Status } from "@/components/UI";
import type { TimesheetData, IncidentRow } from "@/lib/data/service";
import type { StaffingForecastRow } from "@/lib/operations/service";
import type { ObjectAnalyticsDetail, ObjectAnalyticsDailyPoint } from "@/lib/operations/object-analytics";
import { ObjectAnalyticsCategoryChart, ObjectAnalyticsHoursChart, ObjectAnalyticsMarginChart, ObjectAnalyticsMovementChart, ObjectAnalyticsTrendChart } from "@/components/ObjectAnalyticsCharts";
import { pct, rub } from "@/lib/ui/format";

export type ObjectAnalyticsView="summary"|"workforce"|"attendance"|"timesheet"|"quality"|"economics";
type FinanceSnapshot={
  id:string;objectId:string;periodStart?:string|null;periodEnd?:string|null;
  revenue:number|string;workerCost:number|string;expenses:number|string;contribution:number|string;marginPct:number|string;planMarginPct?:number|string|null;
};

const viewLabels:Record<ObjectAnalyticsView,string>={
  summary:"Сводка",workforce:"Персонал",attendance:"Смены и явка",timesheet:"Табель",quality:"Качество",economics:"Экономика",
};
const periodLabels:Record<string,string>={"7":"7 дней","30":"30 дней",month:"Текущий месяц","90":"3 месяца"};
const incidentTypeLabels:Record<string,string>={no_show:"Невыход",discipline:"Дисциплина",quality:"Качество",safety:"Безопасность",client_claim:"Претензия клиента",damage:"Ущерб",other:"Другое"};

function num(value:number|string|null|undefined){return Number(value??0)||0}
function formatDate(value:string|null|undefined){
  if(!value)return"—";
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"));
}
function compactDate(value:string){
  return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",timeZone:"UTC"}).format(new Date(value+"T00:00:00Z"));
}
function timesheetStatusLabel(value:string|null|undefined){return ({draft:"Черновик",submitted:"Передан",approved:"Согласован",returned:"Возвращён",internal_submitted:"На внутренней проверке",internal_checked:"Проверен внутри",client_sent:"Отправлен клиенту",client_approved:"Подтверждён клиентом",closed:"Закрыт"} as Record<string,string>)[value??""]??"Не зафиксирован"}
function toneByCoverage(value:number){return value<85?"bad" as const:value<97?"warn" as const:"good" as const}
function toneByMargin(value:number){return value<10?"bad" as const:value<18?"warn" as const:"good" as const}

function groupWeeks(daily:ObjectAnalyticsDailyPoint[]){
  const map=new Map<string,{label:string;hours:number;demand:number;worked:number;noShows:number}>();
  for(const row of daily){
    const date=new Date(row.date+"T00:00:00Z");const weekday=(date.getUTCDay()+6)%7;date.setUTCDate(date.getUTCDate()-weekday);
    const key=date.toISOString().slice(0,10);
    const current=map.get(key)??{label:compactDate(key),hours:0,demand:0,worked:0,noShows:0};
    current.hours+=row.hours;current.demand+=row.shiftDemand;current.worked+=row.worked;current.noShows+=row.noShows;map.set(key,current);
  }
  return [...map.values()];
}

export function ObjectAnalyticsWorkspace({
  objectId,data,forecast,timesheet,finance,incidents,view,period,canFinance,
}:{
  objectId:string;
  data:ObjectAnalyticsDetail;
  forecast:StaffingForecastRow[];
  timesheet:TimesheetData|null;
  finance:FinanceSnapshot[];
  incidents:IncidentRow[];
  view:ObjectAnalyticsView;
  period:string;
  canFinance:boolean;
}){
  const required=forecast.reduce((sum,row)=>sum+row.required,0);
  const working=forecast.reduce((sum,row)=>sum+row.working,0);
  const confirmedStarts=forecast.reduce((sum,row)=>sum+row.confirmedStarts,0);
  const plannedExits=forecast.reduce((sum,row)=>sum+row.plannedExits,0);
  const projectedDeficit=forecast.reduce((sum,row)=>sum+row.projectedDeficit,0);
  const projectedAvailable=forecast.reduce((sum,row)=>sum+row.projectedAvailable,0);
  const shiftDemand=data.daily.reduce((sum,row)=>sum+row.shiftDemand,0);
  const worked=data.daily.reduce((sum,row)=>sum+row.worked,0);
  const noShows=data.daily.reduce((sum,row)=>sum+row.noShows,0);
  const hours=data.daily.reduce((sum,row)=>sum+row.hours,0);
  const attendance=shiftDemand?Math.round(worked/shiftDemand*100):100;
  const coverage=required?Math.round(working/required*100):100;
  const openIncidents=incidents.filter(row=>!["resolved","closed"].includes(row.status)).length;
  const criticalIncidents=incidents.filter(row=>!["resolved","closed"].includes(row.status)&&row.severity==="critical").length;
  const periodIncidents=data.daily.reduce((sum,row)=>sum+row.incidents,0);
  const financialIncidents=incidents.filter(row=>num(row.financialEffectAmount)>0&&row.financialEffectStatus==="proposed");
  const latestFinance=finance[0]??null;
  const weeks=groupWeeks(data.daily);

  const activityBySpecialty=new Map(data.specialties.map(row=>[row.specialtyId,row] as const));
  const specialtyBase=new Map<string,{specialtyId:string;specialty:string}>();
  for(const row of forecast)specialtyBase.set(row.specialtyId,{specialtyId:row.specialtyId,specialty:row.specialty});
  for(const row of data.specialties)specialtyBase.set(row.specialtyId,{specialtyId:row.specialtyId,specialty:row.specialty});
  const specialtyRows=[...specialtyBase.values()].map(base=>{
    const current=forecast.find(row=>row.specialtyId===base.specialtyId);
    const activity=activityBySpecialty.get(base.specialtyId);
    const demand=activity?.shiftDemand??0;
    const specialtyWorked=activity?.worked??0;
    return {
      ...base,
      required:current?.required??0,working:current?.working??0,confirmedStarts:current?.confirmedStarts??0,plannedExits:current?.plannedExits??0,
      projectedAvailable:current?.projectedAvailable??0,projectedDeficit:current?.projectedDeficit??0,
      demand,worked:specialtyWorked,noShows:activity?.noShows??0,hours:num(activity?.hours),
      attendance:demand?Math.round(specialtyWorked/demand*100):100,
    };
  }).sort((a,b)=>b.projectedDeficit-a.projectedDeficit||a.specialty.localeCompare(b.specialty,"ru"));

  const tabs=(Object.keys(viewLabels) as ObjectAnalyticsView[]).filter(key=>key!=="economics"||canFinance);
  const href=(nextView:ObjectAnalyticsView,nextPeriod=period)=>`/objects/${objectId}?tab=analytics&analyticsView=${nextView}&period=${nextPeriod}`;

  const attention=[
    projectedDeficit>0?{tone:"warn" as const,title:`Прогнозный дефицит: ${projectedDeficit}`,text:`Через 30 дней прогнозируется ${projectedAvailable} из ${required} человек.`,href:`/objects/${objectId}?tab=staffing`,action:"Комплектация"}:null,
    noShows>0?{tone:"bad" as const,title:`Невыходы за период: ${noShows}`,text:`Явка составляет ${attendance}% от потребности смен.`,href:`/objects/${objectId}?tab=shifts`,action:"Смены"}:null,
    timesheet&&Math.abs(num(timesheet.discrepancy))>0?{tone:"warn" as const,title:`Расхождение табеля: ${num(timesheet.discrepancy).toLocaleString("ru-RU")} ч`,text:"Внутренний факт отличается от последнего клиентского подтверждения.",href:`/objects/${objectId}?tab=timesheets`,action:"Табель"}:null,
    openIncidents>0?{tone:criticalIncidents?"bad" as const:"warn" as const,title:`Открытые инциденты: ${openIncidents}`,text:criticalIncidents?`Критических: ${criticalIncidents}`:"Требуется контроль закрытия и последствий.",href:`/objects/${objectId}?tab=quality`,action:"Инциденты"}:null,
    canFinance&&latestFinance&&num(latestFinance.marginPct)<18?{tone:"warn" as const,title:`Маржа: ${pct(latestFinance.marginPct)}`,text:latestFinance.planMarginPct!=null?`Плановая маржа: ${pct(latestFinance.planMarginPct)}`:"Проверьте структуру затрат объекта.",href:`/objects/${objectId}?tab=finance`,action:"Финансы"}:null,
  ].filter(Boolean) as Array<{tone:"good"|"warn"|"bad";title:string;text:string;href:string;action:string}>;

  return <div className="object-analytics">
    <div className="object-analytics-commandbar">
      <div className="object-local-tabs object-analytics-tabs" role="tablist" aria-label="Раздел аналитики">
        {tabs.map(key=><Link key={key} className={view===key?"active":""} href={href(key)}>{viewLabels[key]}</Link>)}
      </div>
      <div className="object-analytics-period"><span>Период</span><div className="segmented">{["7","30","month","90"].map(key=><Link key={key} className={period===key?"active":""} href={href(view,key)}>{periodLabels[key]}</Link>)}</div></div>
    </div>

    {view==="summary"&&<>
      <div className="metrics-grid object-analytics-metrics">
        <div className="metric"><span>Укомплектованность</span><strong>{coverage}%</strong><small>{working} из {required||"—"} работают</small></div>
        <div className={"metric tone-"+(attendance<85?"bad":attendance<97?"warn":"good")}><span>Выполнение смен</span><strong>{attendance}%</strong><small>{worked} фактических выходов из {shiftDemand||"—"}</small></div>
        <div className={"metric "+(noShows?"tone-bad":"tone-good")}><span>Невыходы</span><strong>{noShows}</strong><small>за выбранный период</small></div>
        <div className="metric"><span>Отработано часов</span><strong>{Math.round(hours).toLocaleString("ru-RU")}</strong><small>{timesheet?`клиент подтвердил ${num(timesheet.clientHours).toLocaleString("ru-RU")} ч`:"внутренний факт"}</small></div>
      </div>

      <section className="section object-analytics-attention">
        <div className="section-head"><div><h2>Требует внимания</h2><p>Отклонения, которые можно сразу разобрать в рабочем контуре объекта.</p></div><span className="cell-sub">{attention.length?`сигналов ${attention.length}`:"отклонений нет"}</span></div>
        {attention.length?<div className="stack-list object-analytics-attention-list">{attention.map(item=><div className="stack-item" key={item.title}><div><Status tone={item.tone}>{item.title}</Status><small>{item.text}</small></div><Link className="button" href={item.href}>{item.action}</Link></div>)}</div>:<div className="empty-inline">По основным контурам критичных отклонений не обнаружено.</div>}
      </section>

      <div className="analytics-dashboard-grid object-analytics-dashboard-grid">
        <section className="section"><div className="section-head"><div><h2>Комплектация в динамике</h2><p>Плановая численность и фактически назначенные сотрудники.</p></div></div>{data.daily.length?<ObjectAnalyticsTrendChart rows={data.daily} mode="staffing"/>:<div className="empty-inline">За выбранный период данных нет.</div>}</section>
        <section className="section"><div className="section-head"><div><h2>Выполнение смен</h2><p>Потребность смен против фактических выходов по табелю.</p></div></div>{data.daily.length?<ObjectAnalyticsTrendChart rows={data.daily} mode="attendance"/>:<div className="empty-inline">За выбранный период данных нет.</div>}</section>
      </div>

      <SpecialtyTable rows={specialtyRows} objectId={objectId}/>
    </>}

    {view==="workforce"&&<>
      <div className="metrics-grid object-analytics-metrics">
        <div className="metric"><span>Работает сейчас</span><strong>{working}</strong><small>план {required||"—"}</small></div>
        <div className="metric"><span>Подтверждено к выходу</span><strong>{confirmedStarts}</strong><small>учтены в прогнозе</small></div>
        <div className={"metric "+(plannedExits?"tone-warn":"tone-good")}><span>Планирует выбытие</span><strong>{plannedExits}</strong><small>на горизонте 30 дней</small></div>
        <div className={"metric "+(projectedDeficit?"tone-warn":"tone-good")}><span>Прогнозный дефицит</span><strong>{projectedDeficit}</strong><small>после выходов и выбытий</small></div>
      </div>
      <section className="section"><div className="section-head"><div><h2>Движение персонала</h2><p>Новые назначения и завершения назначений по неделям.</p></div></div>{data.movements.length?<ObjectAnalyticsMovementChart rows={data.movements}/>:<div className="empty-inline">За период движения персонала не зафиксировано.</div>}</section>
      <SpecialtyTable rows={specialtyRows} objectId={objectId}/>
    </>}

    {view==="attendance"&&<>
      <div className="metrics-grid object-analytics-metrics">
        <div className="metric"><span>Потребность смен</span><strong>{shiftDemand}</strong><small>человеко-выходов</small></div>
        <div className={"metric tone-"+(attendance<85?"bad":attendance<97?"warn":"good")}><span>Фактически вышли</span><strong>{worked}</strong><small>{attendance}% выполнения</small></div>
        <div className={"metric "+(noShows?"tone-bad":"tone-good")}><span>Невыходы</span><strong>{noShows}</strong><small>{shiftDemand?((noShows/shiftDemand)*100).toFixed(1):"0"}% от потребности</small></div>
        <div className="metric"><span>Часы</span><strong>{Math.round(hours).toLocaleString("ru-RU")}</strong><small>по внутреннему факту</small></div>
      </div>
      <section className="section"><div className="section-head"><div><h2>Явка по дням</h2><p>Потребность и фактический выход. Невыход считается по зафиксированному коду табеля.</p></div></div><AnalyticsLineChart rows={data.daily} series={[{key:"shiftDemand",label:"Требовалось"},{key:"worked",label:"Вышло"}]}/></section>
      <section className="section"><div className="section-head"><div><h2>Дни с отклонениями</h2><p>Показываются дни с дефицитом выхода, невыходами или инцидентами.</p></div><Link className="button" href={`/objects/${objectId}?tab=shifts`}>Открыть смены</Link></div><DailyExceptions rows={data.daily}/></section>
    </>}

    {view==="timesheet"&&<>
      <div className="metrics-grid object-analytics-metrics">
        <div className="metric"><span>Внутренний факт</span><strong>{timesheet?num(timesheet.internalHours).toLocaleString("ru-RU"):"—"}</strong><small>часов текущего табеля</small></div>
        <div className="metric"><span>Клиент подтвердил</span><strong>{timesheet?num(timesheet.clientHours).toLocaleString("ru-RU"):"—"}</strong><small>последняя клиентская версия</small></div>
        <div className={"metric "+(timesheet&&Math.abs(num(timesheet.discrepancy))>0?"tone-warn":"tone-good")}><span>Расхождение</span><strong>{timesheet?num(timesheet.discrepancy).toLocaleString("ru-RU"):"—"}</strong><small>часов</small></div>
        <div className="metric"><span>Статус</span><strong className="object-analytics-status-value">{timesheetStatusLabel(timesheet?.status)}</strong><small>{timesheet?.period??"текущий период"}</small></div>
      </div>
      <section className="section"><div className="section-head"><div><h2>Часы по неделям</h2><p>Внутренний факт из записей времени за выбранный период.</p></div></div>{weeks.length?<ObjectAnalyticsHoursChart rows={weeks}/>:<div className="empty-inline">За выбранный период часов нет.</div>}</section>
      <section className="section"><div className="section-head"><div><h2>Сверка табеля</h2><p>Внутренний факт и клиентское подтверждение остаются разными версиями.</p></div><Link className="button primary" href={`/objects/${objectId}?tab=timesheets`}>Открыть табель</Link></div>{timesheet?<div className="analytics-process-grid object-analytics-reconcile"><div><span>Внутренний факт</span><strong>{num(timesheet.internalHours).toLocaleString("ru-RU")} ч</strong><small>рабочая версия</small></div><div><span>Клиент</span><strong>{num(timesheet.clientHours).toLocaleString("ru-RU")} ч</strong><small>последнее подтверждение</small></div><div className={Math.abs(num(timesheet.discrepancy))>0?"has-attention":""}><span>Разница</span><strong>{num(timesheet.discrepancy).toLocaleString("ru-RU")} ч</strong><small>требует сверки при отклонении</small></div><div><span>Последняя версия</span><strong>{timesheetStatusLabel(timesheet.status)}</strong><small>{timesheet.period}</small></div></div>:<div className="empty-inline">Табель по объекту ещё не сформирован.</div>}</section>
    </>}

    {view==="quality"&&<>
      <div className="metrics-grid object-analytics-metrics">
        <div className="metric"><span>Инцидентов за период</span><strong>{periodIncidents}</strong><small>{periodLabels[period]??"выбранный период"}</small></div>
        <div className={"metric "+(openIncidents?"tone-warn":"tone-good")}><span>Открыто сейчас</span><strong>{openIncidents}</strong><small>требуют контроля</small></div>
        <div className={"metric "+(criticalIncidents?"tone-bad":"tone-good")}><span>Критические</span><strong>{criticalIncidents}</strong><small>среди открытых</small></div>
        <div className={"metric "+(financialIncidents.length?"tone-warn":"tone-good")}><span>Финансовые последствия</span><strong>{financialIncidents.length}</strong><small>{rub(financialIncidents.reduce((sum,row)=>sum+num(row.financialEffectAmount),0))}</small></div>
      </div>
      <div className="analytics-dashboard-grid object-analytics-dashboard-grid">
        <section className="section"><div className="section-head"><div><h2>Инциденты по дням</h2><p>Динамика зарегистрированных событий за период.</p></div></div>{data.daily.length?<ObjectAnalyticsTrendChart rows={data.daily} mode="incidents"/>:<div className="empty-inline">За выбранный период данных нет.</div>}</section>
        <section className="section"><div className="section-head"><div><h2>Структура инцидентов</h2><p>Категории за выбранный период.</p></div></div>{data.incidentTypes.length?<ObjectAnalyticsCategoryChart rows={data.incidentTypes.map(row=>({label:incidentTypeLabels[row.type]??row.type,value:row.count}))}/>:<div className="empty-inline">Инцидентов за выбранный период нет.</div>}</section>
      </div>
      <section className="section"><div className="section-head"><div><h2>Последние инциденты</h2><p>Рабочий журнал остаётся во вкладке «Инциденты».</p></div><Link className="button" href={`/objects/${objectId}?tab=quality`}>Открыть журнал</Link></div><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Событие</th><th>Дата</th><th>Серьёзность</th><th>Ответственный</th><th>Статус</th></tr></thead><tbody>{incidents.slice(0,12).map(row=><tr key={row.id}><td><strong>{row.title}</strong><span className="cell-sub">{incidentTypeLabels[row.type]??row.type}</span></td><td>{row.occurredAt}</td><td><Status tone={row.severity==="critical"?"bad":row.severity==="high"?"warn":"neutral"}>{row.severity==="critical"?"Критический":row.severity==="high"?"Высокий":"Обычный"}</Status></td><td>{row.responsible??"Не назначен"}</td><td>{row.status==="resolved"||row.status==="closed"?"Закрыт":"В работе"}</td></tr>)}</tbody></table></div></section>
    </>}

    {view==="economics"&&canFinance&&<>
      <div className="metrics-grid object-analytics-metrics">
        <div className="metric"><span>Выручка</span><strong>{latestFinance?rub(latestFinance.revenue):"—"}</strong><small>последний факт</small></div>
        <div className="metric"><span>Персонал</span><strong>{latestFinance?rub(latestFinance.workerCost):"—"}</strong><small>затраты на работников</small></div>
        <div className="metric"><span>Прочие расходы</span><strong>{latestFinance?rub(latestFinance.expenses):"—"}</strong><small>операционные расходы</small></div>
        <div className={"metric "+(latestFinance?"tone-"+(num(latestFinance.marginPct)<10?"bad":num(latestFinance.marginPct)<18?"warn":"good"):"")}><span>Маржа</span><strong>{latestFinance?pct(latestFinance.marginPct):"—"}</strong><small>{latestFinance?.planMarginPct!=null?`план ${pct(latestFinance.planMarginPct)}`:"фактическая"}</small></div>
      </div>
      <section className="section"><div className="section-head"><div><h2>Маржа в динамике</h2><p>Фактические P&amp;L-снимки объекта по периодам.</p></div></div>{finance.length?<ObjectAnalyticsMarginChart rows={finance}/>:<div className="empty-inline">Финансовая история объекта пока отсутствует.</div>}</section>
      <section className="section"><div className="section-head"><div><h2>P&amp;L объекта</h2><p>Исторические фактические снимки; редактирование остаётся в финансовом контуре.</p></div><Link className="button primary" href={`/objects/${objectId}?tab=finance`}>Финансы объекта</Link></div><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Период</th><th>Выручка</th><th>Персонал</th><th>Расходы</th><th>Вклад</th><th>Маржа</th></tr></thead><tbody>{finance.map(row=><tr key={row.id}><td>{formatDate(row.periodStart)}–{formatDate(row.periodEnd)}</td><td className="num">{rub(row.revenue)}</td><td className="num">{rub(row.workerCost)}</td><td className="num">{rub(row.expenses)}</td><td className="num">{rub(row.contribution)}</td><td><Status tone={toneByMargin(num(row.marginPct))}>{pct(row.marginPct)}</Status></td></tr>)}{!finance.length&&<tr><td colSpan={6}><div className="empty-inline">P&amp;L-снимки по объекту пока отсутствуют.</div></td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}

function SpecialtyTable({rows,objectId}:{rows:Array<{specialtyId:string;specialty:string;required:number;working:number;confirmedStarts:number;plannedExits:number;projectedAvailable:number;projectedDeficit:number;demand:number;worked:number;noShows:number;hours:number;attendance:number}>;objectId:string}){
  return <section className="section"><div className="section-head"><div><h2>Разрез по профессиям</h2><p>Комплектация, прогноз и фактическое выполнение смен в одной строке.</p></div><Link className="button" href={`/objects/${objectId}?tab=staffing`}>Комплектация</Link></div><div className="request-table-wrap"><table className="data-table object-analytics-specialty-table"><thead><tr><th>Профессия</th><th>План</th><th>Работает</th><th>К выходу</th><th>Уходит</th><th>Прогноз</th><th>Дефицит</th><th>Явка</th><th>Часы</th></tr></thead><tbody>{rows.map(row=><tr key={row.specialtyId}><td className="cell-title">{row.specialty}</td><td className="num">{row.required||"—"}</td><td className="num">{row.working}</td><td className="num">{row.confirmedStarts||"—"}</td><td className="num">{row.plannedExits||"—"}</td><td className="num">{row.projectedAvailable||"—"}</td><td className="num"><Status tone={row.projectedDeficit?"warn":"good"}>{row.projectedDeficit}</Status></td><td>{row.demand?<div className="object-coverage object-analytics-coverage"><div className="progress"><span style={{width:Math.min(100,row.attendance)+"%"}}/></div><span>{row.attendance}%</span></div>:<span className="cell-sub">Нет смен</span>}</td><td className="num">{Math.round(row.hours).toLocaleString("ru-RU")}</td></tr>)}</tbody></table></div></section>;
}

function DailyExceptions({rows}:{rows:ObjectAnalyticsDailyPoint[]}){
  const exceptions=rows.filter(row=>row.noShows>0||row.incidents>0||row.worked<row.shiftDemand).slice(-20).reverse();
  return <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Дата</th><th>Требовалось</th><th>Назначено</th><th>Вышло</th><th>Невыходы</th><th>Инциденты</th><th>Выполнение</th></tr></thead><tbody>{exceptions.map(row=>{const rate=row.shiftDemand?Math.round(row.worked/row.shiftDemand*100):100;return <tr key={row.date}><td>{formatDate(row.date)}</td><td className="num">{row.shiftDemand||"—"}</td><td className="num">{row.shiftAssigned||"—"}</td><td className="num">{row.worked||"—"}</td><td className="num">{row.noShows||"—"}</td><td className="num">{row.incidents||"—"}</td><td>{row.shiftDemand?<div className="object-coverage object-analytics-coverage"><div className="progress"><span style={{width:Math.min(100,rate)+"%"}}/></div><span>{rate}%</span></div>:<span className="cell-sub">—</span>}</td></tr>})}{!exceptions.length&&<tr><td colSpan={7}><div className="empty-inline">Дней с отклонениями за выбранный период нет.</div></td></tr>}</tbody></table></div>;
}

