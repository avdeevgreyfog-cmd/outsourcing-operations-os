/**
 * A read-only work queue over EXISTING request/tender and calculation entities.
 * No tasks, statuses or copies of business entities are persisted here.
 */
const REQUEST_STAGES = new Map([
  ["ready_calc", "Готова к расчёту"],
  ["calculation", "На расчёте"],
  ["negotiation", "Переговоры / доработка"],
]);
const TENDER_STAGES = new Map([
  ["analysis", "Анализ условий"],
  ["calculation", "Расчёт"],
  ["preparation", "Подготовка"],
]);

export function buildCalculationQueue(requests, tenders, calculations) {
  const bySource = new Map();
  for (const row of calculations) {
    const key = `${row.sourceType}:${row.sourceId}`;
    const group = bySource.get(key);
    if (!group || Number(row.calculationVersion) > group.version) {
      bySource.set(key, { version: Number(row.calculationVersion), calculationId: row.calculationId, rows: [row] });
    } else if (Number(row.calculationVersion) === group.version && group.calculationId === row.calculationId) {
      group.rows.push(row);
    }
  }

  function addCandidate(sourceType, sourceId, title, client, roleCount, stage, at, date, sourceHref) {
    if (!roleCount || roleCount < 1) return null;
    const calculation = bySource.get(`${sourceType}:${sourceId}`);
    const current = calculation?.rows ?? [];
    const accepted = new Set(current.filter(row => row.status === "accepted").map(row => row.sourceRoleId));
    const acceptedRoles = accepted.size;
    if (acceptedRoles >= roleCount) return null;
    const scenarioCount = current.length;
    const hasReview = current.some(row => row.status === "review" || row.status === "pending");
    const state = !scenarioCount ? "not_started" : hasReview ? "review" : acceptedRoles > 0 ? "partial" : "in_progress";
    const stateLabel = state === "not_started" ? "Нет расчёта" : state === "review"
      ? "На согласовании" : state === "partial" ? "Частично рассчитано" : "В работе";
    return {
      id: `${sourceType}:${sourceId}`, sourceType, sourceId, title, client,
      roleCount, acceptedRoles, scenarioCount, stage, state, stateLabel,
      sourceHref, calculationHref: sourceType === "request"
        ? `/calculations?request=${sourceId}`
        : `/calculations?tender=${sourceId}`,
      calculationId: calculation?.calculationId ?? null,
      updatedAt: at || null, date: date || null,
      dateKind: sourceType === "request" ? "Начало работ" : "Подача заявки",
    };
  }

  const result = [];
  for (const request of requests) {
    if (request.archivedAt || request.closedAt
      || ["accepted", "launched", "lost"].includes(request.status)
      || ["agreed", "not_agreed"].includes(request.workflowStageCode)
      || !REQUEST_STAGES.has(request.workflowStageCode)) continue;
    const key = `request:${request.id}`;
    // Negotiations enter this queue only for a known recalculation.
    if (request.workflowStageCode === "negotiation" && !bySource.has(key)) continue;
    const row = addCandidate("request",request.id,request.title,request.client,
      request.roles.length,REQUEST_STAGES.get(request.workflowStageCode),request.updatedAt,request.start,
      `/requests/${request.id}`);
    if (row) result.push(row);
  }

  for (const tender of tenders) {
    if (tender.stage === "completed" || tender.decision !== "participate"
      || !TENDER_STAGES.has(tender.stage)) continue;
    const row = addCandidate("tender",tender.id,tender.title,tender.customer,
      tender.roleCount,TENDER_STAGES.get(tender.stage),tender.updatedAt,tender.submissionDeadline,
      `/tenders/${tender.id}?tab=calculations`);
    if (row) result.push(row);
  }
  return result.sort((a,b)=>{
    const order = { not_started: 0, partial: 1, in_progress: 2, review: 3 };
    const priority = order[a.state] - order[b.state];
    return priority || String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
  });
}
