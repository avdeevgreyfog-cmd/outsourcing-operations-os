export function rub(value: unknown) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);
}

export function num(value: unknown) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(Number(value ?? 0));
}

export function pct(value: unknown) {
  return `${num(value)}%`;
}

export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const roles: Record<string, string> = {
  director: "Директор",
  sales_manager: "Менеджер по продажам",
  regional_manager: "Региональный менеджер",
  object_manager: "Менеджер объекта",
  recruiter: "Рекрутер",
  economist: "Экономист",
  finance: "Финансист",
};

const models: Record<string, string> = {
  "Employment / TK": "Трудовой договор",
  Employment: "Трудовой договор",
  GPH: "Договор ГПХ",
  NPD: "Самозанятый",
  TK: "Трудовой договор",
  gross: "До вычета налогов",
  net: "На руки",
};

export function roleLabel(code: string, fallback?: string) {
  return roles[code] ?? fallback ?? code;
}

export function modelLabel(value: unknown) {
  const key = String(value ?? "");
  return models[key] ?? key;
}

