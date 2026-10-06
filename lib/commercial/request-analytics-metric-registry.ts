export type RequestAnalyticsMetricFormat="number"|"percent"|"days"|"hours";
export type RequestAnalyticsMetricDirection="higher"|"lower"|"neutral";
export type RequestAnalyticsMetricKey=
  |"active_requests"
  |"active_headcount"
  |"proposal_client"
  |"negotiation"
  |"attention"
  |"new_requests"
  |"new_headcount"
  |"agreed_requests"
  |"agreed_headcount"
  |"conversion_requests"
  |"conversion_headcount"
  |"avg_cycle_days"
  |"avg_time_to_proposal_days"
  |"lost_requests"
  |"lost_headcount"
  |"unassigned";

export type RequestAnalyticsMetricDefinition={
  key:RequestAnalyticsMetricKey;
  label:string;
  description:string;
  format:RequestAnalyticsMetricFormat;
  direction:RequestAnalyticsMetricDirection;
  comparison:boolean;
  defaultVisible:boolean;
  defaultPosition:number;
};

export type RequestAnalyticsMetricPreference={
  key:RequestAnalyticsMetricKey;
  label:string;
  visible:boolean;
  position:number;
  targetValue:number|null;
};

export const requestAnalyticsMetricCatalog:RequestAnalyticsMetricDefinition[]=[
  {key:"active_requests",label:"Активные заявки",description:"Заявки, которые сейчас находятся в коммерческой работе.",format:"number",direction:"neutral",comparison:false,defaultVisible:true,defaultPosition:10},
  {key:"active_headcount",label:"Численность в работе",description:"Суммарная потребность по активным заявкам.",format:"number",direction:"neutral",comparison:false,defaultVisible:true,defaultPosition:20},
  {key:"agreed_requests",label:"Согласовано заявок",description:"Заявки выбранного периода, дошедшие до согласования.",format:"number",direction:"higher",comparison:true,defaultVisible:true,defaultPosition:30},
  {key:"conversion_requests",label:"Конверсия до согласования",description:"Доля заявок периода, дошедших до согласования.",format:"percent",direction:"higher",comparison:true,defaultVisible:true,defaultPosition:40},
  {key:"avg_cycle_days",label:"Средний коммерческий цикл",description:"Среднее время от создания заявки до согласования.",format:"days",direction:"lower",comparison:true,defaultVisible:true,defaultPosition:50},
  {key:"attention",label:"Требуют внимания",description:"Активные заявки без ответственного или без изменений более 7 дней.",format:"number",direction:"lower",comparison:false,defaultVisible:true,defaultPosition:60},
  {key:"proposal_client",label:"КП у заказчика",description:"Активные заявки на этапе ожидания реакции заказчика.",format:"number",direction:"neutral",comparison:false,defaultVisible:false,defaultPosition:70},
  {key:"negotiation",label:"Переговоры",description:"Активные заявки на этапе переговоров и доработки.",format:"number",direction:"neutral",comparison:false,defaultVisible:false,defaultPosition:80},
  {key:"new_requests",label:"Новые заявки",description:"Заявки, созданные в выбранном периоде.",format:"number",direction:"neutral",comparison:true,defaultVisible:false,defaultPosition:90},
  {key:"new_headcount",label:"Новая численность",description:"Суммарная численность по заявкам, созданным в выбранном периоде.",format:"number",direction:"neutral",comparison:true,defaultVisible:false,defaultPosition:100},
  {key:"agreed_headcount",label:"Согласовано человек",description:"Численность по заявкам периода, дошедшим до согласования.",format:"number",direction:"higher",comparison:true,defaultVisible:false,defaultPosition:110},
  {key:"conversion_headcount",label:"Конверсия по численности",description:"Доля заявленной численности, дошедшей до согласования.",format:"percent",direction:"higher",comparison:true,defaultVisible:false,defaultPosition:120},
  {key:"avg_time_to_proposal_days",label:"Время до первого КП",description:"Среднее время от создания заявки до первой отправки КП.",format:"days",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:130},
  {key:"lost_requests",label:"Не согласовано",description:"Заявки выбранного периода, завершившиеся несогласованием.",format:"number",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:140},
  {key:"lost_headcount",label:"Потерянная численность",description:"Численность по несогласованным заявкам выбранного периода.",format:"number",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:150},
  {key:"unassigned",label:"Без ответственного",description:"Активные заявки, у которых не назначен ответственный.",format:"number",direction:"lower",comparison:false,defaultVisible:false,defaultPosition:160},
];

const byKey=new Map(requestAnalyticsMetricCatalog.map(item=>[item.key,item]));
export function isRequestAnalyticsMetricKey(value:string):value is RequestAnalyticsMetricKey{return byKey.has(value as RequestAnalyticsMetricKey)}
export function requestAnalyticsMetricDefinition(key:RequestAnalyticsMetricKey){return byKey.get(key)!}
export function defaultRequestAnalyticsMetricPreferences():RequestAnalyticsMetricPreference[]{return requestAnalyticsMetricCatalog.map(item=>({key:item.key,label:item.label,visible:item.defaultVisible,position:item.defaultPosition,targetValue:null}))}
