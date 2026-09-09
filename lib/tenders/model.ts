export const tenderStages = [
  { code:"new", label:"Новые", color:"neutral" },
  { code:"analysis", label:"Анализ", color:"blue" },
  { code:"clarification", label:"Требует уточнения", color:"amber" },
  { code:"calculation", label:"Расчёт", color:"violet" },
  { code:"approval", label:"Согласование", color:"orange" },
  { code:"preparation", label:"Подготовка", color:"cyan" },
  { code:"submitted", label:"Подано", color:"green" },
  { code:"awaiting_result", label:"Ожидаем результат", color:"blue" },
  { code:"completed", label:"Завершён", color:"neutral" },
] as const;

export type TenderStage = typeof tenderStages[number]["code"];
export type TenderDecision = "undecided"|"participate"|"needs_clarification"|"no_bid";
export type TenderResult = "won"|"lost"|"no_bid"|"cancelled"|"failed";

export const tenderDecisionLabels:Record<string,string>={
  undecided:"Не принято",participate:"Участвуем",needs_clarification:"Нужно уточнить",no_bid:"Не участвуем",
};
export const tenderResultLabels:Record<string,string>={
  won:"Выиграли",lost:"Проиграли",no_bid:"Не участвовали",cancelled:"Отменён заказчиком",failed:"Не состоялся",
};
export const tenderBillingLabels:Record<string,string>={
  unknown:"Не определено",hour:"чел./час",shift:"чел./смена",worker_month:"чел./месяц",unit:"единица",piecework:"сдельно",project:"фикс / проект",mixed:"смешанная",
};
export const tenderPriorityLabels:Record<string,string>={low:"Низкий",normal:"Обычный",high:"Высокий"};
export const tenderPotentialLabels:Record<string,string>={low:"Низкий",medium:"Средний",high:"Высокий"};
export const tenderAssignmentLabels:Record<string,string>={
  owner:"Владелец тендера",analyst:"Аналитик",calculator:"Расчёт",documents:"Документы",legal:"Юридическая проверка",approver:"Согласующий",submission:"Подача на площадку",
};
export const tenderDocumentStatusLabels:Record<string,string>={
  available:"Есть в компании",update_needed:"Нужно обновить",prepare:"Нужно подготовить",requested:"Запрошен",ready:"Готов",not_required:"Не требуется",
};

export function tenderStageLabel(code:string){return tenderStages.find(item=>item.code===code)?.label??code;}

export type DeadlineState={key:"overdue"|"today"|"urgent"|"week"|"later"|"none";label:string;days:number|null};
export function tenderDeadlineState(value:string|null|undefined,now=new Date()):DeadlineState{
  if(!value)return {key:"none",label:"Срок не указан",days:null};
  const date=new Date(value);if(Number.isNaN(date.getTime()))return {key:"none",label:"Срок не указан",days:null};
  const diff=date.getTime()-now.getTime();const days=Math.ceil(diff/86400000);
  if(diff<0)return {key:"overdue",label:"Срок прошёл",days};
  if(days<=1)return {key:"today",label:"Сегодня",days};
  if(days<=3)return {key:"urgent",label:`${days} дн.`,days};
  if(days<=7)return {key:"week",label:`${days} дн.`,days};
  return {key:"later",label:`${days} дн.`,days};
}

export function tenderIsCompleted(stage:string){return stage==="completed";}
export function tenderNeedsAttention(value:string|null|undefined,now=new Date()){
  const state=tenderDeadlineState(value,now);return ["overdue","today","urgent"].includes(state.key);
}
