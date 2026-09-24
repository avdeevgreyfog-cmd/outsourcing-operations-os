export type WorkforceStatusInput={
  status:string;
  absenceStatus?:string|null;
  absenceType?:string|null;
  absenceFrom?:string|null;
  absenceTo?:string|null;
  todayTimeCode?:string|null;
  todayFactHours?:number|string|null;
  todayEntrySource?:string|null;
  todayShiftAssigned?:boolean|null;
  todayShiftConfirmed?:boolean|null;
  todayShiftReserve?:boolean|null;
  todayShiftTime?:string|null;
  todayAttendanceEvent?:string|null;
};

export type WorkforceStatus={
  key:string;
  label:string;
  tone:"good"|"info"|"warn"|"bad"|"neutral";
  source:string;
};

const absenceLabels:Record<string,string>={
  intershift:"Межвахта",
  vacation:"Отпуск",
  sick:"Больничный",
  personal:"Личное отсутствие",
  other:"Отсутствует",
};

export function isoToday(){return new Date().toISOString().slice(0,10)}

export function activeAbsence(row:WorkforceStatusInput,today=isoToday()){
  return row.absenceStatus==="confirmed"&&Boolean(row.absenceFrom)&&row.absenceFrom! <= today&&(!row.absenceTo||row.absenceTo>=today);
}

export function workerObjectState(row:WorkforceStatusInput,today=isoToday()):WorkforceStatus{
  if(row.status==="dismissed")return{key:"ended",label:"Работа завершена",tone:"neutral",source:"Статус сотрудника"};
  if(activeAbsence(row,today)){
    const label=absenceLabels[row.absenceType??""]??"Отсутствует";
    return{key:row.absenceType??"absence",label,tone:row.absenceType==="sick"?"warn":"info",source:"Период отсутствия"};
  }
  return{key:"working_period",label:"Рабочий период",tone:"good",source:"Назначение на объект"};
}

export function workerTodayStatus(row:WorkforceStatusInput,today=isoToday()):WorkforceStatus{
  if(row.status==="dismissed")return{key:"ended",label:"Работа завершена",tone:"neutral",source:"Статус сотрудника"};
  if(activeAbsence(row,today)){
    const label=absenceLabels[row.absenceType??""]??"Отсутствует";
    return{key:row.absenceType??"absence",label,tone:row.absenceType==="sick"?"warn":"info",source:"Период отсутствия"};
  }
  switch(row.todayTimeCode){
    case "DAY_OFF":return{key:"day_off",label:"Выходной",tone:"neutral",source:"Табель"};
    case "VACATION":return{key:"vacation",label:"Отпуск",tone:"info",source:"Табель"};
    case "INTERSHIFT":return{key:"intershift",label:"Межвахта",tone:"info",source:"Табель"};
    case "SICK":return{key:"sick",label:"Больничный",tone:"warn",source:"Табель"};
    case "NO_SHOW":return{key:"no_show",label:"Невыход",tone:"bad",source:"Табель"};
    case "ABSENCE":return{key:"absence",label:"Отсутствует",tone:"warn",source:"Табель"};
    case "WORK":if(Number(row.todayFactHours??0)>0)return{key:"on_shift",label:"На смене",tone:"good",source:"Табель"};break;
  }
  if(row.todayAttendanceEvent==="no_show")return{key:"no_show",label:"Невыход",tone:"bad",source:"Факт смены"};
  if(row.todayAttendanceEvent==="arrival")return{key:"on_shift",label:"На смене",tone:"good",source:"Факт смены"};
  if(row.todayShiftAssigned){
    if(row.todayShiftReserve)return{key:"reserve",label:"Резерв",tone:"info",source:"План смены"};
    return{key:"assigned",label:row.todayShiftConfirmed?"Подтверждён":"Назначен",tone:"info",source:"План смены"};
  }
  return{key:"unmarked",label:"Нет отметки",tone:"neutral",source:"Сегодня"};
}

export function absenceTypeLabel(type:string|null|undefined){return absenceLabels[type??""]??"Отсутствие"}
