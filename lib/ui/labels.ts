export const employmentTypeLabels:Record<string,string>={
  employment:"Трудовой договор",
  gph:"ГПХ",
  npd:"Самозанятый",
  custom:"Другое",
};

export const workerStatusLabels:Record<string,string>={
  active:"Работает",
  requires_assignment:"Требует назначения",
  dismissed:"Работа завершена",
};

export function employmentTypeLabel(value:string|null|undefined){
  return value?employmentTypeLabels[value]??value:"—";
}

export function workerStatusLabel(value:string|null|undefined){
  return value?workerStatusLabels[value]??value:"—";
}

export const shiftKindLabels:Record<string,string>={day:"Дневная смена",night:"Ночная смена",mixed:"Смешанная смена"};
export function shiftKindLabel(value:string){return shiftKindLabels[value]??value;}
