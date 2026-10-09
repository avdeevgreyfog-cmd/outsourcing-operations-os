export type CalculationQueueRow = {
  id:string;sourceType:"request"|"tender";sourceId:string;title:string;client:string;
  roleCount:number;acceptedRoles:number;scenarioCount:number;stage:string;
  state:"not_started"|"review"|"partial"|"in_progress";stateLabel:string;
  sourceHref:string;calculationHref:string;calculationId:string|null;
  updatedAt:string|null;date:string|null;dateKind:string;
};
export type CalculationQueueRequest = {
  id:string;title:string;client:string;status:string;workflowStageCode:string;
  archivedAt:string|null;closedAt:string|null;updatedAt:string;
  start:string|null;roles:Array<{name:string;count:number}>;
};
export type CalculationQueueTender = {
  id:string;title:string;customer:string;stage:string;decision:string;roleCount:number;
  updatedAt:string;submissionDeadline:string|null;
};
export type CalculationQueueScenario = {
  sourceType:"request"|"tender";sourceId:string;calculationVersion:number;
  calculationId:string;status:string;sourceRoleId:string;
};
export function buildCalculationQueue(requests:CalculationQueueRequest[],tenders:CalculationQueueTender[],calculations:CalculationQueueScenario[]):CalculationQueueRow[];
