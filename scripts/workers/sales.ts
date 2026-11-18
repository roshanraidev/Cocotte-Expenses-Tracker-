import 'dotenv/config';
import {randomUUID} from 'node:crypto';
import {db} from '../../src/lib/db';
import {salesWorkerTick} from '../../src/lib/sales-sync/job-worker';
const prisma=db(),id=randomUUID();let stopping=false;
process.on('SIGTERM',()=>{stopping=true;});process.on('SIGINT',()=>{stopping=true;});
async function beat(){await prisma.zonalSalesWorker.upsert({where:{id},create:{id},update:{heartbeatAt:new Date()}});}
await beat();const heartbeat=setInterval(()=>void beat().catch(()=>{stopping=true;}),5000);
console.info('[sales-worker] Ready. DAILY jobs only; historical imports disabled. No automatic approvals or scheduled sync.');
try{while(!stopping){try{if(!await salesWorkerTick(prisma))await new Promise(resolve=>setTimeout(resolve,2000));}catch{console.info('[sales-worker] Database unavailable; retrying queue connection.');await new Promise(resolve=>setTimeout(resolve,5000));}}}
finally{clearInterval(heartbeat);await prisma.zonalSalesWorker.deleteMany({where:{id}}).catch(()=>{});await prisma.$disconnect();}
