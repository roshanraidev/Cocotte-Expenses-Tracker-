'use server';
import {requireAdmin} from '@/lib/auth';
import {assertPermission} from '@/lib/access';
import {londonToday} from '@/lib/dates';
import {weeklySyncDates} from '@/lib/zonal/weekly-range';
import {recentWindow} from '@/lib/zonal/sync-config';
import {ZonalError} from '@/lib/zonal/validation';
import {syncSelectedDates} from '@/app/(protected)/admin/integrations/zonal/batch-actions';
export async function syncWeeklyNetSales(monday:string){
 const actor=await requireAdmin();assertPermission(actor,'sales.view');assertPermission(actor,'dashboard.view');
 try{
  const range=weeklySyncDates(monday,londonToday(),recentWindow());
  if(!range.dates.length)throw new ZonalError(range.message);
  // Same reservation, browser, validation and approval pipeline; explicit dates avoid
  // fetching years between a historical selected week and recent correction checks.
  return await syncSelectedDates(range.dates);
 }catch(error){return {error:error instanceof ZonalError?error.message:'Weekly sync could not start. No approved sales were changed.',message:''};}
}
