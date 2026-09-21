import { describe, expect, it } from 'vitest';
import { calculateFinance, orderBudget, stockLinePence, decimal4, dailyBudgets } from '../src/lib/finance';
const input = { sales: 1800000n, targetBps: 2400, opening: 100000n, expectedClosing: 80000n, purchases: 200000n, commitments: 50000n, actualClosing: 75000n, actualSales: 1800000n, completeSales: true, purchasesConfirmed: true };
describe('exact food cost engine', () => {
  it('rounds stock line values half up using four decimal quantities and prices', () => {
    expect(stockLinePence('2.5','8.1234')).toBe(2031n);
    expect(stockLinePence('1','0.0050')).toBe(1n);
    expect(stockLinePence('1','0.0049')).toBe(0n);
    expect(stockLinePence('0','99.9999')).toBe(0n);
    expect(() => decimal4('1e4')).toThrow();
  });
  it('recalculates allowances by target without changing projected food cost', () => {
    const a = calculateFinance(input); const b = calculateFinance({ ...input,targetBps:2300 });
    expect(a.projectedCost).toBe(270000n); expect(a.allowance).toBe(162000n);
    expect(a.allowance! - b.allowance!).toBe(18000n); expect(a.projectedBps).toBe(b.projectedBps);
  });
  it('preserves unknown stock and negative allowances', () => {
    expect(calculateFinance({...input,opening:null}).allowance).toBeNull();
    expect(calculateFinance({...input,expectedClosing:null}).projectedBps).toBeNull();
    expect(calculateFinance({...input,purchases:500000n}).allowance).toBe(-138000n);
  });
  it('keeps target equality and near-threshold fractions accurate', () => {
    expect(calculateFinance({...input,opening:0n,expectedClosing:0n,purchases:432000n,commitments:0n}).warning).toBe('AT_OR_ABOVE_TARGET');
    expect(calculateFinance({...input,opening:0n,expectedClosing:0n,purchases:431999n,commitments:0n}).warning).toBe('NEAR_TARGET');
    expect(calculateFinance({...input,sales:0n}).projectedBps).toBeNull();
  });
  it('requires complete evidence for actual cost and counts credits once', () => {
    expect(calculateFinance(input).actualCost).toBeNull();
    expect(calculateFinance({...input,commitments:0n}).actualCost).toBe(225000n);
    expect(calculateFinance({...input,commitments:0n,purchases:190000n}).actualCost).toBe(215000n);
    expect(calculateFinance({...input,commitments:0n,completeSales:false}).actualCost).toBeNull();
    expect(calculateFinance({...input,commitments:0n,purchasesConfirmed:false}).actualCost).toBeNull();
  });
  it('partitions daily budgets without overspending the allowance', () => {
    const result=dailyBudgets(10000n,[{date:'2026-09-20',demand:1n},{date:'2026-09-21',demand:2n}],'2026-09-20',true)!;
    expect(result.map(d=>d.budget)).toEqual([3333n,6666n]);
    expect(result.reduce((sum,d)=>sum+d.budget,0n)).toBeLessThanOrEqual(10000n);
  });
  it('allocates the positive allowance by covered forecast demand only with stock confirmation', () => {
    const days = [{date:'2026-09-18',demand:100n},{date:'2026-09-19',demand:300n},{date:'2026-09-20',demand:600n}];
    expect(orderBudget(10000n,days,'2026-09-18','2026-09-20',true)).toBe(4000n);
    expect(orderBudget(10000n,days,'2026-09-18','2026-09-20',false)).toBeNull();
    expect(orderBudget(-10000n,days,'2026-09-18','2026-09-20',true)).toBe(0n);
    expect(orderBudget(10000n,[],null,null,true)).toBeNull();
  });
});
