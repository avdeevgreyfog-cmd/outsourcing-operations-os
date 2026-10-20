export class EditConflictError extends Error {
  constructor(){super("Запись изменилась после открытия формы. Обновите карточку и повторите правку. Ваш ввод сохранён в открытой форме.");}
}

export function assertEditVersion(expected:string|undefined,current:string){
  if(expected!==undefined&&expected!==current)throw new EditConflictError();
}
