import 'server-only';
import { createHash } from 'node:crypto';
import type { PrismaClient } from '@/generated/prisma/client';
import { assertAdmin } from '../policy';
import type { SalesActor } from '../sales-service';
import { dateKey, dateValue, londonToday, mondayOf } from '../dates';
import { reportInput, validateReport, ZonalError, type Report } from './validation';
import { zonalConfiguration } from './adapter';
export function fingerprint(report: Report) { return createHash('sha256').update(JSON.stringify(report)).digest('hex'); }
export async function previewImport(prisma: PrismaClient, actor: SalesActor, input: unknown) {
  assertAdmin(actor.role);
  const config = zonalConfiguration(actor.restaurantId);
  if (!config.branch) throw new ZonalError('A server administrator must map this restaurant to its Zonal branch first.');
  const date = (input as { date?: string })?.date ?? '';
  const report = validateReport(input, config.branch, date);
  if (date > londonToday()) throw new ZonalError('Future sales cannot be imported.');
  const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: actor.restaurantId } });
  if (restaurant.currency !== 'GBP') throw new ZonalError('This restaurant is not configured for GBP.');
  const sale = await prisma.dailySales.findUnique({ where: { restaurantId_date: { restaurantId: actor.restaurantId, date: dateValue(date) } } });
  const record = await prisma.zonalImport.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, date: dateValue(date), branch: config.branch, source: 'ZONAL_MANUAL', payload: report, fingerprint: fingerprint(report), salesVersion: sale?.version ?? 0, previousPence: sale?.amountPence } });
  return record.id;
}
export async function resolveImport(prisma: PrismaClient, actor: SalesActor, id: string, cancel: boolean, overwrite: boolean, reason: string) {
  assertAdmin(actor.role);
  if (id.length > 100) throw new ZonalError('Invalid preview.');
  return prisma.$transaction(async tx => {
    // Same lock order as existing financial entry; restaurant lock also serializes approvals.
    await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "restaurantId" FROM "RestaurantSettings" WHERE "restaurantId" = ${actor.restaurantId} FOR UPDATE`;
    const record = await tx.zonalImport.findFirst({ where: { id, restaurantId: actor.restaurantId } });
    if (!record) throw new ZonalError('Preview not found for this restaurant.');
    if (record.status === 'APPROVED') return 'Already approved; no changes made.';
    if (record.status !== 'PREVIEW') throw new ZonalError('This preview has been cancelled.');
    if (cancel) {
      await tx.zonalImport.update({ where: { id }, data: { status: 'CANCELLED', completedAt: new Date() } });
      await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'ZONAL_CANCELLED', entity: 'ZonalImport', entityId: id } });
      return 'Import cancelled.';
    }
    if (Date.now() - record.createdAt.getTime() > 30 * 60 * 1000) throw new ZonalError('Preview expired. Create a fresh preview.');
    const date = dateKey(record.date);
    const branch = zonalConfiguration(actor.restaurantId).branch;
    const report = validateReport(reportInput(record.payload as Report), branch, date);
    if (date > londonToday()) throw new ZonalError('Future sales cannot be imported.');
    const weekStart = dateValue(mondayOf(date));
    await tx.$queryRaw`SELECT id FROM "WeeklyForecast" WHERE "restaurantId" = ${actor.restaurantId} AND "weekStart" = ${weekStart} FOR UPDATE`;
    const week = await tx.weeklyForecast.findUnique({ where: { restaurantId_weekStart: { restaurantId: actor.restaurantId, weekStart } } });
    if (!week || week.finalizedAt) throw new ZonalError('Create the weekly forecast or reopen the finalized week before importing.');
    const where = { restaurantId_date: { restaurantId: actor.restaurantId, date: record.date } };
    const sale = await tx.dailySales.findUnique({ where });
    const prior = await tx.zonalImport.findFirst({ where: { restaurantId: actor.restaurantId, date: record.date, status: 'APPROVED', fingerprint: record.fingerprint }, orderBy: { completedAt: 'desc' } });
    // Only short-circuit when the current sales still match; later manual edits require approval.
    if (prior && sale?.amountPence === BigInt(report.net)) throw new ZonalError('Duplicate report: these figures are already imported.');
    if ((sale?.version ?? 0) !== record.salesVersion) throw new ZonalError('Daily Sales changed after preview. Create a new preview.');
    if (sale && !overwrite) throw new ZonalError('Explicit confirmation is required to replace existing Daily Sales.');
    if ((sale || mondayOf(date) !== mondayOf(londonToday())) && reason.trim().length < 3) throw new ZonalError('Explain the correction or historical entry (at least 3 characters).');
    const saved = sale
      ? await tx.dailySales.update({ where, data: { amountPence: BigInt(report.net), version: { increment: 1 } } })
      : await tx.dailySales.create({ data: { restaurantId: actor.restaurantId, date: record.date, amountPence: BigInt(report.net) } });
    await tx.zonalImport.update({ where: { id }, data: { status: 'APPROVED', completedAt: new Date() } });
    await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'ZONAL_SALES_IMPORTED', entity: 'DailySales', entityId: saved.id, before: { pence: sale?.amountPence.toString() ?? null }, after: { importId: id, source: record.source, ...report }, reason: reason.trim().slice(0, 500) || null } });
    return 'Sales imported. Weekly calculations now use the approved net sales.';
  });
}
