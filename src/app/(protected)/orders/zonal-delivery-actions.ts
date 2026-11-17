'use server';
import {revalidatePath} from 'next/cache';
import {importZonalDeliveries,type DeliveryImportResult} from '@/lib/zonal/delivery-import';
import {headers} from 'next/headers';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {londonToday} from '@/lib/dates';
import {assertSecureCredentialRequest} from '@/lib/zonal/request-policy';
import {deliveryPreviewRange} from '@/lib/zonal/delivery-range';
import {previewZonalDeliveries,DeliveryPreviewError} from '@/lib/zonal/delivery-preview';
import type {DeliveryPreviewRow} from '@/lib/zonal/delivery-matching';
export type DeliveryCheck={error:string;message:string;range?:{from:string;to:string};rows?:DeliveryPreviewRow[];periods?:string[];fetchedAt?:string|null;rowsChecked?:number;previewId?:string};
export async function checkZonalDeliveries(_:DeliveryCheck,form:FormData):Promise<DeliveryCheck>{
 const actor=await requireAdmin();
 try{
  const h=await headers();assertSecureCredentialRequest(h.get('origin'),h.get('host'),process.env.NODE_ENV==='production');
  let range,effective;
  try{range={from:String(form.get('from')??''),to:String(form.get('to')??'')};effective=deliveryPreviewRange(range.from,range.to,londonToday());}
  catch(error){return {error:error instanceof Error?error.message:'Check the reporting dates.',message:''};}
  const result=await previewZonalDeliveries(db(),actor,effective.from,effective.to);
  return {...result,range,message:result.error?'':`${result.timings?.cacheHit?'Recent preview reused (maximum 30 seconds old); source fetch time is shown below. ':''}Delivery preview retrieved from ${result.periods.length} stock period${result.periods.length===1?'':'s'}. No purchases were created.${effective.to!==range.to?` Future days excluded; preview includes deliveries through ${effective.to}.`: ''}`};
 }catch(error){return {error:error instanceof DeliveryPreviewError?error.message:'Unable to fetch Zonal deliveries. No purchases were changed.',message:''};}
}

export type DeliveryApproval={error:string;message:string;previewId?:string;result?:DeliveryImportResult};
export async function approveZonalDeliveries(_:DeliveryApproval,form:FormData):Promise<DeliveryApproval>{
 const actor=await requireAdmin();
 try{
  const h=await headers();assertSecureCredentialRequest(h.get('origin'),h.get('host'),process.env.NODE_ENV==='production');
  const previewId=String(form.get('previewId')??'');const reason=String(form.get('importReason')??'').trim().slice(0,500);
  const result=await importZonalDeliveries(db(),actor,previewId,reason);
  if(result.error)return {error:result.error,message:'',previewId};
  for(const path of ['/orders','/dashboard','/reports','/suppliers','/admin/planning'])revalidatePath(path);
  return {error:'',message:'Import request completed. Only eligible, unchanged deliveries were registered.',previewId,result};
 }catch(error){return {error:error instanceof DeliveryPreviewError?error.message:'Import could not complete safely. No purchases from this request were committed.',message:''};}
}
