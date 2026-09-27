export type SiteVisitChecklistStatus="pending"|"confirmed"|"issue"|"na";

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
};

const checklist=(id:string,section:string,label:string,required=true,category="operations",blocksLaunch=false):SiteVisitChecklistItem=>({
  id,section,label,required,status:"pending",value:"",note:"",category,blocksLaunch,
});

export function defaultPrimarySiteVisitChecklist():SiteVisitChecklistItem[]{
  return [
    checklist("access-entry","Доступ","Точный въезд / проходная и место встречи",true,"access",true),
    checklist("access-contact","Доступ","Кто встречает новых сотрудников и контакт",true,"access",true),
    checklist("access-docs","Доступ","Какие документы нужны для пропуска",true,"access",true),
    checklist("access-deadline","Доступ","За сколько дней подавать списки на пропуска",true,"access",true),
    checklist("access-days","Доступ","В какие дни можно выводить новичков",true,"staffing",true),
    checklist("access-limit","Доступ","Максимум новичков за один вывод",false,"staffing",false),

    checklist("work-duties","Работа","Фактические обязанности по каждой позиции",true,"operations",true),
    checklist("work-location","Работа","Где проходит работа: помещение / улица / смешанно",true,"operations",false),
    checklist("work-load","Работа","Физическая нагрузка и критические требования",true,"operations",false),
    checklist("work-supervisor","Работа","Кто ставит задачи и принимает результат",true,"operations",true),

    checklist("schedule-shift","График","Фактическое время смен",true,"operations",true),
    checklist("schedule-arrival","График","Во сколько сотрудник должен быть на месте",true,"operations",true),
    checklist("schedule-breaks","График","Перерывы и обед",false,"operations",false),
    checklist("schedule-pattern","График","Допустимые графики 5/2, 6/1, вахта и т. п.",true,"staffing",false),

    checklist("housing-required","Проживание","Требуется ли проживание сотрудникам",true,"housing",false),
    checklist("housing-options","Проживание","Есть ли жильё заказчика или рекомендованные варианты",false,"housing",false),
    checklist("transport-required","Транспорт","Нужна ли развозка",true,"transport",false),
    checklist("transport-points","Транспорт","Точки посадки / место остановки автобуса",false,"transport",false),
    checklist("meals","Питание","Как организовано питание и режим столовой",false,"meals",false),

    checklist("ppe-client","СИЗ и форма","Что выдаёт заказчик",true,"supply",false),
    checklist("ppe-company","СИЗ и форма","Что должна предоставить наша компания",true,"supply",true),
    checklist("ppe-first-day","СИЗ и форма","Можно ли первый день выйти в своей одежде",false,"supply",false),
    checklist("ppe-issue","СИЗ и форма","Где и кто выдаёт СИЗ / форму",false,"supply",false),

    checklist("infra-changing","Быт и инфраструктура","Есть ли раздевалка, шкафчики и место хранения вещей",false,"supply",false),
    checklist("infra-wc","Быт и инфраструктура","Где туалет, вода и место для приёма пищи",false,"operations",false),
    checklist("infra-parking","Быт и инфраструктура","Где парковаться сотрудникам и служебному транспорту",false,"transport",false),
    checklist("infra-photo","Быт и инфраструктура","Можно ли делать фото / видео на объекте и какие есть ограничения",false,"access",false),

    checklist("time-confirm","Учёт времени","Кто подтверждает выход сотрудника",true,"operations",true),
    checklist("time-source","Учёт времени","Источник факта: турникет / табель / мастер",true,"operations",true),
    checklist("time-deadline","Учёт времени","Когда заказчик передаёт / подтверждает табель",true,"operations",false),
    checklist("time-overtime","Учёт времени","Кто подтверждает переработки и замены",false,"operations",false),
    checklist("time-reporting","Учёт времени","Кому, в каком формате и к какому времени отправлять ежедневную отчётность",true,"operations",false),

    checklist("quality-acceptance","Качество и ответственность","По каким критериям заказчик принимает работу смены",true,"operations",false),
    checklist("quality-violations","Качество и ответственность","Какие нарушения считаются критичными и как фиксируются",true,"operations",false),
    checklist("quality-penalties","Качество и ответственность","Есть ли штрафы / удержания и кто подтверждает основание",false,"operations",false),
    checklist("quality-replacement","Качество и ответственность","Как согласуется срочная замена сотрудника",true,"staffing",false),

    checklist("staff-plan","Потребность","Плановая численность по позициям и сменам",true,"staffing",true),
    checklist("staff-minimum","Потребность","Минимальный состав для первого запуска",true,"staffing",true),
    checklist("staff-priority","Потребность","Какие позиции / смены закрывать в первую очередь",true,"staffing",false),
    checklist("staff-restrictions","Потребность","Ограничения: опыт, допуски, гражданство и другие требования",true,"staffing",false),

    checklist("contacts-night","Контакты","Контакт дневной и ночной смены",true,"operations",true),
    checklist("contacts-channel","Контакты","Основной канал связи: чат / телефон / почта и кто должен быть в нём",true,"operations",false),
    checklist("contacts-escalation","Контакты","Кому эскалировать проблемы запуска",true,"operations",true),
    checklist("contacts-response","Контакты","Кто принимает решение при невыходе, конфликте или остановке работ",true,"operations",true),
  ];
}


export function mergePrimarySiteVisitChecklist(saved:SiteVisitChecklistItem[]|null|undefined):SiteVisitChecklistItem[]{
  const defaults=defaultPrimarySiteVisitChecklist();
  const savedById=new Map((saved??[]).map(item=>[item.id,item]));
  return defaults.map(item=>{
    const existing=savedById.get(item.id);
    return existing?{...item,...existing,id:item.id,section:item.section,label:item.label,category:item.category,required:item.required,blocksLaunch:item.blocksLaunch}:item;
  });
}
