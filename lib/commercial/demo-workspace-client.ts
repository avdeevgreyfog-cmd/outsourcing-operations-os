"use client";

import type { RequestBoardRow } from "@/lib/commercial/request-workflow";

export type DemoRequestPayload = {
  clientId: string | null;
  title: string;
  source: string;
  location: string;
  regionId: string | null;
  startDate: string | null;
  durationText: string | null;
  schedule: Record<string, unknown>;
  intake: Record<string, unknown>;
  lunchPaid: boolean;
  vatMode: string | null;
  comments: string | null;
  ownerUserId: string | null;
  observerUserIds: string[];
  roles: Array<{ id?: string; specialtyId?: string | null; specialtyName: string; count: number; schedule: Record<string, unknown>; requirements: Record<string, unknown>; targetClientRate: number | null }>;
};

export type DemoRequestRecord = {
  id: string;
  payload: DemoRequestPayload;
  board: RequestBoardRow;
  updatedAt: string;
};

const KEY = "operis.demo.commercial-workspace.v1";
const EVENT = "operis:demo-commercial-workspace";

export function loadDemoRequests(): DemoRequestRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is DemoRequestRecord => Boolean(item?.id && item?.payload && item?.board)) : [];
  } catch { return []; }
}

function save(records: DemoRequestRecord[]) {
  window.localStorage.setItem(KEY, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribeDemoRequests(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener(EVENT, listener); window.removeEventListener("storage", listener); };
}

export function getDemoRequest(id: string) { return loadDemoRequests().find((item) => item.id === id) ?? null; }

export function saveDemoRequest(payload: DemoRequestPayload, options: { id?: string; base?: RequestBoardRow; clientName?: string; ownerName?: string; actorId: string }) {
  const records = loadDemoRequests();
  const id = options.id ?? `demo-local-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const current = records.find((item) => item.id === id);
  const roles = payload.roles.map((role) => ({ name: role.specialtyName, count: role.count }));
  const board: RequestBoardRow = {
    id,
    organizationId: options.base?.organizationId ?? "demo-organization",
    title: payload.title,
    client: options.clientName ?? options.base?.client ?? "Без клиента",
    clientId: payload.clientId,
    status: options.base?.status ?? "draft",
    workflowStageCode: current?.board.workflowStageCode ?? options.base?.workflowStageCode ?? "new",
    location: payload.location,
    regionId: payload.regionId,
    region: options.base?.region ?? null,
    ownerUserId: payload.ownerUserId ?? options.actorId,
    owner: options.ownerName ?? options.base?.owner ?? "Ответственный",
    createdByUserId: options.base?.createdByUserId ?? options.actorId,
    start: payload.startDate,
    source: payload.source,
    archivedAt: options.base?.archivedAt ?? null,
    closedAt: options.base?.closedAt ?? null,
    lossReason: current?.board.lossReason ?? options.base?.lossReason ?? null,
    headcount: roles.reduce((sum, role) => sum + role.count, 0),
    roles,
    proposalVersion: options.base?.proposalVersion ?? 0,
    proposalSentCount: options.base?.proposalSentCount ?? 0,
    lastProposalAt: options.base?.lastProposalAt ?? null,
    updatedAt: now,
  };
  const next: DemoRequestRecord = { id, payload, board, updatedAt: now };
  save(current ? records.map((item) => item.id === id ? next : item) : [next, ...records]);
  return next;
}

export function updateDemoRequestStage(id: string, workflowStageCode: string, lossReason: string | null = null, base?: RequestBoardRow) {
  const records = loadDemoRequests();
  const now = new Date().toISOString();
  if (!records.some((item) => item.id === id) && base) {
    const payload: DemoRequestPayload = {
      clientId: base.clientId, title: base.title, source: base.source, location: base.location, regionId: base.regionId, startDate: base.start,
      durationText: null, schedule: {}, intake: {}, lunchPaid: false, vatMode: "with_vat", comments: null, ownerUserId: base.ownerUserId, observerUserIds: [],
      roles: base.roles.map((role) => ({ specialtyName: role.name, count: role.count, schedule: {}, requirements: {}, targetClientRate: null })),
    };
    const created: DemoRequestRecord = { id, payload, board: { ...base, workflowStageCode, lossReason, updatedAt: now }, updatedAt: now };
    save([created, ...records]);
    return created;
  }
  const next = records.map((item) => item.id === id ? { ...item, updatedAt: now, board: { ...item.board, workflowStageCode, lossReason, updatedAt: now } } : item);
  save(next);
  return next.find((item) => item.id === id) ?? null;
}

export function mergeDemoRequestRows(base: RequestBoardRow[]) {
  const local = loadDemoRequests();
  const overrides = new Map(local.map((item) => [item.id, item.board]));
  const merged = base.map((row) => overrides.get(row.id) ?? row);
  for (const item of local) if (!base.some((row) => row.id === item.id)) merged.unshift(item.board);
  return merged;
}
