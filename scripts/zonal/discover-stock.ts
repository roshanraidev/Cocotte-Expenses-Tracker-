// One authorised read-only discovery; no report values, credentials or cookies printed.
import 'dotenv/config';
import {db} from '../../src/lib/db';
import {connectZonal} from '../../src/lib/zonal/connection-service';
import {discoverZonalStock} from '../../src/lib/zonal/worker';
const prisma=db();
try{
 const actor=await prisma.user.findFirstOrThrow({where:{active:true,role:'SUPER_USER',restaurantId:'restaurant'},select:{id:true,restaurantId:true,role:true}});
 let metadata;
 const state=await connectZonal(prisma,actor,undefined,async(id,credentials)=>{const result=await discoverZonalStock(id,credentials);metadata=result.stockDiscovery;return result;});
 await prisma.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'ZONAL_STOCK_DISCOVERY',entity:'Restaurant',entityId:actor.restaurantId,after:{loginVerified:state.loginVerified,discovery:metadata??null},reason:state.message}});
 console.log('[zonal-stock]',JSON.stringify({loginVerified:state.loginVerified,message:state.message,discovery:metadata??null}));
}catch{console.log('[zonal-stock] Discovery unavailable. No retry attempted and no stock or financial data changed.');process.exitCode=1;}
finally{await prisma.$disconnect();}
