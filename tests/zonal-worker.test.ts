import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
import { cancelZonalWorker, testZonalLogin } from '@/lib/zonal/worker';
function childFixture() {
  const child = Object.assign(new EventEmitter(), { kill: vi.fn(), pid: 2147483000 });
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  return child;
}
const credentials = { username: 'fixture-user', password: 'fixture-pass' };
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe('isolated worker boundary', () => {
  it('passes credentials only through an allowlisted private environment and discards debug/database secrets', async () => {
    vi.stubEnv('DEBUG', 'pw:*'); vi.stubEnv('DATABASE_URL', 'fixture-database-secret');
    vi.stubEnv('ZONAL_CREDENTIALS_KEY', 'fixture-encryption-secret');
    const child = childFixture(); const promise = testZonalLogin('r1', credentials);
    const args = vi.mocked(spawn).mock.calls[0];
    expect(args[1]).toEqual(['scripts/zonal/worker.mjs', 'login']);
    const options = args[2] as { env: Record<string,string>; stdio: string[] };
    expect(options.env.ZONAL_PASSWORD).toBe(credentials.password);
    expect(options.env.DEBUG).toBeUndefined(); expect(options.env.DATABASE_URL).toBeUndefined(); expect(options.env.ZONAL_CREDENTIALS_KEY).toBeUndefined();
    expect(options.stdio).toEqual(['ignore','ignore','ignore','ipc']);
    child.emit('message', { code: 'AUTHENTICATED', password: 'must-not-return' }); child.emit('exit', 0);
    expect(await promise).toEqual({code:'BROWSER_FAILED'});
  });
  it('returns only validated login status and serializes work per restaurant', async () => {
    const child = childFixture(); const promise = testZonalLogin('r1', credentials);
    await expect(testZonalLogin('r1',credentials)).rejects.toThrow('already running');
    child.emit('message', {code:'LOGIN_REJECTED'}); child.emit('exit',0);
    expect(await promise).toEqual({code:'LOGIN_REJECTED'});
  });
  it('disconnect cancels only the requested restaurant’s active session', async () => {
    const child = childFixture(); const promise=testZonalLogin('r1', credentials);
    cancelZonalWorker('other');expect(child.kill).not.toHaveBeenCalled();
    cancelZonalWorker('r1');expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('exit',0);expect(await promise).toEqual({code:'TIMEOUT'});
  });
  it('terminates a timed-out browser job without retrying or leaking raw errors', async () => {
    vi.useFakeTimers(); const child=childFixture(); const promise=testZonalLogin('r1',credentials);
    await vi.advanceTimersByTimeAsync(40000); expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('exit',0);expect(await promise).toEqual({code:'TIMEOUT'});
    expect(spawn).toHaveBeenCalledTimes(1);
  });
  it('logs and returns only enum-validated diagnostic stages, rejecting raw errors', async () => {
    const info=vi.spyOn(console,'info').mockImplementation(()=>{});
    const child=childFixture();const promise=testZonalLogin('r1',credentials);
    child.emit('message',{type:'diagnostic',stage:'LOGIN_VERIFY',reason:'STARTED'});
    child.emit('message',{type:'diagnostic',stage:'LOGIN_VERIFY',reason:'raw-secret-value'});
    child.emit('message',{code:'AUTHENTICATED'});child.emit('exit',0);
    expect(await promise).toEqual({code:'AUTHENTICATED',diagnostics:[{type:'diagnostic',stage:'LOGIN_VERIFY',reason:'STARTED'}]});
    expect(info).toHaveBeenCalledTimes(1);expect(info).toHaveBeenCalledWith('[zonal]','LOGIN_VERIFY','STARTED');
    info.mockRestore();
  });

});
