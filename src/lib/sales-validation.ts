import { z } from 'zod';
import { validDateKey, mondayOf } from './dates';
import { parsePounds } from './money';
export const calendarDateSchema = z.string().refine(validDateKey, 'Enter a valid date.');
const amount = z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, 'Use a non-negative GBP amount with at most two decimal places and no commas.').transform(parsePounds);
const revision = z.coerce.number().int().min(0).max(2147483646);
export const forecastSchema = z.object({
  weekStart: calendarDateSchema.refine(value => validDateKey(value) && mondayOf(value) === value, 'Choose a Monday.'),
  version: revision,
  amounts: z.array(amount).length(7, 'Enter all seven daily forecasts.'),
  reason: z.string().trim().max(500),
}).refine(value => value.version === 0 || value.reason.length >= 3, { path: ['reason'], message: 'Explain the forecast change (at least 3 characters).' });
export const salesSchema = z.object({ date: calendarDateSchema, amount, version: revision, reason: z.string().trim().max(500) });
export type ForecastInput = z.infer<typeof forecastSchema>;
export type DailySalesInput = z.infer<typeof salesSchema>;
export type FormResult = { error: string; success: string };
