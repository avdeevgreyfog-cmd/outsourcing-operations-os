export type TenderAnalyticsMetricFormat="number"|"percent"|"days"|"hours"|"currency";
export type TenderAnalyticsMetricDirection="higher"|"lower"|"neutral";
export type TenderAnalyticsMetricKey=
  |"active_tenders"
  |"participating"
  |"deadline_3d"
  |"submitted_active"
  |"awaiting_result"
  |"attention"
  |"new_tenders"
  |"incoming_value"
  |"incoming_headcount"
  |"submitted_tenders"
  |"submitted_value"
  |"submitted_headcount"
  |"won_tenders"
  |"won_value"
  |"won_headcount"
  |"win_rate_tenders"
  |"win_rate_value"
  |"win_rate_headcount"
  |"avg_decision_hours"
  |"avg_cycle_days"
  |"avg_submission_lead_hours"
  |"blocker_tenders"
  |"unassigned"
  |"no_bid_count"
  |"lost_count";

export type TenderAnalyticsMetricDefinition={
  key:TenderAnalyticsMetricKey;
  label:string;
  description:string;
  format:TenderAnalyticsMetricFormat;
  direction:TenderAnalyticsMetricDirection;
  comparison:boolean;
  defaultVisible:boolean;
  defaultPosition:number;
};

export type TenderAnalyticsMetricPreference={
  key:TenderAnalyticsMetricKey;
  label:string;
  visible:boolean;
  position:number;
  targetValue:number|null;
};

export const tenderAnalyticsMetricCatalog:TenderAnalyticsMetricDefinition[]=[
  {key:"active_tenders",label:"Активные тендеры",description:"Тендеры, которые сейчас находятся в рабочем контуре.",format:"number",direction:"neutral",comparison:false,defaultVisible:true,defaultPosition:10},
  {key:"participating",label:"Участвуем",description:"Активные тендеры, по которым принято решение участвовать.",format:"number",direction:"neutral",comparison:false,defaultVisible:true,defaultPosition:20},
  {key:"won_tenders",label:"Выиграно",description:"Тендеры выбранного периода с результатом «Выиграли».",format:"number",direction:"higher",comparison:true,defaultVisible:true,defaultPosition:30},
  {key:"win_rate_tenders",label:"Win rate",description:"Доля побед среди тендеров с конкурентным результатом: выиграли или проиграли.",format:"percent",direction:"higher",comparison:true,defaultVisible:true,defaultPosition:40},
  {key:"avg_decision_hours",label:"Время до Bid / No Bid",description:"Среднее время от регистрации тендера до решения участвовать или не участвовать.",format:"hours",direction:"lower",comparison:true,defaultVisible:true,defaultPosition:50},
  {key:"attention",label:"Требуют внимания",description:"Активные тендеры с дедлайном, блокерами, отсутствием решения, ответственного или следующего действия.",format:"number",direction:"lower",comparison:false,defaultVisible:true,defaultPosition:60},
  {key:"deadline_3d",label:"Подача ≤ 3 дней",description:"Активные тендеры со сроком подачи в ближайшие три дня или уже просроченные.",format:"number",direction:"lower",comparison:false,defaultVisible:false,defaultPosition:70},
  {key:"submitted_active",label:"Подано",description:"Активные тендеры, которые уже поданы на площадку.",format:"number",direction:"neutral",comparison:false,defaultVisible:false,defaultPosition:80},
  {key:"awaiting_result",label:"Ожидаем результат",description:"Поданные тендеры, находящиеся в ожидании результата.",format:"number",direction:"neutral",comparison:false,defaultVisible:false,defaultPosition:90},
  {key:"new_tenders",label:"Новые тендеры",description:"Тендеры, зарегистрированные за выбранный период.",format:"number",direction:"neutral",comparison:true,defaultVisible:false,defaultPosition:100},
  {key:"incoming_value",label:"Входящая стоимость",description:"Суммарная НМЦК / бюджет тендеров, зарегистрированных за период.",format:"currency",direction:"neutral",comparison:true,defaultVisible:false,defaultPosition:110},
  {key:"incoming_headcount",label:"Входящая численность",description:"Суммарная заявленная численность в тендерах периода.",format:"number",direction:"neutral",comparison:true,defaultVisible:false,defaultPosition:120},
  {key:"submitted_tenders",label:"Подано за период",description:"Тендеры периода, дошедшие до подачи.",format:"number",direction:"higher",comparison:true,defaultVisible:false,defaultPosition:130},
  {key:"submitted_value",label:"Подано на сумму",description:"Входящая стоимость тендеров периода, дошедших до подачи.",format:"currency",direction:"higher",comparison:true,defaultVisible:false,defaultPosition:140},
  {key:"submitted_headcount",label:"Поданная численность",description:"Численность по тендерам периода, дошедшим до подачи.",format:"number",direction:"higher",comparison:true,defaultVisible:false,defaultPosition:150},
  {key:"won_value",label:"Выиграно на сумму",description:"Суммарная стоимость выигранных тендеров периода.",format:"currency",direction:"higher",comparison:true,defaultVisible:false,defaultPosition:160},
  {key:"won_headcount",label:"Выигранная численность",description:"Суммарная численность по выигранным тендерам периода.",format:"number",direction:"higher",comparison:true,defaultVisible:false,defaultPosition:170},
  {key:"win_rate_value",label:"Win rate по сумме",description:"Доля стоимости выигранных тендеров среди выигранных и проигранных.",format:"percent",direction:"higher",comparison:true,defaultVisible:false,defaultPosition:180},
  {key:"win_rate_headcount",label:"Win rate по численности",description:"Доля численности выигранных тендеров среди выигранных и проигранных.",format:"percent",direction:"higher",comparison:true,defaultVisible:false,defaultPosition:190},
  {key:"avg_cycle_days",label:"Средний цикл до результата",description:"Среднее время от регистрации тендера до зафиксированного результата.",format:"days",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:200},
  {key:"avg_submission_lead_hours",label:"Запас до подачи",description:"Средний запас времени между фактической подачей и дедлайном.",format:"hours",direction:"higher",comparison:true,defaultVisible:false,defaultPosition:210},
  {key:"blocker_tenders",label:"Блокеры документов",description:"Активные тендеры с документными блокерами.",format:"number",direction:"lower",comparison:false,defaultVisible:false,defaultPosition:220},
  {key:"unassigned",label:"Без ответственного",description:"Активные тендеры без назначенного владельца.",format:"number",direction:"lower",comparison:false,defaultVisible:false,defaultPosition:230},
  {key:"no_bid_count",label:"Не участвуем",description:"Тендеры периода, по которым принято решение не участвовать.",format:"number",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:240},
  {key:"lost_count",label:"Проиграно",description:"Тендеры периода с результатом «Проиграли».",format:"number",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:250},
];

const byKey=new Map(tenderAnalyticsMetricCatalog.map(item=>[item.key,item]));
export function isTenderAnalyticsMetricKey(value:string):value is TenderAnalyticsMetricKey{return byKey.has(value as TenderAnalyticsMetricKey)}
export function tenderAnalyticsMetricDefinition(key:TenderAnalyticsMetricKey){return byKey.get(key)!}
export function defaultTenderAnalyticsMetricPreferences():TenderAnalyticsMetricPreference[]{return tenderAnalyticsMetricCatalog.map(item=>({key:item.key,label:item.label,visible:item.defaultVisible,position:item.defaultPosition,targetValue:null}))}
