import 'server-only';
import type {PrismaClient} from '@/generated/prisma/client';
import {dateKey,dateValue} from '../dates';
import {resolveSalesSources} from '../zonal/sales-source';
import {validateReport,reportInput,type Report} from '../zonal/validation';
import type {Day} from './analytics';
export async function historicalDays(prisma:PrismaClient,restaurantId:string,from:string,to:string){
 return prisma.$transaction(async tx=>{
  const date={gte:dateValue(from),lte:dateValue(to)};
  const sales=await tx.dailySales.findMany({where:{restaurantId,date},select:{restaurantId:true,date:true,version:true,amountPence:true},orderBy:{date:'asc'}});
  const imports=await tx.zonalImport.findMany({where:{restaurantId,date,status:'APPROVED',completedAt:{not:null}},select:{id:true,restaurantId:true,date:true,status:true,source:true,completedAt:true,salesVersion:true,branch:true,payload:true},orderBy:[{completedAt:'desc'},{id:'desc'}]});
  const sources=resolveSalesSources(restaurantId,sales,imports),byId=new Map(imports.map(r=>[r.id,r]));
  return sales.map(sale=>{
   const date=dateKey(sale.date),source=sources.get(date),record=source?byId.get(source.importId):undefined;
   let report:Report|null=null;if(record)try{const r=validateReport(reportInput(record.payload as Report),record.branch,date);if(BigInt(r.net)===sale.amountPence)report=r;}catch{/* Detail is unavailable; canonical net remains authoritative. */}
   return {date,net:sale.amountPence.toString(),food:report?.food??null,drink:report?.drink??null,specials:report?.specials??null,gross:report?.gross??null,vat:report?.vat??null} satisfies Day;
  });
 },{isolationLevel:'RepeatableRead'});
}
