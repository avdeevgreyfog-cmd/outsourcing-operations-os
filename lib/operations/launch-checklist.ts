export type SiteVisitChecklistStatus="pending"|"confirmed"|"issue"|"na";
export type SiteVisitAnswerKind="text"|"textarea"|"number"|"time"|"boolean";
export type SiteVisitAudience="operations"|"recruiting"|"management";

export type SiteVisitChecklistItem={
  id:string;
  section:string;
  label:string;
  required:boolean;
  status:SiteVisitChecklistStatus;
  value:string;
  note:string;
  category:string;
  blocksLaunch:boolean;
  answerKind:SiteVisitAnswerKind;
  hidden:boolean;
  custom:boolean;
  factKey:string|null;
  audiences:SiteVisitAudience[];
};

type ChecklistOptions={
  answerKind?:SiteVisitAnswerKind;
  recruiting?:boolean;
  management?:boolean;
  factKey?:string|null;
};

const checklist=(
  id:string,
  section:string,
  label:string,
  required=true,
  category="operations",
  blocksLaunch=false,
  options:ChecklistOptions={},
):SiteVisitChecklistItem=>({
  id,section,label,required,status:"pending",value:"",note:"",category,blocksLaunch,
  answerKind:options.answerKind??"text",
  hidden:false,
  custom:false,
  factKey:options.factKey===undefined?`visit.${id}`:options.factKey,
  audiences:[
    "operations",
    ...(options.recruiting?["recruiting" as const]:[]),
    ...(options.management?["management" as const]:[]),
  ],
});

