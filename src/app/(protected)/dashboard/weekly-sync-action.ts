'use server';
import {requireAdmin} from '@/lib/auth';
import {assertPermission} from '@/lib/access';
import {londonToday} from '@/lib/dates';
import {weeklySyncRange} from '@/lib/zonal/weekly-range';
import {ZonalError} from '@/lib/zonal/validation';
import {syncSelectedDates} from '@/app/(protected)/admin/integrations/zonal/batch-actions';
import {db} from '@/lib/db';
import {readWeeklySyncStatus} from '@/lib/zonal/weekly-sync-status';
export async function weeklySyncProgress(monday:string){
 const actor=await requireAdmin();assertPermission(actor,'sales.view');assertPermission(actor,'dashboard.view');
 return readWeeklySyncStatus(db(),actor,monday);
}
export async function syncWeeklyNetSales(monday:string){
 const actor=await requireAdmin();assertPermission(actor,'sales.view');assertPermission(actor,'dashboard.view');
 try{
  const range=weeklySyncRange(monday,londonToday());
  if(!range.dates.length)throw new ZonalError(range.message);
  // Same reservation, browser, validation and approval pipeline; never fetch
  // dates outside the selected Monday–Sunday week.
  return await syncSelectedDates(range.dates,true);
 }catch(error){return {error:error instanceof ZonalError?error.message:'Weekly sync could not start. No approved sales were changed.',message:''};}
}
