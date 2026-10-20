"use client";

import { RequestsWorkspaceBaseline } from "@/components/RequestsWorkspaceBaseline";
import type { RequestBoardRow, RequestStageDefinition, RequestWorkspaceOptions } from "@/lib/commercial/request-workflow";
import type { RequestAnalyticsData } from "@/lib/commercial/request-analytics";
import type { RequestAnalyticsMetricPreference } from "@/lib/commercial/request-analytics-metric-registry";

type Props = {
  rows: RequestBoardRow[];
  stages: RequestStageDefinition[];
  options: RequestWorkspaceOptions;
  analytics: RequestAnalyticsData;
  metricPreferences: RequestAnalyticsMetricPreference[];
  canConfigureMetrics: boolean;
  initialMode?: "list" | "board" | "analytics";
  canCreate: boolean;
  canConfigure: boolean;
  canEdit: boolean;
  editableIds?: string[];
  now: number;
  demo?: boolean;
  preferenceScope?: string;
};

export function RequestsWorkspaceFinal(props: Props) {
  return <div className="request-final-registry request-baseline-registry">
    <RequestsWorkspaceBaseline {...props} lossReasons={props.options.lossReasons}/>
  </div>;
}
