export type RecruitingMetricFormat="number"|"percent"|"days"|"hours";
export type RecruitingMetricDirection="higher"|"lower"|"neutral";
export type RecruitingMetricKey=
  |"staffing_deficit"
  |"staffing_coverage"
  |"staffing_required"
  |"staffing_working"
  |"total_candidates"
  |"conversion_to_start"
  |"in_work"
  |"ready"
  |"started"
  |"avg_days_to_start"
  |"avg_first_contact_hours"
  |"overdue_first_contact"
  |"rejected"
  |"no_show";

export type RecruitingMetricDefinition={
  key:RecruitingMetricKey;
  label:string;
  description:string;
  format:RecruitingMetricFormat;
  direction:RecruitingMetricDirection;
  comparison:boolean;
  defaultVisible:boolean;
  defaultPosition:number;
};

export type RecruitingMetricPreference={
  key:RecruitingMetricKey;
  label:string;
  visible:boolean;
  position:number;
  targetValue:number|null;
};

export const recruitingMetricCatalog:RecruitingMetricDefinition[]=[
  {key:"staffing_deficit",label:"Нужно найти",description:"Остаток плановой численности с учётом фактически работающих.",format:"number",direction:"lower",comparison:false,defaultVisible:true,defaultPosition:10},
  {key:"staffing_coverage",label:"Закрытие потребности",description:"Доля фактически работающих от плановой численности.",format:"percent",direction:"higher",comparison:false,defaultVisible:true,defaultPosition:20},
  {key:"started",label:"Вышли на работу",description:"Кандидаты выбранного периода, дошедшие до фактического выхода.",format:"number",direction:"higher",comparison:true,defaultVisible:true,defaultPosition:30},
  {key:"conversion_to_start",label:"Конверсия до выхода",description:"Доля кандидатов периода, дошедших до фактического выхода.",format:"percent",direction:"higher",comparison:true,defaultVisible:true,defaultPosition:40},
  {key:"avg_first_contact_hours",label:"Время до первого контакта",description:"Среднее время от попадания кандидата в подбор до первого контакта.",format:"hours",direction:"lower",comparison:true,defaultVisible:true,defaultPosition:50},
  {key:"ready",label:"Готовы к выходу",description:"Кандидаты, которые на конец периода находятся на этапе готовности к выходу.",format:"number",direction:"higher",comparison:true,defaultVisible:true,defaultPosition:60},
  {key:"overdue_first_contact",label:"Без контакта > 4 ч",description:"Новые кандидаты, с которыми не связались в течение четырёх часов.",format:"number",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:70},
  {key:"total_candidates",label:"Кандидаты за период",description:"Все кандидаты, попавшие в подбор за выбранный период.",format:"number",direction:"neutral",comparison:true,defaultVisible:false,defaultPosition:80},
  {key:"in_work",label:"В работе на конец периода",description:"Активные кандидаты, ещё не вышедшие и не выбывшие к концу периода.",format:"number",direction:"neutral",comparison:true,defaultVisible:false,defaultPosition:90},
  {key:"avg_days_to_start",label:"Среднее время до выхода",description:"Среднее время от попадания кандидата в подбор до фактического выхода.",format:"days",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:100},
  {key:"rejected",label:"Отказы",description:"Кандидаты периода, завершившие подбор отказом.",format:"number",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:110},
  {key:"no_show",label:"Не вышли",description:"Кандидаты периода, которые были готовы, но не вышли на работу.",format:"number",direction:"lower",comparison:true,defaultVisible:false,defaultPosition:120},
  {key:"staffing_required",label:"Плановая численность",description:"Суммарный план по активным потребностям в выбранном контуре.",format:"number",direction:"neutral",comparison:false,defaultVisible:false,defaultPosition:130},
  {key:"staffing_working",label:"Фактически работают",description:"Количество действующих сотрудников на выбранных объектах и специальностях.",format:"number",direction:"higher",comparison:false,defaultVisible:false,defaultPosition:140},
];

const catalogByKey=new Map(recruitingMetricCatalog.map(item=>[item.key,item]));

export function isRecruitingMetricKey(value:string):value is RecruitingMetricKey{return catalogByKey.has(value as RecruitingMetricKey)}
export function recruitingMetricDefinition(key:RecruitingMetricKey){return catalogByKey.get(key)!}

export function defaultRecruitingMetricPreferences():RecruitingMetricPreference[]{
  return recruitingMetricCatalog.map(item=>({
    key:item.key,label:item.label,visible:item.defaultVisible,position:item.defaultPosition,targetValue:null,
  }));
}
