'use server';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { startSession, endSession } from '@/lib/auth';
import { hashPassword, verifyPassword } from '@/lib/password';
import { hashToken } from '@/lib/tokens';
import { loginSchema } from '@/lib/validation';
import { LOGIN_ATTEMPTS, LOGIN_WINDOW_MS } from '@/lib/policy';
// A real Argon2 check for unknown accounts reduces account enumeration via timing.
let dummyHash: Promise<string> | undefined;
export async function login(_previous: { error: string }, form: FormData) {
  const parsed = loginSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: 'Enter a valid email address and password.' };
  const { email, password } = parsed.data;
  const key = hashToken(email);
  const now = new Date();
  // Atomic database upsert throttles across workers and concurrent requests.
  const rows = await db().$queryRaw<{ attempts: number }[]>`
    INSERT INTO "LoginThrottle" ("key", "attempts", "windowStart") VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "LoginThrottle"."windowStart" <= ${new Date(now.getTime() - LOGIN_WINDOW_MS)} THEN 1 ELSE "LoginThrottle"."attempts" + 1 END,
      "windowStart" = CASE WHEN "LoginThrottle"."windowStart" <= ${new Date(now.getTime() - LOGIN_WINDOW_MS)} THEN ${now} ELSE "LoginThrottle"."windowStart" END
    RETURNING "attempts"`;
  if (rows[0].attempts > LOGIN_ATTEMPTS) return { error: 'Too many sign-in attempts. Try again in 15 minutes.' };
  const user = await db().user.findUnique({ where: { email } });
  dummyHash ??= hashPassword('unused-dummy-password-for-timing');
  const valid = await verifyPassword(user?.passwordHash ?? await dummyHash, password);
  if (!user || !user.active || !valid) return { error: 'Email or password is incorrect.' };
  await startSession(user.id);
  // Successful sign-ins also count toward the short throttle window.
  redirect('/dashboard');
}
export async function logout() { await endSession(); redirect('/login'); }
