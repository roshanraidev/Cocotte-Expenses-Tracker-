// Read-only verification against existing records. No seed, schema changes or writes to the database.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { db } from '../src/lib/db';
import { financialWeek } from '../src/lib/financial-data';
import { loadWeeklyPdfData } from '../src/lib/weekly-pdf-data';
import { renderWeeklyPdf } from '../src/lib/weekly-pdf';
import { formatGBP } from '../src/lib/money';
import { londonToday, mondayOf, validDateKey } from '../src/lib/dates';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';

const restaurantId = process.env.REPORT_RESTAURANT_ID ?? 'restaurant';
const today = londonToday();
const input = process.argv[2];
assert(!input || validDateKey(input), 'Pass a valid reporting date (YYYY-MM-DD).');
const monday = mondayOf(input ?? today);
try {
  const report = await loadWeeklyPdfData(restaurantId, monday, today);
  const existing = await financialWeek(restaurantId, monday, today);
  assert.equal(report.purchases, existing.purchases);
  assert.equal(report.projected, existing.sales?.projectedPence ?? null);
  assert.equal(report.budget, existing.finance?.purchasingBudget ?? null);
  assert.equal(report.allowance, existing.finance?.allowance ?? null);
  if (existing.sales) assert.equal(report.actual, existing.sales.actualPence);
  assert.equal(report.suppliers.reduce((sum, s) => sum + s.amount, 0n), report.purchases);
  const bytes = await renderWeeklyPdf(report);
  const path = `/tmp/Cocotte-Weekly-Report-${monday}.pdf`;
  await writeFile(path, bytes);
  const task = getDocument({ data: bytes, useSystemFonts: true });
  const pdf = await task.promise;
  let text = '';
  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    text += (await page.getTextContent()).items.filter(i => 'str' in i).map(i => i.str).join(' ');
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await page.render({ canvas: canvas as unknown as HTMLCanvasElement, canvasContext: canvas.getContext('2d') as unknown as CanvasRenderingContext2D, viewport }).promise;
    await writeFile(`/tmp/Cocotte-Weekly-Report-${monday}-page-${n}.png`, canvas.toBuffer('image/png'));
  }
  assert(text.includes(formatGBP(report.purchases).replaceAll('−', '-')));
  for (const value of [report.actual, report.projected, report.budget, report.allowance]) {
    if (value !== null) assert(text.includes(formatGBP(value).replaceAll('−', '-')));
  }
  console.log(`PASS: existing Reports figures match the ${pdf.numPages}-page PDF; all pages parsed and rendered. Saved ${path}`);
  console.log(`Week ${monday}: ${report.recordedDays}/7 sales days, ${report.suppliers.length} suppliers, ${report.state.status}.`);
  await task.destroy();
} finally { await db().$disconnect(); }
