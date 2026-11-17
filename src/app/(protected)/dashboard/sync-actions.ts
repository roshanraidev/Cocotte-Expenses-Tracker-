'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/auth';
import {assertPermission} from '@/lib/access';
import {db} from '@/lib/db';
import {enqueueSalesJob,controlSalesJob,salesJobStatus,jobReview,requestBulkApproval} from '@/lib/sales-history/jobs';
import {ZonalError} from '@/lib/zonal/validation';
const guard=async()=>{const actor=await requireAdmin();assertPermission(actor,'sales.view');assertPermission(actor,'dashboard.view');return actor;};
async function enqueue(kind:'HISTORY'|'DAILY'){
 const actor=await guard();try{const id=await enqueueSalesJob(db(),actor,kind);revalidatePath('/dashboard');return {error:'',message:kind==='HISTORY'?'Historical import queued. The worker continues independently of this browser. Sales remain staged until bulk approval.':'Incremental sales sync queued, including the recent correction window.',jobId:id};}catch(error){return {error:error instanceof ZonalError?error.message:'Could not queue sales work. No approved sales were changed.',message:'',jobId:null};}
}
export async function dailySalesSync(){return enqueue('DAILY');}
export async function importAllHistoricalSales(){return enqueue('HISTORY');}
export async function syncStatus(){return salesJobStatus(db(),await guard());}
export async function controlHistoricalJob(id:string,action:string){
 const actor=await guard();if(!['pause','resume','retry'].includes(action))throw new ZonalError('Invalid job action.');
 await controlSalesJob(db(),actor,id,action as 'pause'|'resume'|'retry');return syncStatus();
}
export async function reviewHistoricalJob(id:string){return jobReview(db(),await guard(),id);}
export async function approveHistoricalJob(id:string,digest:string,reason:string,confirmed:boolean){
 const actor=await guard();if(confirmed!==true)throw new ZonalError('Explicit bulk approval confirmation is required.');
 const result=await requestBulkApproval(db(),actor,id,digest,reason);revalidatePath('/dashboard');return result;
}
