import 'server-only';
import {Prisma,type PrismaClient} from '@/generated/prisma/client';
import {can} from '@/lib/permissions';
import type {SalesActor} from '@/lib/sales-service';
import {libraryFiltersSchema} from './recipe-library-preferences';
import {lockRecipeGraph} from './recipe-features';
export class LibraryPreferenceError extends Error{}
export async function readLibraryPreferences(prisma:PrismaClient,actor:SalesActor){
 allowed(actor);
 try{
 const [restaurant,user]=await Promise.all([
  prisma.restaurantRecipeLibrary.findUnique({where:{restaurantId:actor.restaurantId}}),
  prisma.userRecipeLibrary.findFirst({where:{userId:actor.id,restaurantId:actor.restaurantId}})
 ]);
 return {available:true,restaurantOrder:restaurant?.recipeIds??[],defaultRevision:restaurant?.revision??0,personalOrder:user?.personalOrder??null,orderRevision:user?.orderRevision??0,filters:user?.filters??{},filtersRevision:user?.filtersRevision??0};
 }catch(error){
  if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==='P2021'&&/RestaurantRecipeLibrary|UserRecipeLibrary/.test(String(error.meta?.table??error.meta?.modelName??'')))return {available:false,restaurantOrder:[] as string[],defaultRevision:0,personalOrder:null,orderRevision:0,filters:{},filtersRevision:0};
  throw error;
 }
}
function allowed(actor:SalesActor){if(!can(actor,'recipes.view'))throw new LibraryPreferenceError('Recipe access is required.');}
export async function writeLibraryFilters(prisma:PrismaClient,actor:SalesActor,input:unknown,revision:number){
 allowed(actor);const filters=libraryFiltersSchema.parse(input);
 return prisma.$transaction(async tx=>{
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`recipe-library:user:${actor.id}`},0))`;
  const existing=await tx.userRecipeLibrary.findFirst({where:{userId:actor.id,restaurantId:actor.restaurantId}});
  if((existing?.filtersRevision??0)!==revision)throw new LibraryPreferenceError('Filters changed in another window. Reload saved filters before retrying.');
  const admin=can(actor,'recipes.edit')||can(actor,'recipes.create')||can(actor,'recipes.archive')||can(actor,'recipes.restore');
  if(filters.tab==='archived'&&!admin)throw new LibraryPreferenceError('Archived recipes are unavailable for this account.');
  if(filters.type&&!await tx.recipeType.findFirst({where:{id:filters.type,restaurantId:actor.restaurantId,...(admin?{}:{visible:true})}}))throw new LibraryPreferenceError('That category is no longer available. Clear filters and retry.');
  const data={filters,filtersRevision:revision+1};
  await tx.userRecipeLibrary.upsert({where:{userId_restaurantId:{userId:actor.id,restaurantId:actor.restaurantId}},create:{userId:actor.id,restaurantId:actor.restaurantId,...data},update:data});
  return revision+1;
 });
}
export async function writeLibraryOrder(prisma:PrismaClient,actor:SalesActor,scope:'personal'|'restaurant',ids:string[]|null,revision:number){
 allowed(actor);if(scope==='restaurant'&&actor.role!=='SUPER_USER')throw new LibraryPreferenceError('Only a Super User can change the restaurant default order.');
 if(scope==='restaurant'&&ids===null)throw new LibraryPreferenceError('Save a complete restaurant order.');
 if(!Number.isSafeInteger(revision)||revision<0||ids&&new Set(ids).size!==ids.length)throw new LibraryPreferenceError('Invalid recipe order.');
 return prisma.$transaction(async tx=>{
  // Share the recipe graph lock with create/edit/archive, and serialize per-user filter writes.
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`recipe-library:user:${actor.id}`},0))`;
  await lockRecipeGraph(tx,actor.restaurantId);
  const current=scope==='restaurant'?await tx.restaurantRecipeLibrary.findUnique({where:{restaurantId:actor.restaurantId}}):await tx.userRecipeLibrary.findFirst({where:{userId:actor.id,restaurantId:actor.restaurantId}});
  const version=current?('revision' in current?current.revision:current.orderRevision):0;
  if(version!==revision)throw new LibraryPreferenceError('The order changed in another window. Reload the saved order before trying again.');
  const admin=can(actor,'recipes.edit')||can(actor,'recipes.create')||can(actor,'recipes.archive')||can(actor,'recipes.restore');
  const available=await tx.recipe.findMany({where:{restaurantId:actor.restaurantId,archivedAt:null,...(admin?{}:{visible:true,type:{visible:true}})},select:{id:true}});
  const valid=new Set(available.map(row=>row.id));
  if(ids&&(ids.length!==valid.size||ids.some(id=>!valid.has(id))))throw new LibraryPreferenceError('The recipe collection changed or includes unavailable recipes. Reload the saved order before trying again.');
  const old=scope==='restaurant'&&current&&'recipeIds' in current?current.recipeIds:current&&'personalOrder' in current&&Array.isArray(current.personalOrder)?current.personalOrder.filter((id):id is string=>typeof id==='string'):[];
  // Retain archived/temporarily hidden positions as a tail; restoration never breaks saved orders.
  const value=ids===null?null:[...ids,...old.filter(id=>!valid.has(id))];
  if(scope==='restaurant')await tx.restaurantRecipeLibrary.upsert({where:{restaurantId:actor.restaurantId},create:{restaurantId:actor.restaurantId,recipeIds:value!,revision:revision+1},update:{recipeIds:value!,revision:revision+1}});
  else await tx.userRecipeLibrary.upsert({where:{userId_restaurantId:{userId:actor.id,restaurantId:actor.restaurantId}},create:{userId:actor.id,restaurantId:actor.restaurantId,personalOrder:value??Prisma.DbNull,orderRevision:revision+1},update:{personalOrder:value??Prisma.DbNull,orderRevision:revision+1}});
  await tx.auditLog.create({data:{restaurantId:actor.restaurantId,actorId:actor.id,action:scope==='restaurant'?'RECIPE_DEFAULT_ORDER_CHANGED':ids===null?'RECIPE_PERSONAL_ORDER_RESET':'RECIPE_PERSONAL_ORDER_CHANGED',entity:'RecipeLibrary',entityId:scope==='restaurant'?actor.restaurantId:actor.id,after:{revision:revision+1,recipeIds:value}}});
  return revision+1;
 });
}
