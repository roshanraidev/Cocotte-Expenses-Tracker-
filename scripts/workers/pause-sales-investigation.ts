import 'dotenv/config';
import {db} from '../../src/lib/db';
import {controlSalesJob} from '../../src/lib/sales-history/jobs';
const prisma=db();try{const jobs=await prisma.zonalSalesJob.findMany({where:{restaurantId:'restaurant',status:{in:['QUEUED','RUNNING']}}});for(const job of jobs){const actor=await prisma.user.findFirstOrThrow({where:{id:job.actorId,restaurantId:job.restaurantId,active:true,role:'SUPER_USER'},select:{id:true,restaurantId:true,role:true}});await controlSalesJob(prisma,actor,job.id,'pause');console.log(JSON.stringify({job:job.id,status:'PAUSED',checkpointPreserved:true}));}}finally{await prisma.$disconnect();}
