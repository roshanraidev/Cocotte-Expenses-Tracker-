import 'server-only';
import type {PrismaClient} from '@/generated/prisma/client';
import {dateKey,dateValue,addDays} from '../dates';
import {decryptCredentials} from '../zonal/crypto';
import {connectZonal} from '../zonal/connection-service';
import {fetchLatestZonalReport,fetchZonalBatch,cancelZonalWorker,type LoginResult} from '../zonal/worker';
import {startBatch,runBatch} from '../zonal/batch';
import {resolveImport} from '../zonal/service';
import {ownedJob,claimSalesJob} from './jobs';
import {ZonalError} from '../zonal/validation';
const authFailures=['LOGIN_REJECTED','LOGIN_UNVERIFIED','ACCESS_CONTROL','NOT_CONFIGURED','REPORT_CHANGED','BROWSER_FAILED','TIMEOUT','REPORT_RENDER_TIMEOUT','REPORT_DATE_MISMATCH','REPORT_BRANCH_MISMATCH','REPORT_DEPARTMENT_LAYOUT_CHANGED','REPORT_STRUCTURE_CHANGED'];
export type SalesJobDependencies={latest:typeof fetchLatestZonalReport;batch:typeof fetchZonalBatch};
const defaults:SalesJobDependencies={latest:fetchLatestZonalReport,batch:fetchZonalBatch};
export async function workSalesJob(prisma:PrismaClient,claim:{id:string;token:string},deps=defaults){
 const {id,token}=claim;const job=await ownedJob(prisma,id,token);if(!job)return;
 const user=await prisma.user.findFirst({where:{id:job.actorId,restaurantId:job.restaurantId,active:true,role:'SUPER_USER'},select:{id:true,restaurantId:true,role:true}});
 const release=async(status:string,lastError:string|null=null,wait=0)=>prisma.zonalSalesJob.updateMany({where:{id,leaseToken:token,status:'RUNNING'},data:{status,leaseToken:null,leaseUntil:wait?new Date(Date.now()+wait):null,lastError}});
 if(!user){await release('PAUSED','The requesting Super User is no longer authorised.');return;}
 let heartbeating=false;
 const heartbeat=setInterval(()=>{if(heartbeating)return;heartbeating=true;void prisma.zonalSalesJob.updateMany({where:{id,leaseToken:token,status:'RUNNING'},data:{leaseUntil:new Date(Date.now()+120000)}}).then(r=>{if(!r.count)cancelZonalWorker(user.restaurantId);}).catch(()=>cancelZonalWorker(user.restaurantId)).finally(()=>{heartbeating=false;});},5000);
 try{
  if(job.phase==='APPROVE'){
   const days=await prisma.zonalSalesJobDay.findMany({where:{jobId:id,status:'APPROVAL_QUEUED'},orderBy:{date:'asc'},take:50});
   for(const day of days){
    if(!await ownedJob(prisma,id,token))return;
    if(!await prisma.user.count({where:{id:user.id,restaurantId:user.restaurantId,active:true,role:'SUPER_USER'}})){await release('PAUSED','Approval permissions were revoked.');return;}
    try{
     if(!day.previewId)throw new ZonalError('The verified preview is missing.');
     const result=await resolveImport(prisma,user,day.previewId,false,false,job.approvalReason??'',{dayId:day.id,jobId:id,token});
     const approved=await prisma.zonalImport.count({where:{id:day.previewId,restaurantId:user.restaurantId,status:'APPROVED'}});
     await prisma.zonalSalesJobDay.update({where:{id:day.id},data:{status:approved?'APPROVED':result.startsWith('Already')?'SKIPPED':'EXCEPTION',reason:null,processedAt:new Date()}});
    }catch(error){await prisma.zonalSalesJobDay.update({where:{id:day.id},data:{status:'EXCEPTION',reason:error instanceof ZonalError?error.message:'Approval could not complete; no overwrite was authorised.',processedAt:new Date()}});}
   }
   const pending=await prisma.zonalSalesJobDay.count({where:{jobId:id,status:'APPROVAL_QUEUED'}});
   const exceptions=await prisma.zonalSalesJobDay.count({where:{jobId:id,status:{in:['STAGED','EXCEPTION','FAILED','UNAVAILABLE']}}});
   await release(pending?'QUEUED':exceptions?'REVIEW':'COMPLETE');return;
  }
  // A previous process may have persisted reports just before losing its lease.
  if(job.activeBatchId){
   const prior=await prisma.zonalSyncBatch.findFirst({where:{id:job.activeBatchId,restaurantId:user.restaurantId}});
   if(prior?.status==='RUNNING'&&prior.heartbeatAt.getTime()>Date.now()-120000){await release('QUEUED',null,15000);return;}
   await reconcile(prisma,id,token,job.activeBatchId);
   await prisma.zonalSalesJob.updateMany({where:{id,leaseToken:token},data:{activeBatchId:null}});
  }
  if(await prisma.zonalSyncBatch.count({where:{restaurantId:user.restaurantId,status:'RUNNING',heartbeatAt:{gt:new Date(Date.now()-120000)}}})){await release('QUEUED',null,15000);return;}
  const connection=await prisma.zonalConnection.findUnique({where:{restaurantId:user.restaurantId}});
  if(!connection?.encryptedCredentials){await release('PAUSED','The Zonal connection is disconnected.');return;}
  if(connection.lastAttemptAt&&Date.now()-connection.lastAttemptAt.getTime()<61000){await release('QUEUED',null,61000-(Date.now()-connection.lastAttemptAt.getTime()));return;}
  if(!job.latestAvailable){
   let outcome:LoginResult|undefined;
   const state=await connectZonal(prisma,user,undefined,async(restaurant,credentials)=>{outcome=await deps.latest(restaurant,credentials,dateKey(job!.to));return outcome;});
   if(!state.report){await release('PAUSED',outcome?.code??'REPORT_UNAVAILABLE');return;}
   const latest=state.report.date;
   await prisma.zonalSalesJob.updateMany({where:{id,leaseToken:token},data:{latestAvailable:dateValue(latest)}});
   await prisma.zonalSalesJobDay.updateMany({where:{jobId:id,date:{gt:dateValue(latest)},status:'PENDING'},data:{status:'UNAVAILABLE',reason:'Beyond the latest completed date offered by Zonal.',processedAt:new Date()}});
   await release('QUEUED',null,61000);return;
  }
  const pending=await prisma.zonalSalesJobDay.findMany({where:{jobId:id,status:'PENDING'},orderBy:{date:'asc'},take:7});
  if(!pending.length){const review=await prisma.zonalSalesJobDay.count({where:{jobId:id,status:{in:['STAGED','EXCEPTION','FAILED','UNAVAILABLE']}}});await release(review?'REVIEW':'COMPLETE');return;}
  // Only contiguous pending days belong in a source batch. No re-download of resolved gaps.
  const dates=[dateKey(pending[0].date)];for(const day of pending.slice(1)){const d=dateKey(day.date);if(d!==addDays(dates.at(-1)!,1))break;dates.push(d);}
  // Decryption is server-only and validated before reserving the existing browser batch.
  decryptCredentials(user.restaurantId,connection.encryptedCredentials);
  const batchId=await startBatch(prisma,user,'custom',dates[0],dates.at(-1)!);
  await prisma.zonalSalesJob.updateMany({where:{id,leaseToken:token},data:{activeBatchId:batchId}});
  await runBatch(prisma,user,batchId,async(restaurant,credentials,requested,onDay)=>deps.batch(restaurant,credentials,requested,async(date,result)=>{
   if(!await ownedJob(prisma,id,token)||!await prisma.user.count({where:{id:user.id,active:true,role:'SUPER_USER',restaurantId:user.restaurantId}}))throw new ZonalError('Sales job paused or authorisation changed.');
   await onDay(date,result);await reconcile(prisma,id,token,batchId,date);
  }));
  await reconcile(prisma,id,token,batchId);
  const failed=await prisma.zonalSyncDay.findFirst({where:{batchId,errorCode:{in:authFailures}}});
  if(failed){await release('PAUSED',failed.errorCode);return;}
  const sourceDays=await prisma.zonalSyncDay.findMany({where:{batchId},select:{previewId:true,attempted:true,status:true}});
  if(sourceDays.filter(day=>day.attempted&&day.status==='FAILED').length>=3&&!sourceDays.some(day=>day.previewId)){await release('PAUSED','Repeated report validation failures. Inspect the source errors before resuming.');return;}
  await prisma.zonalSalesJob.updateMany({where:{id,leaseToken:token},data:{activeBatchId:null}});
  if(await ownedJob(prisma,id,token))await release('QUEUED');
 }catch(error){
  // No unbounded automatic authentication retries. Operator resumes after inspecting the cause.
  await release('PAUSED',error instanceof ZonalError?error.message:'Worker interrupted. Resume after checking the connection.');
 }finally{
  clearInterval(heartbeat);
  // Pause stops the browser at its next bounded checkpoint and releases the lease.
  await prisma.zonalSalesJob.updateMany({where:{id,leaseToken:token,status:'PAUSED'},data:{leaseToken:null,leaseUntil:null}});
 }
}
async function reconcile(prisma:PrismaClient,jobId:string,token:string,batchId:string,date?:string){
 await prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT id FROM "ZonalSalesJob" WHERE id=${jobId} FOR UPDATE`;
  const job=await ownedJob(tx,jobId,token);if(!job)return;
  const days=await tx.zonalSyncDay.findMany({where:{batchId,...(date?{date:dateValue(date)}:{})},include:{preview:true}});
  for(const day of days){
   if(day.status==='PENDING'||!day.attempted&&!day.preview)continue;
   const status=day.status==='UNCHANGED'?'SKIPPED':day.preview?'STAGED':day.errorCode==='REPORT_DATE_UNAVAILABLE'?'UNAVAILABLE':'FAILED';
   await tx.zonalSalesJobDay.updateMany({where:{jobId,date:day.date,status:'PENDING'},data:{status,previewId:day.previewId,fingerprint:day.preview?.fingerprint,reason:day.preview?null:day.errorCode??'REPORT_UNAVAILABLE',processedAt:new Date()}});
  }
 });
}
export async function salesWorkerTick(prisma:PrismaClient,deps=defaults){const claim=await claimSalesJob(prisma);if(!claim)return false;await workSalesJob(prisma,claim,deps);return true;}
