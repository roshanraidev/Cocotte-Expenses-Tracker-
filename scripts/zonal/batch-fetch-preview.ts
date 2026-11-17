// AUTHORISED LIVE READ ONLY: creates/reuses previews; never approves or changes Daily Sales.
import 'dotenv/config';
import assert from 'node:assert/strict';
import { db } from '../../src/lib/db';
import { startBatch,runBatch,batchOverview } from '../../src/lib/zonal/batch';
import { validDateKey,dateValue } from '../../src/lib/dates';
const prisma=db();
try{
 const from=process.argv[2],to=process.argv[3];
 if(!validDateKey(from)||!validDateKey(to))throw new Error();
 const connection=await prisma.zonalConnection.findFirst({where:{branch:'003 – Parsons Green',encryptedCredentials:{not:null}},select:{restaurantId:true}});
 if(!connection)throw new Error();
 const actor=await prisma.user.findFirstOrThrow({where:{restaurantId:connection.restaurantId,active:true,role:'SUPER_USER'},select:{id:true,restaurantId:true,role:true}});
 const where={restaurantId:actor.restaurantId,date:{gte:dateValue(from),lte:dateValue(to)}};
 const before=await prisma.dailySales.findMany({where,orderBy:{date:'asc'}});
 const id=await startBatch(prisma,actor,'custom',from,to);
 await runBatch(prisma,actor,id);
 assert.deepEqual(await prisma.dailySales.findMany({where,orderBy:{date:'asc'}}),before);
 const batch=(await batchOverview(prisma,actor)).find(row=>row.id===id)!;
 console.log('[zonal] LIVE_BATCH_PREVIEW',JSON.stringify({batchId:id,status:batch.status,branch:batch.branch,dailySalesUnchanged:true,days:batch.days.map(day=>({date:day.date,status:day.status,validatedFields:day.report?Object.keys(day.report):[],error:day.error}))}));
 if(batch.days.some(day=>!day.report))process.exitCode=1;
}catch{console.error('[zonal] Batch preview verification failed safely. No sales were approved.');process.exitCode=1;}
finally{await prisma.$disconnect();}