export function defaultPrimarySiteVisitChecklist():SiteVisitChecklistItem[]{
  return [
    checklist("access-entry","Доступ","Точный въезд / проходная и место встречи",true,"access",true,{recruiting:true}),
    checklist("access-contact","Доступ","Кто встречает новых сотрудников и контакт",true,"access",true,{recruiting:true}),
    checklist("access-docs","Доступ","Какие документы нужны для пропуска",true,"access",true,{recruiting:true,answerKind:"textarea"}),
    checklist("access-deadline","Доступ","За сколько дней подавать списки на пропуска",true,"access",true,{recruiting:true}),
    checklist("access-days","Доступ","В какие дни можно выводить новичков",true,"staffing",true,{recruiting:true}),
    checklist("access-limit","Доступ","Максимум новичков за один вывод",false,"staffing",false,{recruiting:true,answerKind:"number"}),

    checklist("work-duties","Работа","Фактические обязанности по каждой позиции",true,"operations",true,{recruiting:true,answerKind:"textarea"}),
    checklist("work-location","Работа","Где проходит работа: помещение / улица / смешанно",true,"operations",false,{recruiting:true}),
    checklist("work-load","Работа","Физическая нагрузка и критические требования",true,"operations",false,{recruiting:true,answerKind:"textarea"}),
    checklist("work-supervisor","Работа","Кто ставит задачи и принимает результат",true,"operations",true),

    checklist("schedule-shift","График","Фактическое время смен",true,"operations",true,{recruiting:true}),
    checklist("schedule-arrival","График","Во сколько сотрудник должен быть на месте",true,"operations",true,{recruiting:true,answerKind:"time"}),
    checklist("schedule-breaks","График","Перерывы и обед",false,"operations",false,{recruiting:true}),
    checklist("schedule-pattern","График","Допустимые графики 5/2, 6/1, вахта и т. п.",true,"staffing",false,{recruiting:true}),

    checklist("housing-required","Проживание","Требуется ли проживание сотрудникам",true,"housing",false,{recruiting:true,answerKind:"boolean"}),
    checklist("housing-options","Проживание","Есть ли жильё заказчика или рекомендованные варианты",false,"housing",false,{recruiting:true,answerKind:"textarea"}),
    checklist("transport-required","Транспорт","Нужна ли развозка",true,"transport",false,{recruiting:true,answerKind:"boolean"}),
    checklist("transport-points","Транспорт","Точки посадки / место остановки автобуса",false,"transport",false,{recruiting:true,answerKind:"textarea"}),
    checklist("meals","Питание","Как организовано питание и режим столовой",false,"meals",false,{recruiting:true,answerKind:"textarea"}),

    checklist("ppe-client","СИЗ и форма","Что выдаёт заказчик",true,"supply",false,{recruiting:true,answerKind:"textarea"}),
    checklist("ppe-company","СИЗ и форма","Что должна предоставить наша компания",true,"supply",true,{recruiting:true,answerKind:"textarea"}),
    checklist("ppe-first-day","СИЗ и форма","Можно ли первый день выйти в своей одежде",false,"supply",false,{recruiting:true,answerKind:"boolean"}),
    checklist("ppe-issue","СИЗ и форма","Где и кто выдаёт СИЗ / форму",false,"supply",false,{recruiting:true}),

    checklist("infra-changing","Быт и инфраструктура","Есть ли раздевалка, шкафчики и место хранения вещей",false,"supply",false,{recruiting:true,answerKind:"textarea"}),
    checklist("infra-wc","Быт и инфраструктура","Где туалет, вода и место для приёма пищи",false,"operations",false,{recruiting:true,answerKind:"textarea"}),
    checklist("infra-parking","Быт и инфраструктура","Где парковаться сотрудникам и служебному транспорту",false,"transport",false),
    checklist("infra-photo","Быт и инфраструктура","Можно ли делать фото / видео на объекте и какие есть ограничения",false,"access",false,{answerKind:"boolean"}),

    checklist("time-confirm","Учёт времени","Кто подтверждает выход сотрудника",true,"operations",true),
    checklist("time-source","Учёт времени","Источник факта: турникет / табель / мастер",true,"operations",true),
    checklist("time-deadline","Учёт времени","Когда заказчик передаёт / подтверждает табель",true,"operations",false),
    checklist("time-overtime","Учёт времени","Кто подтверждает переработки и замены",false,"operations",false),
    checklist("time-reporting","Учёт времени","Кому, в каком формате и к какому времени отправлять ежедневную отчётность",true,"operations",false,{answerKind:"textarea"}),

    checklist("quality-acceptance","Качество и ответственность","По каким критериям заказчик принимает работу смены",true,"operations",false,{answerKind:"textarea"}),
    checklist("quality-violations","Качество и ответственность","Какие нарушения считаются критичными и как фиксируются",true,"operations",false,{answerKind:"textarea"}),
    checklist("quality-penalties","Качество и ответственность","Есть ли штрафы / удержания и кто подтверждает основание",false,"operations",false,{answerKind:"textarea"}),
    checklist("quality-replacement","Качество и ответственность","Как согласуется срочная замена сотрудника",true,"staffing",false,{recruiting:true,answerKind:"textarea"}),

    checklist("staff-plan","Потребность","Плановая численность по позициям и сменам",true,"staffing",true,{recruiting:true,management:true,answerKind:"textarea"}),
    checklist("staff-minimum","Потребность","Минимальный состав для первого запуска",true,"staffing",true,{recruiting:true,management:true,answerKind:"number"}),
    checklist("staff-priority","Потребность","Какие позиции / смены закрывать в первую очередь",true,"staffing",false,{recruiting:true,answerKind:"textarea"}),
    checklist("staff-restrictions","Потребность","Ограничения: опыт, допуски, гражданство и другие требования",true,"staffing",false,{recruiting:true,answerKind:"textarea"}),

    checklist("contacts-night","Контакты","Контакт дневной и ночной смены",true,"operations",true),
    checklist("contacts-channel","Контакты","Основной канал связи: чат / телефон / почта и кто должен быть в нём",true,"operations",false),
    checklist("contacts-escalation","Контакты","Кому эскалировать проблемы запуска",true,"operations",true),
    checklist("contacts-response","Контакты","Кто принимает решение при невыходе, конфликте или остановке работ",true,"operations",true),
  ];
}

function normalizeSavedItem(item:SiteVisitChecklistItem,fallback?:SiteVisitChecklistItem):SiteVisitChecklistItem{
  return {
    ...(fallback??item),
    ...item,
    id:fallback?.id??item.id,
    answerKind:item.answerKind??fallback?.answerKind??"text",
    hidden:Boolean(item.hidden??false),
    custom:fallback?Boolean(item.custom??false):true,
    factKey:item.factKey===undefined?(fallback?.factKey??`custom.${item.id}`):item.factKey,
    audiences:Array.isArray(item.audiences)&&item.audiences.length?item.audiences:(fallback?.audiences??["operations"]),
  };
}

export function mergePrimarySiteVisitChecklist(saved:SiteVisitChecklistItem[]|null|undefined):SiteVisitChecklistItem[]{
  const defaults=defaultPrimarySiteVisitChecklist();
  const savedRows=Array.isArray(saved)?saved:[];
  const savedById=new Map(savedRows.map(item=>[item.id,item]));
  const defaultIds=new Set(defaults.map(item=>item.id));
  const merged=defaults.map(item=>{
    const existing=savedById.get(item.id);
    return existing?normalizeSavedItem(existing,item):item;
  });
  const custom=savedRows.filter(item=>!defaultIds.has(item.id)).map(item=>normalizeSavedItem(item));
  return [...merged,...custom];
}
