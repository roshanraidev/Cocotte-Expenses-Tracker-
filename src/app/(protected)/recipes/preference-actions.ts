'use server';
import {z} from 'zod';
import {requirePermission} from '@/lib/auth';
import {db} from '@/lib/db';
import {LibraryPreferenceError,writeLibraryFilters,writeLibraryOrder} from '@/lib/recipe-library-service';
const revisionSchema=z.number().int().min(0);
export async function saveLibraryFilters(input:unknown,revision:number){
 const actor=await requirePermission('recipes.view');
 try{return {revision:await writeLibraryFilters(db(),actor,input,revisionSchema.parse(revision)),error:''};}
 catch(error){return {revision,error:error instanceof LibraryPreferenceError?error.message:'Could not save filters. Your changes remain here; please retry.'};}
}
export async function saveLibraryOrder(input:unknown){
 const actor=await requirePermission('recipes.view');
 const parsed=z.object({scope:z.enum(['personal','restaurant']),ids:z.array(z.string().min(1).max(100)).max(20000).nullable(),revision:revisionSchema}).safeParse(input);
 if(!parsed.success)return {error:'Invalid recipe order.'};
 try{const {scope,ids,revision}=parsed.data;const saved=await writeLibraryOrder(db(),actor,scope,ids,revision);return {error:'',revision:saved};}
 catch(error){return {error:error instanceof LibraryPreferenceError?error.message:'Could not save order. Your arrangement has been kept; please retry.'};}
}
