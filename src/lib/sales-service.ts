import 'server-only';
import { resolveTarget } from './target-service';
import type { PrismaClient } from '@/generated/prisma/client';
import type { AppRole } from './policy';
import type { ForecastInput, DailySalesInput } from './sales-validation';
import { dateValue, mondayOf, weekDays, londonToday, dateKey } from './dates';
export class SalesError extends Error {}
export type SalesActor = { id: string; restaurantId: string; role: AppRole };
export async function saveWeeklyForecast(prisma: PrismaClient, actor: SalesActor, input: ForecastInput) {
  if (actor.role !== 'SUPER_USER') throw new SalesError('Only Super Users can create or edit forecasts.');
  const dates = weekDays(input.weekStart);
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "restaurantId" FROM "RestaurantSettings" WHERE "restaurantId" = ${actor.restaurantId} FOR UPDATE`;
    // Shared week lock serializes financial entry and corrections for this week.
    await tx.$queryRaw`SELECT id FROM "WeeklyForecast" WHERE "restaurantId" = ${actor.restaurantId} AND "weekStart" = ${dateValue(input.weekStart)} FOR UPDATE`;
    const existing = await tx.weeklyForecast.findUnique({ where: { restaurantId_weekStart: { restaurantId: actor.restaurantId, weekStart: dateValue(input.weekStart) } }, include: { days: { orderBy: { date: 'asc' } } } });
    if (existing?.finalizedAt) throw new SalesError('This week is finalized. A Super User must reopen it with an audited reason.');
    if (existing ? existing.version !== input.version : input.version !== 0) throw new SalesError('This forecast changed since you opened it. Reload before saving.');
    if (existing && input.reason.length < 3) throw new SalesError('A reason is required for forecast edits.');
    let id: string;
    if (existing) {
      if (existing.days.length !== 7) throw new SalesError('This forecast is incomplete. Contact your administrator.');
      if (existing.days.every((day, i) => day.forecastPence === input.amounts[i])) return;
      id = existing.id;
      for (let i = 0; i < 7; i++) await tx.forecastDay.update({ where: { weeklyForecastId_date: { weeklyForecastId: id, date: dateValue(dates[i]) } }, data: { forecastPence: input.amounts[i] } });
      await tx.weeklyForecast.update({ where: { id }, data: { version: { increment: 1 } } });
    } else {
      const settings = await tx.restaurantSettings.findUniqueOrThrow({ where: { restaurantId: actor.restaurantId } });
      const target = await resolveTarget(tx, actor.restaurantId, input.weekStart);
      const week = await tx.weeklyForecast.create({ data: {
        restaurantId: actor.restaurantId, weekStart: dateValue(input.weekStart),
        targetBps: target.targetBps, warningBps: Math.max(0, target.targetBps - 200), allocationDays: settings.allocationDays,
        days: { create: dates.map((date, i) => ({ date: dateValue(date), originalForecastPence: input.amounts[i], forecastPence: input.amounts[i] })) },
      } });
      id = week.id;
    }
    await tx.auditLog.create({ data: {
      restaurantId: actor.restaurantId, actorId: actor.id, action: existing ? 'FORECAST_UPDATED' : 'FORECAST_CREATED', entity: 'WeeklyForecast', entityId: id,
      ...(existing ? { before: { days: existing.days.map(day => ({ date: dateKey(day.date), pence: day.forecastPence.toString() })) } } : {}),
      after: { weekStart: input.weekStart, days: dates.map((date, i) => ({ date, pence: input.amounts[i].toString() })) }, reason: input.reason || null,
    } });
  });
}
export async function saveActualSales(prisma: PrismaClient, actor: SalesActor, input: DailySalesInput, today = londonToday()) {
  if (input.date > today) throw new SalesError('Actual sales cannot be entered for a future date.');
  const monday = mondayOf(input.date);
  if (actor.role === 'CHEF' && input.version !== 0) throw new SalesError('Only Super Users can correct saved sales.');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "restaurantId" FROM "RestaurantSettings" WHERE "restaurantId" = ${actor.restaurantId} FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM "WeeklyForecast" WHERE "restaurantId" = ${actor.restaurantId} AND "weekStart" = ${dateValue(monday)} FOR UPDATE`;
    const week = await tx.weeklyForecast.findUnique({ where: { restaurantId_weekStart: { restaurantId: actor.restaurantId, weekStart: dateValue(monday) } } });
    if (!week) throw new SalesError('A Super User must create the weekly forecast before sales can be entered.');
    if (week.finalizedAt) throw new SalesError('This week is finalized. A Super User must reopen it with an audited reason.');
    const where = { restaurantId_date: { restaurantId: actor.restaurantId, date: dateValue(input.date) } };
    const existing = await tx.dailySales.findUnique({ where });
    if (existing && actor.role !== 'SUPER_USER') throw new SalesError('Sales are already recorded for this day. Ask a Super User to correct them.');
    if (existing ? existing.version !== input.version : input.version !== 0) throw new SalesError('Sales changed since you opened this form. Reload before saving.');
    if ((existing || monday !== mondayOf(today)) && input.reason.length < 3) throw new SalesError('Explain the correction or historical entry (at least 3 characters).');
    if (existing?.amountPence === input.amount) return;
    const sale = existing
      ? await tx.dailySales.update({ where, data: { amountPence: input.amount, version: { increment: 1 } } })
      : await tx.dailySales.create({ data: { restaurantId: actor.restaurantId, date: dateValue(input.date), amountPence: input.amount } });
    await tx.auditLog.create({ data: {
      restaurantId: actor.restaurantId, actorId: actor.id, action: existing ? 'SALES_CORRECTED' : 'SALES_RECORDED', entity: 'DailySales', entityId: sale.id,
      ...(existing ? { before: { date: input.date, pence: existing.amountPence.toString() } } : {}),
      after: { date: input.date, pence: input.amount.toString() }, reason: input.reason || null,
    } });
  });
}
