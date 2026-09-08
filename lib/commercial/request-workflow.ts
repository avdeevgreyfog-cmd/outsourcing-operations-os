export const requestStageCodes = ["new","clarification","ready_calc","calculation","proposal_prep","proposal_client","negotiation","agreed","not_agreed"] as const;
export type RequestStageCode = typeof requestStageCodes[number];

export type RequestStageDefinition = {
  code: RequestStageCode | string;
  label: string;
  sortOrder: number;
  color: string;
  active: boolean;
  terminalKind: "active" | "agreed" | "not_agreed";
};

export type SpecialtyRateStats = {
  sampleCount: number;
  clientRateMin: number | null;
  clientRateMedian: number | null;
  clientRateMax: number | null;
  workerPayMin: number | null;
  workerPayMax: number | null;
};

export type WorkspaceSpecialty = { id: string; name: string; stats: SpecialtyRateStats };
export type WorkspaceMember = { id: string; name: string; role: string };

export type RequestWorkspaceOptions = {
  clients: Array<{ id: string; name: string }>;
  regions: Array<{ id: string; name: string }>;
  specialties: WorkspaceSpecialty[];
  members: WorkspaceMember[];
  currentUserId: string;
  canAssign: boolean;
  canConfigurePipeline: boolean;
};

export type RequestBoardRow = {
  id: string;
  organizationId: string;
  title: string;
  client: string;
  clientId: string | null;
  status: string;
  workflowStageCode: string;
  location: string;
  regionId: string | null;
  region: string | null;
  ownerUserId: string | null;
  owner: string | null;
  createdByUserId: string;
  start: string | null;
  source: string;
  archivedAt: string | null;
  closedAt: string | null;
  lossReason: string | null;
  headcount: number;
  roles: Array<{ name: string; count: number }>;
  proposalVersion: number;
  proposalSentCount: number;
  lastProposalAt: string | null;
  updatedAt: string;
};

export type RequestTimelineItem = {
  id: string;
  at: string;
  actor: string;
  title: string;
  detail: string;
  kind: "request" | "position" | "calculation" | "proposal" | "external";
};

export type RequestWorkflowMeta = {
  owner: string | null;
  observers: WorkspaceMember[];
  timeline: RequestTimelineItem[];
};

export const defaultRequestStages: RequestStageDefinition[] = [
  { code: "new", label: "Новая", sortOrder: 10, color: "neutral", active: true, terminalKind: "active" },
  { code: "clarification", label: "Уточнение условий", sortOrder: 20, color: "blue", active: true, terminalKind: "active" },
  { code: "ready_calc", label: "Готова к расчёту", sortOrder: 30, color: "cyan", active: true, terminalKind: "active" },
  { code: "calculation", label: "Расчёт", sortOrder: 40, color: "violet", active: true, terminalKind: "active" },
  { code: "proposal_prep", label: "Подготовка КП", sortOrder: 50, color: "amber", active: true, terminalKind: "active" },
  { code: "proposal_client", label: "КП у заказчика", sortOrder: 60, color: "orange", active: true, terminalKind: "active" },
  { code: "negotiation", label: "Переговоры / доработка", sortOrder: 70, color: "pink", active: true, terminalKind: "active" },
  { code: "agreed", label: "Согласовано", sortOrder: 80, color: "green", active: true, terminalKind: "agreed" },
  { code: "not_agreed", label: "Не согласовано", sortOrder: 90, color: "red", active: true, terminalKind: "not_agreed" },
];

export function requestBucket(row: Pick<RequestBoardRow,"archivedAt"|"workflowStageCode">): "active" | "completed" | "archive" {
  if (row.archivedAt) return "archive";
  if (row.workflowStageCode === "agreed" || row.workflowStageCode === "not_agreed") return "completed";
  return "active";
}

export function stageByCode(stages: RequestStageDefinition[], code: string) {
  return stages.find((stage) => stage.code === code) ?? defaultRequestStages.find((stage) => stage.code === code) ?? defaultRequestStages[0];
}
