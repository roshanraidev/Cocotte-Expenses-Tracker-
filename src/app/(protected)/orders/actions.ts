'use server';
import {randomUUID} from 'node:crypto';
import {requireUser} from '@/lib/auth';
import {db} from '@/lib/db';
import {mondayOf} from '@/lib/dates';
import {saveOperation} from '../operations/actions';
export type PurchaseResult = {error:string;success:string;submissionKey:string;savedWeek:string};
export async function savePurchase(previous:PurchaseResult,form:FormData):Promise<PurchaseResult> {
  form.set('operation','purchase');
  const result=await saveOperation(previous,form);
  return {...result,savedWeek:result.success?mondayOf(String(form.get('deliveryDate'))):'',success:result.success?'Purchase saved and confirmed. The delivery week’s allowance has been updated.':'',submissionKey:result.success?randomUUID():String(form.get('submissionKey')??'')};
}
export async function activePurchaseSuppliers() {
  const user=await requireUser();
  return db().supplier.findMany({where:{restaurantId:user.restaurantId,active:true,foodWorkspace:true},select:{id:true,name:true},orderBy:{name:'asc'}});
}
