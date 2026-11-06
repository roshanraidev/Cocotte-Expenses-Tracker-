// Read-only approval diagnostics. Prints status codes and dates, never sales figures or credentials.
import 'dotenv/config';
import { db } from '../../src/lib/db';
import { previewAssessment } from '../../src/lib/zonal/approval-data';
const prisma=db();
try{
 const actor=await prisma.user.findFirst({where:{active:true,role:'SUPER_USER',restaurantId:'restaurant'},select:{restaurantId:true}});
 if(!actor)throw new Error('Active Super User required.');
 const records=await prisma.zonalImport.findMany({where:{restaurantId:actor.restaurantId,status:'PREVIEW'},orderBy:[{date:'desc'},{createdAt:'desc'}]});
 const result=[];
 for(const record of records){const state=await previewAssessment(prisma,actor.restaurantId,record);result.push({previewId:record.id,date:state.date,monday:state.monday,sunday:state.weekEnd,state:state.state,blockers:state.issues.map(issue=>issue.code),ready:state.canApprove});}
 console.log(JSON.stringify(result,null,2));
}catch{console.log('Read-only approval diagnosis failed; check local database configuration. No records were changed.');process.exitCode=1;}
finally{await prisma.$disconnect();}
