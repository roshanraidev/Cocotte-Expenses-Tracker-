import 'server-only';
import { spawn } from 'node:child_process';
import type { ZonalCredentials } from './crypto';
import { z } from 'zod';
import { ZonalError, validateReport } from './validation';
import { validDateKey, londonToday } from '../dates';
export const diagnosticSchema = z.object({ type: z.literal('diagnostic'), stage: z.enum(['BROWSER_LAUNCH','LOGIN_PAGE','LOGIN_FORM','LOGIN_SUBMIT','LOGIN_VERIFY','NETWORK_POLICY','REPORT_NAVIGATION','REPORT_BRANCH','REPORT_START_DATE','REPORT_END_DATE','REPORT_RUN','REPORT_PARSE','CLEANUP']), reason: z.enum(['STARTED','OK','AUTHENTICATED','LOGIN_REJECTED','ACCESS_CONTROL','REPORT_CHANGED','BROWSER_FAILED','TIMEOUT','SUCCESS_MARKER_MISSING','EXTERNAL_AUTH_BLOCKED','EXTERNAL_ASSET_BLOCKED','UNRECOGNISED_POST_BLOCKED','METHOD_BLOCKED','NAVIGATION_FAILED','VALIDATION_FAILED']) }).strict();
export const extractedReportSchema = z.object({ branch:z.literal('003 – Parsons Green'),date:z.string().refine(validDateKey),currency:z.literal('GBP'),...Object.fromEntries(['gross','discount','vat','net','food','drink','specials'].map(key=>[key,z.string().regex(/^\d{1,12}\.\d{2}$/)])),covers:z.string().regex(/^\d{1,9}$/),transactions:z.string().regex(/^\d{1,9}$/) }).strict();
export const resultSchema = z.object({ code: z.enum(['AUTHENTICATED', 'LOGIN_UNVERIFIED', 'LOGIN_REJECTED', 'ACCESS_CONTROL', 'REPORT_CHANGED', 'NOT_CONFIGURED', 'BROWSER_FAILED', 'TIMEOUT', 'EXTRACTION_UNVERIFIED','REPORT_EXTRACTED','REPORT_INVALID','REPORT_DATE_UNAVAILABLE']), report:extractedReportSchema.optional(), loginVerified:z.boolean().optional(), diagnostics: z.array(diagnosticSchema).max(40).optional(), discovery: z.object({ financialDetailVisible: z.boolean(), requestedBranchVisible: z.boolean() }).optional() }).strict().refine(result=>result.code==='REPORT_EXTRACTED'?!!result.report:!result.report);
export type LoginResult = z.infer<typeof resultSchema>;
export const loginMessages: Record<LoginResult['code'], string> = {
  REPORT_EXTRACTED: 'Financial Detail was read and validated. Review the saved preview before approving any sales.',
  REPORT_INVALID: 'Financial Detail could not be validated. Check the report branch, date, missing fields, layout or totals; manual entry remains available.',
  REPORT_DATE_UNAVAILABLE: 'The requested date is not available in the Zonal report controls. Choose another date or use manual entry.',
  AUTHENTICATED: 'Login verified in a temporary browser session. Report navigation and extraction are not yet verified.',
  LOGIN_UNVERIFIED: 'Login could not be verified. An authorised operator must inspect the workflow before another attempt.',
  LOGIN_REJECTED: 'Zonal rejected the login. Check the server credentials with your account administrator before retrying.',
  ACCESS_CONTROL: 'Zonal requires human intervention or blocked access. No security challenge was bypassed.',
  REPORT_CHANGED: 'The login page has changed. An authorised operator must verify its controls.',
  NOT_CONFIGURED: 'Zonal credentials are not configured for this restaurant.',
  BROWSER_FAILED: 'The browser could not complete the connection test. Check browser installation and server network access.',
  TIMEOUT: 'Zonal connection test timed out. The temporary browser session was closed.',
  EXTRACTION_UNVERIFIED: 'Financial Detail navigation and extraction are not verified. Use manual entry until discovery is complete.',
};
const running = new Map<string, () => void>();
export function cancelZonalWorker(restaurantId: string) { running.get(restaurantId)?.(); }
export async function testZonalLogin(restaurantId: string, credentials: ZonalCredentials): Promise<LoginResult> {
  if (running.has(restaurantId)) throw new ZonalError('A Zonal browser job is already running. Wait for it to finish.');
  try { return await runWorker(restaurantId, credentials); } finally { running.delete(restaurantId); }
}
export async function fetchZonalReport(restaurantId:string,credentials:ZonalCredentials,branch:string,date:string):Promise<LoginResult>{
  if(branch!=='003 – Parsons Green')throw new ZonalError('This Zonal branch is not authorised for the live adapter.');
  if(!validDateKey(date)||date>londonToday())throw new ZonalError('Choose a valid reporting date that is not in the future.');
  if(running.has(restaurantId))throw new ZonalError('A Zonal browser job is already running.');
  try {
    const result=await runWorker(restaurantId,credentials,{branch,date});
    if(result.code==='REPORT_EXTRACTED'){
      if(!result.report) return {code:'REPORT_INVALID',loginVerified:true,diagnostics:result.diagnostics};
      try{validateReport(result.report,branch,date);}catch{return {code:'REPORT_INVALID',loginVerified:true,diagnostics:result.diagnostics};}
    }
    return result;
  }finally{running.delete(restaurantId);}
}
function runWorker(restaurantId: string, credentials: ZonalCredentials, request?:{branch:string;date:string}): Promise<LoginResult> {
  return new Promise(resolve => {
    // Child gets an allowlisted environment. Do not inherit DEBUG, PWDEBUG, tracing,
    // NODE_OPTIONS or application/database secrets. Credentials never appear in arguments.
    const env: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV };
    for (const key of ['PATH', 'HOME', 'TMPDIR', 'SYSTEMROOT', 'PLAYWRIGHT_BROWSERS_PATH', 'ZONAL_BROWSER_CHANNEL']) if (process.env[key]) env[key] = process.env[key];
    env.ZONAL_USERNAME = credentials.username;
    env.ZONAL_PASSWORD = credentials.password;
    let settled = false;
    let cancelled = false;
    const child = spawn(process.execPath, ['scripts/zonal/worker.mjs', request ? 'extract' : 'login', ...(request ? [request.date] : [])], { cwd: process.cwd(), env, detached: process.platform !== 'win32', stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    let result: LoginResult = { code: 'BROWSER_FAILED' };
    const diagnostics: z.infer<typeof diagnosticSchema>[] = [];
    let hardStop: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      cancelled = true;
      result = { code: 'TIMEOUT', ...(diagnostics.some(event=>event.stage==='LOGIN_VERIFY'&&event.reason==='AUTHENTICATED')?{loginVerified:true}:{}) };
      child.kill('SIGTERM');
      hardStop ??= setTimeout(() => {
        try { if (child.pid && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* Already closed. */ }
        complete();
      }, 3000);
      hardStop.unref();
    };
    running.set(restaurantId, stop);
    const complete = () => { if (settled) return; settled = true; clearTimeout(timer); clearTimeout(hardStop); resolve(diagnostics.length ? { ...result, diagnostics } : result); };
    child.on('message', message => {
      const diagnostic = diagnosticSchema.safeParse(message);
      if (diagnostic.success && diagnostics.length < 40) { diagnostics.push(diagnostic.data); console.info('[zonal]', diagnostic.data.stage, diagnostic.data.reason); return; }
      const parsed = resultSchema.safeParse(message); if (!cancelled && parsed.success) result = parsed.data;
    });
    child.on('error', complete);
    child.on('exit', complete);
    const timer = setTimeout(stop, request ? 95000 : 40000);
  });
}
