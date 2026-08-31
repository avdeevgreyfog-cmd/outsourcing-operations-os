export const requestStageLabels: Record<string,string> = {
  new: "Новая",
  clarification: "Уточнение",
  ready_for_calculation: "Готова к расчёту",
  calculation: "Расчёт",
  approval: "Согласование",
  proposal_ready: "КП подготовлено",
  proposal_sent: "КП отправлено",
  negotiation: "Переговоры",
  accepted: "Принято",
};

export const requestOutcomeLabels: Record<string,string> = {
  open: "В работе",
  accepted: "Принято",
  closed: "Закрыта",
};

export const closeReasonLabels: Record<string,string> = {
  irrelevant: "Неактуально",
  client_declined: "Клиент отказался",
  price: "Не устроила цена",
  competitor: "Выбран конкурент",
  cancelled: "Проект отменён",
  postponed: "Проект перенесён",
  no_feedback: "Нет обратной связи",
  staffing_impossible: "Не можем обеспечить персонал",
  terms: "Не сошлись по условиям",
  duplicate: "Дубль",
  other: "Другое",
};

export const approvalStatusLabels: Record<string,string> = {
  pending: "На согласовании",
  approved: "Согласовано",
  rejected: "Отклонено",
  revision_requested: "На доработку",
};

export const proposalStatusLabels: Record<string,string> = {
  draft: "Черновик",
  prepared: "Подготовлено",
  sent: "Отправлено",
  negotiation: "Переговоры",
  accepted: "Принято",
  rejected: "Отклонено",
  expired: "Истёк срок",
};

export const commentTypeLabels: Record<string,string> = {
  comment: "Комментарий",
  call: "Звонок",
  client_clarification: "Уточнение клиента",
  decision: "Решение",
  internal_note: "Внутреннее примечание",
};

export function requestStageLabel(value:string){return requestStageLabels[value] ?? value;}
export function requestOutcomeLabel(value:string){return requestOutcomeLabels[value] ?? value;}
export function approvalStatusLabel(value:string){return approvalStatusLabels[value] ?? value;}
export function proposalStatusLabel(value:string){return proposalStatusLabels[value] ?? value;}
export function commentTypeLabel(value:string){return commentTypeLabels[value] ?? value;}
