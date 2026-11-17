import 'server-only';
import PDFDocument from 'pdfkit';
import type { WeeklyPdfData } from './weekly-pdf-data';
import { addDays, dayLabel } from './dates';
import { formatGBP } from './money';
import { percentLabel } from './targets';
import { ratioBps, ratioLabel } from './finance';

const GREEN = '#214a37', GOLD = '#b69a59', INK = '#25362c', MUTED = '#667267', PALE = '#eef2ec';
const money = (value: bigint | null) => value === null ? 'Not available' : formatGBP(value).replaceAll('−', '-');
const percentage = (value: bigint | null) => ratioLabel(value).replaceAll('−', '-');

export async function renderWeeklyPdf(report: WeeklyPdfData): Promise<Uint8Array> {
  const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true,
    info: { Title: `Cocotte Weekly Report ${report.monday}`, Author: 'Cocotte', Subject: 'Net sales and confirmed food purchasing' } });
  const chunks: Buffer[] = [];
  const output = new Promise<Uint8Array>((resolve, reject) => {
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
    doc.on('error', reject);
  });
  const left = 40, width = doc.page.width - 80, bottom = doc.page.height - 65;
  let y = 40;
  function text(value: string, x: number, top: number, w: number, size = 10, bold = false, color = INK) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color).text(value, x, top, { width: w, lineGap: 2 });
  }
  function header() {
    text('COCOTTE', left, 36, width, 24, true, GREEN);
    text('KITCHEN INTELLIGENCE', left, 66, width, 8, false, MUTED);
    text('Weekly Sales & Food Purchasing Report', left, 87, width, 16, true, GREEN);
    const subtitle = `${report.restaurant} | ${dayLabel(report.monday)} - ${dayLabel(addDays(report.monday, 6))}`;
    doc.font('Helvetica').fontSize(9);
    const height = doc.heightOfString(subtitle, { width, lineGap: 2 });
    text(subtitle, left, 111, width, 9, false, MUTED);
    y = 111 + height + 17;
  }
  function newPage() { doc.addPage(); header(); }
  function ensure(height: number) { if (y + height > bottom) newPage(); }
  function heading(title: string) {
    ensure(55);
    text(title, left, y, width, 13, true, GREEN);
    y += 24;
  }
  function paragraph(value: string, color = MUTED) {
    doc.font('Helvetica').fontSize(9);
    const height = doc.heightOfString(value, { width, lineGap: 2 });
    ensure(height + 12);
    text(value, left, y, width, 9, false, color);
    y += height + 12;
  }
  function wrap(value: string, w: number) {
    doc.font('Helvetica').fontSize(9);
    const lines: string[] = [];
    let line = '';
    for (const char of value.replaceAll('\n', ' ')) {
      if (line && doc.widthOfString(line + char) > w) { lines.push(line); line = ''; }
      line += char;
    }
    lines.push(line);
    return lines;
  }
  function table(headers: string[], rows: string[][], fractions: number[]) {
    const widths = fractions.map(f => width * f);
    function row(values: string[], top: number, height: number, bold: boolean, fill?: string) {
      if (fill) doc.rect(left, top, width, height).fill(fill);
      let x = left;
      values.forEach((value, i) => { text(value, x + 6, top + 6, widths[i] - 12, 9, bold); x += widths[i]; });
      doc.moveTo(left, top + height).lineTo(left + width, top + height).strokeColor('#dde3da').lineWidth(0.5).stroke();
    }
    const headerHeight = Math.max(...headers.map((v, i) => wrap(v, widths[i] - 16).length)) * 13 + 12;
    function tableHeader() { ensure(headerHeight + 26); row(headers, y, headerHeight, true, PALE); y += headerHeight; }
    tableHeader();
    rows.forEach((values, index) => {
      const lines = values.map((v, i) => wrap(v, widths[i] - 16));
      let offset = 0;
      const count = Math.max(...lines.map(l => l.length));
      while (offset < count) {
        if (y + 26 > bottom) { newPage(); tableHeader(); }
        const fit = Math.max(1, Math.min(count - offset, Math.floor((bottom - y - 12) / 13)));
        row(lines.map(l => l.slice(offset, offset + fit).join('\n')), y, fit * 13 + 12, false, index % 2 ? '#fafbf8' : undefined);
        y += fit * 13 + 12; offset += fit;
        if (offset < count) { newPage(); tableHeader(); }
      }
    });
    y += 14;
  }
  function figures(rows: [string, string][]) {
    const cellWidth = width / 3;
    for (let i = 0; i < rows.length; i += 3) {
      doc.font('Helvetica-Bold').fontSize(13);
      const heights = rows.slice(i, i + 3).map(([label, value]) => {
        const labelHeight = doc.font('Helvetica').fontSize(8).heightOfString(label, { width: cellWidth - 24 });
        const valueHeight = doc.font('Helvetica-Bold').fontSize(13).heightOfString(value, { width: cellWidth - 24 });
        return labelHeight + valueHeight + 29;
      });
      const height = Math.max(...heights, 57);
      ensure(height);
      rows.slice(i, i + 3).forEach(([label, value], j) => {
        const x = left + j * cellWidth;
        doc.rect(x, y, cellWidth - 7, height - 7).fill(PALE);
        text(label, x + 9, y + 8, cellWidth - 24, 8, false, MUTED);
        doc.font('Helvetica').fontSize(8);
        const labelHeight = doc.heightOfString(label, { width: cellWidth - 24 });
        text(value, x + 9, y + 12 + labelHeight, cellWidth - 24, 13, true, GREEN);
      });
      y += height;
    }
    y += 6;
  }
  function chart() {
    ensure(207);
    const top = y + 10, chartHeight = 122, origin = top + chartHeight;
    const amounts = report.days.flatMap(d => [Number(d.actual ?? 0n) / 100, Number(d.purchases) / 100]);
    const max = Math.max(1, ...amounts), min = Math.min(0, ...amounts);
    const scale = chartHeight / (max - min), zero = origin + min * scale;
    const x0 = left + 66, plotWidth = width - 72, group = plotWidth / 7;
    for (let i = 0; i <= 3; i++) {
      const value = min + (max - min) * i / 3, yy = origin - (value - min) * scale;
      text(`£${Math.round(value).toLocaleString('en-GB')}`, left, yy - 4, 62, 8, false, MUTED);
      doc.moveTo(x0, yy).lineTo(left + width, yy).strokeColor('#dde3da').lineWidth(0.5).stroke();
    }
    doc.moveTo(x0, zero).lineTo(left + width, zero).strokeColor(MUTED).stroke();
    report.days.forEach((day, i) => {
      const x = x0 + i * group + group / 2;
      [day.actual, day.purchases].forEach((amount, j) => {
        const xx = x - 13 + j * 15;
        if (amount === null) { text('?', xx, zero - 13, 13, 9, true, MUTED); return; }
        const v = Number(amount) / 100, height = Math.abs(v * scale);
        if (height) doc.rect(xx, v >= 0 ? zero - height : zero, 11, height).fill(j ? GOLD : GREEN);
        else doc.moveTo(xx, zero).lineTo(xx + 11, zero).strokeColor(j ? GOLD : GREEN).lineWidth(2).stroke();
      });
      text(dayLabel(day.date).slice(0, 3), x - 12, origin + 9, group, 9);
    });
    y = origin + 34;
    doc.rect(left, y, 8, 8).fill(GREEN); text('Actual net sales', left + 13, y - 1, 150, 9);
    doc.rect(left + 150, y, 8, 8).fill(GOLD); text('Confirmed food purchases', left + 163, y - 1, 250, 9);
    y += 21;
    paragraph('? = sales not recorded. A baseline mark means recorded zero. Purchases use delivery dates; credits reduce purchases.');
  }

  header();
  heading('Executive Summary');
  paragraph(`Status: ${report.state.status}${report.state.status === 'Final' ? '' : ' | Purchasing percentages are provisional.'}`, GREEN);
  figures([
    ['Projected weekly sales', money(report.projected)], ['Actual net sales recorded', money(report.actual)], ['Target purchasing', percentLabel(report.targetBps)],
    ['Confirmed food purchases (ex VAT)', money(report.purchases)], ['Purchasing budget', money(report.budget)], ['Remaining allowance', money(report.allowance)],
    [report.state.status === 'Final' ? 'Final purchasing %' : 'Current purchasing % (provisional)', percentage(report.purchasingBps)],
    ['Sales entries recorded', `${report.recordedDays} of 7 days`], ['Forecast variance (recorded days)', money(report.variance)],
  ]);
  heading('Sales Analysis');
  paragraph(`Original forecast: ${money(report.original)} | Revised forecast: ${money(report.revised)}. Projection uses actual sales for recorded days and revised forecasts only for unrecorded days.`);
  table(['Day', 'Original forecast', 'Revised forecast', 'Actual net sales', 'Variance vs original'], report.days.map(d => [
    dayLabel(d.date), d.original === null ? 'Not available' : money(d.original), d.revised === null ? 'Not available' : money(d.revised),
    d.actual === null ? 'Not recorded' : money(d.actual), d.actual === null || d.original === null ? '-' : money(d.actual - d.original),
  ]).concat([['Week total', money(report.original), money(report.revised), money(report.actual), money(report.variance)]]), [.25, .18, .18, .19, .20]);
  paragraph('Recorded £0.00 is a zero-sales day. “Not recorded” is missing data. Forecast variance compares recorded sales with the original forecast for those days.');
  if (report.projected === null) paragraph('A complete weekly forecast is unavailable. Recorded sales and confirmed purchases are shown; projection, budget and allowance are unavailable.');

  newPage();
  heading('Food Purchasing');
  paragraph('Confirmed food purchases exclude VAT and include credits. Packaging, chemicals and stock are separate from this report.');
  heading('Sales vs Food Purchases');
  chart();
  heading('Supplier Analysis');
  table(['Supplier', 'Invoices', 'Credits', 'Confirmed ex VAT', 'Spending share'],
    report.suppliers.map(s => [s.name, String(s.count), String(s.credits), money(s.amount), percentage(ratioBps(s.amount, report.purchases))])
      .concat([['Total', String(report.suppliers.reduce((n, s) => n + s.count, 0)), String(report.suppliers.reduce((n, s) => n + s.credits, 0)), money(report.purchases), report.purchases > 0n ? '100.00%' : 'Not available']]),
    [.40, .10, .10, .23, .17]);
  heading('Weekly Performance');
  const difference = report.purchasingBps === null ? null : report.purchasingBps - BigInt(report.targetBps);
  const absoluteDifference = difference === null ? null : difference < 0n ? -difference : difference;
  const pp = absoluteDifference === null ? 'Not available' : `${difference! < 0n ? '-' : '+'}${absoluteDifference / 100n}.${String(absoluteDifference % 100n).padStart(2, '0')} percentage points`;
  paragraph(`Target: ${percentLabel(report.targetBps)} | ${report.state.status === 'Final' ? 'Final' : 'Provisional current'} purchasing: ${percentage(report.purchasingBps)} | Variance: ${pp}`);
  paragraph(difference === null ? 'A purchasing percentage cannot be calculated without positive recorded net sales.' :
    `Food purchasing is ${difference > 0n ? 'above' : difference < 0n ? 'below' : 'in line with'} the target on ${report.state.status === 'Final' ? 'final weekly' : 'recorded sales to date'}.${report.state.status === 'Final' ? '' : ' This result is provisional and may change as sales and purchases are completed.'}`, INK);
  if (report.state.missing.length) paragraph(`To complete the report: ${report.state.missing.join('; ')}.`);
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.moveTo(left, bottom + 3).lineTo(left + width, bottom + 3).strokeColor(GOLD).lineWidth(0.7).stroke();
    text(`Cocotte | ${report.monday} | GBP, excluding VAT`, left, bottom + 12, width - 90, 8, false, MUTED);
    text(`${i + 1} / ${pages.count}`, left + width - 70, bottom + 12, 70, 8, false, MUTED);
  }
  doc.end();
  return output;
}
