'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/auth';
import {assertPermission} from '@/lib/access';
import {db} from '@/lib/db';
import {enqueueSalesJob,controlSalesJob,salesJobStatus,jobReview,requestBulkApproval,workerReady,dateRange} from '@/lib/sales-sync/jobs';
import {dailySyncRange,recentWindow} from '@/lib/zonal/sync-config';
import {addDays,dateKey,dateValue,londonToday} from '@/lib/dates';
import {syncSelectedDates} from '@/app/(protected)/admin/integrations/zonal/batch-actions';
import {ZonalError} from '@/lib/zonal/validation';
const guard=async()=>{const actor=await requireAdmin();assertPermission(actor,'sales.view');assertPermission(actor,'dashboard.view');return actor;};
export async function dailySalesSync(){
 const actor=await guard();try{
  const prisma=db();
  if(!await workerReady(prisma)){
   // A small persistent Node deployment can use the same bounded batch path as weekly sync.
   const yesterday=addDays(londonToday(),-1);
   const last=await prisma.dailySales.findFirst({where:{restaurantId:actor.restaurantId,date:{lte:dateValue(yesterday)}},orderBy:{date:'desc'},select:{date:true}});
   const range=dailySyncRange(yesterday,last?dateKey(last.date):null,recentWindow());
   const result=await syncSelectedDates(dateRange(range.from,range.to));
   return {...result,jobId:null};
  }
  const id=await enqueueSalesJob(prisma,actor,'DAILY');revalidatePath('/dashboard');return {error:'',message:'Incremental sales sync queued, including recent correction checks. Review reports before approval.',jobId:id};
 }catch(error){return {error:error instanceof ZonalError?error.message:'Could not start sales sync. No approved sales were changed.',message:'',jobId:null};}
}
export async function syncStatus(){return salesJobStatus(db(),await guard());}
export async function controlDailyJob(id:string,action:string){
 const actor=await guard();if(!['pause','resume','retry'].includes(action))throw new ZonalError('Invalid job action.');
 await controlSalesJob(db(),actor,id,action as 'pause'|'resume'|'retry');return syncStatus();
}
export async function reviewDailyJob(id:string){return jobReview(db(),await guard(),id);}
export async function approveDailyJob(id:string,digest:string,reason:string,confirmed:boolean){
 const actor=await guard();if(confirmed!==true)throw new ZonalError('Explicit bulk approval confirmation is required.');
 const result=await requestBulkApproval(db(),actor,id,digest,reason);revalidatePath('/dashboard');return result;
}
