// Presentation of missing facts; never inferred dates, money or assignments.
export function objectMissingFields(row) {
  return [
    !row.clientId && "Клиент",
    !row.legalEntityId && "Наше юрлицо",
    !row.regionId && "Регион",
    !row.address?.trim() && "Адрес",
    !row.ownerUserId && "Менеджер объекта",
    !row.actualStartDate && "Дата начала — неизвестна",
    row.clientId && row.clientDetailsComplete === false && "Реквизиты клиента",
    row.legalEntityId && row.legalDetailsComplete === false && "Реквизиты нашего юрлица",
  ].filter(value=>typeof value === "string");
}
export function workerMissingFields(row) {
  return [
    !row.phone?.trim() && "Телефон",
    !row.objectId && "Действующее назначение на объект",
    !row.specialtyId && "Специальность назначения",
    !row.startDate && "Дата назначения — неизвестна",
    !row.employment && "Оформление",
    row.rate == null && "Ставка",
  ].filter(value=>typeof value === "string");
}
