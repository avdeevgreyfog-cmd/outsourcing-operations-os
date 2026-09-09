export const proposalStatusLabels: Record<string, string> = {
  draft: "Черновик",
  internal_review: "Внутреннее согласование",
  approved: "Согласовано внутри",
  sent: "У клиента",
  negotiation: "Переговоры",
  accepted: "Принято клиентом",
  revision_requested: "На доработке",
  client_rejected: "Отказ клиента",
  rejected_internal: "Отклонено внутри",
  launched: "Передано в запуск",
};

export const proposalUnitLabels: Record<string, string> = {
  hour: "чел./час",
  shift: "чел./смена",
  unit: "единица",
  piece: "за единицу",
  piecework: "сдельно",
  worker_month: "чел./месяц",
  project_month: "проект/месяц",
  project_fixed: "проект",
  mixed: "сдельно / переменная единица",
};

export function proposalStatusLabel(status: string) {
  return proposalStatusLabels[status] ?? (/[A-Za-z_]/.test(status) ? "В работе" : status);
}

export function proposalTone(status: string) {
  if (["accepted", "launched"].includes(status)) return "good" as const;
  if (["client_rejected", "rejected_internal"].includes(status)) return "bad" as const;
  if (["draft", "revision_requested"].includes(status)) return "neutral" as const;
  if (["sent", "negotiation", "approved"].includes(status)) return "info" as const;
  return "warn" as const;
}

export function proposalDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function proposalDay(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
}
