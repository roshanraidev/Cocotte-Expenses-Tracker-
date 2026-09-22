'use server';
import { requireUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { OperationError, runOperation } from '@/lib/operations';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@/generated/prisma/client';
import type { FormResult } from '@/lib/sales-validation';
export async function saveOperation(_previous: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireUser();
  try { await runOperation(db(), user, String(form.get('operation')), Object.fromEntries(form)); }
  catch (e) {
    if (e instanceof OperationError) return { error: e.message, success: '' };
    if (e instanceof z.ZodError) return { error: e.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '), success: '' };
    if (e instanceof Prisma.PrismaClientKnownRequestError && ['P2002','P2025'].includes(e.code)) return { error: 'Record already exists or is no longer available. Reload and check your input.', success: '' };
    throw e;
  }
  for (const path of ['/packaging/suppliers','/packaging/invoices','/suppliers','/orders','/stock','/dashboard','/reports','/admin/planning','/admin/legacy-orders']) revalidatePath(path);
  return { error: '', success: 'Saved successfully.' };
}
