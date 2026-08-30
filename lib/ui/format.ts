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
