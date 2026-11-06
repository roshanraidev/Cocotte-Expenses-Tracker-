import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import type { SalesActor } from '../sales-service';
import { assertAdmin } from '../policy';
import { dateKey,dateValue } from '../dates';
import { syncDates } from './batch-dates';
import { decryptCredentials } from './crypto';
import { PARSONS_GREEN } from './connection-service';
import { cancelZonalWorker,fetchZonalBatch,loginMessages,type LoginResult } from './worker';
import { fingerprint,resolveImport } from './service';
import { previewAssessment } from './approval-data';
import { validateReport,reportInput,ZonalError } from './validation';

export async function startBatch(prisma:PrismaClient,actor:SalesActor,mode:string,from:string,to:string){
 assertAdmin(actor.role);
 const range=syncDates(mode,from,to);
 if(!range.dates.length)throw new ZonalError(range.message);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
  // A dead process cannot leave a restaurant permanently locked. Retain all completed results.
  const stale=await tx.zonalSyncBatch.findMany({where:{restaurantId:actor.restaurantId,status:'RUNNING',heartbeatAt:{lt:new Date(Date.now()-120000)}}});
  for(const batch of stale){
   await tx.zonalSyncBatch.update({where:{id:batch.id},data:{status:'INTERRUPTED',finishedAt:new Date()}});
   await tx.zonalSyncDay.updateMany({where:{batchId:batch.id,status:'PENDING'},data:{status:'FAILED',errorCode:'INTERRUPTED'}});
  }
  if(await tx.zonalSyncBatch.count({where:{restaurantId:actor.restaurantId,status:'RUNNING'}}))throw new ZonalError('A sync is already running for this restaurant.');
  const connection=await tx.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId}});
  if(!connection?.encryptedCredentials||connection.branch!==PARSONS_GREEN)throw new ZonalError('Connect the verified Parsons Green branch first.');
  if(connection.lastAttemptAt&&Date.now()-connection.lastAttemptAt.getTime()<60000)throw new ZonalError('Please wait one minute between Zonal login attempts.');
  // Fail before reserving if the separately held encryption key is missing or invalid.
  decryptCredentials(actor.restaurantId,connection.encryptedCredentials);
  const reserved=await tx.zonalConnection.update({where:{restaurantId:actor.restaurantId},data:{revision:{increment:1},lastAttemptAt:new Date(),lastResultCode:'TESTING'}});
  const batch=await tx.zonalSyncBatch.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,branch:connection.branch,from:dateValue(range.from),to:dateValue(range.to),connectionRevision:reserved.revision,days:{create:range.dates.map(date=>({date:dateValue(date)}))}}});
  await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'ZONAL_BATCH_STARTED',entity:'ZonalSyncBatch',entityId:batch.id,after:{from:range.from,to:range.to,days:range.dates.length}}});
  return batch.id;
 });
}
export async function runBatch(prisma:PrismaClient,actor:SalesActor,id:string,runner=fetchZonalBatch){
 assertAdmin(actor.role);
 const batch=await prisma.zonalSyncBatch.findFirst({where:{id,restaurantId:actor.restaurantId,status:'RUNNING'},include:{days:{orderBy:{date:'asc'}}}});
 if(!batch)return;
 const connection=await prisma.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId}});
 if(!connection?.encryptedCredentials||connection.revision!==batch.connectionRevision){await cancelBatch(prisma,actor,id);return;}
 let monitoring=false;
 const heartbeat=setInterval(()=>{
  if(monitoring)return;monitoring=true;
  void (async()=>{
   const current=await prisma.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId},select:{revision:true,encryptedCredentials:true}});
   const updated=await prisma.zonalSyncBatch.updateMany({where:{id,restaurantId:actor.restaurantId,status:'RUNNING',connectionRevision:current?.revision??-1},data:{heartbeatAt:new Date()}});
   if(!updated.count||!current?.encryptedCredentials)cancelZonalWorker(actor.restaurantId);
  })().catch(()=>cancelZonalWorker(actor.restaurantId)).finally(()=>{monitoring=false;});
 },5000);
 let final:LoginResult={code:'BROWSER_FAILED'};
 try{
  const credentials=decryptCredentials(actor.restaurantId,connection.encryptedCredentials);
  final=await runner(actor.restaurantId,credentials,batch.days.map(day=>dateKey(day.date)),async(date,result)=>{
   await prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
    const active=await tx.zonalSyncBatch.findFirst({where:{id,restaurantId:actor.restaurantId,status:'RUNNING'}});
    const current=await tx.zonalConnection.findUnique({where:{restaurantId:actor.restaurantId}});
    if(!active||current?.revision!==batch.connectionRevision||!current.encryptedCredentials)throw new ZonalError('Sync cancelled or connection changed.');
    const day=await tx.zonalSyncDay.findUnique({where:{batchId_date:{batchId:id,date:dateValue(date)}}});
    if(!day||day.status!=='PENDING')return;
    if(result.code!=='REPORT_EXTRACTED'||!result.report){
     await tx.zonalSyncDay.update({where:{id:day.id},data:{status:'FAILED',attempted:true,errorCode:result.code,checkedAt:new Date()}});return;
    }
    let report;
    try{report=validateReport(result.report,batch.branch,date);}catch{await tx.zonalSyncDay.update({where:{id:day.id},data:{status:'FAILED',attempted:true,errorCode:'REPORT_INVALID',checkedAt:new Date()}});return;}
    const restaurant=await tx.restaurant.findUniqueOrThrow({where:{id:actor.restaurantId}});
    if(restaurant.currency!=='GBP')throw new ZonalError('Restaurant currency must be GBP.');
    const sale=await tx.dailySales.findUnique({where:{restaurantId_date:{restaurantId:actor.restaurantId,date:day.date}}});
    const prior=await tx.zonalImport.findFirst({where:{restaurantId:actor.restaurantId,date:day.date,status:'APPROVED'},orderBy:{completedAt:'desc'}});
    const hash=fingerprint(report);
    await tx.zonalConnection.update({where:{restaurantId:actor.restaurantId},data:{loginVerifiedAt:new Date(),reportAccessVerifiedAt:new Date(),lastResultCode:'REPORT_EXTRACTED'}});
    if(prior&&prior.fingerprint===hash&&sale?.version===prior.salesVersion+1&&sale.amountPence===BigInt(report.net)){
     await tx.zonalSyncDay.update({where:{id:day.id},data:{status:'UNCHANGED',attempted:true,previewId:prior.id,checkedAt:new Date()}});return;
    }
    const newest=await tx.zonalImport.findFirst({where:{restaurantId:actor.restaurantId,date:day.date,status:'PREVIEW'},orderBy:[{createdAt:'desc'},{id:'desc'}]});
    const reusable=newest&&newest.fingerprint===hash&&newest.salesVersion===(sale?.version??0)&&Date.now()-newest.createdAt.getTime()<25*60000;
    const preview=reusable?newest:await tx.zonalImport.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,date:day.date,branch:batch.branch,source:'ZONAL_BROWSER',payload:report,fingerprint:hash,salesVersion:sale?.version??0,previousPence:sale?.amountPence}});
    const assessment=await previewAssessment(tx,actor.restaurantId,preview);
    await tx.zonalSyncDay.update({where:{id:day.id},data:{status:assessment.canApprove?(sale?'CHANGED':'NEW'):'BLOCKED',attempted:true,previewId:preview.id,checkedAt:new Date()}});

   });
  });
 }catch{/* Only fixed safe result codes are persisted; never serialize worker/credential exceptions. */}
 finally{clearInterval(heartbeat);}
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
  const active=await tx.zonalSyncBatch.findFirst({where:{id,restaurantId:actor.restaurantId,status:'RUNNING'}});
  if(!active)return;
  await tx.zonalSyncDay.updateMany({where:{batchId:id,status:'PENDING'},data:{status:'FAILED',errorCode:final.code==='AUTHENTICATED'?'INTERRUPTED':final.code}});
  const days=await tx.zonalSyncDay.findMany({where:{batchId:id}});
  const good=days.filter(day=>day.previewId).length;
  const status=good===days.length?'COMPLETED':good?'PARTIAL':'FAILED';
  await tx.zonalConnection.updateMany({where:{restaurantId:actor.restaurantId,revision:batch.connectionRevision,encryptedCredentials:{not:null}},data:{lastResultCode:good?'REPORT_EXTRACTED':final.code,...(final.loginVerified?{loginVerifiedAt:new Date()}:{})}});
  await tx.zonalSyncBatch.update({where:{id},data:{status,finishedAt:new Date(),heartbeatAt:new Date()}});
  await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'ZONAL_BATCH_FINISHED',entity:'ZonalSyncBatch',entityId:id,after:{status,retrieved:good,total:days.length}}});
 });
}
export async function cancelBatch(prisma:PrismaClient,actor:SalesActor,id:string){
 assertAdmin(actor.role);
 const cancelled=await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
  const changed=await tx.zonalSyncBatch.updateMany({where:{id,restaurantId:actor.restaurantId,status:'RUNNING'},data:{status:'CANCELLED',finishedAt:new Date()}});
  if(!changed.count)return false;
  await tx.zonalSyncDay.updateMany({where:{batchId:id,status:'PENDING'},data:{status:'FAILED',errorCode:'CANCELLED'}});
  await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'ZONAL_BATCH_CANCELLED',entity:'ZonalSyncBatch',entityId:id}});
  return true;
 });
 // A foreign or completed batch must never cancel another restaurant's active job.
 if(cancelled)cancelZonalWorker(actor.restaurantId);
}
export async function batchOverview(prisma:PrismaClient,actor:SalesActor){
 assertAdmin(actor.role);
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "Restaurant" WHERE id = ${actor.restaurantId} FOR UPDATE`;
  const stale=await tx.zonalSyncBatch.findMany({where:{restaurantId:actor.restaurantId,status:'RUNNING',heartbeatAt:{lt:new Date(Date.now()-120000)}}});
  for(const batch of stale){
   await tx.zonalSyncBatch.update({where:{id:batch.id},data:{status:'INTERRUPTED',finishedAt:new Date()}});
   await tx.zonalSyncDay.updateMany({where:{batchId:batch.id,status:'PENDING'},data:{status:'FAILED',errorCode:'INTERRUPTED'}});
  }
 });

 const batches=await prisma.zonalSyncBatch.findMany({where:{restaurantId:actor.restaurantId},orderBy:{createdAt:'desc'},take:5,include:{days:{orderBy:{date:'asc'},include:{preview:true}}}});
 const rows=[];
 for(const batch of batches){
  const days=[];
  for(const day of batch.days){
   // Defence in depth: never expose a preview outside its owning restaurant.
   const preview=day.preview?.restaurantId===actor.restaurantId?day.preview:null;
   const assessment=preview&&preview.status==='PREVIEW'?await previewAssessment(prisma,actor.restaurantId,preview):null;
   let report=assessment?.report??null;
   if(preview&&!report)try{report=validateReport(reportInput(preview.payload as Parameters<typeof reportInput>[0]),batch.branch,dateKey(day.date));}catch{}
   const status=preview?.status==='CANCELLED'?'BLOCKED':day.status==='UNCHANGED'?'UNCHANGED':preview?.status==='APPROVED'?'APPROVED':assessment?assessment.state==='expired'?'EXPIRED':assessment.canApprove?(assessment.conflict?'CHANGED':'NEW'):'BLOCKED':day.status;
   const error=preview?.status==='CANCELLED'?'This preview was cancelled. Fetch the date again to create a new review.':day.errorCode==='CANCELLED'?'Cancelled before this date completed.':day.errorCode==='INTERRUPTED'?'Sync interrupted; fetch this date again.':day.errorCode?loginMessages[day.errorCode as keyof typeof loginMessages]??'Report could not be retrieved.':null;
   days.push({id:day.id,date:dateKey(day.date),status,attempted:day.attempted,previewId:preview?.id??null,previous:preview?.previousPence?.toString()??null,report,issues:assessment?.issues??[],eligible:assessment?.canApprove??false,reasonRequired:assessment?.reasonRequired??false,error,approvalError:day.approvalError});
  }
  rows.push({id:batch.id,branch:batch.branch,from:dateKey(batch.from),to:dateKey(batch.to),status:batch.status,createdAt:batch.createdAt.toISOString(),finishedAt:batch.finishedAt?.toISOString()??null,days});
 }
 return rows;
}
export async function approveBatch(prisma:PrismaClient,actor:SalesActor,id:string,ids:string[],overwrite:boolean,reason:string){
 assertAdmin(actor.role);
 if(!ids.length||ids.length>31||new Set(ids).size!==ids.length)throw new ZonalError('Select between 1 and 31 eligible reports.');
 const batch=await prisma.zonalSyncBatch.findFirst({where:{id,restaurantId:actor.restaurantId},include:{days:true}});
 if(!batch)throw new ZonalError('Batch not found for this restaurant.');
 if(batch.status==='RUNNING')throw new ZonalError('Wait for fetching to finish before approval.');
 if(ids.some(previewId=>!batch.days.some(day=>day.previewId===previewId&&day.status!=='UNCHANGED')))throw new ZonalError('Invalid batch selection.');
 let approved=0,failed=0;
 for(const previewId of ids){
  try{
   await resolveImport(prisma,actor,previewId,false,overwrite,reason);
   await prisma.zonalSyncDay.updateMany({where:{batchId:id,previewId},data:{status:'APPROVED',approvalError:null}});approved++;
  }catch(error){
   const message=error instanceof ZonalError?error.message:'Approval failed safely; refresh and review this date.';
   await prisma.zonalSyncDay.updateMany({where:{batchId:id,previewId},data:{approvalError:message}});failed++;
  }
 }
 return {approved,failed};
}
export type BatchOverview=Awaited<ReturnType<typeof batchOverview>>;
