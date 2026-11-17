import 'server-only';
import type {PrismaClient} from '@/generated/prisma/client';
import {dateValue,addDays} from '../dates';
import {financialWeek} from '../financial-data';
import {weeklySalesOverview} from './weekly-sales';
export async function dashboardWeek(prisma:PrismaClient,restaurantId:string,monday:string,today:string){
 // Purchasing and sales panels share one repeatable-read snapshot, so approval
 // cannot produce a new sales total beside an older purchasing projection.
 return prisma.$transaction(async tx=>{
  const financial=await financialWeek(restaurantId,monday,today,tx);
  const range={gte:dateValue(monday),lte:dateValue(addDays(monday,6))};
  const sales=await tx.dailySales.findMany({where:{restaurantId,date:range},select:{restaurantId:true,date:true,amountPence:true,version:true}});
  const imports=await tx.zonalImport.findMany({where:{restaurantId,date:range,status:'APPROVED',completedAt:{not:null}},select:{id:true,restaurantId:true,date:true,status:true,source:true,completedAt:true,salesVersion:true,branch:true,payload:true},orderBy:[{completedAt:'desc'},{id:'desc'}]});
  return {financial,overview:weeklySalesOverview(restaurantId,monday,sales,imports,financial.days,financial.sales?.projectedPence??null)};
 },{isolationLevel:'RepeatableRead'});
}
