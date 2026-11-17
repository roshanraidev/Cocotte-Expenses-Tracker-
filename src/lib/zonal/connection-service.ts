import 'server-only';
import { z } from 'zod';
import type { PrismaClient } from '@/generated/prisma/client';
import type { SalesActor } from '../sales-service';
import { assertAdmin } from '../policy';
import { decryptCredentials, encryptCredentials, encryptionReady } from './crypto';
import { cancelZonalWorker, loginMessages, testZonalLogin, type LoginResult } from './worker';
import { ZonalError,validateReport } from './validation';
import { zonalConfiguration } from './adapter';
export const PARSONS_GREEN = '003 – Parsons Green';
const credentialInput = z.object({ username: z.string().trim().min(1).max(254), password: z.string().min(1).max(1024), branch: z.literal(PARSONS_GREEN), authorised: z.literal(true) }).strict();
export async function connectionOverview(prisma: PrismaClient, actor: SalesActor) {
  assertAdmin(actor.role);
  // Select only safe metadata: never serialize the encryption envelope or username.
  const row = await prisma.zonalConnection.findUnique({ where: { restaurantId: actor.restaurantId }, select: { branch: true, revision: true, loginVerifiedAt: true, reportAccessVerifiedAt: true, lastAttemptAt: true, lastResultCode: true } });
  const stored = await prisma.zonalConnection.count({ where: { restaurantId: actor.restaurantId, encryptedCredentials: { not: null } } });
  return { branch: row?.branch ?? zonalConfiguration(actor.restaurantId).branch, credentialsSaved: stored > 0, encryptionReady: encryptionReady(), loginVerifiedAt: row?.loginVerifiedAt?.toISOString() ?? null, reportAccessVerifiedAt: row?.reportAccessVerifiedAt?.toISOString() ?? null, lastAttemptAt: row?.lastAttemptAt?.toISOString() ?? null, lastResultCode: row?.lastResultCode ?? null };
}
export async function mappedBranch(prisma: PrismaClient, restaurantId: string) {
  const row = await prisma.zonalConnection.findUnique({ where: { restaurantId }, select: { branch: true } });
  return row?.branch ?? zonalConfiguration(restaurantId).branch;
}
async function reserveAttempt(prisma: PrismaClient, actor: SalesActor, input?: z.infer<typeof credentialInput>) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
    const existing = await tx.zonalConnection.findUnique({ where: { restaurantId: actor.restaurantId } });
    if (existing?.lastAttemptAt && Date.now() - existing.lastAttemptAt.getTime() < 60000) throw new ZonalError('Please wait one minute between Zonal login attempts, including credential updates.');
    if (!input && !existing?.encryptedCredentials) throw new ZonalError('Connect Zonal with your credentials first.');
    if (!encryptionReady()) throw new ZonalError('Credential saving and testing are disabled until the server encryption key is configured.');
    const credentials = input ? { username: input.username, password: input.password } : decryptCredentials(actor.restaurantId, existing!.encryptedCredentials!);
    const encrypted = input ? encryptCredentials(actor.restaurantId, credentials) : existing!.encryptedCredentials!;
    const row = await tx.zonalConnection.upsert({ where: { restaurantId: actor.restaurantId }, create: { restaurantId: actor.restaurantId, branch: input?.branch ?? existing!.branch, encryptedCredentials: encrypted, lastAttemptAt: new Date(), lastResultCode: 'TESTING' }, update: { ...(input ? { branch: input.branch, encryptedCredentials: encrypted } : {}), revision: { increment: 1 }, loginVerifiedAt: null, ...(input ? {reportAccessVerifiedAt:null} : {}), lastAttemptAt: new Date(), lastResultCode: 'TESTING' } });
    await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: input ? 'ZONAL_CREDENTIALS_SAVED' : 'ZONAL_CONNECTION_STARTED', entity: 'Restaurant', entityId: actor.restaurantId, after: { branch: row.branch, revision: row.revision } } });
    return { revision: row.revision, credentials, branch: row.branch, priorReportVerifiedAt:input?null:existing?.reportAccessVerifiedAt??null };
  });
}
export async function connectZonal(prisma: PrismaClient, actor: SalesActor, input?: unknown, runner = testZonalLogin) {
  assertAdmin(actor.role);
  const parsed = input === undefined ? undefined : credentialInput.safeParse(input);
  if (parsed && !parsed.success) throw new ZonalError('Enter a username, password and the supported branch, and confirm authorised access.');
  const reservation = await reserveAttempt(prisma, actor, parsed?.data);
  let result: LoginResult;
  try { result = await runner(actor.restaurantId, reservation.credentials); } catch { result = { code: 'BROWSER_FAILED' }; }
  if(result.code==='REPORT_EXTRACTED'){
    try { if(!result.report)throw new Error();validateReport(result.report,reservation.branch,result.report.date); }
    catch { result={code:'REPORT_INVALID',loginVerified:result.loginVerified}; }
  }
  const loginVerified=result.code==='AUTHENTICATED'||result.code==='REPORT_EXTRACTED'||result.loginVerified===true;
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
    const changed = await tx.zonalConnection.updateMany({ where: { restaurantId: actor.restaurantId, revision: reservation.revision, encryptedCredentials: { not: null } }, data: { lastResultCode: result.code, loginVerifiedAt: loginVerified ? new Date() : null, reportAccessVerifiedAt: result.code==='REPORT_EXTRACTED'?new Date():loginVerified?reservation.priorReportVerifiedAt:null } });
    if (!changed.count) throw new ZonalError('Connection changed while testing. This result was discarded; refresh the dashboard.');
    await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: result.code === 'REPORT_EXTRACTED' ? 'ZONAL_REPORT_VERIFIED' : loginVerified ? 'ZONAL_LOGIN_VERIFIED' : 'ZONAL_CONNECTION_UNVERIFIED', entity: 'Restaurant', entityId: actor.restaurantId, after: { resultCode: result.code, revision: reservation.revision, diagnostics: result.diagnostics ?? [] }, reason: loginMessages[result.code] } });
    return { loginVerified, message: loginMessages[result.code], report:result.code==='REPORT_EXTRACTED'?result.report:undefined, revision:reservation.revision };
  });
}
export async function disconnectZonal(prisma: PrismaClient, actor: SalesActor) {
  assertAdmin(actor.role);
  // Always allow disconnect, even during cooldown or when the key is unavailable.
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
    const current = await tx.zonalConnection.findUnique({ where: { restaurantId: actor.restaurantId }, select: { encryptedCredentials: true } });
    if (!current?.encryptedCredentials) return; // Repeated disconnect is a no-op; no audit-log flooding.
    await tx.zonalConnection.updateMany({ where: { restaurantId: actor.restaurantId }, data: { encryptedCredentials: null, loginVerifiedAt: null, reportAccessVerifiedAt: null, lastResultCode: 'DISCONNECTED', revision: { increment: 1 } } });
    await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'ZONAL_DISCONNECTED', entity: 'Restaurant', entityId: actor.restaurantId } });
  });
  cancelZonalWorker(actor.restaurantId);
}
