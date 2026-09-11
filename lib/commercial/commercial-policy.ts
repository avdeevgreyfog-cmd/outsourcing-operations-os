export type CommercialPolicy = {
  minimumMarginPct: number;
  recommendedMarginPct: number;
  riskReservePct: number;
  vatPct: number;
  roundingStep: number;
  approvalBelowMarginPct: number;
  notes: string;
};

export const defaultCommercialPolicy: CommercialPolicy = {
  minimumMarginPct: 15,
  recommendedMarginPct: 18,
  riskReservePct: 2,
  vatPct: 22,
  roundingStep: 1,
  approvalBelowMarginPct: 15,
  notes: "Внутренние ориентиры компании. Проверьте применимость перед использованием в сделке.",
};
