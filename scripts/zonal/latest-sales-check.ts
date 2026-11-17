// One authorised latest-completed-report read; no Daily Sales or preview writes.
import 'dotenv/config';
import {db} from '../../src/lib/db';
import {connectZonal} from '../../src/lib/zonal/connection-service';
import {fetchLatestZonalReport} from '../../src/lib/zonal/worker';
import {addDays,londonToday} from '../../src/lib/dates';
const prisma=db();
try{
 const actor=await prisma.user.findFirstOrThrow({where:{active:true,role:'SUPER_USER',restaurantId:'restaurant'},select:{id:true,restaurantId:true,role:true}});
 if(await prisma.zonalSyncBatch.count({where:{restaurantId:actor.restaurantId,status:'RUNNING'}}))throw new Error();
 const result=await connectZonal(prisma,actor,undefined,(id,credentials)=>fetchLatestZonalReport(id,credentials,addDays(londonToday(),-1)));
 console.log('[latest-sales]',JSON.stringify({loginVerified:result.loginVerified,reportDate:result.report?.date??null,reportValidated:!!result.report,fields:result.report?Object.keys(result.report):[],message:result.message}));
 if(!result.report)process.exitCode=1;
}catch{console.log('[latest-sales] Read unavailable. No retry and no sales writes.');process.exitCode=1;}finally{await prisma.$disconnect();}
