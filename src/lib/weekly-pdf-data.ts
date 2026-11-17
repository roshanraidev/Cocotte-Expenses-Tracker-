import 'server-only';
import { db } from './db';
import { financialWeek } from './financial-data';
import { dateKey, dateValue, addDays, weekDays } from './dates';
import { reportStatus } from './reporting';
import { ratioBps } from './finance';

type FinancialWeek = Awaited<ReturnType<typeof financialWeek>>;
export function weeklyPdfData(data: FinancialWeek, monday: string, today: string, restaurant: string, recordedSales: { date: Date; amountPence: bigint }[] = []) {
  const days = weekDays(monday).map(date => {
    const day = data.days.find(d => d.date === date);
    return { date, original: day?.originalPence ?? null, revised: day?.forecastPence ?? null,
      actual: day?.actualPence ?? recordedSales.find(s => dateKey(s.date) === date)?.amountPence ?? null,
      purchases: data.invoices.filter(i => dateKey(i.accountingDate) === date).reduce((sum, i) => sum + i.amountPence, 0n) };
  });
  const recordedDays = days.filter(d => d.actual !== null).length;
  const actual = data.sales?.actualPence ?? (recordedDays ? days.reduce((sum, d) => sum + (d.actual ?? 0n), 0n) : null);
  const state = reportStatus({ monday, today, recordedDays, opening: data.opening, closing: data.closing,
    purchasesConfirmed: data.purchasesComplete, outstandingOrders: data.orders.length });
  const suppliers = new Map<string, { name: string; amount: bigint; count: number; credits: number }>();
  for (const invoice of data.invoices) {
    const row = suppliers.get(invoice.supplierId) ?? { name: invoice.supplier.name, amount: 0n, count: 0, credits: 0 };
    row.amount += invoice.amountPence;
    if (invoice.creditForId) row.credits++; else row.count++;
    suppliers.set(invoice.supplierId, row);
  }
  return { monday, restaurant, state, days, recordedDays, actual,
    original: data.sales?.originalPence ?? null, revised: data.sales?.forecastPence ?? null,
    projected: data.sales?.projectedPence ?? null, variance: data.sales?.variancePence ?? null,
    targetBps: data.target.targetBps, purchases: data.purchases,
    budget: data.finance?.purchasingBudget ?? null, allowance: data.finance?.allowance ?? null,
    purchasingBps: ratioBps(data.purchases, actual ?? 0n),
    suppliers: [...suppliers.values()].sort((a, b) => a.amount > b.amount ? -1 : a.amount < b.amount ? 1 : a.name.localeCompare(b.name)),
  };
}
export type WeeklyPdfData = ReturnType<typeof weeklyPdfData>;

export async function loadWeeklyPdfData(restaurantId: string, monday: string, today: string) {
  // One consistent read, using the same delivery-week purchases and financial rules as Reports.
  return db().$transaction(async tx => {
    const restaurant = await tx.restaurant.findUniqueOrThrow({ where: { id: restaurantId }, select: { name: true } });
    const data = await financialWeek(restaurantId, monday, today, tx);
    // Recorded sales remain reportable even when the week has no complete forecast.
    const actuals = data.days.length === 7 ? [] : await tx.dailySales.findMany({
      where: { restaurantId, date: { gte: dateValue(monday), lte: dateValue(addDays(monday, 6)) } },
      select: { date: true, amountPence: true },
    });
    return weeklyPdfData(data, monday, today, restaurant.name, actuals);
  }, { isolationLevel: 'RepeatableRead' });
}
