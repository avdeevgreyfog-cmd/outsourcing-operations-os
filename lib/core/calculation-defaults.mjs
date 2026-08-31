// Fallback values are only for the read-only demo/empty configuration state.
// Production calculations must store calculation_rule_versions and their id in the scenario snapshot.
export const demoModelHourlyDefaults = Object.freeze({
  employment: 82,
  gph: 64,
  npd: 24,
  custom: 50,
});

export const minimumRecommendedMarginPct = 15;
