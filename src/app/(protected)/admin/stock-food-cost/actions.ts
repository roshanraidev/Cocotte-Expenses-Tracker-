'use server';
import {revalidatePath} from 'next/cache';
import {requireAdmin} from '@/lib/auth';
import {db} from '@/lib/db';
import {createFoodCostPreview,approveFoodCost,cancelFoodCost} from '@/lib/food-cost/service';
import {FoodCostError} from '@/lib/food-cost/calculation';
import {connectZonal,PARSONS_GREEN,mappedBranch} from '@/lib/zonal/connection-service';
import {discoverZonalStock,type LoginResult} from '@/lib/zonal/worker';
import {ZonalError} from '@/lib/zonal/validation';
export type StockState={error:string;success:string;previewId?:string|null};
export async function stockAction(_:StockState,form:FormData):Promise<StockState>{
 const actor=await requireAdmin(),prisma=db();
 try{
  const action=String(form.get('action'));
  let success='',previewId:string|null|undefined;
  if(action==='preview'){const result=await createFoodCostPreview(prisma,actor,form);success=result.message;previewId=result.previewId;}
  else if(action==='approve'){
   if(form.get('confirm')!=='on')throw new FoodCostError('Explicit approval is required.');
   success=await approveFoodCost(prisma,actor,String(form.get('id')??''),form.get('overwrite')==='on',String(form.get('reason')??'').slice(0,500));
  }else if(action==='cancel')success=await cancelFoodCost(prisma,actor,String(form.get('id')??''));
  else if(action==='sync'){
   if(await mappedBranch(prisma,actor.restaurantId)!==PARSONS_GREEN)throw new FoodCostError('Connect the verified Parsons Green branch before checking Zonal stock access.');
   if(await prisma.zonalSyncBatch.count({where:{restaurantId:actor.restaurantId,status:'RUNNING'}}))throw new FoodCostError('Wait for the sales batch to finish before checking stock reports.');
   let result:LoginResult|undefined;
   const state=await connectZonal(prisma,actor,undefined,async(id,credentials)=>{result=await discoverZonalStock(id,credentials);return result;});
   await prisma.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:'ZONAL_STOCK_DISCOVERY',entity:'Restaurant',entityId:actor.restaurantId,after:{loginVerified:state.loginVerified,resultCode:result?.code??'BROWSER_FAILED',discovery:result?.stockDiscovery??null},reason:state.message}});
   success=(state.loginVerified?'Login verified. ':'')+'Automatic stock import is unsupported until report fields and periods are verified. No stock values were extracted or imported. '+state.message;
  }else throw new FoodCostError('Unknown stock action.');
  revalidatePath('/admin/stock-food-cost');
  return {error:'',success,previewId};
 }catch(error){
  return {error:error instanceof FoodCostError||error instanceof ZonalError?error.message:'Stock operation failed safely. Check server configuration and migration status; no approval was claimed.',success:''};
 }
}
