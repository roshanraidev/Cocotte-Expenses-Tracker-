import { z } from 'zod';
import { validDateKey } from '../dates';
import { parsePounds } from '../money';
export class ZonalError extends Error {}
const money = z.string().trim().regex(/^(?:£\s*)?(?:\d{1,12}|\d{1,3}(?:,\d{3})+)(?:\.\d{2})?$/, 'Enter a valid GBP amount.').transform(v => parsePounds(v.replace(/[£,\s]/g, '')) .toString());
const count = z.union([z.literal(''), z.string().regex(/^\d{1,9}$/)]).transform(v => v === '' ? null : Number(v));
export const reportSchema = z.object({
  branch: z.string().trim().min(1).max(120), date: z.string().refine(validDateKey, 'Invalid reporting date.'), currency: z.literal('GBP'),
  gross: money, discount: money, vat: money, net: money, food: money, drink: money, specials: money,
  covers: count, transactions: count,
}).strict();
export type Report = z.infer<typeof reportSchema>;
export const moneyFields = ['gross', 'discount', 'vat', 'net', 'food', 'drink', 'specials'] as const;
export function validateReport(input: unknown, branch: string, date: string): Report {
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) throw new ZonalError(parsed.error.issues[0].message);
  const r = parsed.data;
  if (r.branch !== branch) throw new ZonalError('Report branch does not match the configured restaurant.');
  if (r.date !== date) throw new ZonalError('Report date does not match the requested date.');
  // Verified Zonal Gross Sales is AFTER discounts; Gross Sales Incl Disc is a separate report field.
  if (BigInt(r.gross) - BigInt(r.vat) !== BigInt(r.net)) throw new ZonalError('Gross Sales less VAT must equal Net Sales. Enter the report’s Gross Sales field after discounts.');
  const difference = BigInt(r.food) + BigInt(r.drink) + BigInt(r.specials) - BigInt(r.net);
  if (difference < -1n || difference > 1n) throw new ZonalError('Department totals do not reconcile to net sales (1p rounding tolerance).');
  return r;
}
// Stored canonical pence are converted back to pounds before revalidation.
export function reportInput(r: Report) {
  return { ...r, ...Object.fromEntries(moneyFields.map(k => [k, `${BigInt(r[k]) / 100n}.${(BigInt(r[k]) % 100n).toString().padStart(2, '0')}`])), covers: r.covers === null ? '' : String(r.covers), transactions: r.transactions === null ? '' : String(r.transactions) };
}
