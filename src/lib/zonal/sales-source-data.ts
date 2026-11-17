import 'server-only';
import type { PrismaClient } from '@/generated/prisma/client';
import { addDays,dateValue } from '../dates';
import { resolveSalesSources } from './sales-source';
export async function loadSalesSources(prisma:PrismaClient,restaurantId:string,monday:string){
 const range={gte:dateValue(monday),lte:dateValue(addDays(monday,6))};
 return prisma.$transaction(async tx=>{
  const sales=await tx.dailySales.findMany({where:{restaurantId,date:range},select:{restaurantId:true,date:true,version:true,amountPence:true}});
  const imports=await tx.zonalImport.findMany({where:{restaurantId,date:range,status:'APPROVED',completedAt:{not:null}},select:{id:true,restaurantId:true,date:true,status:true,source:true,completedAt:true,salesVersion:true,branch:true,payload:true},orderBy:{completedAt:'desc'}});
  return resolveSalesSources(restaurantId,sales,imports);
 },{isolationLevel:'RepeatableRead'});
}
