// Local pilot verification: creates only a PREVIEW through the production worker.
// Never approves sales and never prints credentials or financial values.
import 'dotenv/config';
import { db } from '../../src/lib/db';
import { fetchAndPreview } from '../../src/lib/zonal/service';
import { dateValue, validDateKey } from '../../src/lib/dates';
const prisma=db();const date=process.argv[2]??'2026-11-03';
try{
 if(!validDateKey(date))throw new Error();
 const actor=await prisma.user.findFirst({where:{active:true,role:'SUPER_USER',restaurantId:'restaurant'},select:{id:true,restaurantId:true,role:true}});
 if(!actor)throw new Error();
 const where={restaurantId_date:{restaurantId:actor.restaurantId,date:dateValue(date)}};
 const before=await prisma.dailySales.findUnique({where});
 const previewId=await fetchAndPreview(prisma,actor,date);
 const after=await prisma.dailySales.findUnique({where});
 if(before?.amountPence!==after?.amountPence||before?.version!==after?.version)throw new Error();
 const preview=await prisma.zonalImport.findFirstOrThrow({where:{id:previewId,restaurantId:actor.restaurantId}});
 console.log('[zonal] PREVIEW_CREATED',JSON.stringify({previewId:preview.id,date,branch:preview.branch,source:preview.source,status:preview.status,fields:Object.keys(preview.payload as object),dailySalesUnchanged:true}));
}catch{console.log('[zonal] FETCH_PREVIEW_FAILED. Check the sanitized audit/worker diagnostics. No import was approved.');process.exitCode=1;}
finally{await prisma.$disconnect();}
