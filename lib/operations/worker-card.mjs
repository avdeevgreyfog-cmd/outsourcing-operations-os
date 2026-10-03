/**
 * Only actual assignments and reserves belong to an employee's schedule.
 * @template {{workerIds:string[],reserveWorkerIds:string[],dateIso?:string|null,time:string}} T
 * @param {T[]} rows
 * @param {string} workerId
 * @returns {T[]}
 */
export function shiftsForWorker(rows, workerId) {
  return rows.filter(row => row.workerIds.includes(workerId) || row.reserveWorkerIds.includes(workerId))
    .sort((a, b) => (a.dateIso ?? "").localeCompare(b.dateIso ?? "") || a.time.localeCompare(b.time));
}

/**
 * @param {string[]} keys
 * @param {{assets:boolean,housing:boolean,sensitive:boolean,accruals:boolean,payments:boolean,incidents:boolean,timesheets:boolean}} access
 * @returns {string[]}
 */
export function visibleWorkerTabs(keys, access) {
  return keys.filter(key => {
    if (key === "assets") return access.assets;
    if (key === "housing") return access.housing;
    if (key === "accruals") return access.sensitive && access.accruals;
    if (key === "payments") return access.sensitive && access.payments;
    if (key === "incidents") return access.incidents;
    if (key === "timesheets") return access.timesheets;
    return true;
  });
}

/** @param {{effectiveFrom:string,effectiveTo:string|null}} row */
export function assignmentState(row, today = new Date().toISOString().slice(0,10)) {
  const iso = value => value?.includes(".") ? value.split(".").reverse().join("-") : value;
  if (iso(row.effectiveFrom) > today) return "planned";
  if (row.effectiveTo && iso(row.effectiveTo) < today) return "completed";
  return "current";
}
