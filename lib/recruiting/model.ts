export const recruitingStages = [
  "new",
  "interview",
  "documents",
  "clearance",
  "preparation",
  "first_shift",
  "retention_7",
  "retention_30",
] as const;

export const recruitingTerminalStages = ["rejected", "no_show", "reserve"] as const;
export type RecruitingStage = typeof recruitingStages[number] | typeof recruitingTerminalStages[number];

export const recruitingStageLabels: Record<RecruitingStage, string> = {
  new: "Новый контакт",
  interview: "Интервью",
  documents: "Документы для оформления",
  clearance: "Оформление и допуски",
  preparation: "Подготовка к выходу",
  first_shift: "Первый выход",
  retention_7: "7 дней",
  retention_30: "30 дней",
  rejected: "Отказ",
  no_show: "Не вышел",
  reserve: "Резерв",
};

export const legacyStageMap: Record<string, RecruitingStage> = {
  call: "interview",
  contact: "interview",
  manager_review: "documents",
  approved: "documents",
  ready: "preparation",
  started: "first_shift",
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
  referral: "Рекомендация сотрудника / кандидата",
  company_database: "База компании / импорт",
  agency: "Агентство",
  site: "Сайт",
  manual: "Ручной ввод",
};

export const contactChannelLabels: Record<string, string> = {
  phone: "Телефон",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  max: "MAX",
  email: "Email",
  other: "Другой",
};
