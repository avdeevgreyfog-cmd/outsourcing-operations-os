/** Calendar 5/2 and 6/1 stay calendar based unless a cycle origin is explicit. */
export function scheduleCycleWork(date:string,input:{workDays:number|null;restDays:number|null;anchorDate:string|null;explicitAnchor?:boolean}):boolean|null{
 const {workDays,restDays,anchorDate}=input;
 if(workDays==null||restDays==null||workDays<1||restDays<0)return null;
 if(!input.explicitAnchor&&((workDays===5&&restDays===2)||(workDays===6&&restDays===1))){
  const day=new Date(date+"T00:00:00Z").getUTCDay();return day!==0&&(workDays!==5||day!==6);
 }
 if(!anchorDate)return null;
 const offset=Math.floor((Date.parse(date+"T00:00:00Z")-Date.parse(anchorDate+"T00:00:00Z"))/86400000),cycle=workDays+restDays;
 return ((offset%cycle)+cycle)%cycle<workDays;
}

export type SchedulingCondition={specialtyId:string;shiftKind:"day"|"night"|"mixed";schedule:string|null;startTime:string|null;endTime:string|null;effectiveFrom:string|null;effectiveTo:string|null};
/** No compensation fields cross into planning-only readers. */
export function schedulingConditionForDate(conditions:SchedulingCondition[],specialtyId:string|null|undefined,shiftKind:string|null|undefined,date:string){
 return [...conditions].sort((a,b)=>Number(b.shiftKind===shiftKind)-Number(a.shiftKind===shiftKind)).find(c=>c.specialtyId===specialtyId&&(c.shiftKind===shiftKind||c.shiftKind==="mixed")&&(!c.effectiveFrom||c.effectiveFrom<=date)&&(!c.effectiveTo||c.effectiveTo>=date))??null;
}
export function schedulingCycle(condition:SchedulingCondition){
 const match=condition.schedule?.match(/^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*$/);
 return {workDays:match?Number(match[1]):null,restDays:match?Number(match[2]):null,anchorDate:condition.effectiveFrom};
}
