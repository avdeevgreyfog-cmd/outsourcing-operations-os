export type RegistryColumn<Id extends string = string> = { id: Id; label: string; width: number; required?: boolean };
export type RegistryColumnLayout<Id extends string = string> = { columns: Id[]; pinned: Id[]; widths: Partial<Record<Id, number>> };
export const registryWidth = (value: number) => Math.max(110, Math.min(480, Math.round(value)));

// Saved layouts never introduce columns outside the current module/permission list.
export function normalizeRegistryLayout<Id extends string>(value: unknown, definitions: readonly RegistryColumn<Id>[], fallback: RegistryColumnLayout<Id>): RegistryColumnLayout<Id> {
  const input = value && typeof value === "object" ? value as Partial<RegistryColumnLayout<Id>> : fallback;
  const allowed = new Set(definitions.map(column => column.id));
  const columns = Array.from(new Set((Array.isArray(input.columns) ? input.columns : fallback.columns).filter(id => allowed.has(id))));
  for (const column of definitions) if (column.required && !columns.includes(column.id)) columns.unshift(column.id);
  const pinned = Array.from(new Set((Array.isArray(input.pinned) ? input.pinned : fallback.pinned).filter(id => columns.includes(id))));
  const widths: Partial<Record<Id, number>> = {};
  for (const column of definitions) {
    const width = input.widths?.[column.id];
    if (typeof width === "number" && Number.isFinite(width)) widths[column.id] = registryWidth(width);
  }
  return { columns, pinned, widths };
}

export function orderedRegistryColumns<Id extends string>(definitions: readonly RegistryColumn<Id>[], layout: RegistryColumnLayout<Id>) {
  const columns = layout.columns.map(id => definitions.find(column => column.id === id)).filter((column): column is RegistryColumn<Id> => Boolean(column));
  return [...columns.filter(column => layout.pinned.includes(column.id)), ...columns.filter(column => !layout.pinned.includes(column.id))];
}

export function registryPinnedOffset<Id extends string>(id: Id, definitions: readonly RegistryColumn<Id>[], layout: RegistryColumnLayout<Id>, leadingWidth = 0) {
  const columns = orderedRegistryColumns(definitions, layout);
  return leadingWidth + columns.slice(0, columns.findIndex(column => column.id === id)).filter(column => layout.pinned.includes(column.id)).reduce((total, column) => total + (layout.widths[column.id] ?? column.width), 0);
}
