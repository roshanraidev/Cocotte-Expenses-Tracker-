'use server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { saveTarget, TargetError } from '@/lib/target-service';
import { revalidatePath } from 'next/cache';
import type { FormResult } from '@/lib/sales-validation';
export async function updateTarget(_previous: FormResult, form: FormData): Promise<FormResult> {
  const user = await requireAdmin();
  try { await saveTarget(db(), user, Object.fromEntries(form), form.get('scope') === 'default'); }
  catch (e) { if (e instanceof TargetError) return { error: e.message, success: '' }; throw e; }
  revalidatePath('/admin/food-cost'); revalidatePath('/dashboard'); revalidatePath('/reports');
  return { error: '', success: 'Food cost target saved.' };
}
