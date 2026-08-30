export const PERIOD_HOURS = Object.freeze({ hour: 1, shift: 11, month: 242 });

export function calculateScenario(input) {
  const hoursPerWorker = input.hoursPerWorker ?? PERIOD_HOURS.month;
  const workers = input.workers ?? 1;
  const directHourly = input.workerNetHourly + sumEnabled(input.employeeCosts);
  const projectHourly = sumEnabled(input.projectCosts) / Math.max(1, hoursPerWorker * workers);
  const totalCostHourly = directHourly + projectHourly;
  const targetMargin = clamp(input.targetMarginPct ?? 15, 0, 95) / 100;
  const clientRateHourly = input.clientRateHourly ?? roundMoney(totalCostHourly / (1 - targetMargin));
  const marginHourly = clientRateHourly - totalCostHourly;
  const marginPct = clientRateHourly === 0 ? 0 : (marginHourly / clientRateHourly) * 100;
  return {
    directHourly: roundMoney(directHourly),
    projectHourly: roundMoney(projectHourly),
    totalCostHourly: roundMoney(totalCostHourly),
    clientRateHourly: roundMoney(clientRateHourly),
    marginHourly: roundMoney(marginHourly),
    marginPct: roundMoney(marginPct),
    monthlyRevenue: roundMoney(clientRateHourly * hoursPerWorker * workers),
    monthlyCost: roundMoney(totalCostHourly * hoursPerWorker * workers),
    monthlyContribution: roundMoney(marginHourly * hoursPerWorker * workers)
  };
}

export function sumEnabled(items = []) {
  return items.filter((item) => item.enabled !== false).reduce((sum, item) => sum + Number(item.hourlyAmount ?? 0), 0);
}

export function compareScenarios(scenarios) {
  return [...scenarios].sort((a, b) => b.result.marginPct - a.result.marginPct);
}

function roundMoney(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
