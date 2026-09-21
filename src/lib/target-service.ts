import 'server-only';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { addDays, dateValue, londonToday, mondayOf } from './dates';
import { targetSchema } from './targets';
import type { SalesActor } from './sales-service';
export class TargetError extends Error {}
type Reader = Pick<Prisma.TransactionClient, 'weeklyTarget' | 'targetDefault' | 'restaurantSettings'>;
export async function resolveTarget(tx: Reader, restaurantId: string, monday: string) {
  const row = await tx.weeklyTarget.findUnique({ where: { restaurantId_weekStart: { restaurantId, weekStart: dateValue(monday) } } });
  if (row) return row;
  const fallback = await tx.targetDefault.findFirst({ where: { restaurantId, effectiveFrom: { lte: dateValue(monday) } }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] });
  const targetBps = fallback?.targetBps ?? (await tx.restaurantSettings.findUniqueOrThrow({ where: { restaurantId } })).targetBps;
  return { id: '', weekStart: dateValue(monday), targetBps, originalBps: targetBps, source: 'DEFAULT', version: 0, updatedAt: fallback?.createdAt ?? null };
}
export async function saveTarget(prisma: PrismaClient, actor: SalesActor, raw: unknown, isDefault = false, today = londonToday()) {
  if (actor.role !== 'SUPER_USER') throw new TargetError('Only Super Users can change food cost targets.');
  const parsed = targetSchema.safeParse(raw);
  if (!parsed.success) throw new TargetError(parsed.error.issues[0].message);
  const input = parsed.data;
  const effective = isDefault ? addDays(mondayOf(today), 7) : input.weekStart;
  return prisma.$transaction(async tx => {
    // Serializes defaults, target edits and forecast creation for the restaurant.
    await tx.$queryRaw`SELECT "restaurantId" FROM "RestaurantSettings" WHERE "restaurantId" = ${actor.restaurantId} FOR UPDATE`;
    if (isDefault) {
      const previous = await tx.targetDefault.findFirst({ where: { restaurantId: actor.restaurantId }, orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] });
      const settings = await tx.restaurantSettings.findUniqueOrThrow({ where: { restaurantId: actor.restaurantId } });
      const before = previous?.targetBps ?? settings.targetBps;
      if (input.version !== before) throw new TargetError('The default changed. Reload before saving.');
      if (!previous) await tx.targetDefault.create({ data: { restaurantId: actor.restaurantId, effectiveFrom: dateValue('0001-01-01'), targetBps: settings.targetBps } });
      const row = await tx.targetDefault.create({ data: { restaurantId: actor.restaurantId, effectiveFrom: dateValue(effective), targetBps: input.percentage } });
      await tx.restaurantSettings.update({ where: { restaurantId: actor.restaurantId }, data: { targetBps: input.percentage, warningBps: Math.max(0, input.percentage - 200) } });
      await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'DEFAULT_TARGET_CHANGED', entity: 'TargetDefault', entityId: row.id, before: { targetBps: before }, after: { targetBps: input.percentage, effectiveFrom: effective }, reason: input.reason || null } });
      return;
    }
    const previous = await resolveTarget(tx, actor.restaurantId, effective);
    if (previous.version !== input.version) throw new TargetError('This target changed. Reload before saving.');
    const week = await tx.weeklyForecast.findUnique({ where: { restaurantId_weekStart: { restaurantId: actor.restaurantId, weekStart: dateValue(effective) } } });
    if (week?.finalizedAt) throw new TargetError('Reopen the finalized week with a reason before correcting its target.');
    if (effective < mondayOf(today) && input.reason.length < 3) throw new TargetError('A reason is required for a completed week.');
    const row = await tx.weeklyTarget.upsert({ where: { restaurantId_weekStart: { restaurantId: actor.restaurantId, weekStart: dateValue(effective) } },
      create: { restaurantId: actor.restaurantId, weekStart: dateValue(effective), originalBps: effective > mondayOf(today) && !week ? input.percentage : previous.targetBps, targetBps: input.percentage, source: 'CUSTOM' },
      update: { targetBps: input.percentage, source: 'CUSTOM', version: { increment: 1 } },
    });
    if (week) await tx.weeklyForecast.update({ where: { id: week.id }, data: { targetBps: input.percentage, warningBps: Math.max(0, input.percentage - 200) } });
    await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'WEEKLY_TARGET_CHANGED', entity: 'WeeklyTarget', entityId: row.id, before: { targetBps: previous.targetBps, source: previous.source }, after: { weekStart: effective, targetBps: input.percentage, originalBps: row.originalBps, source: 'CUSTOM' }, reason: input.reason || null } });
  });
}
