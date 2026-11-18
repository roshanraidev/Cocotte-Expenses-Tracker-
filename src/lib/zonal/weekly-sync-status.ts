import 'server-only';
import type {PrismaClient} from '@/generated/prisma/client';
import type {SalesActor} from '../sales-service';
import {assertAdmin} from '../policy';
import {dateValue,addDays,mondayOf,validDateKey,dateKey} from '../dates';

export type WeeklyBatchRecord={id:string;status:string;createdAt:Date;finishedAt:Date|null;heartbeatAt:Date;days:{date:Date;status:string;attempted:boolean;errorCode:string|null;approvalError:string|null;preview:{status:string;completedAt:Date|null}|null}[]};
export function weeklySyncStatus(batch:WeeklyBatchRecord|null,now=Date.now()){
 if(!batch)return null;
 const available=batch.days.filter(d=>d.errorCode!=='REPORT_AFTER_LATEST');
 const unavailable=batch.days.length-available.length;
 const approved=available.filter(d=>d.status==='UNCHANGED'||d.preview?.status==='APPROVED').length;
 const review=available.filter(d=>d.status!=='UNCHANGED'&&d.preview?.status==='PREVIEW').length;
 const failed=available.filter(d=>d.status==='FAILED'||d.approvalError!==null).length;
 const running=batch.status==='RUNNING'&&batch.heartbeatAt.getTime()>now-120000;
 const interrupted=batch.status==='RUNNING'&&!running||['INTERRUPTED','CANCELLED','FAILED'].includes(batch.status);
 const stage=running?'Sync Started':interrupted?'Failed':review?'Review Required':failed?'Failed':available.length>0&&approved===available.length?'Approved':'Fetch Completed';
 return {id:batch.id,stage,fetchCompleted:batch.finishedAt!==null&&batch.status!=='RUNNING',partial:failed>0&&available.some(d=>d.preview!==null),total:available.length,checked:available.filter(d=>d.attempted).length,approved,review,failed,unavailable,
  latestDate:available.filter(d=>d.preview!==null).map(d=>dateKey(d.date)).sort().at(-1)??null,
  startedAt:batch.createdAt.toISOString(),finishedAt:batch.finishedAt?.toISOString()??null,
  lastApprovedAt:available.map(d=>d.preview?.completedAt).filter((v):v is Date=>!!v).sort((a,b)=>b.getTime()-a.getTime())[0]?.toISOString()??null};
}
export async function readWeeklySyncStatus(prisma:PrismaClient,actor:SalesActor,monday:string){
 assertAdmin(actor.role);
 if(!validDateKey(monday)||mondayOf(monday)!==monday)throw new Error('Choose a valid reporting week.');
 const batch=await prisma.zonalSyncBatch.findFirst({where:{restaurantId:actor.restaurantId,from:dateValue(monday),to:{lte:dateValue(addDays(monday,6))}},orderBy:{createdAt:'desc'},select:{id:true,status:true,createdAt:true,finishedAt:true,heartbeatAt:true,days:{select:{date:true,status:true,attempted:true,errorCode:true,approvalError:true,preview:{select:{restaurantId:true,status:true,completedAt:true}}}}}});
 return weeklySyncStatus(batch?{...batch,days:batch.days.map(day=>({...day,preview:day.preview?.restaurantId===actor.restaurantId?day.preview:null}))}:null);
}
export type WeeklySyncStatus=ReturnType<typeof weeklySyncStatus>;
