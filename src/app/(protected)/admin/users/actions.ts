'use server';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { createUserSchema } from '@/lib/validation';
import { hashPassword } from '@/lib/password';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma/client';
export async function createUser(_previous: { error: string; success: string }, form: FormData) {
  const actor = await requireAdmin();
  const parsed = createUserSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: parsed.error.issues[0].message, success: '' };
  const { password, ...fields } = parsed.data;
  const passwordHash = await hashPassword(password);
  try {
    await db().$transaction(async tx => {
      const user = await tx.user.create({ data: { ...fields, passwordHash, restaurantId: actor.restaurantId } });
      await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'USER_CREATED', entity: 'User', entityId: user.id, after: fields } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return { error: 'An account with this email already exists.', success: '' };
    throw error;
  }
  revalidatePath('/admin/users');
  return { error: '', success: 'User created. Share their temporary password securely.' };
}
export async function deactivateUser(form: FormData) {
  const actor = await requireAdmin();
  const id = String(form.get('id') ?? '');
  if (!id || id === actor.id) throw new Error('You cannot deactivate your own account.');
  await db().$transaction(async tx => {
    const user = await tx.user.findFirst({ where: { id, restaurantId: actor.restaurantId, active: true } });
    if (!user) return;
    // The acting administrator remains active; prevent concurrent admin removal races.
    if (user.role === 'SUPER_USER') throw new Error('Administrator deactivation is not available in Stage 1.');
    await tx.user.update({ where: { id }, data: { active: false } });
    await tx.session.deleteMany({ where: { userId: id } });
    await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'USER_DEACTIVATED', entity: 'User', entityId: id, before: { active: true }, after: { active: false } } });
  });
  revalidatePath('/admin/users');
}
