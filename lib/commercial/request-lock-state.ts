export const commercialClosedStatuses=['accepted','prelaunch','launch_ready','launched'];
export function isRequestCommercialLocked(record:{status:string;commercialLocked?:boolean}){
  return Boolean(record.commercialLocked)||commercialClosedStatuses.includes(record.status);
}
