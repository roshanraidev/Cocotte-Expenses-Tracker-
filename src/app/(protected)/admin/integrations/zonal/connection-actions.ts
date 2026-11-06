'use server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { connectZonal, disconnectZonal } from '@/lib/zonal/connection-service';
import { assertSecureCredentialRequest } from '@/lib/zonal/request-policy';
import { ZonalError } from '@/lib/zonal/validation';
export type ConnectionState = { error: string; success: string; saved?: boolean };
export async function manageZonalConnection(_: ConnectionState, form: FormData): Promise<ConnectionState> {
  const actor = await requireAdmin();
  try {
    const h = await headers();
    // Require an explicit exact same-origin request in addition to Next.js CSRF checks.
    // Trust Host only; proxies must preserve the externally visible host.
    assertSecureCredentialRequest(h.get('origin'), h.get('host'), process.env.NODE_ENV === 'production');
    const action = form.get('connectionAction');
    if (action === 'disconnect') {
      if (form.get('confirmDisconnect') !== 'on') throw new ZonalError('Confirm disconnection before removing stored credentials.');
      await disconnectZonal(db(), actor);
      revalidatePath('/admin/integrations/zonal');
      return { error: '', success: 'Disconnected. Stored credentials were deleted and local Zonal browser sessions invalidated.' };
    }
    if (action !== 'connect' && action !== 'test') throw new ZonalError('Invalid connection action.');
    const result = await connectZonal(db(), actor, action === 'connect' ? { username: form.get('username'), password: form.get('password'), branch: form.get('branch'), authorised: form.get('authorised') === 'on' } : undefined);
    revalidatePath('/admin/integrations/zonal');
    return result.loginVerified ? { error: '', success: result.message, saved: true } : { error: `Credentials saved. ${result.message}`, success: '', saved: true };
  } catch (error) {
    revalidatePath('/admin/integrations/zonal');
    return { error: error instanceof ZonalError ? error.message : 'Connection operation failed. No sensitive details were returned. Please check server setup and try again.', success: '' };
  }
}
