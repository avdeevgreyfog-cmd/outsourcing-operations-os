"use client";

import { useEffect, useState } from "react";
import { requestBucket, type RequestBoardRow, type RequestStageDefinition, type RequestWorkspaceOptions } from "@/lib/commercial/request-workflow";
import type { RequestAnalyticsData } from "@/lib/commercial/request-analytics";
import type { RequestAnalyticsMetricPreference } from "@/lib/commercial/request-analytics-metric-registry";
import { SalesMetrics } from "@/components/sales/SalesUI";
import { RequestsWorkspaceBaseline } from "@/components/RequestsWorkspaceBaseline";
import { mergeDemoRequestRows, subscribeDemoRequests } from "@/lib/commercial/demo-workspace-client";

type Props = {
  rows: RequestBoardRow[];
  stages: RequestStageDefinition[];
  options: RequestWorkspaceOptions;
  analytics: RequestAnalyticsData;
  metricPreferences: RequestAnalyticsMetricPreference[];
  canConfigureMetrics: boolean;
  initialMode?: "list"|"board"|"analytics";
  canCreate: boolean;
  canConfigure: boolean;
  canEdit: boolean;
  now: number;
  demo?: boolean;
};

export function RequestsWorkspaceFinal(props: Props) {
  const [rows, setRows] = useState<RequestBoardRow[]>(props.rows);
  const [mode,setMode]=useState<"list"|"board"|"analytics">(props.initialMode??"list");
  useEffect(() => {
    if (!props.demo) return;
    const refresh = () => setRows(mergeDemoRequestRows(props.rows));
    refresh();
    return subscribeDemoRequests(refresh);
  }, [props.demo, props.rows]);
  const liveRows = props.demo ? rows : props.rows;
  const active = liveRows.filter((row) => requestBucket(row) === "active");
  const completed = liveRows.filter((row) => requestBucket(row) === "completed");
  const agreed = completed.filter((row) => row.workflowStageCode === "agreed");
  const activeHeadcount = active.reduce((sum, row) => sum + row.headcount, 0);
  const sent = liveRows.reduce((sum, row) => sum + row.proposalSentCount, 0);
  const conversionBase = agreed.length + completed.filter((row) => row.workflowStageCode === "not_agreed").length;
  const conversion = conversionBase ? Math.round((agreed.length / conversionBase) * 100) : 0;

  return <div className="request-final-registry request-baseline-registry">
    {mode!=="analytics"&&<SalesMetrics label="Сводка по заявкам" items={[
      {label:"Активные заявки",value:active.length,note:"сейчас в работе"},
      {label:"Потребность",value:activeHeadcount,note:"человек по активным заявкам"},
      {label:"Отправки КП",value:sent,note:"за всё время"},
      {label:"Согласовано",value:conversionBase ? `${conversion}%` : "—",note:conversionBase ? `из ${conversionBase} завершённых заявок` : "нет завершённых заявок"},
    ]}/>}
    <RequestsWorkspaceBaseline {...props} lossReasons={props.options.lossReasons} initialMode={mode} onModeChange={setMode}/>
  </div>;
}
