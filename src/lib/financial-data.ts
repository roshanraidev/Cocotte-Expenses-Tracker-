import 'server-only';
import type { Prisma } from '@/generated/prisma/client';
import { db } from './db';
import { addDays, dateKey, dateValue } from './dates';
import { resolveTarget } from './target-service';
import { calculateFinance, orderBudget } from './finance';
import { projectSales } from './sales';
export function financialWeek(restaurantId: string, monday: string, today: string, tx?: Prisma.TransactionClient) {
  return tx ? readFinancialWeek(restaurantId,monday,today,tx) : db().$transaction(client => readFinancialWeek(restaurantId,monday,today,client), { isolationLevel: 'RepeatableRead' });
}
async function readFinancialWeek(restaurantId: string, monday: string, today: string, tx: Prisma.TransactionClient) {
  const end = addDays(monday,6); const range = { gte: dateValue(monday), lte: dateValue(end) };
  const [week, actuals, invoices, orders, closingCount, target] = [
    await tx.weeklyForecast.findUnique({ where: { restaurantId_weekStart: { restaurantId, weekStart: dateValue(monday) } }, include: { days: { orderBy: { date: 'asc' } } } }),
    await tx.dailySales.findMany({ where: { restaurantId, date: range } }),
    await tx.purchaseInvoice.findMany({ where: { restaurantId, accountingDate: range, confirmedAt: { not: null }, voidedAt: null }, include: { supplier: true } }),
    await tx.supplierOrder.findMany({ where: { restaurantId, expectedDeliveryDate: range, status: 'PLACED' }, include: { supplier: true } }),
    await tx.stockCount.findUnique({ where: { restaurantId_date: { restaurantId, date: dateValue(end) } } }),
    await resolveTarget(tx,restaurantId,monday),
  ] as const;
  const days = week?.days.map(d => ({ date: dateKey(d.date), originalPence: d.originalForecastPence, forecastPence: d.forecastPence, actualPence: actuals.find(a => dateKey(a.date) === dateKey(d.date))?.amountPence ?? null })) ?? [];
  const sales = days.length === 7 ? projectSales(monday,days,today) : null;
  const purchases = invoices.reduce((sum,i) => sum + i.amountPence,0n);
  const commitments = orders.reduce((sum,o) => sum + o.estimatedAmountPence,0n);
  const opening = week?.openingStockPence ?? null;
  const closing = week?.actualClosingStockPence ?? (closingCount?.status === 'CONFIRMED' ? closingCount.totalValuePence : null);
  const unconfirmed = await tx.purchaseInvoice.count({where:{restaurantId,accountingDate:range,confirmedAt:null,voidedAt:null}});
  const purchasesComplete = unconfirmed === 0 && orders.length === 0 && week?.purchasesConfirmedAt != null;
  const finance = sales ? calculateFinance({ sales: sales.projectedPence, targetBps: target.targetBps, opening, expectedClosing: week?.expectedClosingStockPence ?? null, purchases, commitments, actualClosing: closing, actualSales: sales.actualPence, completeSales: sales.recordedDays === 7, purchasesConfirmed: purchasesComplete }) : null;
  const nextDate = week?.nextDeliveryDate ? dateKey(week.nextDeliveryDate) : null;
  const nextBudget = nextDate && nextDate >= today ? orderBudget(finance?.allowance ?? null,days.map(d => ({ date: d.date, demand: d.forecastPence })),nextDate,week?.followingDeliveryDate ? dateKey(week.followingDeliveryDate) : null,week?.stockAvailabilityConfirmed ?? false) : null;
  return { week, days, sales, purchasesComplete, purchases, commitments, opening, closing, target, finance, nextBudget, invoices, orders };
}
