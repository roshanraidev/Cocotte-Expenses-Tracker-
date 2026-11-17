// One read-only session verifies the parser fix. Creates no preview or financial record.
import 'dotenv/config';
import {db} from '../../src/lib/db';
import {connectZonal} from '../../src/lib/zonal/connection-service';
import {fetchZonalBatch} from '../../src/lib/zonal/worker';
const prisma=db();try{
 const actor=await prisma.user.findFirstOrThrow({where:{restaurantId:'restaurant',active:true,role:'SUPER_USER'},select:{id:true,restaurantId:true,role:true}});
 const state=await connectZonal(prisma,actor,undefined,(restaurant,credentials)=>fetchZonalBatch(restaurant,credentials,['2025-05-13','2026-02-08','2022-12-24'],async(date,result)=>{console.log(JSON.stringify({date,code:result.code,reason:result.failureReason??null,reportValidated:!!result.report}));}));
 console.log(JSON.stringify({loginVerified:state.loginVerified,financialWrites:false}));
}catch{console.log('Read-only verification unavailable. No automatic retry.');process.exitCode=1;}finally{await prisma.$disconnect();}
