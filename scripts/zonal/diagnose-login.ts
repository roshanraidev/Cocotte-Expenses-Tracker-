// One rate-limited login using stored encrypted credentials and the production worker.
// No password arguments or raw browser output. Diagnostics are enum-validated.
import 'dotenv/config';
import { db } from '../../src/lib/db';
import { connectZonal } from '../../src/lib/zonal/connection-service';
const prisma = db();
try {
  const user=await prisma.user.findFirst({where:{active:true,role:'SUPER_USER',restaurantId:'restaurant'},select:{id:true,restaurantId:true,role:true}});
  if(!user)throw new Error();
  const result=await connectZonal(prisma,user);
  console.log('[zonal] LOGIN_VERIFIED',result.loginVerified);
  console.log('[zonal] REPORT_ACCESS_VERIFIED',false);
}catch{console.log('[zonal] Diagnostic stopped safely. Check cooldown, encryption setup or server availability. Raw details withheld.');process.exitCode=1;}
finally{await prisma.$disconnect();}
