'use server';
import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { db } from '@/lib/db';
import { startBatch,runBatch,batchOverview,cancelBatch,approveBatch } from '@/lib/zonal/batch';
import { ZonalError } from '@/lib/zonal/validation';
export async function readBatches(){return batchOverview(db(),await requireAdmin());}
export async function syncBatch(form:FormData){
 const actor=await requireAdmin();
 try{
  const id=await startBatch(db(),actor,String(form.get('mode')),String(form.get('from')??''),String(form.get('to')??''));
  after(async()=>{try{await runBatch(db(),actor,id);}catch{console.info('[zonal] BATCH INTERRUPTED');}revalidatePath('/admin/integrations/zonal');});
  return {error:'',message:'Sync started. Reports will remain previews until approved.'};
 }catch(error){return {error:error instanceof ZonalError?error.message:'Sync could not start. Check server configuration and migrations.',message:''};}
}
export async function stopBatch(id:string){await cancelBatch(db(),await requireAdmin(),id);revalidatePath('/admin/integrations/zonal');}
export async function approveSyncBatch(form:FormData){
 const actor=await requireAdmin();
 try{
  if(form.get('confirm')!=='on')throw new ZonalError('Explicit confirmation is required.');
  const result=await approveBatch(db(),actor,String(form.get('batchId')),form.getAll('previewId').map(String),form.get('overwrite')==='on',String(form.get('reason')??'').slice(0,500));
  for(const path of ['/admin/integrations/zonal','/dashboard','/sales','/reports','/admin/planning','/admin/forecasts'])revalidatePath(path);
  return {error:'',message:`${result.approved} approved; ${result.failed} could not be approved. Review each date below.`};
 }catch(error){return {error:error instanceof ZonalError?error.message:'Approval could not complete. Refresh and review each date before retrying.',message:''};}
}
