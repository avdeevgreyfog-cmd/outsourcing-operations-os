// Tender deadlines are entered in Moscow time, independent of browser/server TZ.
const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
export function tenderDateTimeInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const fields = Object.fromEntries(parts.formatToParts(date).map(part => [part.type, part.value]));
  return `${fields.year}-${fields.month}-${fields.day}T${fields.hour}:${fields.minute}`;
}
export function tenderDateTimeIso(value: string, previousValue?: string | null): string | null {
  if (!value) return null;
  // Keep seconds/precision when an existing value has not been edited.
  if (previousValue && value === tenderDateTimeInput(previousValue)) return previousValue;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+03:00`);
  if (!Number.isFinite(date.getTime()) || tenderDateTimeInput(date.toISOString()) !== value) return null;
  return date.toISOString();
}
export function formatTenderDateTime(value: string | null | undefined): string {
  const input = tenderDateTimeInput(value);
  if (!input) return '—';
  const [date, time] = input.split('T');
  return `${date.split('-').reverse().join('.')} ${time} МСК`;
}
