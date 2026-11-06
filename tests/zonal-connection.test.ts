import { randomBytes } from 'node:crypto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { encryptCredentials, decryptCredentials, encryptionReady } from '@/lib/zonal/crypto';
import { assertSecureCredentialRequest } from '@/lib/zonal/request-policy';
import { connectZonal, disconnectZonal, connectionOverview, PARSONS_GREEN } from '@/lib/zonal/connection-service';
import type { PrismaClient } from '@/generated/prisma/client';
import type { LoginResult } from '@/lib/zonal/worker';
const actor = { id: 'admin', restaurantId: 'r1', role: 'SUPER_USER' as const };
const secrets = { username: 'fixture-user', password: 'fixture-password' };
const input = { ...secrets, branch: PARSONS_GREEN, authorised: true };
beforeEach(() => vi.stubEnv('ZONAL_CREDENTIALS_KEY', randomBytes(32).toString('base64')));
afterEach(() => vi.unstubAllEnvs());
describe('authenticated credential encryption', () => {
  it('round trips with random nonces and never stores plaintext', () => {
    const first = encryptCredentials('r1', secrets), second = encryptCredentials('r1', secrets);
    expect(first).not.toBe(second);
    expect(first).not.toContain(secrets.username); expect(first).not.toContain(secrets.password);
    expect(decryptCredentials('r1', first)).toEqual(secrets);
  });
  it('rejects another restaurant, tampering and incorrect encryption keys', () => {
    const envelope = encryptCredentials('r1', secrets);
    expect(() => decryptCredentials('r2', envelope)).toThrow('could not be decrypted');
    const changed = JSON.parse(envelope); changed.tag = randomBytes(16).toString('base64');
    expect(() => decryptCredentials('r1', JSON.stringify(changed))).toThrow('could not be decrypted');
    vi.stubEnv('ZONAL_CREDENTIALS_KEY', randomBytes(32).toString('base64'));
    expect(() => decryptCredentials('r1', envelope)).toThrow('could not be decrypted');
  });
  it.each(['', 'not-a-key', 'a'.repeat(44)])('fails closed for missing or invalid key', key => {
    vi.stubEnv('ZONAL_CREDENTIALS_KEY', key);
    expect(encryptionReady()).toBe(false);
    expect(() => encryptCredentials('r1', secrets)).toThrow();
  });
});
describe('credential request transport and CSRF policy', () => {
  it('accepts exact same-origin HTTPS and development loopback', () => {
    expect(() => assertSecureCredentialRequest('https://cocotte.example', 'cocotte.example', true)).not.toThrow();
    expect(() => assertSecureCredentialRequest('http://localhost:3000', 'localhost:3000', false)).not.toThrow();
  });
  it.each([[null,'localhost:3000',false],['https://evil.example','cocotte.example',true],['http://cocotte.example','cocotte.example',false],['http://localhost:3000','localhost:3000',true],['https://user:secret@cocotte.example','cocotte.example',true]] as const)('rejects missing/cross-origin/insecure requests', (origin, host, production) => {
    expect(() => assertSecureCredentialRequest(origin, host, production)).toThrow('HTTPS');
  });
});
type Row = { restaurantId: string; branch: string; encryptedCredentials: string | null; revision: number; lastAttemptAt: Date | null; lastResultCode: string | null; loginVerifiedAt: Date | null; reportAccessVerifiedAt: Date | null };
function database() {
  const rows = new Map<string, Row>();
  const findUnique = vi.fn(async ({ where }: {where:{restaurantId:string}}) => rows.get(where.restaurantId) ?? null);
  const updateMany = vi.fn(async ({ where, data }: {where:{restaurantId:string;revision?:number;encryptedCredentials?:unknown};data:Record<string,unknown>}) => {
    const row = rows.get(where.restaurantId);
    if (!row || (where.revision !== undefined && row.revision !== where.revision) || (where.encryptedCredentials && !row.encryptedCredentials)) return { count: 0 };
    const increment = (data.revision as {increment:number} | undefined)?.increment;
    const previousRevision = row.revision;
    Object.assign(row, data); if (increment) row.revision = previousRevision + increment;
    return { count: 1 };
  });
  const tx = {
    $queryRaw: vi.fn(),
    zonalConnection: {
      findUnique, updateMany,
      count: vi.fn(async ({where}:{where:{restaurantId:string}}) => rows.get(where.restaurantId)?.encryptedCredentials ? 1 : 0),
      upsert: vi.fn(async ({ where, create, update }: {where:{restaurantId:string};create:Pick<Row,'restaurantId'|'branch'|'encryptedCredentials'|'lastAttemptAt'|'lastResultCode'>;update:Partial<Row> & {revision:{increment:number}}}) => {
        const row = rows.get(where.restaurantId);
        if (row) { const revision = row.revision + update.revision.increment; Object.assign(row, update, {revision}); return {...row}; }
        const next = { loginVerifiedAt: null, reportAccessVerifiedAt: null, revision: 1, ...create }; rows.set(where.restaurantId, next); return {...next};
      }),
    },
    auditLog: { create: vi.fn() },
  };
  return { rows, tx, prisma: { ...tx, $transaction: async (fn:(t:unknown)=>unknown) => fn(tx) } as unknown as PrismaClient };
}
const verified = vi.fn(async ():Promise<LoginResult> => ({code:'AUTHENTICATED'}));
describe('secure connection lifecycle', () => {
  it('saves encrypted credentials, calls login, and keeps report access unverified', async () => {
    const {prisma,rows,tx}=database(); const result = await connectZonal(prisma,actor,input,verified);
    expect(result.loginVerified).toBe(true);
    const row=rows.get('r1')!; expect(row.loginVerifiedAt).toBeInstanceOf(Date); expect(row.reportAccessVerifiedAt).toBeNull();
    expect(decryptCredentials('r1',row.encryptedCredentials!)).toEqual(secrets);
    expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toContain(secrets.password);
    expect(JSON.stringify(result)).not.toContain(secrets.username);
  });
  it('never claims connected on rejected or ambiguous login', async () => {
    const {prisma,rows}=database();
    const result=await connectZonal(prisma,actor,input,async()=>({code:'LOGIN_REJECTED'}));
    expect(result.loginVerified).toBe(false); expect(rows.get('r1')?.loginVerifiedAt).toBeNull();
    expect(rows.get('r1')?.encryptedCredentials).toBeTruthy();
  });
  it('limits login attempts including credential updates and saves replacement credentials after cooldown', async () => {
    const {prisma,rows}=database(); await connectZonal(prisma,actor,input,verified);
    await expect(connectZonal(prisma,actor,{...input,password:'replacement'},verified)).rejects.toThrow('one minute');
    rows.get('r1')!.lastAttemptAt = new Date(0);
    await connectZonal(prisma,actor,{...input,password:'replacement'},async()=>({code:'LOGIN_REJECTED'}));
    const row=rows.get('r1')!; expect(row.revision).toBe(2); expect(row.loginVerifiedAt).toBeNull(); expect(decryptCredentials('r1',row.encryptedCredentials!).password).toBe('replacement');
  });
  it('disconnect removes credentials and verification even if the encryption key is unavailable', async () => {
    const {prisma,rows}=database();await connectZonal(prisma,actor,input,verified);vi.stubEnv('ZONAL_CREDENTIALS_KEY','');
    await disconnectZonal(prisma,actor);
    expect(rows.get('r1')).toMatchObject({encryptedCredentials:null,loginVerifiedAt:null,reportAccessVerifiedAt:null,lastResultCode:'DISCONNECTED'});
  });
  it('discards an in-flight result after disconnect', async () => {
    const {prisma,rows}=database();
    await expect(connectZonal(prisma,actor,input,async()=>{await disconnectZonal(prisma,actor);return {code:'AUTHENTICATED'};})).rejects.toThrow('discarded');
    expect(rows.get('r1')?.encryptedCredentials).toBeNull();
  });
  it('isolates connection reads and deletes to the authenticated restaurant', async () => {
    const {prisma,rows}=database();await connectZonal(prisma,actor,input,verified);
    const other={...actor,restaurantId:'r2'};await disconnectZonal(prisma,other);
    expect(rows.get('r1')?.encryptedCredentials).toBeTruthy();expect((await connectionOverview(prisma,other)).credentialsSaved).toBe(false);
    await expect(connectZonal(prisma,other,undefined,verified)).rejects.toThrow('Connect Zonal');
  });
  it('requires Super User permission for saving, testing, metadata and disconnect', async () => {
    const {prisma,tx}=database();const chef={...actor,role:'CHEF' as const};
    for (const work of [()=>connectZonal(prisma,chef,input,verified),()=>connectZonal(prisma,chef,undefined,verified),()=>disconnectZonal(prisma,chef),()=>connectionOverview(prisma,chef)]) await expect(work()).rejects.toThrow('Super User');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
  });
  it('does not save or launch a browser when the key is missing or authorisation is absent', async () => {
    const {prisma,rows}=database(); const runner=vi.fn(async ():Promise<LoginResult>=>({code:'AUTHENTICATED'})); vi.stubEnv('ZONAL_CREDENTIALS_KEY','');
    await expect(connectZonal(prisma,actor,input,runner)).rejects.toThrow('encryption key');
    expect(rows.size).toBe(0);expect(runner).not.toHaveBeenCalled();
    await expect(connectZonal(prisma,actor,{...input,authorised:false},runner)).rejects.toThrow('authorised');
  });
  it('metadata never includes a username, password or encryption envelope', async()=>{
    const {prisma}=database();await connectZonal(prisma,actor,input,verified);const metadata=JSON.stringify(await connectionOverview(prisma,actor));
    expect(metadata).not.toContain(secrets.username);expect(metadata).not.toContain(secrets.password);expect(metadata).not.toContain('encryptedCredentials');
  });
  it('preserves previously verified report access when only retesting the same credentials',async()=>{
    const {prisma,rows}=database();await connectZonal(prisma,actor,input,verified);
    const prior=new Date('2026-11-03T12:00:00Z');rows.get('r1')!.reportAccessVerifiedAt=prior;rows.get('r1')!.lastAttemptAt=new Date(0);
    await connectZonal(prisma,actor,undefined,verified);
    expect(rows.get('r1')!.reportAccessVerifiedAt).toEqual(prior);
  });

});
