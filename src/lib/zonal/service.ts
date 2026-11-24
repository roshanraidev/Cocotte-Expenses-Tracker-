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
import { enqueueAgentReport } from './agent/outbox';
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
export async function writePreview(prisma:PrismaClient|Prisma.TransactionClient,actor:SalesActor,report:Report,source:'ZONAL_MANUAL'|'ZONAL_BROWSER',options:{capturedAt?:Date;reusePending?:boolean}={}){
  assertAdmin(actor.role);
  const restaurant=await prisma.restaurant.findUniqueOrThrow({where:{id:actor.restaurantId}});
  if(restaurant.currency!=='GBP')throw new ZonalError('This restaurant is not configured for GBP.');
  const sale=await prisma.dailySales.findUnique({where:{restaurantId_date:{restaurantId:actor.restaurantId,date:dateValue(report.date)}}});
  const prior=await prisma.zonalImport.findFirst({where:{restaurantId:actor.restaurantId,date:dateValue(report.date),status:'APPROVED'},orderBy:{completedAt:'desc'}});
  if(prior&&sale?.version===prior.salesVersion+1&&prior.fingerprint===fingerprint(report)&&sale.amountPence===BigInt(report.net))return prior.id;
  if(options.reusePending){
    const pending=await prisma.zonalImport.findFirst({where:{restaurantId:actor.restaurantId,date:dateValue(report.date),status:'PREVIEW'},orderBy:[{createdAt:'desc'},{id:'desc'}]});
    if(pending&&pending.fingerprint===fingerprint(report)&&pending.salesVersion===(sale?.version??0)&&Date.now()-pending.createdAt.getTime()<30*60000)return pending.id;
  }
  const record=await prisma.zonalImport.create({data:{...(options.capturedAt?{createdAt:options.capturedAt}:{}),restaurantId:actor.restaurantId,actorId:actor.id,date:dateValue(report.date),branch:report.branch,source,payload:report,fingerprint:fingerprint(report),salesVersion:sale?.version??0,previousPence:sale?.amountPence}});
  return record.id;
}
export async function fetchAndPreview(prisma:PrismaClient,actor:SalesActor,date:string,runner=zonalAdapter.extract,latest=false){
  assertAdmin(actor.role);
  if(!validDateKey(date)||date>londonToday())throw new ZonalError('Choose a valid reporting date that is not in the future.');
  const branch=await mappedBranch(prisma,actor.restaurantId);
  if(branch!==PARSONS_GREEN)throw new ZonalError('Map this restaurant to 003 – Parsons Green before fetching.');
  const state=await connectZonal(prisma,actor,undefined,(id,credentials)=>runner(id,credentials,branch,date));
  if(!state.report)throw new ZonalError(state.message);
  const report=validateReport(state.report,branch,latest?state.report.date:date);
  if(report.date>date)throw new ZonalError('The report date exceeds the requested completed date.');
  const capturedAt=new Date();
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
    const connection=await tx.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId},select:{revision:true,encryptedCredentials:true,branch:true}});
    if(!connection?.encryptedCredentials||connection.revision!==state.revision||connection.branch!==branch)throw new ZonalError('The connection changed while fetching. This preview was discarded.');
    await enqueueAgentReport(tx,actor.restaurantId,report,capturedAt);
    return await writePreview(tx,actor,report,'ZONAL_BROWSER');
  });
}

export async function resolveImport(prisma: PrismaClient, actor: SalesActor, id: string, cancel: boolean, overwrite: boolean, reason: string, durable?:{dayId:string;jobId:string;token:string}) {
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
    if(durable){
      if(!await tx.user.count({where:{id:actor.id,restaurantId:actor.restaurantId,active:true,role:'SUPER_USER'}}))throw new ZonalError('Bulk approval permissions have been revoked.');
      await tx.$queryRaw`SELECT id FROM "ZonalSalesJob" WHERE id=${durable.jobId} FOR UPDATE`;
      const evidence=await tx.zonalSalesJobDay.findFirst({where:{id:durable.dayId,jobId:durable.jobId,previewId:id,fingerprint:record.fingerprint,date:record.date,status:'APPROVAL_QUEUED',job:{restaurantId:actor.restaurantId,actorId:actor.id,kind:'DAILY',phase:'APPROVE',status:'RUNNING',leaseToken:durable.token,leaseUntil:{gt:new Date()}}}});
      if(!evidence)throw new ZonalError('Durable approval authorization expired or changed.');
    }
    const assessment=await previewAssessment(tx,actor.restaurantId,record,new Date(),!!durable);
    if(assessment.alreadyImported)return 'Already Imported; no financial changes made.';
    const blocker=assessment.issues.find(issue=>issue.blocking);
    if(blocker)throw new ZonalError(blocker.message);
    if(!assessment.report)throw new ZonalError('Report validation failed. Fetch a new preview.');
    if(assessment.conflict&&!overwrite)throw new ZonalError('Explicit confirmation is required to replace existing Daily Sales.');
    if(assessment.reasonRequired&&reason.trim().length<3)throw new ZonalError('Explain the correction or historical entry (at least 3 characters).');
    const report=assessment.report;
    const where={restaurantId_date:{restaurantId:actor.restaurantId,date:record.date}};
    const sale=await tx.dailySales.findUnique({where});
    const saved = sale
      ? await tx.dailySales.update({ where:{...where,version:sale.version}, data: { amountPence: BigInt(report.net), version: { increment: 1 } } })
      : await tx.dailySales.create({ data: { restaurantId: actor.restaurantId, date: record.date, amountPence: BigInt(report.net) } });
    await tx.zonalImport.update({ where: { id }, data: { status: 'APPROVED', completedAt: new Date() } });
    await tx.auditLog.create({ data: { restaurantId: actor.restaurantId, actorId: actor.id, action: 'ZONAL_SALES_IMPORTED', entity: 'DailySales', entityId: saved.id, before: { pence: sale?.amountPence.toString() ?? null }, after: { importId: id, source: record.source, ...report }, reason: reason.trim().slice(0, 500) || null } });
    return `Sales approved for ${date}. Weekly calculations now use the approved net sales.`;
  });
}
