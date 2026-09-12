export const recruitingStages = [
  "new",
  "contact",
  "interview",
  "manager_review",
  "approved",
  "preparation",
  "ready",
  "started",
] as const;

export const recruitingTerminalStages = ["rejected", "no_show"] as const;
export type RecruitingStage = typeof recruitingStages[number] | typeof recruitingTerminalStages[number];

export const recruitingStageLabels: Record<RecruitingStage, string> = {
  new: "Новый",
  contact: "Контакт",
  interview: "Интервью",
  manager_review: "На согласовании",
  approved: "Согласован",
  preparation: "Подготовка",
  ready: "Готов к выходу",
  started: "Вышел",
  rejected: "Отказ",
  no_show: "Не вышел",
};

export const legacyStageMap: Record<string, RecruitingStage> = {
  call: "contact",
  documents: "preparation",
  first_shift: "started",
};

export function normalizeRecruitingStage(value: string | null | undefined): RecruitingStage {
  const normalized = legacyStageMap[value ?? ""] ?? value;
  return ([...recruitingStages, ...recruitingTerminalStages] as readonly string[]).includes(normalized ?? "")
    ? normalized as RecruitingStage
    : "new";
}

export const needSourceLabels: Record<string, string> = {
  commercial: "Из коммерческой заявки",
  object: "От объекта",
  manual: "Создана вручную",
  replacement: "Замена сотрудника",
  reserve: "Резерв",
  other: "Другое",
};

export const needPriorityLabels: Record<string, string> = {
  low: "Низкий",
  normal: "Обычный",
  high: "Высокий",
  critical: "Критический",
};

export const candidateSourceLabels: Record<string, string> = {
  avito: "Авито",
  hh: "hh.ru",
  telegram: "Telegram",
  vk: "VK",
  referral: "Рекомендация",
  agency: "Агентство",
  site: "Сайт",
  manual: "Ручной ввод",
};

export const contactChannelLabels: Record<string, string> = {
  phone: "Телефон",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  email: "Email",
  other: "Другой",
};
