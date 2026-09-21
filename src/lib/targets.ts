import { z } from 'zod';
import { mondayOf, validDateKey } from './dates';
export function parsePercent(value: string): number {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(value.trim())) throw new Error('Enter a percentage with up to two decimal places.');
  const [whole, fraction = ''] = value.trim().split('.');
  const bps = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (bps < 1 || bps > 10000) throw new Error('Target must be between 0.01% and 100%.');
  return bps;
}
export function percentInput(bps: number) { return `${Math.trunc(bps / 100)}.${String(bps % 100).padStart(2, '0')}`; }
export function percentLabel(bps: number) { return `${percentInput(bps).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1')}%`; }
export const targetSchema = z.object({
  weekStart: z.string().refine(v => validDateKey(v) && mondayOf(v) === v, 'Select a Monday.'),
  percentage: z.string().transform((v, ctx) => { try { return parsePercent(v); } catch (e) { ctx.addIssue({ code: 'custom', message: (e as Error).message }); return z.NEVER; } }),
  version: z.coerce.number().int().nonnegative(),
  reason: z.string().trim().max(500),
});
export function maximumCost(projectedPence: bigint, targetBps: number): bigint {
  if (projectedPence < 0n || !Number.isInteger(targetBps) || targetBps < 1 || targetBps > 10000) throw new Error('Invalid sales or target.');
  // Floor the allowance: never authorize a fraction of a penny beyond the target.
  return projectedPence * BigInt(targetBps) / 10000n;
}
