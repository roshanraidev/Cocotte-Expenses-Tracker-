/** Calendar dates are YYYY-MM-DD keys, never local-midnight instants. */
export function validDateKey(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function dateKey(date: Date): string { return date.toISOString().slice(0, 10); }
export function dateValue(key: string): Date {
  if (!validDateKey(key)) throw new Error('Enter a valid calendar date.');
  return new Date(`${key}T00:00:00.000Z`);
}
export function londonToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export function addDays(key: string, days: number): string {
  const date = dateValue(key); date.setUTCDate(date.getUTCDate() + days); return dateKey(date);
}
export function mondayOf(key: string): string {
  return addDays(key, -((dateValue(key).getUTCDay() + 6) % 7));
}
export function weekDays(monday: string): string[] {
  if (mondayOf(monday) !== monday) throw new Error('The week must start on Monday.');
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
export function dayLabel(key: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'short' }).format(dateValue(key));
}
export function weekLabel(key: string): string { return `${dayLabel(key)} – ${dayLabel(addDays(key, 6))}`; }
