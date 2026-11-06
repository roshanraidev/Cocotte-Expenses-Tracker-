import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { validateReport, reportInput } from '@/lib/zonal/validation';
import { safeProbe, zonalAdapter, zonalConfiguration } from '@/lib/zonal/adapter';
import { fingerprint, previewImport, resolveImport } from '@/lib/zonal/service';
import type { PrismaClient } from '@/generated/prisma/client';
// Explicit test fixture only. Never a seed or dashboard default.
const sample = { branch: 'Test Cocotte', date: '2026-11-03', currency: 'GBP', gross: '£1,398.50', discount: '0.00', vat: '230.58', net: '1,167.92', food: '945.83', drink: '83.75', specials: '138.33', covers: '12', transactions: '38' };
const parse = (input: unknown = sample) => validateReport(input, sample.branch, sample.date);
const actor = { id: 'super', restaurantId: 'cocotte', role: 'SUPER_USER' as const };
beforeEach(() => { vi.unstubAllEnvs(); vi.stubEnv('ZONAL_RESTAURANT_ID', 'cocotte'); vi.stubEnv('ZONAL_BRANCH', sample.branch); });
describe('Financial Detail validation', () => {
  it('parses the sample exactly in integer GBP pence, with explicit 1p department rounding', () => {
    expect(parse()).toMatchObject({ gross: '139850', discount: '0', vat: '23058', net: '116792', food: '94583', drink: '8375', specials: '13833', covers: 12, transactions: 38 });
    expect(parse(reportInput(parse()))).toEqual(parse());
  });
  it.each([{ currency: 'EUR' }, { gross: '' }, { vat: 'oops' }, { net: '1,16.92' }, { branch: 'Another branch' }, { date: '2026-11-02' }, { date: '2026-02-30' }, { food: '1000.00' }, { gross: '1400.00' }, { transactions: '-1' }, { costPercent: '24' }])('rejects invalid or changed report structure: %j', change => { expect(() => parse({ ...sample, ...change })).toThrow(); });
  it('keeps unavailable counts null and rejects missing amounts', () => {
    expect(parse({ ...sample, covers: '', transactions: '' })).toMatchObject({ covers: null, transactions: null });
    const missing = { ...sample } as Partial<typeof sample>; delete missing.drink;
    expect(() => parse(missing)).toThrow();
  });
  it('fingerprints canonical data regardless of GBP formatting', () => { expect(fingerprint(parse())).toBe(fingerprint(parse({ ...sample, gross: '1398.50', net: '1167.92' }))); });
});
function database(options: { sale?: { version: number; amountPence: bigint }; status?: string; foreign?: boolean; prior?: boolean; finalized?: boolean } = {}) {
  const record = { id: 'preview', restaurantId: 'cocotte', actorId: 'super', date: new Date('2026-11-03T00:00:00Z'), branch: sample.branch, payload: parse(), fingerprint: fingerprint(parse()), source: 'ZONAL_MANUAL', status: options.status ?? 'PREVIEW', createdAt: new Date(), salesVersion: 0 };
  const tx = { zonalConnection: { findUnique: vi.fn().mockResolvedValue(null) }, $queryRaw: vi.fn(), restaurant: { findUniqueOrThrow: vi.fn().mockResolvedValue({ currency: 'GBP' }) }, dailySales: { findUnique: vi.fn().mockResolvedValue(options.sale ?? null), create: vi.fn().mockResolvedValue({ id: 'sale' }), update: vi.fn().mockResolvedValue({ id: 'sale' }) }, zonalImport: { findFirst: vi.fn().mockImplementation(({ where }) => Promise.resolve(where.id ? options.foreign ? null : record : options.prior ? record : null)), create: vi.fn().mockResolvedValue(record), update: vi.fn() }, weeklyForecast: { findUnique: vi.fn().mockResolvedValue({ _count:{days:7}, finalizedAt: options.finalized ? new Date() : null }) }, auditLog: { create: vi.fn() } };
  return { tx, record, prisma: { ...tx, $transaction: async (f: (t: unknown) => unknown) => f(tx) } as unknown as PrismaClient };
}
describe('sales import controls', () => {
  it('restricts preview and approval to Super Users', async () => {
    const { prisma } = database(); const chef = { ...actor, role: 'CHEF' as const };
    await expect(previewImport(prisma, chef, sample)).rejects.toThrow('Super User');
    await expect(resolveImport(prisma, chef, 'preview', false, true, 'Report')).rejects.toThrow('Super User');
  });
  it('scopes preview data to the authenticated restaurant', async () => {
    const { prisma, tx } = database(); await previewImport(prisma, actor, sample);
    expect(tx.zonalImport.create.mock.calls[0][0].data.restaurantId).toBe(actor.restaurantId);
    await expect(previewImport(prisma, { ...actor, restaurantId: 'other' }, sample)).rejects.toThrow('map this restaurant');
  });
  it('rejects another restaurant’s preview', async () => {
    const { prisma, tx } = database({ foreign: true });
    await expect(resolveImport(prisma, actor, 'preview', false, true, 'Report')).rejects.toThrow('not found');
    expect(tx.zonalImport.findFirst.mock.calls[0][0].where.restaurantId).toBe(actor.restaurantId);
    expect(tx.dailySales.create).not.toHaveBeenCalled();
  });
  it('requires explicit approval of existing manual sales', async () => {
    const { prisma, record, tx } = database({ sale: { amountPence: 100n, version: 1 } }); record.salesVersion = 1;
    await expect(resolveImport(prisma, actor, 'preview', false, false, 'Report correction')).rejects.toThrow('Explicit confirmation');
    expect(tx.dailySales.update).not.toHaveBeenCalled();
    await resolveImport(prisma, actor, 'preview', false, true, 'Report correction');
    expect(tx.dailySales.update.mock.calls[0][0].data.amountPence).toBe(116792n);
  });
  it('detects concurrent sales changes and finalized weeks', async () => {
    await expect(resolveImport(database({ sale: { amountPence: 1n, version: 2 } }).prisma, actor, 'preview', false, true, 'Report')).rejects.toThrow('changed after preview');
    await expect(resolveImport(database({ finalized: true }).prisma, actor, 'preview', false, true, 'Report')).rejects.toThrow('finalized');
  });
  it('prevents duplicate reports and makes repeated approval idempotent', async () => {
    await expect(resolveImport(database({ prior: true, sale: { amountPence: 116792n, version: 1 } }).prisma, actor, 'preview', false, true, 'Report')).rejects.toThrow('Duplicate');
    const { prisma, tx } = database({ status: 'APPROVED' });
    expect(await resolveImport(prisma, actor, 'preview', false, true, 'Report')).toContain('Already approved');
    expect(tx.dailySales.update).not.toHaveBeenCalled(); expect(tx.dailySales.create).not.toHaveBeenCalled();
  });
  it('cancels without saving sales and expires old previews', async () => {
    const { prisma, tx, record } = database();
    await resolveImport(prisma, actor, 'preview', true, false, ''); expect(tx.dailySales.create).not.toHaveBeenCalled();
    record.createdAt = new Date(0);
    await expect(resolveImport(prisma, actor, 'preview', false, false, 'Report')).rejects.toThrow('expired');
  });
  it('writes net sales and a full audit inside the transaction', async () => {
    const { prisma, tx } = database(); await resolveImport(prisma, actor, 'preview', false, false, 'Historical report');
    expect(tx.dailySales.create.mock.calls[0][0].data).toMatchObject({ restaurantId: 'cocotte', amountPence: 116792n });
    expect(tx.auditLog.create.mock.calls[0][0].data.after).toMatchObject({ source: 'ZONAL_MANUAL', net: '116792', branch: sample.branch });
  });
});
describe('connection boundary', () => {
  it('never exposes credentials through configuration', () => {
    vi.stubEnv('ZONAL_USERNAME', 'private-user'); vi.stubEnv('ZONAL_PASSWORD', 'private-password');
    const config = zonalConfiguration(actor.restaurantId);
    expect(config.credentialsConfigured).toBe(true); expect(JSON.stringify(config)).not.toContain('private-');
    expect(zonalConfiguration('other').credentialsConfigured).toBe(false);
  });
  it('rejects unauthorised branch extraction before opening a browser', async () => { await expect(zonalAdapter.extract('cocotte',{username:'fixture',password:'fixture'},sample.branch,sample.date)).rejects.toThrow('not authorised'); });
  it('redacts failures and aborts timeouts without retries', async () => {
    await expect(safeProbe(async () => { throw new Error('private-password'); })).rejects.toThrow('Connection test failed.');
    let signal: AbortSignal | undefined;
    await expect(safeProbe(async s => { signal = s; await new Promise(() => {}); }, 5)).rejects.toThrow('timed out');
    expect(signal?.aborted).toBe(true);
  });
});
