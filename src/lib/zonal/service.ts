import 'server-only';
import { createHash } from 'node:crypto';
import type { PrismaClient, Prisma } from '@/generated/prisma/client';
import { assertAdmin } from '../policy';
import type { SalesActor } from '../sales-service';
import { dateKey, dateValue, londonToday, mondayOf } from '../dates';
import { validateReport, ZonalError, type Report } from './validation';
import { connectZonal, mappedBranch, PARSONS_GREEN } from './connection-service';
import { zonalAdapter } from './adapter';
import { previewAssessment } from './approval-data';
import { validDateKey } from '../dates';
export function fingerprint(report: Report) { return createHash('sha256').update(JSON.stringify(report)).digest('hex'); }
export async function previewImport(prisma: PrismaClient, actor: SalesActor, input: unknown) {
  assertAdmin(actor.role);
  const branch = await mappedBranch(prisma, actor.restaurantId);
  if (!branch) throw new ZonalError('A server administrator must map this restaurant to its Zonal branch first.');
  const date = (input as { date?: string })?.date ?? '';
  const report = validateReport(input, branch, date);
  if (date > londonToday()) throw new ZonalError('Future sales cannot be imported.');
  return await writePreview(prisma,actor,report,'ZONAL_MANUAL');
}
async function writePreview(prisma:PrismaClient|Prisma.TransactionClient,actor:SalesActor,report:Report,source:'ZONAL_MANUAL'|'ZONAL_BROWSER'){
  const restaurant=await prisma.restaurant.findUniqueOrThrow({where:{id:actor.restaurantId}});
  if(restaurant.currency!=='GBP')throw new ZonalError('This restaurant is not configured for GBP.');
  const sale=await prisma.dailySales.findUnique({where:{restaurantId_date:{restaurantId:actor.restaurantId,date:dateValue(report.date)}}});
  const record=await prisma.zonalImport.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,date:dateValue(report.date),branch:report.branch,source,payload:report,fingerprint:fingerprint(report),salesVersion:sale?.version??0,previousPence:sale?.amountPence}});
  return record.id;
}
export async function fetchAndPreview(prisma:PrismaClient,actor:SalesActor,date:string,runner=zonalAdapter.extract){
  assertAdmin(actor.role);
  if(!validDateKey(date)||date>londonToday())throw new ZonalError('Choose a valid reporting date that is not in the future.');
  const branch=await mappedBranch(prisma,actor.restaurantId);
  if(branch!==PARSONS_GREEN)throw new ZonalError('Map this restaurant to 003 – Parsons Green before fetching.');
  const state=await connectZonal(prisma,actor,undefined,(id,credentials)=>runner(id,credentials,branch,date));
  if(!state.report)throw new ZonalError(state.message);
  const report=validateReport(state.report,branch,date);
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
    const connection=await tx.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId},select:{revision:true,encryptedCredentials:true,branch:true}});
    if(!connection?.encryptedCredentials||connection.revision!==state.revision||connection.branch!==branch)throw new ZonalError('The connection changed while fetching. This preview was discarded.');
    return await writePreview(tx,actor,report,'ZONAL_BROWSER');
  });
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
    const date=dateKey(record.date);
    const weekStart=dateValue(mondayOf(date));
    await tx.$queryRaw`SELECT id FROM "WeeklyForecast" WHERE "restaurantId" = ${actor.restaurantId} AND "weekStart" = ${weekStart} FOR UPDATE`;
    const assessment=await previewAssessment(tx,actor.restaurantId,record);
    const blocker=assessment.issues.find(issue=>issue.blocking);
    if(blocker)throw new ZonalError(blocker.message);
    if(!assessment.report)throw new ZonalError('Report validation failed. Fetch a new preview.');
    if(assessment.conflict&&!overwrite)throw new ZonalError('Explicit confirmation is required to replace existing Daily Sales.');
    if(assessment.reasonRequired&&reason.trim().length<3)throw new ZonalError('Explain the correction or historical entry (at least 3 characters).');
    const report=assessment.report;
    const where={restaurantId_date:{restaurantId:actor.restaurantId,date:record.date}};
    const sale=await tx.dailySales.findUnique({where});
    const saved = sale
      ? await tx.dailySales.update({ where, data: { amountPence: BigInt(report.net), version: { increment: 1 } } })
      : await tx.dailySales.create({ data: { restaurantId: actor.restaurantId, date: record.date, amountPence: BigInt(report.net) } });
    await tx.zonalImport.update({ where: { id }, data: { status: 'APPROVED', completedAt: new Date() } });
    await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'ZONAL_SALES_IMPORTED', entity: 'DailySales', entityId: saved.id, before: { pence: sale?.amountPence.toString() ?? null }, after: { importId: id, source: record.source, ...report }, reason: reason.trim().slice(0, 500) || null } });
    return `Sales approved for ${date}. Weekly calculations now use the approved net sales.`;
  });
}
