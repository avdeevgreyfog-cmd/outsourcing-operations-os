export const SYSTEM_ADMIN_CAPABILITIES = [
  { capability: "organization.manage", label: "Настройки организации", description: "Общие настройки рабочей организации." },
  { capability: "organization.unit.manage", label: "Структура и подразделения", description: "Создание и изменение подразделений и оргструктуры." },
  { capability: "organization.position.manage", label: "Должности и роли", description: "Должностные профили, штатные позиции и процессные роли." },
  { capability: "organization.employee.manage", label: "Сотрудники и приглашения", description: "Добавление, изменение и блокировка сотрудников компании." },
  { capability: "organization.access.manage", label: "Права должностей", description: "Настройка наследуемых прав должностных профилей и процессных ролей." },
  { capability: "admin.permissions.manage", label: "Индивидуальные исключения", description: "Персональные разрешения и запреты поверх наследуемого доступа." },
  { capability: "audit.read", label: "Журнал действий", description: "Просмотр высокорисковых и системных изменений." },
  { capability: "admin.system_access.manage", label: "Делегирование администраторов", description: "Назначение системных полномочий другим сотрудникам.", ownerOnly: true },
] as const;

export const OWNER_SYSTEM_CAPABILITIES = SYSTEM_ADMIN_CAPABILITIES.map((item) => item.capability);

export const SYSTEM_ADMIN_CAPABILITY_SET = new Set<string>(OWNER_SYSTEM_CAPABILITIES);

export const SYSTEM_ONLY_CAPABILITY_SET = new Set<string>(OWNER_SYSTEM_CAPABILITIES);

export function isSystemAdminCapability(capability: string) {
  return SYSTEM_ADMIN_CAPABILITY_SET.has(capability);
}

export function isSystemOnlyCapability(capability: string) {
  return SYSTEM_ONLY_CAPABILITY_SET.has(capability);
}
