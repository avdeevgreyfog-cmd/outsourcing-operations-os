import type { TenderAnalyticsDaily } from "./analytics";
export type TenderActivityPoint=Omit<TenderAnalyticsDaily,"date">&{dateRange:string};
export function bucketTenderActivity(rows:TenderAnalyticsDaily[]):TenderActivityPoint[];
export function tenderPercent(value:number|null|undefined):string;
export function tenderActivityTooltip(point:TenderActivityPoint|undefined,previousPoint:TenderActivityPoint|undefined,unit:"tenders"|"value"|"headcount",rate?:boolean):string;
