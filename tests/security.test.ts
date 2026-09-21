import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/lib/password';
import { createToken, hashToken } from '../src/lib/tokens';
import { assertAdmin, canAccessAdmin } from '../src/lib/policy';
import { createUserSchema, loginSchema } from '../src/lib/validation';
describe('account security', () => {
  it('hashes with Argon2id, salts independently and verifies passwords', async () => {
    const password = 'a long restaurant password';
    const a = await hashPassword(password), b = await hashPassword(password);
    expect(a).toMatch(/^\$argon2id\$/); expect(a).not.toBe(b); expect(a).not.toContain(password);
    expect(await verifyPassword(a, password)).toBe(true);
    expect(await verifyPassword(a, 'wrong password')).toBe(false);
    expect(await verifyPassword('malformed-hash', password)).toBe(false);
  });
  it('creates independent 256-bit session secrets and stores only digests', () => {
    const a = createToken(), b = createToken();
    expect(a.token).toMatch(/^[a-f0-9]{64}$/); expect(a.token).not.toBe(b.token);
    expect(a.tokenHash).toBe(hashToken(a.token)); expect(a.tokenHash).not.toBe(a.token);
  });
  it('denies Chef access to admin capabilities', () => {
    expect(canAccessAdmin('CHEF')).toBe(false); expect(() => assertAdmin('CHEF')).toThrow();
    expect(() => assertAdmin('SUPER_USER')).not.toThrow();
  });
  it('normalizes email and rejects invalid roles and short passwords', () => {
    const data = { name: 'Chef', email: '  CHEF@EXAMPLE.COM ', password: 'a strong password', role: 'CHEF' };
    expect(createUserSchema.parse(data).email).toBe('chef@example.com');
    expect(createUserSchema.safeParse({ ...data, role: 'OWNER' }).success).toBe(false);
    expect(createUserSchema.safeParse({ ...data, password: 'short' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: data.email, password: 'x'.repeat(129) }).success).toBe(false);
  });
});
