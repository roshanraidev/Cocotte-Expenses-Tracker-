'use server';
import { revalidatePath } from 'next/cache';
import { requireUser, requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { forecastSchema, salesSchema, type FormResult } from '@/lib/sales-validation';
import { saveWeeklyForecast, saveActualSales, SalesError } from '@/lib/sales-service';
import { Prisma } from '@/generated/prisma/client';
function failure(error: unknown): FormResult {
  if (error instanceof SalesError) return { error: error.message, success: '' };
  if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2002', 'P2034'].includes(error.code)) return { error: 'Another user saved this record. Reload to see the latest values before retrying.', success: '' };
  throw error;
}
function refresh() { revalidatePath('/dashboard'); revalidatePath('/sales'); revalidatePath('/admin/forecasts'); revalidatePath('/admin'); revalidatePath('/admin/planning'); revalidatePath('/reports'); }
export async function saveForecast(_previous: FormResult, form: FormData): Promise<FormResult> {
  const actor = await requireAdmin();
  const parsed = forecastSchema.safeParse({ weekStart: form.get('weekStart'), version: form.get('version'), amounts: Array.from({ length: 7 }, (_, i) => form.get(`day${i}`)), reason: form.get('reason') ?? '' });
  if (!parsed.success) return { error: parsed.error.issues[0].message, success: '' };
  try { await saveWeeklyForecast(db(), actor, parsed.data); } catch (error) { return failure(error); }
  refresh(); return { error: '', success: 'Weekly forecast saved.' };
}
export async function saveSales(_previous: FormResult, form: FormData): Promise<FormResult> {
  const actor = await requireUser();
  const parsed = salesSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message, success: '' };
  try { await saveActualSales(db(), actor, parsed.data); } catch (error) { return failure(error); }
  refresh(); return { error: '', success: 'Actual sales saved. The weekly projection has been updated.' };
}
