import type { AnalyticsTender, StageEvent, DecisionEvent, ResultEvent, PeriodResult } from "./analytics";
export const tenderFunnelSteps:Array<{code:string;label:string}>;
export function calculateTenderPeriod(rows:AnalyticsTender[],stageHistory:StageEvent[],decisionHistory:DecisionEvent[],resultHistory:ResultEvent[],from:string,to:string):PeriodResult;
