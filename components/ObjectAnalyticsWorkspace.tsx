import Link from "next/link";
import { Status } from "@/components/UI";
import type { TimesheetData, IncidentRow } from "@/lib/data/service";
import type { StaffingForecastRow } from "@/lib/operations/service";
import type { ObjectAnalyticsDetail, ObjectAnalyticsDailyPoint, ObjectAnalyticsMovementPoint } from "@/lib/operations/object-analytics";
import { pct, rub } from "@/lib/ui/format";

type AnalyticsView="summary"|"workforce"|"attendance"|"timesheet"|"quality"|"economics";
type FinanceSnapshot={
  id:string;objectId:string;periodStart?:string|null;periodEnd?:string|null;
  revenue:number|string;workerCost:number|string;expenses:number|string;contribution:number|string;marginPct:number|string;planMarginPct?:number|string|null;
};

const viewLabels:Record<AnalyticsView,string>={
  summary:"Сводка",workforce:"Персонал",attendance:"Смены и явка",timesheet:"Табель",quality:"Качество",economics:"Экономика",
};
const periodLabels:Record<string,string>={"7":"7 дней","30":"30 дней",month:"Текущий месяц","90":"3 месяца"};
const incidentTypeLabels:Record<string,string>={no_show:"Невыход",discipline:"Дисциплина",quality:"Качество",safety:"Безопасность",client_claim:"Претензия клиента",damage:"Ущерб",other:"Другое"};

function clamp(value:number){return Math.max(0,Math.min(100,value))}
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
  view:AnalyticsView;
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

  const activityBySpecialty=new Map(data.specialties.map(row=>[row.specialtyId,row]));
  const specialtyRows=[...new Map([
    ...forecast.map(row=>[row.specialtyId,{specialtyId:row.specialtyId,specialty:row.specialty}]),
    ...data.specialties.map(row=>[row.specialtyId,{specialtyId:row.specialtyId,specialty:row.specialty}]),
  ]).values()].map(base=>{
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

  const tabs=(Object.keys(viewLabels) as AnalyticsView[]).filter(key=>key!=="economics"||canFinance);
  const href=(nextView:AnalyticsView,nextPeriod=period)=>`/objects/${objectId}?tab=analytics&analyticsView=${nextView}&period=${nextPeriod}`;

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
        {attention.length?<div className="object-analytics-signal-list">{attention.map(item=><div key={item.title}><Status tone={item.tone}>{item.title}</Status><span>{item.text}</span><Link className="table-link" href={item.href}>{item.action}</Link></div>)}</div>:<div className="empty-inline">По основным контурам критичных отклонений не обнаружено.</div>}
      </section>

      <div className="object-analytics-chart-grid">
        <section className="section"><div className="section-head"><div><h2>Комплектация в динамике</h2><p>Плановая численность и фактически назначенные сотрудники.</p></div></div><AnalyticsLineChart rows={data.daily} series={[{key:"planned",label:"План"},{key:"working",label:"Работает"}]}/></section>
        <section className="section"><div className="section-head"><div><h2>Выполнение смен</h2><p>Потребность смен против фактических выходов по табелю.</p></div></div><AnalyticsLineChart rows={data.daily} series={[{key:"shiftDemand",label:"Требовалось"},{key:"worked",label:"Вышло"}]}/></section>
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
      <section className="section"><div className="section-head"><div><h2>Движение персонала</h2><p>Новые назначения и завершения назначений по неделям.</p></div></div><MovementChart rows={data.movements}/></section>
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
      <section className="section"><div className="section-head"><div><h2>Часы по неделям</h2><p>Внутренний факт из записей времени за выбранный период.</p></div></div><HoursChart rows={weeks}/></section>
      <section className="section"><div className="section-head"><div><h2>Сверка табеля</h2><p>Внутренний факт и клиентское подтверждение остаются разными версиями.</p></div><Link className="button primary" href={`/objects/${objectId}?tab=timesheets`}>Открыть табель</Link></div>{timesheet?<div className="object-analytics-reconcile"><div><span>Внутренний факт</span><strong>{num(timesheet.internalHours).toLocaleString("ru-RU")} ч</strong></div><div><span>Клиент</span><strong>{num(timesheet.clientHours).toLocaleString("ru-RU")} ч</strong></div><div className={Math.abs(num(timesheet.discrepancy))>0?"has-attention":""}><span>Разница</span><strong>{num(timesheet.discrepancy).toLocaleString("ru-RU")} ч</strong></div><div><span>Последняя версия</span><strong>{timesheetStatusLabel(timesheet.status)}</strong></div></div>:<div className="empty-inline">Табель по объекту ещё не сформирован.</div>}</section>
    </>}

    {view==="quality"&&<>
      <div className="metrics-grid object-analytics-metrics">
        <div className="metric"><span>Инцидентов за период</span><strong>{periodIncidents}</strong><small>{periodLabels[period]??"выбранный период"}</small></div>
        <div className={"metric "+(openIncidents?"tone-warn":"tone-good")}><span>Открыто сейчас</span><strong>{openIncidents}</strong><small>требуют контроля</small></div>
        <div className={"metric "+(criticalIncidents?"tone-bad":"tone-good")}><span>Критические</span><strong>{criticalIncidents}</strong><small>среди открытых</small></div>
        <div className={"metric "+(financialIncidents.length?"tone-warn":"tone-good")}><span>Финансовые последствия</span><strong>{financialIncidents.length}</strong><small>{rub(financialIncidents.reduce((sum,row)=>sum+num(row.financialEffectAmount),0))}</small></div>
      </div>
      <div className="object-analytics-chart-grid">
        <section className="section"><div className="section-head"><div><h2>Инциденты по дням</h2><p>Динамика зарегистрированных событий за период.</p></div></div><AnalyticsLineChart rows={data.daily} series={[{key:"incidents",label:"Инциденты"}]}/></section>
        <section className="section"><div className="section-head"><div><h2>Структура инцидентов</h2><p>Категории за выбранный период.</p></div></div><CategoryBars rows={data.incidentTypes.map(row=>({label:incidentTypeLabels[row.type]??row.type,value:row.count}))}/></section>
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
      <section className="section"><div className="section-head"><div><h2>Маржа в динамике</h2><p>Фактические P&amp;L-снимки объекта по периодам.</p></div></div><FinanceMarginChart rows={finance}/></section>
      <section className="section"><div className="section-head"><div><h2>P&amp;L объекта</h2><p>Исторические фактические снимки; редактирование остаётся в финансовом контуре.</p></div><Link className="button primary" href={`/objects/${objectId}?tab=finance`}>Финансы объекта</Link></div><div className="request-table-wrap"><table className="data-table"><thead><tr><th>Период</th><th>Выручка</th><th>Персонал</th><th>Расходы</th><th>Вклад</th><th>Маржа</th></tr></thead><tbody>{finance.map(row=><tr key={row.id}><td>{formatDate(row.periodStart)}–{formatDate(row.periodEnd)}</td><td className="num">{rub(row.revenue)}</td><td className="num">{rub(row.workerCost)}</td><td className="num">{rub(row.expenses)}</td><td className="num">{rub(row.contribution)}</td><td><Status tone={toneByMargin(num(row.marginPct))}>{pct(row.marginPct)}</Status></td></tr>)}{!finance.length&&<tr><td colSpan={6}><div className="empty-inline">P&amp;L-снимки по объекту пока отсутствуют.</div></td></tr>}</tbody></table></div></section>
    </>}
  </div>;
}

