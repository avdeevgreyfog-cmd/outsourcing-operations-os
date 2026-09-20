import { recruitingStages, type RecruitingStage } from "./model";

export type WorkflowDetails = {
  // Structured action/result. Free text is only for an exceptional comment.
  actionCode?: string;
  outcomeCode?: string;
  additionalComment?: string;

  // Legacy display fields kept for backward compatibility and old history snapshots.
  nextActionText?: string;
  lastContact?: string;
  contactAttempts?: number;
  plannedShift?: string;
  confirmed?: boolean;
  readiness?: boolean;
  reserveReason?: string;

  // Optional second interview with object manager/master.
  managerInterviewState?: "not_required"|"pending"|"completed";
  managerInterviewUserId?: string;

  // Arrival / logistics / accommodation.
  travelState?: "not_required"|"self"|"company"|"ticket_required"|"ticket_bought";
  travelNote?: string;
  arrivalAt?: string;
  ticketDueAt?: string;
  ticketAssigneeUserId?: string;
  housingState?: "not_required"|"needs_booking"|"booked";
  housingDueAt?: string;
  housingAssigneeUserId?: string;

  // First shift result.
  firstShiftOutcome?: "pending"|"worked"|"no_show"|"not_admitted";

  // Old document aggregate fields are read only for backward compatibility.
  documentsReceived?: number;
  documentsRequired?: number;
  missingDocuments?: string[];
};

export type WorkflowRow = {
  stage: RecruitingStage;
  nextActionAt?: string | null;
  plannedStartDate: string | null;
  plannedArrivalAt?: string | null;
  actualStartAt?: string | null;
  stageEnteredAt?: string | null;
  workflow?: WorkflowDetails;
};

export type StageChange = {
  stage: RecruitingStage;
  reason?: string;
  reasonCode?: string;
  nextActionAt?: string | null;
  plannedStartDate?: string | null;
  plannedArrivalAt?: string | null;
  actualStartAt?: string | null;
  workflow?: WorkflowDetails;
  expectedStage?: string;
  expectedUpdatedAt?: string;
  ownerUserId?: string | null;
};

export const reserveReasons = ["Кандидат готов позже", "Нет свободных мест", "Ожидание другой потребности", "Не подходит объект", "Другая специальность"];

export function isActiveStage(stage: string) {
  return !["rejected", "no_show", "reserve"].includes(stage);
}

export function needsTransitionDetails(from: RecruitingStage, to: RecruitingStage) {
  const fromIndex=recruitingStages.indexOf(from as typeof recruitingStages[number]);
  const toIndex=recruitingStages.indexOf(to as typeof recruitingStages[number]);
  if(toIndex<0 || fromIndex<0) return true;
  return toIndex<fromIndex || toIndex>fromIndex+1 || ["documents","clearance","preparation","first_shift","retention_7","retention_30"].includes(to);
}

export function validateStageChange(row: WorkflowRow, change: StageChange, now = Date.now()): string | null {
  const details={...row.workflow,...change.workflow};
  const planned=change.plannedStartDate === undefined ? row.plannedStartDate : change.plannedStartDate;
  const arrival=change.plannedArrivalAt === undefined ? row.plannedArrivalAt : change.plannedArrivalAt;
  const actualStart=change.actualStartAt === undefined ? row.actualStartAt : change.actualStartAt;

  if(["first_shift","retention_7","retention_30"].includes(row.stage) && recruitingStages.indexOf(change.stage as typeof recruitingStages[number]) < recruitingStages.indexOf(row.stage as typeof recruitingStages[number])) {
    return "После фактического выхода этап нельзя вернуть назад. Для выбытия используйте завершение заявки.";
  }
  if(change.stage !== "preparation" && details.travelState === "ticket_required" && (!details.ticketDueAt || !details.ticketAssigneeUserId)) return "Для покупки билета укажите ответственного и дедлайн.";
  if(change.stage !== "preparation" && details.housingState === "needs_booking" && (!details.housingDueAt || !details.housingAssigneeUserId)) return "Для размещения укажите ответственного и дедлайн.";
  if(change.stage === "first_shift" && row.stage !== "first_shift") {
    if(!planned) return "Перед первым выходом укажите плановую дату первого выхода.";
    if(details.travelState !== "not_required" && !arrival) return "Перед первым выходом укажите плановую дату прибытия.";
    if(details.travelState === "ticket_required" && (!details.ticketDueAt || !details.ticketAssigneeUserId)) return "Для покупки билета укажите ответственного и дедлайн.";
    if(details.housingState === "needs_booking" && (!details.housingDueAt || !details.housingAssigneeUserId)) return "Для размещения укажите ответственного и дедлайн.";
  }
  if(details.firstShiftOutcome === "worked" && (!actualStart || !Number.isFinite(Date.parse(actualStart)) || Date.parse(actualStart)>now)) {
    return "Для подтверждённого выхода укажите фактическое время первого выхода.";
  }
  if(change.stage === "retention_7") {
    if(!actualStart || !Number.isFinite(Date.parse(actualStart))) return "Сначала зафиксируйте первый выход.";
    if(now-Date.parse(actualStart)<7*24*60*60*1000) return "С момента первого выхода ещё не прошло 7 дней.";
  }
  if(change.stage === "retention_30") {
    if(!actualStart || !Number.isFinite(Date.parse(actualStart))) return "Сначала зафиксируйте первый выход.";
    if(now-Date.parse(actualStart)<30*24*60*60*1000) return "С момента первого выхода ещё не прошло 30 дней.";
  }
  if(["rejected","no_show"].includes(change.stage) && !change.reasonCode) return "Выберите причину завершения.";
  if(change.stage === "reserve" && (!details.reserveReason?.trim() || !change.nextActionAt)) return "Укажите причину резерва и дату повторного контакта.";

  const from=recruitingStages.indexOf(row.stage as typeof recruitingStages[number]);
  const to=recruitingStages.indexOf(change.stage as typeof recruitingStages[number]);
  if(from>=0 && to>=0 && (to<from || to>from+1) && !change.reason?.trim()) return "Укажите причину возврата или пропуска этапов.";
  return null;
}

export function workRisks(row: WorkflowRow, now = Date.now()): string[] {
  if(!isActiveStage(row.stage) && row.stage!=="reserve") return [];
  const result:string[]=[];
  if(row.nextActionAt && Date.parse(row.nextActionAt)<now) result.push("Просрочено действие");
  if(row.stage==="new") result.push("Нужно взять в работу");
  if(!row.nextActionAt && ["interview","documents","clearance"].includes(row.stage)) result.push("Нет следующего действия");
  if(row.stage==="interview" && row.workflow?.managerInterviewState==="pending") result.push("Ожидает интервью мастера");
  if(row.stage==="preparation") {
    if(!row.plannedStartDate) result.push("Не назначена дата выхода");
    if(row.workflow?.travelState==="ticket_required") result.push("Нужно купить билет");
    if(row.workflow?.housingState==="needs_booking") result.push("Нужно подтвердить жильё");
    if(!row.workflow?.confirmed) result.push("Нет подтверждения кандидата");
  }
  if(row.stage==="first_shift" && !row.workflow?.firstShiftOutcome) result.push("Ожидается подтверждение выхода");
  return result;
}

export function formatWorkDate(value?: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Moscow"}).format(new Date(value))
    : "—";
}
