import 'server-only';
import { db } from './db';
import { addDays, dateKey, dateValue, mondayOf, validDateKey, weekDays } from './dates';
export function selectedWeek(value: string | string[] | undefined, today: string) {
  return typeof value === 'string' && validDateKey(value) ? mondayOf(value) : mondayOf(today);
}
export async function loadWeek(restaurantId: string, monday: string) {
  const [week, sales] = await Promise.all([
    db().weeklyForecast.findUnique({ where: { restaurantId_weekStart: { restaurantId, weekStart: dateValue(monday) } }, include: { days: { orderBy: { date: 'asc' } } } }),
    db().dailySales.findMany({ where: { restaurantId, date: { gte: dateValue(monday), lte: dateValue(addDays(monday, 6)) } } }),
  ]);
  const actuals = new Map(sales.map(day => [dateKey(day.date), day]));
  const forecasts = new Map(week?.days.map(day => [dateKey(day.date), day]) ?? []);
  const days = weekDays(monday).map(date => ({ date, sale: actuals.get(date), forecast: forecasts.get(date) }));
  return { week, days };
}
