import type { RequestStage } from "@/lib/commercial/constants";

export type CommercialRole = {
  id: string;
  specialtyId?: string|null;
  name: string;
  count: number;
  qualification?: string|null;
  experience?: string|null;
  salaryTarget?: number|string|null;
  scheduleType?: string|null;
  shiftStart?: string|null;
  shiftEnd?: string|null;
  presenceHours?: number|string|null;
  paidHours?: number|string|null;
  lunchMinutes?: number|null;
  lunchPaid?: boolean|null;
  nightHours?: number|string|null;
  overtimeRule?: string|null;
  requirements?: Record<string,unknown>;
};

export type CommercialRequestRow = {
  id:string; organizationId:string; number:string; title:string; stage:RequestStage; legacyStatus?:string;
  businessResult:string; archived:boolean; archivedAt?:string|null; closeReason?:string|null; closeComment?:string|null; closedAt?:string|null;
  clientId?:string|null; client:string; companyInn?:string|null; contactName?:string|null; contactPosition?:string|null; phone?:string|null; email?:string|null; source?:string|null;
  siteName?:string|null; location:string; address?:string|null; city?:string|null; regionId?:string|null; region?:string|null; transportAccess?:string|null; nearestTransport?:string|null; logisticsComment?:string|null;
  ownerUserId?:string|null; owner:string; createdByUserId?:string; teamId?:string|null; createdAt:string; updatedAt:string;
  start?:string|null; duration?:string|null; schedule?:unknown; roles:CommercialRole[]; totalHeadcount:number;
  housing?:string|null; vat?:string|null;
  desiredClientRate?:number|string|null; maxClientRate?:number|string|null; clientRateVatMode?:string|null; proposedWorkerPay?:number|string|null; totalBudget?:number|string|null; monthlyLimit?:number|string|null;
  selectedScenarioId?:string|null; agreedClientRate?:number|string|null; acceptedProposalId?:string|null;
  lastAction?:string|null; lastActionAt?:string|null; nextAction?:string|null; nextActionAt?:string|null;
};

export type CommercialCalculationRow = {
  id:string; organizationId:string; calculationId:string; requestId?:string|null; request:string; sourceKind:"request"|"standalone"; calculationTitle:string;
  role:string; name:string; scenarioNumber:number; model:string; modelType:string; ruleVersionId?:string|null; status:string; approvalStatus?:string|null;
  workerNet:number|string; totalCost:number|string; clientRate:number|string; clientRateWithVat?:number|string|null; marginPct:number|string; monthlyRevenue?:number|string|null; monthlyContribution:number|string;
  ownerUserId?:string|null; createdByUserId?:string; teamId?:string|null; regionId?:string|null; createdAt:string;
};

export type CommercialProposalRow = {
  id:string; organizationId:string; requestId:string; request:string; client:string; clientId?:string|null; version:number; status:string; scenarioCount:number;
  totalValue:number|string; validUntil?:string|null; sentAt?:string|null; acceptedAt?:string|null; supersedesProposalId?:string|null; createdAt:string; createdBy:string;
  clientPayload?:Record<string,unknown>; ownerUserId?:string|null; createdByUserId?:string; teamId?:string|null; regionId?:string|null;
};

export type CommercialApprovalRow = {
  id:string; scenarioId:string; scenario:string; round:number; status:string; requestedAt:string; requestedBy:string; assignedTo?:string|null; decidedAt?:string|null; decidedBy?:string|null; comment?:string|null;
};

export type CommercialCommentRow = { id:string; entityType:string; entityId:string; type:string; body:string; author:string; createdAt:string; visibility:string };
export type CommercialHistoryRow = { id:string; verb:string; summary:string; actor:string; createdAt:string; entityType:string; entityId?:string|null; metadata?:Record<string,unknown> };
export type ProvisionRow = { id:string; code:string; provider:string; amount?:number|string|null; unit?:string|null; comment?:string|null; parameters?:Record<string,unknown> };

export type CommercialRateRow = {
  id:string; organizationId:string; specialty:string; region:string; employmentModel:string; amountMin:number|string; amountMax:number|string; unit:string; grossNet:string;
  source:string; sourceDate:string; confidence:string; comment?:string|null; sourceKind:"market"|"calculation"|"object_fact"; scheduleCode?:string|null; workforceMode?:string|null; housingIncluded?:boolean|null; seasonality?:string|null;
  workerPay?:number|string|null; clientOfferRate?:number|string|null; actualObjectRate?:number|string|null; actualMarginPct?:number|string|null; regionId?:string|null; createdByUserId?:string;
};

export type CommercialRuleRow = { id:string; category:string; version:number; effectiveFrom:string; effectiveTo?:string|null; verified:boolean; source?:string|null; rules:Record<string,unknown>; createdAt:string };

export type CalculatorModelRule = {
  code:"employment"|"gph"|"npd"|"custom"; label:string; ruleVersionId?:string|null; verified:boolean;
  mandatoryChargePct:number; vatRatePct:number; minimumMarginPct:number; recommendedMarginPct:number;
  defaults:{ housingPerShift:number; transportPerHour:number; workwearPerWorkerMonth:number; ppePerWorkerMonth:number; medicalPerWorkerMonth:number; recruitmentProjectMonth:number; managementProjectMonth:number };
};
