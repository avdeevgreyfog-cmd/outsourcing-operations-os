import type { Actor } from "@/lib/access/types";
import { requireCapability } from "@/lib/access/server";
import { hasCapability, canReadRow } from "@/lib/core/access.mjs";
import { inPortfolioScope, latestFinanceByObject, staffingSummary, portfolioSignals } from "@/lib/core/portfolio.mjs";
import { withTenant } from "@/lib/db/client";
import { listObjects, listFinance, listRequests, listWorkers, listCandidates, type ObjectRow, type FinanceRow } from "@/lib/data/service";
import { listRequestBoard, listRequestStages } from "@/lib/commercial/request-workflow-server";
import * as demo from "@/lib/demo/data";
import { demoActors, getDemoActor } from "@/lib/demo/access";

export type PortfolioTimesheet = { objectId: string; status: string; period: string };
export type PortfolioObject = ObjectRow & { staffing: { coverage: number | null; deficit: number | null }; finance: FinanceRow | null; timesheet: PortfolioTimesheet | null; workerCount: number | null; candidateCount: number | null; signals: { label: string; tab: string; tone: string }[] };

async function timesheetSummaries(actor: Actor, objects: ObjectRow[]): Promise<PortfolioTimesheet[]> {
  if (!hasCapability(actor.access, "time.timesheet.read")) return [];
  const allowedObjects = objects.filter(object => canReadRow(actor.access, "time.timesheet.read", { ...object, objectId: object.id }, actor));
  if (!allowedObjects.length) return [];
  if (actor.demo) return allowedObjects.some(object => object.id === demo.timesheet.objectId) ? [{ objectId: demo.timesheet.objectId, status: demo.timesheet.status, period: demo.timesheet.period }] : [];
  return withTenant(actor.organizationId, actor.userId, sql => sql<PortfolioTimesheet[]>`
    SELECT DISTINCT ON (object_id) object_id "objectId", status,
      to_char(period_start,'DD.MM.YYYY') || ' – ' || to_char(period_end,'DD.MM.YYYY') period
    FROM timesheet_snapshots
    WHERE object_id=ANY(${allowedObjects.map(object => object.id)}::uuid[]) AND view_type='client'
    ORDER BY object_id,period_end DESC,created_at DESC
  `);
}

export async function loadPortfolio(actor: Actor) {
  requireCapability(actor, "analytics.portfolio.read");
  const can = (capability: string) => hasCapability(actor.access, capability);
  const permissions = { objects: can("operations.object.read"), finance: can("finance.pnl.read"), timesheets: can("time.timesheet.read"), needs: can("operations.need.read"), workers: can("worker.read"), candidates: can("recruiting.candidate.read"), requests: can("sales.request.read") };
  const [objectRows, finances, workers, candidates, requests, board, stages] = await Promise.all([
    permissions.objects ? listObjects(actor) : [], permissions.finance ? listFinance(actor) : [],
    permissions.workers ? listWorkers(actor) : [], permissions.candidates ? listCandidates(actor) : [],
    permissions.requests ? listRequests(actor) : [], permissions.requests ? listRequestBoard(actor) : [], permissions.requests ? listRequestStages(actor) : [],
  ]);
  const objects = objectRows.filter(row => inPortfolioScope(actor, row));
  const snapshots = await timesheetSummaries(actor, objects);
  const financeMap = latestFinanceByObject(finances.filter(row => inPortfolioScope(actor, row)));
  const timesheetMap = new Map(snapshots.map(row => [row.objectId, row]));
  const demoNames = actor.demo ? new Map(demoActors().map(item => [getDemoActor(item.code).userId, item.name])) : null;
  const rows: PortfolioObject[] = objects.map(object => {
    const finance = financeMap.get(object.id) as FinanceRow | undefined;
    const timesheet = timesheetMap.get(object.id);
    // Demo names come from the existing actor records, not generated identities.
    const ownerName = actor.demo ? (demoNames?.get(object.ownerUserId ?? "") ?? null) : object.ownerName;
    return { ...object, revenueForecast: null, marginForecast: null, ownerName, staffing: staffingSummary(object.required, object.filled), finance: finance ?? null, timesheet: timesheet ?? null,
      workerCount: permissions.workers ? workers.filter(row => row.objectId === object.id && inPortfolioScope(actor, row)).length : null,
      candidateCount: permissions.candidates ? candidates.filter(row => row.objectId === object.id && inPortfolioScope(actor, row)).length : null,
      signals: portfolioSignals(object, finance, timesheet),
    };
  });
  const requestScope = new Map(requests.filter(row => inPortfolioScope(actor, row)).map(row => [row.id, row]));
  const upcoming = board.filter(row => requestScope.has(row.id) && row.start && !row.archivedAt && !row.closedAt && !["launched", "lost", "archived"].includes(row.status) && stages.find(stage => stage.code === row.workflowStageCode)?.terminalKind !== "not_agreed" && !objects.some(object => object.sourceRequestId === row.id))
    .map(row => ({ id: row.id, title: row.title, client: row.client, start: row.start, headcount: row.headcount, stage: stages.find(stage => stage.code === row.workflowStageCode)?.label ?? "Этап не указан" }));
  const candidateStages = Object.entries(candidates.filter(row => inPortfolioScope(actor, row)).reduce<Record<string, number>>((counts, row) => { counts[row.stageLabel ?? row.stage] = (counts[row.stageLabel ?? row.stage] ?? 0) + 1; return counts; }, {})).map(([stage, count]) => ({ stage, count }));
  return { rows, upcoming, candidateStages, permissions, demo: actor.demo };
}
export type PortfolioData = Awaited<ReturnType<typeof loadPortfolio>>;
