import 'server-only';
import type { Prisma,PrismaClient } from '@/generated/prisma/client';
import { dateValue,mondayOf,londonToday } from '../dates';
import { mappedBranch } from './connection-service';
import { assessPreview,type PreviewRecord } from './approval';
export async function previewAssessment(prisma:Prisma.TransactionClient|PrismaClient,restaurantId:string,record:PreviewRecord,now=new Date()){
 const date=record.date;
 const [branch,restaurant,week,sale,prior,newest]=[
  await mappedBranch(prisma as PrismaClient,restaurantId),
  await prisma.restaurant.findUniqueOrThrow({where:{id:restaurantId},select:{currency:true}}),
  await prisma.weeklyForecast.findUnique({where:{restaurantId_weekStart:{restaurantId,weekStart:dateValue(mondayOf(date.toISOString().slice(0,10)))}},include:{_count:{select:{days:true}}}}),
  await prisma.dailySales.findUnique({where:{restaurantId_date:{restaurantId,date}}}),
  await prisma.zonalImport.findFirst({where:{restaurantId,date,status:'APPROVED'},orderBy:{completedAt:'desc'}}),
  await prisma.zonalImport.findFirst({where:{restaurantId,date,status:'PREVIEW'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{id:true}}),
 ] as const;
 return assessPreview(record,{branch,currency:restaurant.currency,today:londonToday(now),now,week:week?{finalizedAt:week.finalizedAt,dayCount:week._count.days}:null,sale,priorFingerprint:prior&&sale?.version===prior.salesVersion+1?prior.fingerprint:undefined,newestId:newest?.id});
}
