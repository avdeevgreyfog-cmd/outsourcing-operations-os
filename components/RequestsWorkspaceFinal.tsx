import { requestBucket, type RequestBoardRow, type RequestStageDefinition } from "@/lib/commercial/request-workflow";
import { SalesMetrics } from "@/components/sales/SalesUI";
import { RequestsWorkspaceBaseline } from "@/components/RequestsWorkspaceBaseline";

type Props = {
  rows: RequestBoardRow[];
  stages: RequestStageDefinition[];
  canCreate: boolean;
  canConfigure: boolean;
  canEdit: boolean;
  now: number;
};

export function RequestsWorkspaceFinal(props: Props) {
  const active = props.rows.filter((row) => requestBucket(row) === "active");
  const completed = props.rows.filter((row) => requestBucket(row) === "completed");
  const agreed = completed.filter((row) => row.workflowStageCode === "agreed");
  const activeHeadcount = active.reduce((sum, row) => sum + row.headcount, 0);
  const sent = props.rows.reduce((sum, row) => sum + row.proposalSentCount, 0);
  const conversionBase = agreed.length + completed.filter((row) => row.workflowStageCode === "not_agreed").length;
  const conversion = conversionBase ? Math.round((agreed.length / conversionBase) * 100) : 0;

  return <div className="request-final-registry request-baseline-registry">
    <SalesMetrics label="Сводка по заявкам" items={[
      {label:"Активные заявки",value:active.length,note:"сейчас в работе"},
      {label:"Потребность",value:activeHeadcount,note:"человек по активным заявкам"},
      {label:"Отправки КП",value:sent,note:"за всё время"},
      {label:"Согласовано",value:conversionBase ? `${conversion}%` : "—",note:conversionBase ? `из ${conversionBase} завершённых заявок` : "нет завершённых заявок"},
    ]}/>
    <RequestsWorkspaceBaseline {...props}/>
  </div>;
}
