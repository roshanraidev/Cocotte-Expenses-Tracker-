'use server';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { lockRecipeGraph, replaceComponents, RecipeFeatureError } from '@/lib/recipe-features';
import { requireAdmin } from '@/lib/auth';

const clean=(v:FormDataEntryValue|null,max=5000)=>String(v??'').trim().slice(0,max);
const bool=(v:FormDataEntryValue|null)=>v==='on';
function ingredients(raw:string){return raw.split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{const [name='',quantity='',unit='']=line.split('|').map(x=>x.trim());return {name,quantity,unit};}).filter(x=>x.name);}
export async function saveRecipeType(form:FormData){
 const user=await requireAdmin(),id=clean(form.get('id'),100),name=clean(form.get('name'),100),sortOrder=Number(clean(form.get('sortOrder'),10)||0),visible=bool(form.get('visible'));
 if(!name) throw new Error('Recipe type name is required.');
 if(id) await db().$executeRaw(Prisma.sql`UPDATE "RecipeType" SET name=${name},visible=${visible},"sortOrder"=${sortOrder},"updatedAt"=NOW() WHERE id=${id} AND "restaurantId"=${user.restaurantId}`);
 else await db().$executeRaw(Prisma.sql`INSERT INTO "RecipeType"(id,"restaurantId",name,visible,"sortOrder","createdAt","updatedAt") VALUES(${randomUUID()},${user.restaurantId},${name},${visible},${sortOrder},NOW(),NOW())`);
 revalidatePath('/recipes', 'layout');
}
export async function deleteRecipeType(form:FormData){
 const user=await requireAdmin(),id=clean(form.get('id'),100); if(id){await db().$transaction(async tx=>{await lockRecipeGraph(tx,user.restaurantId);await tx.$executeRaw(Prisma.sql`DELETE FROM "Recipe" WHERE "typeId"=${id} AND "restaurantId"=${user.restaurantId}`);await tx.$executeRaw(Prisma.sql`DELETE FROM "RecipeType" WHERE id=${id} AND "restaurantId"=${user.restaurantId}`);});} revalidatePath('/recipes', 'layout');
}
export async function saveRecipe(form:FormData){
 const user=await requireAdmin(),id=clean(form.get('id'),100),name=clean(form.get('name'),120),typeId=clean(form.get('typeId'),100),sortOrder=Number(clean(form.get('sortOrder'),10)||0);
 if(!name||!typeId) throw new Error('Recipe name and recipe type are required.');
 const data={visible:bool(form.get('visible')),beforeService:form.has('method')?String(form.get('method')??''):String(form.get('beforeService')??''),onOrder:form.has('method')?'':String(form.get('onOrder')??''),allergens:clean(form.get('allergens'),1000),mayContain:clean(form.get('mayContain'),1000),suitability:clean(form.get('suitability'),1000),ingredients:ingredients(String(form.get('ingredients')??''))};
 const removeImage=form.get('removeImage')==='true';
 const image=form.get('image'); let bytes:Uint8Array|null=null,mime:string|null=null;
 if(!removeImage&&image instanceof File&&image.size){if(image.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(image.type)) throw new Error('Recipe image must be JPG, PNG or WEBP and no larger than 5 MB.');bytes=new Uint8Array(await image.arrayBuffer());mime=image.type;}
 const savedId=id||randomUUID();
 await db().$transaction(async tx=>{
  await lockRecipeGraph(tx,user.restaurantId);
 const validType=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM "RecipeType" WHERE id=${typeId} AND "restaurantId"=${user.restaurantId} LIMIT 1`);
 if(!validType.length) throw new Error('Choose a valid recipe type.');
  if(id){const owned=await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM "Recipe" WHERE id=${id} AND "restaurantId"=${user.restaurantId}`);if(!owned.length)return;}
 if(id){
  await tx.$executeRaw(Prisma.sql`UPDATE "Recipe" SET name=${name},"typeId"=${typeId},visible=${data.visible},"sortOrder"=${sortOrder},ingredients=${JSON.stringify(data.ingredients)}::jsonb,"beforeService"=${data.beforeService},"onOrder"=${data.onOrder},allergens=${data.allergens},"mayContain"=${data.mayContain},suitability=${data.suitability},${removeImage?Prisma.sql`"imageBytes"=NULL,"imageMime"=NULL,`:bytes?Prisma.sql`"imageBytes"=${bytes},"imageMime"=${mime},`:Prisma.empty}"updatedAt"=NOW() WHERE id=${id} AND "restaurantId"=${user.restaurantId}`);
 } else {
  await tx.$executeRaw(Prisma.sql`INSERT INTO "Recipe"(id,"restaurantId","typeId",name,visible,"sortOrder","imageBytes","imageMime",ingredients,"beforeService","onOrder",allergens,"mayContain",suitability,"createdAt","updatedAt") VALUES(${savedId},${user.restaurantId},${typeId},${name},${data.visible},${sortOrder},${bytes},${mime},${JSON.stringify(data.ingredients)}::jsonb,${data.beforeService},${data.onOrder},${data.allergens},${data.mayContain},${data.suitability},NOW(),NOW())`);
 }
  if(form.has('componentsIncluded')) {
   const componentIds=form.getAll('componentIds').map(value=>String(value));
   await replaceComponents(tx,user.restaurantId,savedId,componentIds);
  }
 });
 revalidatePath('/recipes', 'layout'); redirect('/recipes');
}
export async function deleteRecipe(form:FormData){const user=await requireAdmin(),id=clean(form.get('id'),100);if(id)await db().$transaction(async tx=>{await lockRecipeGraph(tx,user.restaurantId);await tx.$executeRaw(Prisma.sql`DELETE FROM "Recipe" WHERE id=${id} AND "restaurantId"=${user.restaurantId}`);});revalidatePath('/recipes', 'layout');}

export async function recipeFormAction(_: {error: string}, form: FormData): Promise<{error: string}> {
 try { await saveRecipe(form); return {error:''}; }
 catch(error) { if(error instanceof RecipeFeatureError)return {error:error.message};throw error; }
}
