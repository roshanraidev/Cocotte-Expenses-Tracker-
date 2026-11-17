// Resume unattempted history only after verifying the investigation baseline.
import 'dotenv/config';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {db} from '../../src/lib/db';
import {controlSalesJob} from '../../src/lib/sales-history/jobs';
const prisma=db();try{
 const job=await prisma.zonalSalesJob.findFirstOrThrow({where:{restaurantId:'restaurant',kind:'HISTORY',status:'PAUSED'}});
 const rows=await prisma.zonalSalesJobDay.findMany({where:{jobId:job.id,status:'STAGED'},select:{id:true,date:true,previewId:true,fingerprint:true},orderBy:{date:'asc'}});
 const digest=createHash('sha256').update(JSON.stringify(rows.map(d=>({date:d.date,previewId:d.previewId,fingerprint:d.fingerprint})))).digest('hex');
 if(rows.length!==1318||digest!=='ad56071690f8189640f4f9532fac777e01e116bec6076de15eeddabde3d2b863')throw new Error('PRESERVATION_CHECK_FAILED');
 await writeFile('/private/tmp/cocotte-staged-history-baseline.json',JSON.stringify({jobId:job.id,rows:rows.map(r=>({id:r.id,previewId:r.previewId,fingerprint:r.fingerprint}))}),{mode:0o600});
 const actor=await prisma.user.findFirstOrThrow({where:{id:job.actorId,restaurantId:job.restaurantId,active:true,role:'SUPER_USER'},select:{id:true,restaurantId:true,role:true}});
 await controlSalesJob(prisma,actor,job.id,'resume');
 console.log(JSON.stringify({preservedStagedReports:rows.length,digest,action:'RESUME_EXISTING_PENDING_ONLY',failedReportsReset:false,newHistoryJob:false}));
}finally{await prisma.$disconnect();}
