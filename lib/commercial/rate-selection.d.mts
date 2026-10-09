export type RateCandidate={id:string;amountMin:number|string|null;amountMax:number|string|null;sourceDate:string;regionId?:string|null;
  paySemantics:string;sourceType?:string|null;sourceStatus?:string|null;[key:string]:unknown};
export function rankRateReferences<T extends RateCandidate>(rows:T[],regionId:string|null,economicsDate:string,limit?:number):T[];
