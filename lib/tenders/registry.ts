import { normalizeRegistryLayout, type RegistryColumnLayout } from "@/lib/ui/registry-layout";
import type { TenderRow } from "@/lib/tenders/service";

export const tenderColumns = [
  { id: "identity", label: "Тендер", width: 340, required: true },
  { id: "customer", label: "Заказчик", width: 190 },
  { id: "commerce", label: "Коммерция", width: 170 },
  { id: "deadline", label: "Срок подачи", width: 160 },
  { id: "remaining", label: "До подачи", width: 145 },
  { id: "stage", label: "Этап", width: 170 },
  { id: "blockers", label: "Блокеры", width: 110 },
  { id: "owner", label: "Ответственный", width: 160 },
  { id: "platform", label: "Площадка", width: 160 },
  { id: "procedure", label: "Номер процедуры", width: 160 },
  { id: "decision", label: "Решение об участии", width: 180 },
  { id: "potential", label: "Потенциал", width: 130 },
  { id: "billing", label: "Единица расчёта", width: 130 },
  { id: "source", label: "Источник", width: 170 },
  { id: "publication", label: "Дата публикации", width: 150 },
  { id: "roles", label: "Роли", width: 120 },
  { id: "calculations", label: "Расчёты", width: 120 },
  { id: "action", label: "Следующее действие", width: 240 },
  { id: "updated", label: "Последнее изменение", width: 165 },
  { id: "result", label: "Результат", width: 160 },
] as const;

export type TenderColumnId = typeof tenderColumns[number]["id"];
export type TenderGroupId = "none" | "stage" | "owner" | "customer" | "platform" | "decision";
export type TenderRegistrySettings = RegistryColumnLayout<TenderColumnId> & {
  bucket: "active" | "completed";
  stage: string; owner: string; customer: string; platform: string; decision: string; source: string;
  deadline: "all" | "today" | "3d" | "7d";
  sort: TenderColumnId; direction: "asc" | "desc";
  group: TenderGroupId; subgroup: TenderGroupId; hideEmpty: boolean;
};

export const defaultTenderSettings: TenderRegistrySettings = {
  bucket: "active", stage: "", owner: "", customer: "", platform: "", decision: "", source: "", deadline: "all",
  columns: ["identity", "customer", "commerce", "deadline", "remaining", "stage", "blockers", "owner"],
  pinned: ["identity"], widths: {}, sort: "updated", direction: "desc", group: "none", subgroup: "none", hideEmpty: false,
};
const groupIds: readonly string[] = ["none", "stage", "owner", "customer", "platform", "decision"];
const columnIds = new Set<string>(tenderColumns.map(column => column.id));
const presetIds = ["active", "completed", "unassigned", "urgent"] as const;

export function normalizeTenderSettings(value: unknown): TenderRegistrySettings {
  const item = value && typeof value === "object" ? value as Partial<TenderRegistrySettings> : {};
  const group = groupIds.includes(item.group ?? "") ? item.group! : "none";
  const subgroup = group !== "none" && groupIds.includes(item.subgroup ?? "") && item.subgroup !== group ? item.subgroup! : "none";
  return {
    ...normalizeRegistryLayout(item, tenderColumns, defaultTenderSettings),
    bucket: item.bucket === "completed" ? "completed" : "active",
    stage: typeof item.stage === "string" ? item.stage : "",
    owner: typeof item.owner === "string" ? item.owner : "",
    customer: typeof item.customer === "string" ? item.customer : "",
    platform: typeof item.platform === "string" ? item.platform : "",
    decision: typeof item.decision === "string" ? item.decision : "",
    source: typeof item.source === "string" ? item.source : "",
    deadline: ["all", "today", "3d", "7d"].includes(item.deadline ?? "") ? item.deadline! : "all",
    sort: columnIds.has(item.sort ?? "") ? item.sort! : "updated",
    direction: item.direction === "asc" ? "asc" : "desc",
    group, subgroup, hideEmpty: item.hideEmpty === true,
  };
}

// Linked customers retain their IDs; free-text customers have a separate stable key space.
export function tenderCustomerKey(row: Pick<TenderRow, "clientId" | "customer">): string {
  return row.clientId || `customer:${row.customer}`;
}

export function tenderPresetSettings(id: string, current: TenderRegistrySettings): TenderRegistrySettings {
  return normalizeTenderSettings({ ...current, bucket: id === "completed" ? "completed" : "active", stage: "",
    owner: id === "unassigned" ? "unassigned" : "", customer: "", platform: "", decision: "", source: "",
    deadline: id === "urgent" ? "3d" : "all" });
}

export type TenderSavedView = { id: string; name: string; settings: TenderRegistrySettings };
export type TenderRegistryPreferences = { settings: TenderRegistrySettings; views: TenderSavedView[]; selectedView: string };

export function normalizeTenderPreferences(value: unknown): TenderRegistryPreferences {
  const raw = value && typeof value === "object" ? value as Partial<TenderRegistryPreferences> : {};
  const ids = new Set<string>([...presetIds, "custom"]);
  const views: TenderSavedView[] = [];
  if (Array.isArray(raw.views)) {
    for (const view of raw.views) {
      if (!view || typeof view.id !== "string" || !view.id || view.id.length > 100 || ids.has(view.id) || typeof view.name !== "string" || !view.name.trim()) continue;
      ids.add(view.id);
      views.push({ id: view.id, name: view.name.trim().slice(0, 60), settings: normalizeTenderSettings(view.settings) });
      if (views.length === 30) break;
    }
  }
  const selected = typeof raw.selectedView === "string" ? raw.selectedView : "active";
  return { settings: normalizeTenderSettings(raw.settings), views, selectedView: ids.has(selected) ? selected : "custom" };
}
