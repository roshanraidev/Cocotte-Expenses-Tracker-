import { weekDays } from './dates';
export type SalesDay = { date: string; originalPence: bigint; forecastPence: bigint; actualPence: bigint | null };
export function projectSales(monday: string, days: SalesDay[], today: string) {
  const expected = weekDays(monday);
  if (days.length !== 7 || new Set(days.map(d => d.date)).size !== 7 || days.some(d => !expected.includes(d.date))) throw new Error('A complete seven-day forecast is required.');
  if (days.some(d => d.originalPence < 0n || d.forecastPence < 0n || (d.actualPence !== null && d.actualPence < 0n))) throw new Error('Sales amounts must be non-negative.');
  const originalPence = days.reduce((sum, day) => sum + day.originalPence, 0n);
  const forecastPence = days.reduce((sum, day) => sum + day.forecastPence, 0n);
  const actualPence = days.reduce((sum, day) => sum + (day.actualPence ?? 0n), 0n);
  const remainingForecastPence = days.reduce((sum, day) => sum + (day.actualPence === null ? day.forecastPence : 0n), 0n);
  return {
    originalPence, forecastPence, actualPence, remainingForecastPence,
    projectedPence: actualPence + remainingForecastPence,
    recordedDays: days.filter(day => day.actualPence !== null).length,
    missingPastDates: days.filter(day => day.date < today && day.actualPence === null).map(day => day.date),
    variancePence: days.reduce((sum, day) => sum + (day.actualPence === null ? 0n : day.actualPence - day.originalPence), 0n),
  };
}
