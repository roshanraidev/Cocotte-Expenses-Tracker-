import { beforeEach, expect, it, vi } from 'vitest';
import { dateValue, weekDays } from '@/lib/dates';
import { projectSales } from '@/lib/sales';
import { calculateFinance } from '@/lib/finance';
const mocks = vi.hoisted(() => ({ user: vi.fn(), week: vi.fn(), restaurant: vi.fn(), actuals: vi.fn(), transaction: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireUser: mocks.user,requirePermission:mocks.user }));
vi.mock('@/lib/financial-data', () => ({ financialWeek: mocks.week }));
vi.mock('@/lib/db', () => ({ db: () => ({ $transaction: mocks.transaction }) }));
import { weeklyPdfData, loadWeeklyPdfData } from '@/lib/weekly-pdf-data';
import { renderWeeklyPdf } from '@/lib/weekly-pdf';
import { GET } from '@/app/(protected)/reports/export/route';
import type { financialWeek } from '@/lib/financial-data';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

type Week = Awaited<ReturnType<typeof financialWeek>>;
const monday = '2026-10-05', today = '2026-10-12';
function fixture(): Week {
  const days = weekDays(monday).map((date, i) => ({ date, originalPence: 100000n, forecastPence: 120000n, actualPence: i === 0 ? 150000n : i === 1 ? 0n : null }));
  const sales = projectSales(monday, days, today);
  const invoices = [
    { id: 'i1', supplierId: 'a', supplier: { name: 'Market & Sons' }, accountingDate: dateValue(monday), amountPence: 25000n, creditForId: null },
    { id: 'i2', supplierId: 'a', supplier: { name: 'Market & Sons' }, accountingDate: dateValue(monday), amountPence: 5000n, creditForId: null },
    { id: 'credit', supplierId: 'a', supplier: { name: 'Market & Sons' }, accountingDate: dateValue(weekDays(monday)[1]), amountPence: -2000n, creditForId: 'i1' },
    { id: 'i3', supplierId: 'b', supplier: { name: 'Fresh Fish' }, accountingDate: dateValue(weekDays(monday)[2]), amountPence: 7000n, creditForId: null },
  ];
  const purchases = 35000n;
  return { days, sales, invoices, purchases, target: { targetBps: 2400 }, orders: [], opening: null, closing: null, purchasesComplete: true,
    finance: calculateFinance({ sales: sales.projectedPence, targetBps: 2400, opening: null, expectedClosing: null, purchases, commitments: 0n, actualClosing: null, actualSales: sales.actualPence, completeSales: false, purchasesConfirmed: true }),
  } as unknown as Week;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ restaurantId: 'restaurant-a', role: 'CHEF' });
  mocks.week.mockResolvedValue(fixture());
  mocks.restaurant.mockResolvedValue({ name: 'Cocotte Test Kitchen' });
  mocks.actuals.mockResolvedValue([]);
  mocks.transaction.mockImplementation(async callback => callback({ restaurant: { findUniqueOrThrow: mocks.restaurant }, dailySales: { findMany: mocks.actuals } }));
});
async function inspect(bytes: Uint8Array) {
  const task = getDocument({ data: bytes, useSystemFonts: true });
  const pdf = await task.promise;
  const pages: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    expect(page.view[2]).toBeCloseTo(595.28, 1);
    const content = await page.getTextContent();
    const items = content.items.filter(item => 'str' in item);
    for (const item of items) {
      // Every rendered line stays inside the A4 page, including overflowing supplier tables.
      expect(item.transform[4]).toBeGreaterThanOrEqual(39);
      expect(item.transform[4] + item.width).toBeLessThanOrEqual(556);
      expect(item.transform[5]).toBeGreaterThan(20);
      expect(item.transform[5]).toBeLessThan(810);
    }
    pages.push(items.map(i => i.str).join(' '));
  }
  await task.destroy();
  return pages;
}
it('downloads a real unified two-page PDF with exact Reports figures for the selected restaurant and week', async () => {
  const response = await GET(new Request(`http://localhost/reports/export?format=pdf&week=${monday}&restaurantId=other&tab=suppliers&month=2025-01`));
  expect(response.headers.get('Content-Type')).toBe('application/pdf');
  expect(response.headers.get('Content-Disposition')).toBe(`attachment; filename="Cocotte-Weekly-Report-${monday}.pdf"`);
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  expect(mocks.week).toHaveBeenCalledWith('restaurant-a', monday, expect.any(String), expect.any(Object));
  expect(mocks.restaurant).toHaveBeenCalledWith({ where: { id: 'restaurant-a' }, select: { name: true } });
  const pages = await inspect(bytes);
  expect(pages).toHaveLength(2);
  const text = pages.join(' ');
  for (const heading of ['Executive Summary', 'Sales Analysis', 'Food Purchasing', 'Sales vs Food Purchases', 'Supplier Analysis', 'Weekly Performance']) expect(text).toContain(heading);
  for (const value of ['£7,500.00', '£1,500.00', '£1,800.00', '£1,450.00', '£350.00', '£7,000.00', '£8,400.00', '23.33%', '24%', '£0.00', 'Not recorded', 'Market & Sons', 'Fresh Fish']) expect(text).toContain(value);
  expect(text).toContain('provisional');
});
it('preserves Reports projection, variance, credits, invoice counts and supplier shares', () => {
  const data = fixture();
  const report = weeklyPdfData(data, monday, today, 'Cocotte');
  expect(report.projected).toBe(data.sales!.projectedPence);
  expect(report.projected).toBe(750000n);
  expect(report.revised).toBe(840000n);
  expect(report.variance).toBe(-50000n);
  expect(report.allowance).toBe(data.finance!.allowance);
  expect(report.suppliers[0]).toEqual({ name: 'Market & Sons', amount: 28000n, count: 2, credits: 1 });
  expect(report.days[0].purchases).toBe(30000n);
  expect(report.days[1].purchases).toBe(-2000n);
  expect(report.days[1].actual).toBe(0n);
  expect(report.days[2].actual).toBeNull();
});
it('uses unchanged finalisation rules and labels a completed week Final', async () => {
  const data = fixture();
  data.days.forEach(d => d.actualPence = 100000n);
  data.sales = projectSales(monday, data.days, today);
  const report = weeklyPdfData(data, monday, today, 'Cocotte');
  expect(report.state.status).toBe('Final');
  const text = (await inspect(await renderWeeklyPdf(report))).join(' ');
  expect(text).toContain('Final purchasing %');
  expect(text).not.toContain('provisional');
  expect(weeklyPdfData(data, monday, '2026-10-11', 'Cocotte').state.status).toBe('In progress');
  data.purchasesComplete = false;
  expect(weeklyPdfData(data, monday, today, 'Cocotte').state.status).toBe('Provisional');
});
it('handles absent forecasts, zero sales and missing sales without inventing a budget or percentage', async () => {
  const data = fixture();
  data.days = []; data.sales = null; data.finance = null;
  mocks.week.mockResolvedValue(data);
  mocks.actuals.mockResolvedValue([{ date: dateValue(monday), amountPence: 0n }]);
  const report = await loadWeeklyPdfData('restaurant-a', monday, today);
  expect(report.days).toHaveLength(7);
  expect(report.actual).toBe(0n);
  expect(report.projected).toBeNull();
  expect(report.budget).toBeNull();
  expect(report.purchasingBps).toBeNull();
  expect(mocks.actuals.mock.calls[0][0].where.restaurantId).toBe('restaurant-a');
  const text = (await inspect(await renderWeeklyPdf(report))).join(' ');
  expect(text).toContain('Not recorded');
  expect(text).toContain('£0.00');
  expect(text).toContain('without positive recorded net sales');
});
it('paginates long supplier lists without dropping suppliers or making text smaller', async () => {
  const report = weeklyPdfData(fixture(), monday, today, 'Cocotte');
  report.suppliers = Array.from({ length: 80 }, (_, n) => ({ name: `Supplier ${String(n).padStart(3, '0')} ${'Long supplier name '.repeat(5)}`, amount: 1000n, count: 2, credits: 0 }));
  const pages = await inspect(await renderWeeklyPdf(report));
  expect(pages.length).toBeGreaterThan(2);
  expect(pages.join(' ')).toContain('Supplier 079');
  expect(pages.join(' ')).toContain('Weekly Performance');
});
it('denies unauthenticated PDF requests before reading report data', async () => {
  mocks.user.mockRejectedValue(new Error('redirect:/login'));
  await expect(GET(new Request('http://localhost/reports/export?format=pdf'))).rejects.toThrow('redirect:/login');
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it('keeps CSV export separate from PDF', async () => {
  const response = await GET(new Request(`http://localhost/reports/export?week=${monday}&tab=sales`));
  expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  expect(response.headers.get('Content-Disposition')).toContain('.csv');
  expect(await response.text()).toContain('Cumulative actual GBP');
});
