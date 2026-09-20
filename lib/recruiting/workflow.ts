import { recruitingStages, type RecruitingStage } from "./model";
export type WorkflowDetails = {
  nextActionText?: string; plannedShift?: string; confirmed?: boolean;
  readiness?: boolean; reviewRecipient?: string; reviewDueAt?: string;
  reserveReason?: string; lastContact?: string;
  contactOutcome?: "interested"|"callback"|"no_answer"|"declined"|"documents_requested"|"documents_received"|"other";
  travelStatus?: "not_required"|"planning"|"ticket_required"|"ticket_purchased"|"travelling"|"arrived";
  arrivalDetails?: string;
};
export type WorkflowRow = { stage: RecruitingStage; nextActionAt?: string | null; plannedStartDate: string | null; stageEnteredAt?: string | null; workflow?: WorkflowDetails };
export type StageChange = { stage: RecruitingStage; reason?: string; reasonCode?: string; nextActionAt?: string | null; plannedStartDate?: string | null; actualStartAt?: string | null; workflow?: WorkflowDetails; expectedStage?: string; expectedUpdatedAt?: string };
export const reserveReasons = ["Кандидат готов позже", "Нет свободных мест", "Ожидание другой потребности", "Не подходит объект", "Другая специальность"];
export function isActiveStage(stage: string) { return !["started", "rejected", "no_show", "reserve"].includes(stage); }
export function needsTransitionDetails(from: RecruitingStage, to: RecruitingStage) {
  if(recruitingStages.indexOf(to as typeof recruitingStages[number]) < recruitingStages.indexOf(from as typeof recruitingStages[number])) return true;
  return ["manager_review","approved","preparation","ready","started","rejected","no_show","reserve"].includes(to) || Math.abs(recruitingStages.indexOf(to as typeof recruitingStages[number])-recruitingStages.indexOf(from as typeof recruitingStages[number])) > 1;
}
export function validateStageChange(row: WorkflowRow, change: StageChange, now = Date.now()): string | null {
  const details={...row.workflow,...change.workflow};
  const planned=change.plannedStartDate === undefined ? row.plannedStartDate : change.plannedStartDate;
  if(row.stage === "started" && change.stage !== "started") return "Фактический выход уже зафиксирован. Завершите назначение в карточке сотрудника; для нового подбора используйте другую потребность.";
  if(change.stage === "manager_review" && (!details.reviewRecipient?.trim() || !details.reviewDueAt || !Number.isFinite(Date.parse(details.reviewDueAt)))) return "Укажите получателя согласования и срок решения.";
  if(change.stage === "approved" && row.stage !== "approved" && !change.reason?.trim()) return "Зафиксируйте решение согласующего.";
  if(change.stage === "ready" && (!planned || !details.plannedShift?.trim() || !details.confirmed || !details.readiness)) return "Для готовности нужны дата, смена, подтверждение кандидата и проверка подготовки.";
  if(change.stage === "started" && row.stage !== "started") {
    if(row.stage !== "ready") return "Сначала подтвердите готовность к выходу.";
    if(!change.actualStartAt || !Number.isFinite(Date.parse(change.actualStartAt)) || Date.parse(change.actualStartAt)>now) return "Укажите фактическое время выхода, не позднее текущего.";
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
  if(!row.nextActionAt && isActiveStage(row.stage)) result.push("Нет следующего действия");
  if(row.stage==="ready") {
    if(!row.plannedStartDate) result.push("Не назначена дата выхода");
    else if(Date.parse(row.plannedStartDate+"T23:59:59Z")<now) result.push("Выход не подтверждён фактом");
    if(!row.workflow?.confirmed) result.push("Нет подтверждения кандидата");
  }
  if(row.stage==="manager_review" && row.workflow?.reviewDueAt && Date.parse(row.workflow.reviewDueAt)<now) result.push("Просрочено согласование");
  return result;
}
export function formatWorkDate(value?: string | null) { return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",timeZone:"Europe/Moscow"}).format(new Date(value)) : "—"; }


export type RecruitingDisplayStage = RecruitingStage | "retention_7" | "retention_30";

export function displayRecruitingStage(row: Pick<WorkflowRow,"stage"> & {actualStartAt?:string|null}, now=Date.now()): RecruitingDisplayStage {
  if(row.stage!=="started"||!row.actualStartAt||!Number.isFinite(Date.parse(row.actualStartAt))) return row.stage;
  const days=Math.floor((now-Date.parse(row.actualStartAt))/86400000);
  if(days>=30)return "retention_30";
  if(days>=7)return "retention_7";
  return "started";
}
