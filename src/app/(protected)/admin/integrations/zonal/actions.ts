'use server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { previewImport, resolveImport } from '@/lib/zonal/service';
import { zonalAdapter, zonalConfiguration } from '@/lib/zonal/adapter';
import { ZonalError } from '@/lib/zonal/validation';
export type ZonalState = { error: string; success: string; previewId?: string };
export async function zonalAction(_: ZonalState, form: FormData): Promise<ZonalState> {
  const actor = await requireAdmin();
  const action = form.get('action');
  try {
    if (action === 'test') {
      const config = zonalConfiguration(actor.restaurantId);
      const message = !config.credentialsConfigured ? 'Credentials are not configured for this restaurant.' : !config.authorised ? 'Browser automation authorisation is not configured.' : 'Credentials configured; login and report extraction remain unverified. Live connection testing is not implemented until the authorised workflow is inspected.';
      await db().auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'ZONAL_CONNECTION_UNVERIFIED', entity: 'Restaurant', entityId: actor.restaurantId, reason: message } });
      revalidatePath('/admin/integrations/zonal');
      return { error: message, success: '' };
    }
    if (action === 'extract') { await zonalAdapter.extract('', ''); }
    if (action === 'preview') {
      const input = Object.fromEntries(Array.from(form.entries()).filter(([key]) => key !== 'action' && !key.startsWith('$ACTION')));
      const previewId = await previewImport(db(), actor, input);
      revalidatePath('/admin/integrations/zonal');
      return { error: '', success: 'Report validated. Review the saved preview below before approving.', previewId };
    }
    if (action === 'approve' || action === 'cancel') {
      const success = await resolveImport(db(), actor, String(form.get('id') ?? ''), action === 'cancel', form.get('overwrite') === 'on', String(form.get('reason') ?? '').slice(0, 500));
      for (const path of ['/admin/integrations/zonal', '/dashboard', '/sales', '/reports', '/admin/planning', '/admin/forecasts']) revalidatePath(path);
      return { error: '', success };
    }
    return { error: 'Invalid action.', success: '' };
  } catch (error) {
    // Never serialize unknown exceptions, credentials, stack traces or database details.
    const message = error instanceof ZonalError ? error.message : 'Operation failed. Check the database migration and server configuration, then retry.';
    try {
      await db().auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'ZONAL_IMPORT_FAILED', entity: 'Restaurant', entityId: actor.restaurantId, reason: message } });
      revalidatePath('/admin/integrations/zonal');
    } catch { /* Database outages must not expose raw errors or mask the safe response. */ }
    return { error: message, success: '' };
  }
}
