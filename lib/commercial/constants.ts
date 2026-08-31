export const requestStages = [
  "new","clarification","ready_for_calculation","calculation","approval","proposal_prepared","proposal_sent","negotiation","accepted",
] as const;

export type RequestStage = typeof requestStages[number];

export const requestStageLabels: Record<RequestStage,string> = {
  new: "Новая",
  clarification: "Уточнение",
  ready_for_calculation: "Готова к расчёту",
  calculation: "Расчёт",
  approval: "Согласование",
  proposal_prepared: "КП подготовлено",
  proposal_sent: "КП отправлено",
  negotiation: "Переговоры",
  accepted: "Принято",
};

export const requestStageTones: Record<RequestStage,"neutral"|"info"|"warn"|"good"> = {
  new:"info",clarification:"warn",ready_for_calculation:"info",calculation:"info",approval:"warn",proposal_prepared:"info",proposal_sent:"info",negotiation:"warn",accepted:"good",
};

export const closeReasonLabels: Record<string,string> = {
  irrelevant:"Неактуально",
  client_refused:"Клиент отказался",
  price:"Не устроила цена",
  competitor:"Выбран конкурент",
  cancelled:"Проект отменён",
  postponed:"Проект перенесён",
  no_feedback:"Нет обратной связи",
  staffing_impossible:"Не можем обеспечить персонал",
  terms:"Не сошлись по условиям",
  duplicate:"Дубль",
  other:"Другое",
};

export const provisionLabels: Record<string,string> = {
  workwear:"Спецодежда",ppe:"СИЗ",food:"Питание",housing:"Проживание",shuttle:"Развозка",travel:"Проезд иногородних",medical:"Медосмотр",medbook:"Медкнижка",training:"Обучение",permits:"Допуски",tools:"Инструменты",other:"Другие расходы",
};

export const providerLabels: Record<string,string> = { client:"Заказчик",ours:"Мы",not_required:"Не требуется" };

export const calculationViewLabels = { all:"Все", request:"По заявкам", standalone:"Самостоятельные" } as const;
export const rateViewLabels = { market:"Рыночные ориентиры", calculation:"Наши расчёты", object_fact:"Факт объектов" } as const;

export const approvalStatusLabels: Record<string,string> = { pending:"Ожидает решения",approved:"Согласовано",rejected:"Отклонено",rework:"На доработку" };
export const commentTypeLabels: Record<string,string> = { comment:"Комментарий",call:"Звонок",client_clarification:"Уточнение клиента",decision:"Решение",internal_note:"Внутреннее примечание" };
