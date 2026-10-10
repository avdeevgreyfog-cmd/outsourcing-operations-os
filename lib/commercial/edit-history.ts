export type EditChange={field:string;label:string;before:unknown;after:unknown};
const nestedLabels:Record<string,string>={paidHours:"Оплачиваемых часов",presenceHours:"Часов присутствия",pattern:"График",customPattern:"Другой график",shiftStart:"Начало смены",shiftEnd:"Конец смены",shiftType:"Тип смены",lunchMinutes:"Обед, минут",lunchPaid:"Оплата обеда",provider:"Кто обеспечивает",cost:"Стоимость",unit:"Единица",comment:"Комментарий",name:"Имя",phone:"Телефон",email:"Эл. почта",position:"Должность",housing:"Проживание",travel:"Проезд",shuttle:"Развозка",ppe:"СИЗ",medical:"Медосмотр",tools:"Инструменты",billingUnit:"Формат оплаты",clientLimit:"Лимит заказчика",clientLimitVatMode:"НДС",paymentTerms:"Срок оплаты",startHeadcount:"Первый вывод",guaranteedHours:"Гарантия часов",workerCategories:"Категории работников",documentChecks:"Документы и проверки",subject:"Предмет закупки",workFormat:"Формат работ",schedule:"График",region:"Регион",projectDuration:"Срок работ",guaranteedVolume:"Гарантированный объём",requestLeadTime:"Срок подачи заявки",vatMode:"НДС",bidSecurity:"Обеспечение заявки",contractSecurity:"Обеспечение договора",participantRequirements:"Требования участникам",penaltiesRisks:"Штрафы и риски",openQuestions:"Открытые вопросы"};
function record(value:unknown):value is Record<string,unknown>{return value!==null&&typeof value==="object"&&!Array.isArray(value);}
export function editChanges(before:Record<string,unknown>,after:Record<string,unknown>,labels:Record<string,string>):EditChange[]{
 return Object.entries(labels).flatMap(([field,label])=>{
  const old=before[field]??null,next=after[field]??null;if(JSON.stringify(old)===JSON.stringify(next))return [];
  if(record(old)&&record(next)){const keys=[...new Set([...Object.keys(old),...Object.keys(next)])];return editChanges(old,next,Object.fromEntries(keys.map(key=>[key,nestedLabels[key]??"Дополнительный параметр"]))).map(change=>({...change,field:`${field}.${change.field}`,label:`${label} · ${change.label}`}));}
  return [{field,label,before:old,after:next}];
 });
}
export const clientEditLabels={name:"Название",legalName:"Юридическое наименование",inn:"ИНН",status:"Статус",notes:"Внутренние заметки",ownerUserId:"Ответственный",regionId:"Регион",teamId:"Команда"};
export const tenderEditLabels={title:"Название",customerName:"Заказчик",platform:"Площадка",procedureNumber:"Номер процедуры",sourceUrl:"Ссылка",sourceName:"Источник",publicationDate:"Дата публикации",submissionDeadline:"Срок подачи",initialPrice:"НМЦК",billingUnit:"Формат цены",priority:"Приоритет",potential:"Потенциал",regionId:"Регион",legalEntityId:"Юрлицо",nextActionText:"Следующее действие",nextActionAt:"Срок действия",analysisSummary:"Заключение аналитика",conditions:"Условия анализа"};

export function requestAuditChanges(before:Record<string,unknown>,after:Record<string,unknown>):EditChange[]{
 const labels={title:"Название",source:"Источник",location_text:"Объект",expected_start_date:"Дата старта",duration_text:"Срок работ",owner_user_id:"Ответственный",client_company_id:"Клиент",region_id:"Регион",vat_mode:"НДС",comments:"Комментарий",count_required:"Численность",specialty_id:"Специальность",target_client_rate:"Ориентир ставки",schedule_json:"График",requirements_json:"Требования позиции"};
 const changes=editChanges(before,after,labels);
 const oldIntake=(before.intake_json??{}) as Record<string,unknown>,newIntake=(after.intake_json??{}) as Record<string,unknown>;
 return [...changes,...editChanges(oldIntake,newIntake,{companyName:"Наименование заказчика",contact:"Контакт по заявке",object:"Условия объекта",schedule:"График и часы",volume:"Объём",provision:"Обеспечение",logistics:"Логистика",compliance:"Требования к работникам",commercial:"Коммерческие ориентиры"})];
}
