import type { RequestIntake } from "./request-intake";

/** Public intake is stricter than the internal, intentionally incomplete draft. */
export function publicIntakeContactError(companyName: string, contact: RequestIntake["contact"]): string | null {
  if (companyName.trim().length < 2 || companyName.trim().length > 240) return "Укажите название компании";
  if (contact.name.trim().length < 2 || contact.name.trim().length > 160) return "Укажите имя контактного лица (от 2 до 160 символов)";
  const phone = contact.phone.trim();
  const email = contact.email.trim();
  if (!phone && !email) return "Укажите телефон или электронную почту для обратной связи";
  if (phone && (phone.length > 40 || !/^[+\d\s().-]+$/.test(phone) || phone.replace(/\D/g, "").length < 7 || phone.replace(/\D/g, "").length > 15)) return "Проверьте телефон: укажите от 7 до 15 цифр";
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return "Проверьте адрес электронной почты";
  return null;
}

export class PublicIntakeInputError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
