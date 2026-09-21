import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { maximumCost, parsePercent, percentLabel } from '../src/lib/targets';
import { saveTarget, resolveTarget } from '../src/lib/target-service';
import type { PrismaClient } from '../src/generated/prisma/client';
const actor = { id: 'admin', restaurantId: 'restaurant', role: 'SUPER_USER' as const };
function fixture() {
  const rows = new Map<string, { id: string; targetBps: number; originalBps: number; source: string; version: number }>();
  const defaults: { targetBps: number; effectiveFrom: Date }[] = [{ targetBps: 2400, effectiveFrom: new Date('0001-01-01') }];
  const key = (a: { where: { restaurantId_weekStart: { weekStart: Date } } }) => a.where.restaurantId_weekStart.weekStart.toISOString();
  const tx = {
    $queryRaw: vi.fn(),
    weeklyTarget: { findUnique: vi.fn(async a => rows.get(key(a)) ?? null), upsert: vi.fn(async a => { const old = rows.get(key(a)); const next = old ? { ...old, targetBps: a.update.targetBps, version: old.version + 1 } : { ...a.create, id: key(a), version: 1 }; rows.set(key(a), next); return next; }) },
    targetDefault: { findFirst: vi.fn(async a => [...defaults].reverse().find(d => !a.where.effectiveFrom || d.effectiveFrom <= a.where.effectiveFrom.lte)), create: vi.fn(async a => { defaults.push(a.data); return { ...a.data, id: 'default' }; }) },
    restaurantSettings: { findUniqueOrThrow: vi.fn(async () => ({ targetBps: 2400, warningBps: 2200 })), update: vi.fn() },
    weeklyForecast: { findUnique: vi.fn(async () => null), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const prisma = { ...tx, $transaction: async (fn: (tx: unknown) => unknown) => fn(tx) } as unknown as PrismaClient;
  return { prisma, tx };
}
const input = { weekStart: '2026-09-21', percentage: '23', version: 0, reason: '' };
describe('weekly targets', () => {
  it('calculates the requested £180 difference exactly', () => {
    expect(maximumCost(1800000n, parsePercent('24'))).toBe(432000n);
    expect(maximumCost(1800000n, parsePercent('23'))).toBe(414000n);
    expect(maximumCost(1800000n, 2400) - maximumCost(1800000n, 2300)).toBe(18000n);
    expect(percentLabel(parsePercent('22.5'))).toBe('22.5%');
    expect(maximumCost(1n, 2250)).toBe(0n);
  });
  it.each(['0', '-1', '100.01', 'NaN', '24.001', '2e1'])('rejects invalid percentage %s', value => expect(() => parsePercent(value)).toThrow());
  it('enforces Chef permissions before database work', async () => {
    await expect(saveTarget({} as PrismaClient, { ...actor, role: 'CHEF' }, input)).rejects.toThrow('Only Super Users');
  });
  it('schedules targets independently and recalculates only the affected week', async () => {
    const { prisma, tx } = fixture();
    await saveTarget(prisma, actor, input, false, '2026-09-20');
    expect((await resolveTarget(prisma, 'restaurant', '2026-09-21')).targetBps).toBe(2300);
    expect((await resolveTarget(prisma, 'restaurant', '2026-09-28')).targetBps).toBe(2400);
    expect(tx.weeklyForecast.update).not.toHaveBeenCalled();
    await saveTarget(prisma, actor, { ...input, version: 1, percentage: '22.5' }, false, '2026-09-22');
    const target = await resolveTarget(prisma, 'restaurant', '2026-09-21');
    expect(target.originalBps).toBe(2300); expect(target.targetBps).toBe(2250);
    expect(maximumCost(1800000n, target.targetBps)).toBe(405000n);
    await expect(saveTarget(prisma, actor, input, false, '2026-09-22')).rejects.toThrow('Reload');
  });
  it('retains historical defaults when the next-week default changes', async () => {
    const { prisma } = fixture();
    await saveTarget(prisma, actor, { ...input, version: 2400 }, true, '2026-09-20');
    expect((await resolveTarget(prisma, 'restaurant', '2026-09-14')).targetBps).toBe(2400);
    expect((await resolveTarget(prisma, 'restaurant', '2026-09-21')).targetBps).toBe(2300);
    expect((await resolveTarget(prisma, 'restaurant', '2026-09-28')).source).toBe('DEFAULT');
  });
  it('requires historical correction reasons and retains original targets in audit', async () => {
    const { prisma, tx } = fixture();
    await expect(saveTarget(prisma, actor, input, false, '2026-10-01')).rejects.toThrow('reason');
    await saveTarget(prisma, actor, { ...input, reason: 'Correct approved target' }, false, '2026-10-01');
    expect(tx.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: 'admin', reason: 'Correct approved target', before: { targetBps: 2400, source: 'DEFAULT' }, after: expect.objectContaining({ targetBps: 2300, originalBps: 2400 }) }) });
  });
});
