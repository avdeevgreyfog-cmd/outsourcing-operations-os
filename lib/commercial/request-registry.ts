import { normalizeRegistryLayout, type RegistryColumnLayout } from "@/lib/ui/registry-layout";

export const requestColumns = [
  { id: "identity", label: "Заявка / клиент", width: 270, required: true },
  { id: "need", label: "Потребность", width: 180 }, { id: "stage", label: "Этап", width: 165 },
  { id: "owner", label: "Ответственный", width: 165 }, { id: "start", label: "Старт", width: 130 },
  { id: "activity", label: "Последнее изменение", width: 185 }, { id: "proposal", label: "КП", width: 115 },
  { id: "client", label: "Заказчик", width: 190 }, { id: "location", label: "Адрес объекта", width: 240 },
  { id: "roles", label: "Специальности", width: 240 }, { id: "source", label: "Источник", width: 160 }, { id: "region", label: "Регион", width: 180 },
] as const;
export type RequestColumnId = typeof requestColumns[number]["id"];
export type RequestGroupId = "none" | "stage" | "owner" | "client";
export type RequestSortId = "updated" | "title" | "start" | "headcount" | "stage" | "owner" | "client" | "source" | "region" | "location" | "roles" | "proposal";
export type RequestRegistrySettings = RegistryColumnLayout<RequestColumnId> & {
  bucket: "active" | "completed" | "archive";
  stage: string; owner: string; client: string; source: string;
  sort: RequestSortId; direction: "asc" | "desc";
  group: RequestGroupId; subgroup: RequestGroupId; hideEmpty: boolean;
};
export const defaultRequestSettings: RequestRegistrySettings = {
  bucket: "active", stage: "", owner: "", client: "", source: "",
  columns: ["identity", "need", "stage", "owner", "start", "activity", "proposal"], pinned: ["identity"], widths: {},
  sort: "updated", direction: "desc", group: "none", subgroup: "none", hideEmpty: false,
};
const groupIds = ["none", "stage", "owner", "client"];
const sortIds = ["updated", "title", "start", "headcount", "stage", "owner", "client", "source", "region", "location", "roles", "proposal"];
export function normalizeRequestSettings(value: unknown): RequestRegistrySettings {
  const item = value && typeof value === "object" ? value as Partial<RequestRegistrySettings> : {};
  const group = groupIds.includes(item.group ?? "") ? item.group! : "none";
  const subgroup = group !== "none" && groupIds.includes(item.subgroup ?? "") && item.subgroup !== group ? item.subgroup! : "none";
  return {
    ...normalizeRegistryLayout(item, requestColumns, defaultRequestSettings),
    bucket: ["active", "completed", "archive"].includes(item.bucket ?? "") ? item.bucket! : "active",
    stage: typeof item.stage === "string" ? item.stage : "", owner: typeof item.owner === "string" ? item.owner : "",
    client: typeof item.client === "string" ? item.client : "", source: typeof item.source === "string" ? item.source : "",
    sort: sortIds.includes(item.sort ?? "") ? item.sort! : "updated", direction: item.direction === "asc" ? "asc" : "desc",
    group, subgroup, hideEmpty: item.hideEmpty === true,
  };
}
