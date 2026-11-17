// Read-only operational metadata. No report values, credentials or cookies.
import 'dotenv/config';
import {createHash} from 'node:crypto';
import {db} from '../../src/lib/db';
const prisma=db();try{
 const jobs=await prisma.zonalSalesJob.findMany({where:{restaurantId:'restaurant'},orderBy:{createdAt:'desc'}});
 for(const job of jobs){const days=await prisma.zonalSalesJobDay.findMany({where:{jobId:job.id},select:{date:true,status:true,reason:true,previewId:true,fingerprint:true},orderBy:{date:'asc'}});const counts=new Map<string,number>();for(const day of days){const key=day.status+':'+(day.reason??'');counts.set(key,(counts.get(key)??0)+1);}console.log(JSON.stringify({job:job.id,kind:job.kind,status:job.status,phase:job.phase,leaseUntil:job.leaseUntil,activeBatchId:job.activeBatchId,errors:[...counts],failed:days.filter(d=>d.status==='FAILED').map(d=>({date:d.date.toISOString().slice(0,10),reason:d.reason})),stagedCount:days.filter(d=>d.status==='STAGED').length,stagedDigest:createHash('sha256').update(JSON.stringify(days.filter(d=>d.status==='STAGED').map(d=>({date:d.date,previewId:d.previewId,fingerprint:d.fingerprint})))).digest('hex')}));}
 console.log(JSON.stringify({sourceBatches:await prisma.zonalSyncBatch.findMany({where:{restaurantId:'restaurant'},orderBy:{createdAt:'desc'},take:5,select:{id:true,status:true,from:true,to:true,createdAt:true,finishedAt:true,days:{select:{date:true,status:true,errorCode:true,attempted:true}}}}),connection:await prisma.zonalConnection.findUnique({where:{restaurantId:'restaurant'},select:{lastAttemptAt:true,lastResultCode:true,loginVerifiedAt:true}})}));
}finally{await prisma.$disconnect();}
