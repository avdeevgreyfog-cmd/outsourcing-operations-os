/** @param {string} month */
export function validTimesheetMonth(month){return /^(20\d{2})-(0[1-9]|1[0-2])$/.test(month);}
/** @param {number|string|null|undefined} value */
export function timesheetHours(value){const n=typeof value==="number"?value:typeof value==="string"&&/^\d+(?:[.,]\d+)?$/.test(value.trim())?Number(value.replace(",",".")):0;return Number.isFinite(n)&&n>0?n:0;}
/**
 * Condition rows may split one worker within a month. Merge disjoint cells by date,
 * without counting the same object/date/segment twice. Plans never become worked shifts.
 * @param {Array<{objectId:string,object:string,rows:Array<{dayCells?:Record<string,number|string|null>,nightCells?:Record<string,number|string|null>}>}>} sheets
 */
export function summarizeWorkerTimesheet(sheets){
 const cells=new Map();
 for(const sheet of sheets)for(const row of sheet.rows)for(const segment of ["day","night"])for(const [day,value] of Object.entries(segment==="day"?row.dayCells??{}:row.nightCells??{})){
  const key=[sheet.objectId,day,segment].join(":");
  if(!cells.has(key)||timesheetHours(value)>timesheetHours(cells.get(key)))cells.set(key,value);
 }
 let hours=0,dayShifts=0,nightShifts=0;const days=new Set();
 for(const [key,value] of cells){const h=timesheetHours(value);if(!h)continue;hours+=h;const parts=key.split(":");days.add(parts[1]);if(parts[2]==="day")dayShifts++;else nightShifts++;}
 return {hours:Number(hours.toFixed(2)),shifts:dayShifts+nightShifts,dayShifts,nightShifts,workedDays:days.size};
}
