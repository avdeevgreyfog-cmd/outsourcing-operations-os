import { canReadRow } from './access.mjs';

/** An overview never widens either the source permission or its own scope. */
export function inPortfolioScope(actor, row) {
  return canReadRow(actor.access, 'analytics.portfolio.read', { ...row, objectId: row.objectId ?? row.id }, actor);
}

/** Source is ordered newest first; never add historical snapshots together. */
export function latestFinanceByObject(rows) {
  const result = new Map();
  for (const row of rows) if (!result.has(row.objectId)) result.set(row.objectId, row);
  return result;
}

export function staffingSummary(required, filled) {
  if (!(required > 0)) return { coverage: null, deficit: null };
  return { coverage: Math.round(100 * filled / required), deficit: Math.max(0, required - filled) };
}

export function portfolioSignals(object, finance, timesheet) {
  const signals = [];
  const staffing = staffingSummary(object.required, object.filled);
  if (staffing.deficit > 0) signals.push({ label: `Не хватает ${staffing.deficit} чел.`, tab: 'needs', tone: 'warn' });
  if (['critical', 'high'].includes(object.risk) || object.status === 'risk') signals.push({ label: object.risk === 'critical' ? 'Критический риск' : 'Операционный риск', tab: 'overview', tone: 'bad' });
  if (finance && Number(finance.contribution) < 0) signals.push({ label: 'Отрицательный вклад в прибыль', tab: 'finance', tone: 'bad' });
  if (timesheet && ['draft', 'submitted', 'review', 'На сверке'].includes(timesheet.status)) signals.push({ label: 'Табель не согласован', tab: 'timesheets', tone: 'warn' });
  return signals;
}
