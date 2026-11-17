import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import type {PrismaClient,Prisma} from '@/generated/prisma/client';
import type {SalesActor} from '../sales-service';
import {reportErrorMessage} from '../zonal/report-errors';
import {jobDisplayState} from './job-state';
import {assertAdmin} from '../policy';
import {addDays,dateKey,dateValue,londonToday,validDateKey} from '../dates';
import {ZonalError} from '../zonal/validation';
import {assessPreview} from '../zonal/approval';
import {mondayOf} from '../dates';
export const ACTIVE=['QUEUED','RUNNING','PAUSED'];
export function recentWindow(){const n=Number(process.env.ZONAL_SALES_RECHECK_DAYS??7);return Number.isInteger(n)&&n>=1&&n<=31?n:7;}
export function dateRange(from:string,to:string){if(!validDateKey(from)||!validDateKey(to)||from>to)throw new ZonalError('Invalid sales date range.');const dates:string[]=[];for(let d=from;d<=to;d=addDays(d,1)){if(dates.length>=5500)throw new ZonalError('Sales history exceeds the supported 15-year range.');dates.push(d);}return dates;}
export async function verifiedBounds(prisma:PrismaClient,restaurantId:string){
 const audit=await prisma.auditLog.findFirst({where:{restaurantId,action:'ZONAL_SALES_HISTORY_DISCOVERED'},orderBy:{createdAt:'desc'}});
 const e=audit?.after as {offeredFirst?:string;offeredLast?:string;verifiedDates?:string[];branch?:string}|null;
 if(!e?.offeredFirst||!e.offeredLast||!validDateKey(e.offeredFirst)||!validDateKey(e.offeredLast)||e.branch!=='003 – Parsons Green'||!e.verifiedDates?.includes(e.offeredFirst))throw new ZonalError('Verify historical Zonal availability for this restaurant first.');
 return {first:e.offeredFirst,last:e.offeredLast};
}
export async function workerReady(prisma:PrismaClient){return !!await prisma.zonalSalesWorker.findFirst({where:{heartbeatAt:{gt:new Date(Date.now()-20000)}}});}
export async function enqueueSalesJob(prisma:PrismaClient,actor:SalesActor,kind:'HISTORY'|'DAILY'){
 assertAdmin(actor.role);
 if(!await workerReady(prisma))throw new ZonalError('The durable sales worker is offline. Start npm run worker:sales under a restart supervisor. No import has started.');
 const bounds=await verifiedBounds(prisma,actor.restaurantId),yesterday=addDays(londonToday(),-1);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${actor.restaurantId} FOR UPDATE`;
  const active=await tx.zonalSalesJob.findFirst({where:{restaurantId:actor.restaurantId,kind,status:{in:ACTIVE}}});if(active)return active.id;
  let dates:string[];
  if(kind==='HISTORY'){
   const existing=await tx.zonalSalesJob.findFirst({where:{restaurantId:actor.restaurantId,kind:'HISTORY'},orderBy:{createdAt:'desc'}});if(existing)return existing.id;
   dates=dateRange(bounds.first,yesterday);
  }else{
   const prior=await tx.zonalSalesJob.findFirst({where:{restaurantId:actor.restaurantId,latestAvailable:{not:null}},orderBy:{createdAt:'desc'}});
   const latest=prior?.latestAvailable?dateKey(prior.latestAvailable):bounds.last;
   const start=[bounds.first,addDays(latest,1-recentWindow())].sort().at(-1)!;
   // Recent checks never pull unresolved historical failures into daily use.
   // Historical exceptions stay attached to their original job for explicit review.
   dates=dateRange(start,yesterday);
  }
  const connection=await tx.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId}});if(!connection?.encryptedCredentials||connection.branch!=='003 – Parsons Green')throw new ZonalError('Connect the authorised Parsons Green branch first.');
  const job=await tx.zonalSalesJob.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,kind,from:dateValue(dates[0]),to:dateValue(dates.at(-1)!),days:{create:dates.map(d=>({date:dateValue(d)}))}}});
  await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'ZONAL_SALES_JOB_QUEUED',entity:'ZonalSalesJob',entityId:job.id,after:{kind,dates:dates.length,from:dates[0],to:dates.at(-1)!}}});return job.id;
 });
}
export async function controlSalesJob(prisma:PrismaClient,actor:SalesActor,id:string,action:'pause'|'resume'|'retry'){
 assertAdmin(actor.role);
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${actor.restaurantId} FOR UPDATE`;
  const job=await tx.zonalSalesJob.findFirst({where:{id,restaurantId:actor.restaurantId}});if(!job)throw new ZonalError('Sales job not found.');
  if(action!=='pause'&&!await workerReady(prisma))throw new ZonalError('The durable sales worker is offline.');
  if(action==='pause')await tx.zonalSalesJob.update({where:{id},data:{status:'PAUSED',lastError:'Paused by an authorised user.'}});
  else{
   if(job.leaseUntil&&job.leaseUntil.getTime()>Date.now()&&job.leaseToken)throw new ZonalError('The current worker is stopping. Wait for its lease to release before resuming.');
   if(action==='retry')await tx.zonalSalesJobDay.updateMany({where:{jobId:id,status:{in:['FAILED','UNAVAILABLE']}},data:{status:'PENDING',reason:null}});
   await tx.zonalSalesJob.update({where:{id},data:{status:'QUEUED',phase:action==='retry'?'FETCH':job.phase,leaseToken:null,leaseUntil:null,lastError:null}});
  }
  await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:`ZONAL_SALES_JOB_${action.toUpperCase()}`,entity:'ZonalSalesJob',entityId:id}});
 });
}
export async function jobReview(prisma:PrismaClient,actor:SalesActor,id:string){
 assertAdmin(actor.role);
 const job=await prisma.zonalSalesJob.findFirst({where:{id,restaurantId:actor.restaurantId},include:{days:{where:{status:{in:['STAGED','EXCEPTION']}},orderBy:{date:'asc'}}}});if(!job)throw new ZonalError('Sales job not found.');
 const clean:{id:string;previewId:string;date:string;net:string;hash:string}[]=[],exceptions:{id:string;date:string;reason:string;href:string}[]=[];
 // One coherent batched snapshot; never issue seven queries for each of 1,455 days.
 await prisma.$transaction(async tx=>{
  const range={gte:job.from,lte:job.to};
  const [restaurant,connection,sales,weeks,imports]=await Promise.all([
   tx.restaurant.findUniqueOrThrow({where:{id:actor.restaurantId},select:{currency:true}}),
   tx.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId},select:{branch:true}}),
   tx.dailySales.findMany({where:{restaurantId:actor.restaurantId,date:range}}),
   tx.weeklyForecast.findMany({where:{restaurantId:actor.restaurantId,weekStart:{gte:dateValue(mondayOf(dateKey(job.from))),lte:job.to}},include:{_count:{select:{days:true}}}}),
   tx.zonalImport.findMany({where:{restaurantId:actor.restaurantId,date:range,status:{in:['PREVIEW','APPROVED']}},orderBy:[{createdAt:'desc'},{id:'desc'}]})
  ]);
  const byId=new Map(imports.map(r=>[r.id,r])),saleByDate=new Map(sales.map(r=>[dateKey(r.date),r])),weekByDate=new Map(weeks.map(r=>[dateKey(r.weekStart),r]));
  for(const day of job.days){
   const record=day.previewId?byId.get(day.previewId):null,date=dateKey(day.date);
   if(!record){exceptions.push({id:day.id,date,reason:'A verified report is missing.',href:'/admin/integrations/zonal'});continue;}
   const sale=saleByDate.get(date)??null,week=weekByDate.get(mondayOf(date));
   const evidence=imports.filter(r=>dateKey(r.date)===date),prior=evidence.filter(r=>r.status==='APPROVED').sort((a,b)=>(b.completedAt?.getTime()??0)-(a.completedAt?.getTime()??0))[0],newest=evidence.find(r=>r.status==='PREVIEW');
   const assessment=assessPreview(record,{branch:connection?.branch??'',currency:restaurant.currency,today:londonToday(),now:new Date(),week:week?{finalizedAt:week.finalizedAt,dayCount:week._count.days}:null,sale,priorFingerprint:prior&&sale?.version===prior.salesVersion+1?prior.fingerprint:undefined,newestId:newest?.id,durableStaging:true});
   if(assessment.canApprove&&!assessment.conflict&&record.fingerprint===day.fingerprint&&assessment.report)clean.push({id:day.id,previewId:record.id,date,net:assessment.report.net,hash:record.fingerprint});
   else exceptions.push({id:day.id,date,reason:assessment.issues.map(i=>i.message).join(' ')||'The report changed or is no longer eligible.',href:assessment.issues.find(i=>i.blocking)?.href??`/admin/integrations/zonal#preview-${record.id}`});
  }
 },{isolationLevel:'RepeatableRead'});
 const total=clean.reduce((sum,d)=>sum+BigInt(d.net),0n).toString();
 const digest=createHash('sha256').update(JSON.stringify(clean)).digest('hex');
 return {jobId:id,clean,total,digest,exceptions};
}
export async function requestBulkApproval(prisma:PrismaClient,actor:SalesActor,id:string,digest:string,reason:string){
 assertAdmin(actor.role);if(reason.trim().length<3||reason.length>500)throw new ZonalError('Supply a historical approval reason (3–500 characters).');
 if(!await workerReady(prisma))throw new ZonalError('The durable sales worker is offline.');
 const summary=await jobReview(prisma,actor,id);if(summary.digest!==digest||!summary.clean.length)throw new ZonalError('Review changed. Refresh the summary before approving.');
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id=${actor.restaurantId} FOR UPDATE`;
  const job=await tx.zonalSalesJob.findFirst({where:{id,restaurantId:actor.restaurantId}});if(!job||!['REVIEW','COMPLETE'].includes(job.status))throw new ZonalError('Wait for retrieval to finish or pause it before bulk review.');
  if(summary.exceptions.length)await tx.$executeRaw`UPDATE "ZonalSalesJobDay" AS d SET "status"='EXCEPTION', "reason"=e.reason FROM jsonb_to_recordset(${JSON.stringify(summary.exceptions.map(e=>({id:e.id,reason:e.reason})))}::jsonb) AS e(id text,reason text) WHERE d."id"=e.id AND d."jobId"=${id} AND d."status" IN ('STAGED','EXCEPTION')`;
  await tx.zonalSalesJobDay.updateMany({where:{jobId:id,id:{in:summary.clean.map(d=>d.id)},status:{in:['STAGED','EXCEPTION']}},data:{status:'APPROVAL_QUEUED'}});
  await tx.zonalSalesJob.update({where:{id},data:{actorId:actor.id,status:'QUEUED',phase:'APPROVE',approvalReason:reason.trim(),leaseToken:null,leaseUntil:null}});
  await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'ZONAL_SALES_BULK_APPROVAL_REQUESTED',entity:'ZonalSalesJob',entityId:id,after:{count:summary.clean.length,total:summary.total,digest},reason:reason.trim()}});
 });return {count:summary.clean.length,total:summary.total};
}
export async function salesJobStatus(prisma:PrismaClient,actor:SalesActor){
 assertAdmin(actor.role);
 const [ready,recent,history,connection]=await Promise.all([workerReady(prisma),prisma.zonalSalesJob.findMany({where:{restaurantId:actor.restaurantId},orderBy:{createdAt:'desc'},take:5,include:{days:{select:{status:true,date:true,processedAt:true,reason:true}}}}),prisma.zonalSalesJob.findFirst({where:{restaurantId:actor.restaurantId,kind:'HISTORY'},orderBy:{createdAt:'desc'},include:{days:{select:{status:true,date:true,processedAt:true,reason:true}}}}),prisma.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId},select:{reportAccessVerifiedAt:true}})]);
 const jobs=[...new Map([...(history?[history]:[]),...recent].map(job=>[job.id,job])).values()];
 return {workerReady:ready,lastSuccess:connection?.reportAccessVerifiedAt?.toISOString()??null,jobs:jobs.map(job=>{
  const counts=(status:string)=>job.days.filter(d=>d.status===status).length;
  const processed=job.days.filter(d=>d.status!=='PENDING'),latest=processed.filter(d=>!['FAILED','UNAVAILABLE'].includes(d.status)).map(d=>dateKey(d.date)).sort().at(-1)??null;
  return {id:job.id,kind:job.kind,status:job.status,...jobDisplayState(job,ready),phase:job.phase,from:dateKey(job.from),to:dateKey(job.to),latestAvailable:job.latestAvailable?dateKey(job.latestAvailable):null,total:job.days.length,processed:processed.length,imported:counts('APPROVED'),staged:counts('STAGED')+counts('APPROVAL_QUEUED'),skipped:counts('SKIPPED'),failed:counts('FAILED'),unavailable:counts('UNAVAILABLE'),exceptions:counts('EXCEPTION'),remaining:counts('PENDING'),latestProcessed:latest,lastError:job.lastError,failures:job.days.filter(d=>['FAILED','UNAVAILABLE','EXCEPTION'].includes(d.status)).slice(0,30).map(d=>({date:dateKey(d.date),reason:reportErrorMessage(d.reason)}))};})};
}
// Lease tokens fence stale workers. PostgreSQL, not a web request, owns work state.
export async function claimSalesJob(prisma:PrismaClient){
 const token=randomUUID();const rows=await prisma.$transaction(async tx=>{
  // Serialize only queue claiming, never browser work. The running-only unique index
  // remains the database backstop against simultaneous workers for a restaurant.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('cocotte-sales-job-claim'))::text`;
  return tx.$queryRaw<{id:string}[]>`UPDATE "ZonalSalesJob" SET "status"='RUNNING', "leaseToken"=${token}, "leaseUntil"=NOW()+INTERVAL '120 seconds', "updatedAt"=NOW() WHERE "id"=(SELECT candidate."id" FROM "ZonalSalesJob" candidate WHERE ((candidate."status"='QUEUED' AND (candidate."leaseUntil" IS NULL OR candidate."leaseUntil"<NOW())) OR (candidate."status"='RUNNING' AND candidate."leaseUntil"<NOW())) AND NOT EXISTS (SELECT 1 FROM "ZonalSalesJob" other WHERE other."restaurantId"=candidate."restaurantId" AND other."status"='RUNNING' AND other."id"<>candidate."id") ORDER BY CASE WHEN candidate."status"='RUNNING' THEN 0 WHEN candidate."phase"='APPROVE' THEN 1 WHEN candidate."kind"='DAILY' THEN 2 ELSE 3 END, candidate."createdAt" FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING "id"`;
 });
 return rows[0]?{id:rows[0].id,token}:null;
}
export async function ownedJob(tx:PrismaClient|Prisma.TransactionClient,id:string,token:string){return tx.zonalSalesJob.findFirst({where:{id,leaseToken:token,status:'RUNNING',leaseUntil:{gt:new Date()}}});}
