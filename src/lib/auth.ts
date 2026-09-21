import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from './db';
import { createToken, hashToken } from './tokens';
import { SESSION_SECONDS } from './policy';
export const SESSION_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-restaurant-session' : 'restaurant-session';
export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db().session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: { id: true, name: true, email: true, role: true, active: true, restaurantId: true } } } });
  if (!session || session.expiresAt <= new Date() || !session.user.active) return null;
  return session.user;
}
export async function requireUser() { const user = await currentUser(); if (!user) redirect('/login'); return user; }
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== 'SUPER_USER') redirect('/dashboard');
  return user;
}
export async function startSession(userId: string) {
  const jar = await cookies();
  const oldToken = jar.get(SESSION_COOKIE)?.value;
  const { token, tokenHash } = createToken();
  await db().$transaction(async tx => {
    if (oldToken) await tx.session.deleteMany({ where: { tokenHash: hashToken(oldToken) } });
    await tx.session.create({ data: { userId, tokenHash, expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000) } });
  });
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_SECONDS });
}
export async function endSession() {
  const jar = await cookies(); const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db().session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}
