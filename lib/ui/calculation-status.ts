const labels: Record<string,string> = {
  draft: "Черновик", review: "На согласовании", pending: "На согласовании",
  accepted: "Принято", rejected: "Отклонено", superseded: "Историческая версия", approved: "Согласовано",
};
export function calculationStatusLabel(value: string): string {
  return labels[value] ?? (/^[a-z_]+$/i.test(value) ? "Другой статус" : value);
}
