import type { WorkerRow } from "@/lib/data/service";
import { rub } from "@/lib/ui/format";
const today=()=>new Date().toISOString().slice(0,10);
const absenceLabels:Record<string,string>={intershift:"Межвахта",vacation:"Отпуск",sick:"Больничный",personal:"Личное отсутствие",other:"Отсутствие"};
const timeCodeLabels:Record<string,string>={WORK:"На смене",NO_SHOW:"Невыход",DAY_OFF:"Выходной",INTERSHIFT:"Межвахта",VACATION:"Отпуск",SICK:"Больничный"};
export function todayState(row:WorkerRow){
  const current=operationalState(row);
  if(current!=="Работает")return current;
  if(row.todayTimeCode&&timeCodeLabels[row.todayTimeCode])return timeCodeLabels[row.todayTimeCode];
  if(row.todayShiftAssigned)return row.todayShiftConfirmed?"Смена подтверждена":"Смена назначена";
  return "Нет смены";
}
export function todayStateTone(row:WorkerRow){
  const state=todayState(row);
  if(state==="Невыход")return "bad" as const;
  if(["Больничный","Отпуск","Межвахта","Смена назначена"].includes(state))return "warn" as const;
  if(["На смене","Смена подтверждена"].includes(state))return "good" as const;
  return "neutral" as const;
}
export function scheduleLabel(row:WorkerRow){
  const cycle=row.scheduleWorkDays!=null?row.scheduleWorkDays+"/"+(row.scheduleRestDays??0):"—";
  const shift=row.scheduleShiftKind==="day"?"день":row.scheduleShiftKind==="night"?"ночь":row.scheduleShiftKind==="mixed"?"день/ночь":"";
  return shift?cycle+" · "+shift:cycle;
}
export function nextChange(row:WorkerRow){
  const changes:Array<{date:string;text:string}>=[];
  if(row.plannedExitDate)changes.push({date:row.plannedExitDate,text:"уход "+formatDate(row.plannedExitDate)});
  if(row.plannedTransferDate)changes.push({date:row.plannedTransferDate,text:"перевод "+formatDate(row.plannedTransferDate)+(row.plannedTransferObject?" · "+row.plannedTransferObject:"")});
  if(row.absenceStatus==="confirmed"&&row.absenceFrom&&row.absenceFrom<=today()){
    changes.push({date:row.absenceTo??"9999-12-31",text:row.absenceTo?"возврат "+formatDate(addDays(row.absenceTo,1)):"дата возврата не задана"});
  }else if(row.absenceFrom&&row.absenceFrom>today())changes.push({date:row.absenceFrom,text:(absenceLabels[row.absenceType??""]??"Отсутствие").toLocaleLowerCase("ru")+" с "+formatDate(row.absenceFrom)});
  return changes.sort((a,b)=>a.date.localeCompare(b.date))[0]?.text??"—";
}
export function documentsLabel(value:string|null|undefined){return ({not_received:"Не получены",received:"Получены мастером",completed:"Готовы",submitted:"Переданы",processing:"На оформлении",collecting:"Собираются",problem:"Есть проблема"} as Record<string,string>)[value??""]??"Не указано"}
export function workerNeedsAttention(row:WorkerRow){
  if(row.status!=="active")return false;
  if(!row.objectId||!row.specialtyId)return true;
  if(row.todayTimeCode==="NO_SHOW"||row.todayAttendanceEvent==="no_show")return true;
  if(row.employmentDocumentsStatus&&row.employmentDocumentsStatus!=="completed")return true;
  if(Number(row.ppeRequiredCount??0)>Number(row.ppeIssuedCount??0))return true;
  if(row.absenceStatus==="confirmed"&&row.absenceFrom&&row.absenceFrom<=today()&&!row.absenceTo)return true;
  if(row.plannedExitDate||row.plannedTransferDate)return true;
  if(row.todayShiftAssigned&&!row.todayShiftConfirmed)return true;
  return false;
}
export function operationalState(row:WorkerRow){if(row.status==="dismissed")return"Работа завершена";if(row.startDate&&row.startDate>today())return"Ожидает выхода";const current=Boolean(row.absenceStatus==="confirmed"&&row.absenceFrom&&row.absenceFrom<=today()&&(!row.absenceTo||row.absenceTo>=today()));return current?(absenceLabels[row.absenceType??""]??"Отсутствует"):"Работает"}
export function availabilityChange(row:WorkerRow){if(!row.absenceFrom)return"—";const label=absenceLabels[row.absenceType??""]??"Отсутствие";if(row.absenceStatus==="confirmed"&&row.absenceFrom<=today()&&(!row.absenceTo||row.absenceTo>=today()))return row.absenceTo?`возврат ${formatDate(addDays(row.absenceTo,1))}`:"дата возврата открыта";return `${label.toLocaleLowerCase("ru")} с ${formatDate(row.absenceFrom)}`}
export function addDays(value:string,days:number){const date=new Date(value+"T00:00:00Z");date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10)}
export function formatDate(value:string){return new Intl.DateTimeFormat("ru-RU").format(new Date(value+"T00:00:00"))}
export function rateLabel(row:WorkerRow){if(row.rate==null)return"—";const unit=row.rateUnit==="shift"?"/смену":row.rateUnit==="month"?"/мес":"/ч";if(row.rateUnit==="shift"&&Number(row.paidHoursPerShift)>0)return`${rub(row.rate)}${unit} · ${rub(Number(row.rate)/Number(row.paidHoursPerShift))}/ч`;return`${rub(row.rate)}${unit}`}
