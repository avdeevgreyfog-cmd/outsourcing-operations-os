import { requestBucket, type RequestBoardRow, type RequestStageDefinition } from "@/lib/commercial/request-workflow";
import { RequestsWorkspaceBaseline } from "@/components/RequestsWorkspaceBaseline";

type Props = {
  rows: RequestBoardRow[];
  stages: RequestStageDefinition[];
  canCreate: boolean;
  canConfigure: boolean;
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
    <div className="request-final-command-strip" aria-label="Сводка по заявкам">
      <div><span>Активные заявки</span><strong>{active.length}</strong><small>сейчас в работе</small></div>
      <div><span>Потребность</span><strong>{activeHeadcount}</strong><small>человек по активным заявкам</small></div>
      <div><span>Отправки КП</span><strong>{sent}</strong><small>за всё время</small></div>
      <div><span>Согласовано</span><strong>{conversion}%</strong><small>из завершённых исходов</small></div>
    </div>
    <RequestsWorkspaceBaseline {...props}/>
  </div>;
}
