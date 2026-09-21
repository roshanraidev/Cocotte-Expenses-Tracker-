import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), remove: vi.fn(), find: vi.fn(), create: vi.fn(), deleteMany: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: mocks.get, set: mocks.set, delete: mocks.remove }) }));
vi.mock('next/navigation', () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock('../src/lib/db', () => ({ db: () => ({ session: { findUnique: mocks.find, deleteMany: mocks.deleteMany }, $transaction: async (fn: (tx: unknown) => unknown) => fn({ session: { create: mocks.create, deleteMany: mocks.deleteMany } }) }) }));
import { currentUser, requireAdmin, requireUser, startSession, endSession } from '../src/lib/auth';
import { hashToken } from '../src/lib/tokens';
const token = 'a'.repeat(64);
const user = { id: 'chef-1', name: 'Chef', email: 'chef@example.com', role: 'CHEF', active: true, restaurantId: 'restaurant' };
beforeEach(() => { vi.clearAllMocks(); mocks.get.mockReturnValue({ value: token }); mocks.find.mockResolvedValue({ user, expiresAt: new Date(Date.now() + 60_000) }); });
describe('server-side sessions and authorization', () => {
  it('redirects unauthenticated users and avoids looking up malformed tokens', async () => {
    mocks.get.mockReturnValue({ value: 'malformed' });
    await expect(requireUser()).rejects.toThrow('redirect:/login'); expect(mocks.find).not.toHaveBeenCalled();
  });
  it('rejects expired sessions', async () => {
    mocks.find.mockResolvedValue({ user, expiresAt: new Date(0) }); expect(await currentUser()).toBeNull();
  });
  it('rejects deactivated users even if a session exists', async () => {
    mocks.find.mockResolvedValue({ user: { ...user, active: false }, expiresAt: new Date(Date.now() + 60_000) });
    expect(await currentUser()).toBeNull();
  });
  it('enforces admin access on the server', async () => {
    await expect(requireAdmin()).rejects.toThrow('redirect:/dashboard');
    mocks.find.mockResolvedValue({ user: { ...user, role: 'SUPER_USER' }, expiresAt: new Date(Date.now() + 60_000) });
    expect((await requireAdmin()).role).toBe('SUPER_USER');
  });
  it('rotates sessions and sets an HTTP-only expiring cookie', async () => {
    await startSession(user.id);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: hashToken(token) } });
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mocks.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/', maxAge: 43200 }));
    expect(data.tokenHash).not.toBe(mocks.set.mock.calls[0][1]);
  });
  it('revokes the database session on logout', async () => {
    await endSession(); expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: hashToken(token) } });
    expect(mocks.remove).toHaveBeenCalled();
  });
});