function SpecialtyTable({rows,objectId}:{rows:Array<{specialtyId:string;specialty:string;required:number;working:number;confirmedStarts:number;plannedExits:number;projectedAvailable:number;projectedDeficit:number;demand:number;worked:number;noShows:number;hours:number;attendance:number}>;objectId:string}){
  return <section className="section"><div className="section-head"><div><h2>Разрез по профессиям</h2><p>Комплектация, прогноз и фактическое выполнение смен в одной строке.</p></div><Link className="button" href={`/objects/${objectId}?tab=staffing`}>Комплектация</Link></div><div className="request-table-wrap"><table className="data-table object-analytics-specialty-table"><thead><tr><th>Профессия</th><th>План</th><th>Работает</th><th>К выходу</th><th>Уходит</th><th>Прогноз</th><th>Дефицит</th><th>Явка</th><th>Часы</th></tr></thead><tbody>{rows.map(row=><tr key={row.specialtyId}><td className="cell-title">{row.specialty}</td><td className="num">{row.required||"—"}</td><td className="num">{row.working}</td><td className="num">{row.confirmedStarts||"—"}</td><td className="num">{row.plannedExits||"—"}</td><td className="num">{row.projectedAvailable||"—"}</td><td className="num"><Status tone={row.projectedDeficit?"warn":"good"}>{row.projectedDeficit}</Status></td><td><Status tone={toneByCoverage(row.attendance)}>{row.demand?row.attendance+"%":"—"}</Status></td><td className="num">{Math.round(row.hours).toLocaleString("ru-RU")}</td></tr>)}</tbody></table></div></section>;
}

