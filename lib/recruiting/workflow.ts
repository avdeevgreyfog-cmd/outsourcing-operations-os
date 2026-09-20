import { recruitingStages, type RecruitingStage } from "./model";

export type WorkflowDetails = {
  nextActionText?: string;
  plannedShift?: string;
  confirmed?: boolean;
  readiness?: boolean;
  reserveReason?: string;
  lastContact?: string;
  contactAttempts?: number;
  travelState?: "not_required"|"self"|"company"|"ticket_required"|"ticket_bought";
  travelNote?: string;
  arrivalAt?: string;
  documentsReceived?: number;
  documentsRequired?: number;
  missingDocuments?: string[];
};

export type WorkflowRow = {
  stage: RecruitingStage;
  nextActionAt?: string | null;
  plannedStartDate: string | null;
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
  if(toIndex<0) return true;
  if(fromIndex<0) return true;
  return toIndex<fromIndex || toIndex>fromIndex+1 || ["documents","preparation","first_shift","retention_7","retention_30"].includes(to);
}

export function validateStageChange(row: WorkflowRow, change: StageChange, now = Date.now()): string | null {
  const details={...row.workflow,...change.workflow};
  const planned=change.plannedStartDate === undefined ? row.plannedStartDate : change.plannedStartDate;
  const actualStart=change.actualStartAt === undefined ? row.actualStartAt : change.actualStartAt;

  if(["first_shift","retention_7","retention_30"].includes(row.stage) && recruitingStages.indexOf(change.stage as typeof recruitingStages[number]) < recruitingStages.indexOf(row.stage as typeof recruitingStages[number])) {
    return "После фактического выхода этап нельзя вернуть назад. Для выбытия используйте завершение заявки.";
  }
  if(change.stage === "preparation" && !planned) return "Укажите плановую дату выхода.";
  if(change.stage === "first_shift" && row.stage !== "first_shift") {
    if(!planned) return "Перед первым выходом укажите плановую дату.";
    if(!change.actualStartAt || !Number.isFinite(Date.parse(change.actualStartAt)) || Date.parse(change.actualStartAt)>now) return "Укажите фактическое время первого выхода, не позднее текущего.";
  }
  if(change.stage === "retention_7") {
    if(!actualStart || !Number.isFinite(Date.parse(actualStart))) return "Сначала зафиксируйте первый выход.";
    if(now-Date.parse(actualStart)<7*24*60*60*1000) return "С момента первого выхода ещё не прошло 7 дней.";
  }
  if(change.stage === "retention_30") {
    if(!actualStart || !Number.isFinite(Date.parse(actualStart))) return "Сначала зафиксируйте первый выход.";
    if(now-Date.parse(actualStart)<30*24*60*60*1000) return "С момента первого выхода ещё не прошло 30 дней.";
  }
  if(["rejected","no_show"].includes(change.stage) && !change.reasonCode) return "Выберите причину выбытия.";
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
  if(!row.nextActionAt && ["new","interview","documents","preparation"].includes(row.stage)) result.push("Нет следующего действия");
  if(row.stage==="documents" && (row.workflow?.documentsRequired??0)>0 && (row.workflow?.documentsReceived??0)<(row.workflow?.documentsRequired??0)) result.push("Не все документы получены");
  if(row.stage==="preparation") {
    if(!row.plannedStartDate) result.push("Не назначена дата выхода");
    if(row.workflow?.travelState==="ticket_required") result.push("Нужно купить билет");
    if(!row.workflow?.confirmed) result.push("Нет подтверждения кандидата");
  }
  return result;
}

export function formatWorkDate(value?: string | null) {
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Moscow"}).format(new Date(value))
    : "—";
}
