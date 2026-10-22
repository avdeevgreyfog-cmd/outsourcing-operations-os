/** Keep the saved unit primary; a shift amount must never masquerade as hourly. */
export function workerRatePresentation(row) {
  const selected = finiteAmount(row.rate);
  const amount = selected ?? finiteAmount(row.dayRate) ?? finiteAmount(row.nightRate);
  if (amount == null) return null;
  const unit = selected != null && ["hour", "shift"].includes(row.rateUnit) ? row.rateUnit : null;
  const hours = finiteAmount(row.paidHoursPerShift);
  const equivalent = unit && hours != null && hours > 0
    ? { amount: unit === "shift" ? amount / hours : amount * hours, unit: unit === "shift" ? "hour" : "shift", hours }
    : null;
  return { amount, unit, equivalent };
}

function finiteAmount(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
