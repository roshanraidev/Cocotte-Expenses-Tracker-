import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { londonToday, mondayOf, weekDays, validDateKey } from '../src/lib/dates';
import { parsePounds, poundsInput } from '../src/lib/money';
import { projectSales } from '../src/lib/sales';
import { forecastSchema } from '../src/lib/sales-validation';
import { saveActualSales, saveWeeklyForecast } from '../src/lib/sales-service';
import type { PrismaClient } from '../src/generated/prisma/client';
const monday = '2026-09-14';
const actor = { id: 'chef', restaurantId: 'restaurant', role: 'CHEF' as const };
describe('sales planning', () => {
  it('uses London dates across midnight and daylight saving changes', () => {
    expect(londonToday(new Date('2026-09-20T23:30:00Z'))).toBe('2026-09-21');
    expect(londonToday(new Date('2026-12-20T23:30:00Z'))).toBe('2026-12-20');
    expect(weekDays('2026-03-23')[6]).toBe('2026-03-29');
    expect(mondayOf('2027-01-01')).toBe('2026-12-28');
    expect(validDateKey('2026-02-29')).toBe(false);
  });
  it('parses exact pence and rejects ambiguous or negative amounts', () => {
    expect(parsePounds('999999999999.99')).toBe(99999999999999n);
    expect(poundsInput(parsePounds('0.01'))).toBe('0.01');
    for (const value of ['1,000', '-1', '0.001', '1e3', '']) expect(() => parsePounds(value)).toThrow();
  });
  it.each([0n, 5000n, 15000n])('replaces forecast with actual %s, including zero', actual => {
    const days = weekDays(monday).map((date, i) => ({ date, originalPence: 10000n, forecastPence: 12000n, actualPence: i === 0 ? actual : null }));
    const result = projectSales(monday, days, '2026-09-16');
    expect(result.originalPence).toBe(70000n);
    expect(result.projectedPence).toBe(60000n + actual);
    expect(result.recordedDays).toBe(1);
    expect(result.missingPastDates).toEqual(['2026-09-15']);
    expect(result.variancePence).toBe(actual - 10000n);
  });
  it('requires seven days, a Monday and reasons for forecast revisions', () => {
    const input = { weekStart: monday, version: 0, amounts: Array(7).fill('100'), reason: '' };
    expect(forecastSchema.safeParse(input).success).toBe(true);
    expect(forecastSchema.safeParse({ ...input, version: 1 }).success).toBe(false);
    expect(forecastSchema.safeParse({ ...input, weekStart: '2026-09-15' }).success).toBe(false);
    expect(forecastSchema.safeParse({ ...input, amounts: ['100'] }).success).toBe(false);
    expect(() => projectSales(monday, [], monday)).toThrow();
  });
  it('denies Chef forecast writes and corrections before touching the database', async () => {
    const prisma = {} as PrismaClient;
    await expect(saveWeeklyForecast(prisma, actor, { weekStart: monday, version: 0, amounts: Array(7).fill(100n), reason: '' })).rejects.toThrow('Only Super Users');
    await expect(saveActualSales(prisma, actor, { date: monday, version: 1, amount: 100n, reason: 'Correction' }, monday)).rejects.toThrow('Only Super Users');
    await expect(saveActualSales(prisma, actor, { date: '2026-09-15', version: 0, amount: 100n, reason: '' }, monday)).rejects.toThrow('future date');
  });
});

describe('transactional sales safeguards', () => {
  function database({ finalized = false, version = 1, sale = true, auditFails = false } = {}) {
    const tx = {
      $queryRaw: vi.fn(),
      weeklyForecast: { findUnique: vi.fn().mockResolvedValue({ id: 'week', version, finalizedAt: finalized ? new Date() : null, days: weekDays(monday).map(date => ({ date: new Date(`${date}T00:00:00Z`), forecastPence: 100n })) }), update: vi.fn() },
      dailySales: { findUnique: vi.fn().mockResolvedValue(sale ? { id: 'sale', version, amountPence: 100n } : null), update: vi.fn().mockResolvedValue({ id: 'sale' }), create: vi.fn().mockResolvedValue({ id: 'sale' }) },
      forecastDay: { update: vi.fn() },
      auditLog: { create: auditFails ? vi.fn().mockRejectedValue(new Error('Audit unavailable')) : vi.fn() },
    };
    const prisma = { $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;
    return { prisma, tx };
  }
  const admin = { ...actor, role: 'SUPER_USER' as const };
  const input = { date: monday, version: 1, amount: 200n, reason: 'Correct till total' };
  it('rejects stale sales and forecast forms without writing', async () => {
    const { prisma, tx } = database({ version: 2 });
    await expect(saveActualSales(prisma, admin, input, monday)).rejects.toThrow('Reload');
    await expect(saveWeeklyForecast(prisma, admin, { weekStart: monday, version: 1, amounts: Array(7).fill(200n), reason: 'New bookings' })).rejects.toThrow('Reload');
    expect(tx.dailySales.update).not.toHaveBeenCalled();
    expect(tx.forecastDay.update).not.toHaveBeenCalled();
  });
  it('rejects finalized weeks and Chef attempts to overwrite using version zero', async () => {
    await expect(saveActualSales(database({ finalized: true }).prisma, admin, input, monday)).rejects.toThrow('finalized');
    await expect(saveActualSales(database().prisma, actor, { ...input, version: 0 }, monday)).rejects.toThrow('already recorded');
  });
  it('requires correction reasons and writes exact audit values', async () => {
    const { prisma, tx } = database();
    await expect(saveActualSales(prisma, admin, { ...input, reason: '' }, monday)).rejects.toThrow('Explain');
    await saveActualSales(prisma, admin, input, monday);
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'SALES_CORRECTED', before: { date: monday, pence: '100' }, after: { date: monday, pence: '200' } }) });
    await expect(saveActualSales(database({ auditFails: true }).prisma, admin, input, monday)).rejects.toThrow('Audit unavailable');
  });
});