function AnalyticsLineChart({rows,series}:{rows:ObjectAnalyticsDailyPoint[];series:Array<{key:keyof ObjectAnalyticsDailyPoint;label:string}>}){
  if(!rows.length)return <div className="empty-inline">За выбранный период данных нет.</div>;
  const width=1000,height=210,padX=24,padY=18;
  const values=rows.flatMap(row=>series.map(item=>num(row[item.key] as number)));
  const max=Math.max(1,...values);
  const points=(key:keyof ObjectAnalyticsDailyPoint)=>rows.map((row,index)=>{
    const x=rows.length===1?width/2:padX+index/(rows.length-1)*(width-padX*2);
    const y=height-padY-(num(row[key] as number)/max)*(height-padY*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const labels=rows.length<=12?rows:rows.filter((_,index)=>index===0||index===rows.length-1||index%Math.ceil(rows.length/6)===0);
  return <div className="object-analytics-line-chart">
    <div className="object-analytics-legend">{series.map((item,index)=><span key={item.label}><i data-series={index}/>{item.label}</span>)}</div>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-label={series.map(item=>item.label).join(" и ")}>
      {[0.25,0.5,0.75].map(value=><line key={value} x1={padX} x2={width-padX} y1={height*value} y2={height*value} className="grid"/>)}
      {series.map((item,index)=><polyline key={item.label} points={points(item.key)} className={`series series-${index}`} fill="none" vectorEffect="non-scaling-stroke"/>)}
    </svg>
    <div className="object-analytics-chart-labels">{labels.map(row=><span key={row.date}>{row.label}</span>)}</div>
  </div>;
}

function MovementChart({rows}:{rows:ObjectAnalyticsMovementPoint[]}){
  if(!rows.length)return <div className="empty-inline">За период движения персонала не зафиксировано.</div>;
  const max=Math.max(1,...rows.flatMap(row=>[row.started,row.ended]));
  return <div className="object-analytics-bars">{rows.map(row=><div key={row.periodStart}><span>{row.label}</span><div><i className="started" style={{height:`${Math.max(4,row.started/max*100)}%`}} title={`Принято: ${row.started}`}/><i className="ended" style={{height:`${Math.max(4,row.ended/max*100)}%`}} title={`Выбыло: ${row.ended}`}/></div><small>+{row.started} / −{row.ended}</small></div>)}</div>;
}

function HoursChart({rows}:{rows:Array<{label:string;hours:number;demand:number;worked:number;noShows:number}>}){
  if(!rows.length)return <div className="empty-inline">За выбранный период часов нет.</div>;
  const max=Math.max(1,...rows.map(row=>row.hours));
  return <div className="object-analytics-hours">{rows.map(row=><div key={row.label}><span>{row.label}</span><div><i style={{width:`${row.hours/max*100}%`}}/></div><strong>{Math.round(row.hours).toLocaleString("ru-RU")} ч</strong><small>{row.worked} выходов · невыходов {row.noShows}</small></div>)}</div>;
}

function CategoryBars({rows}:{rows:Array<{label:string;value:number}>}){
  if(!rows.length)return <div className="empty-inline">Инцидентов за выбранный период нет.</div>;
  const max=Math.max(1,...rows.map(row=>row.value));
  return <div className="object-analytics-category-bars">{rows.map(row=><div key={row.label}><span>{row.label}</span><div><i style={{width:`${row.value/max*100}%`}}/></div><strong>{row.value}</strong></div>)}</div>;
}

function DailyExceptions({rows}:{rows:ObjectAnalyticsDailyPoint[]}){
  const exceptions=rows.filter(row=>row.noShows>0||row.incidents>0||row.worked<row.shiftDemand).slice(-20).reverse();
  return <div className="request-table-wrap"><table className="data-table"><thead><tr><th>Дата</th><th>Требовалось</th><th>Назначено</th><th>Вышло</th><th>Невыходы</th><th>Инциденты</th><th>Выполнение</th></tr></thead><tbody>{exceptions.map(row=>{const rate=row.shiftDemand?Math.round(row.worked/row.shiftDemand*100):100;return <tr key={row.date}><td>{formatDate(row.date)}</td><td className="num">{row.shiftDemand||"—"}</td><td className="num">{row.shiftAssigned||"—"}</td><td className="num">{row.worked||"—"}</td><td className="num">{row.noShows||"—"}</td><td className="num">{row.incidents||"—"}</td><td><Status tone={toneByCoverage(rate)}>{row.shiftDemand?rate+"%":"—"}</Status></td></tr>})}{!exceptions.length&&<tr><td colSpan={7}><div className="empty-inline">Дней с отклонениями за выбранный период нет.</div></td></tr>}</tbody></table></div>;
}

function FinanceMarginChart({rows}:{rows:FinanceSnapshot[]}){
  if(!rows.length)return <div className="empty-inline">Финансовая история объекта пока отсутствует.</div>;
  const ordered=[...rows].reverse();
  const max=Math.max(30,...ordered.map(row=>num(row.marginPct)));
  return <div className="object-analytics-margin-chart">{ordered.map(row=><div key={row.id}><span>{row.periodEnd?compactDate(row.periodEnd):"Период"}</span><div><i style={{height:`${clamp(num(row.marginPct)/max*100)}%`}}/></div><strong>{pct(row.marginPct)}</strong></div>)}</div>;
}
