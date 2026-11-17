import 'server-only';
import { fetchZonalReport } from './worker';
import { ZonalError } from './validation';
export const ZONAL_LOGIN = 'https://mm.zonalconnect.com/Portal/login/Login';
export function zonalConfiguration(restaurantId: string) {
  const mapped = process.env.ZONAL_RESTAURANT_ID === restaurantId;
  return { branch: mapped ? process.env.ZONAL_BRANCH?.trim() ?? '' : '', credentialsConfigured: mapped && !!process.env.ZONAL_USERNAME && !!process.env.ZONAL_PASSWORD, authorised: mapped && process.env.ZONAL_AUTOMATION_AUTHORISED === 'true', extractionImplemented: true as const };
}
export interface FinancialDetailAdapter { extract: typeof fetchZonalReport; }
// Server-only adapter: credentials are passed only to an isolated browser worker.
export const zonalAdapter:FinancialDetailAdapter={extract:fetchZonalReport};
/** Never return raw Playwright errors: these can contain URLs and page content. */
export async function safeProbe(probe: (signal: AbortSignal) => Promise<void>, timeoutMs = 15000) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([probe(controller.signal), new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ZonalError('Connection test timed out.')); }, timeoutMs); })]);
  } catch (error) {
    if (error instanceof ZonalError) throw error;
    throw new ZonalError('Connection test failed. Check server configuration and network access.');
  } finally { clearTimeout(timer); controller.abort(); }
}
