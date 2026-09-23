export const employmentTypeLabels:Record<string,string>={
  employment:"Трудовой договор",
  gph:"ГПХ",
  npd:"Самозанятый",
  custom:"Другое",
};

export const workerStatusLabels:Record<string,string>={
  active:"Работает",
  dismissed:"Работа завершена",
};

export function employmentTypeLabel(value:string|null|undefined){
  return value?employmentTypeLabels[value]??value:"—";
}

export function workerStatusLabel(value:string|null|undefined){
  return value?workerStatusLabels[value]??value:"—";
}
