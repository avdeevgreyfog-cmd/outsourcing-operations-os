export function classifyAttendance({ planned, factHours }) {
  if (!planned) return factHours > 0 ? "extra_shift" : "off";
  if (factHours <= 0) return "no_show";
  return "worked";
}

export function splitPeriod(dateISO) {
  const day = Number(dateISO.slice(8, 10));
  return day <= 15 ? "first_half" : "second_half";
}

export function aggregateTimeEntries(entries) {
  return entries.reduce((acc, entry) => {
    acc.factHours += Number(entry.factHours ?? 0);
    acc.dayHours += Number(entry.dayHours ?? 0);
    acc.nightHours += Number(entry.nightHours ?? 0);
    acc.overtimeHours += Number(entry.overtimeHours ?? 0);
    const status = classifyAttendance({ planned: entry.planned, factHours: entry.factHours });
    acc.statusCounts[status] = (acc.statusCounts[status] ?? 0) + 1;
    return acc;
  }, { factHours: 0, dayHours: 0, nightHours: 0, overtimeHours: 0, statusCounts: {} });
}

export function reconcile(internalHours, clientHours) {
  const difference = Number((internalHours - clientHours).toFixed(2));
  return { difference, hasIssue: Math.abs(difference) > 0.001 };
}
