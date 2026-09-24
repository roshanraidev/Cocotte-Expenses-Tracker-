import { maximumCost } from './targets';
/** Fixed-point decimal quantity/unit cost: four places; no binary floating point. */
export function decimal4(value: string): bigint {
  if (!/^\d{1,10}(\.\d{1,4})?$/.test(value)) throw new Error('Use a non-negative decimal with up to four decimal places.');
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, '0'));
}
export function stockLinePence(quantity: string, price: string): bigint {
  return (decimal4(quantity) * decimal4(price) + 500000n) / 1000000n;
}
export function ratioBps(cost: bigint, sales: bigint): bigint | null { return sales > 0n ? (cost * 10000n) / sales : null; }
export function ratioLabel(bps: bigint | null) { if (bps === null) return 'Not available'; const sign = bps < 0n ? '−' : ''; const n = bps < 0n ? -bps : bps; return `${sign}${n / 100n}.${String(n % 100n).padStart(2, '0')}%`; }
export function calculateFinance(input: { sales: bigint; targetBps: number; opening: bigint | null; expectedClosing: bigint | null; purchases: bigint; commitments: bigint; actualClosing: bigint | null; actualSales: bigint; completeSales: boolean; purchasesConfirmed: boolean }) {
  const maximum = maximumCost(input.sales, input.targetBps);
  // Purchasing control counts every confirmed delivery-week purchase, not food consumed.
  // Stock values remain available for optional stock reporting but do not affect the allowance.
  const projectedCost = input.purchases;
  const purchasingBudget = maximum;
  const allowance = purchasingBudget - input.purchases;
  const projectedBps = ratioBps(input.purchases, input.sales);
  const actualCost = input.completeSales && input.purchasesConfirmed && input.commitments === 0n ? input.purchases : null;
  const warning = input.sales <= 0n ? 'UNKNOWN' : input.purchases * 10000n >= input.sales * BigInt(input.targetBps) ? 'AT_OR_ABOVE_TARGET' : input.purchases * 10000n >= input.sales * BigInt(Math.max(0, input.targetBps - 200)) ? 'NEAR_TARGET' : 'BELOW_TARGET';
  return { maximum, purchasingBudget, projectedCost, allowance, projectedBps, actualCost, actualBps: actualCost === null ? null : ratioBps(actualCost, input.actualSales), warning };
}
export function orderBudget(allowance: bigint | null, days: { date: string; demand: bigint }[], from: string | null, until: string | null, sufficient: boolean): bigint | null {
  if (allowance === null || !sufficient || !from || !until || until <= from) return null;
  const remaining = days.filter(d => d.date >= from);
  const demand = remaining.reduce((sum, d) => sum + d.demand, 0n);
  if (demand <= 0n) return null;
  const covered = remaining.filter(d => d.date < until).reduce((sum, d) => sum + d.demand, 0n);
  return allowance <= 0n ? 0n : allowance * covered / demand;
}
/** Display-only daily guidance partitions one allowance; rounding remainder stays unallocated. */
export function dailyBudgets(allowance: bigint | null, days: { date: string; demand: bigint }[], from: string, sufficient: boolean) {
  if (allowance === null || !sufficient) return null;
  const remaining = days.filter(d => d.date >= from);
  const total = remaining.reduce((sum,d) => sum + d.demand,0n);
  if (total <= 0n) return null;
  return remaining.map(d => ({ date: d.date, budget: allowance <= 0n ? 0n : allowance * d.demand / total }));
}
