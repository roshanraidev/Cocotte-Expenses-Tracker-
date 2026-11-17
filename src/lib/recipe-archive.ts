import 'server-only';
import {can} from './permissions';
import {randomUUID} from 'node:crypto';
import {Prisma,type PrismaClient} from '@/generated/prisma/client';
import {lockRecipeGraph,RecipeFeatureError} from './recipe-features';
import type {SalesActor} from './sales-service';
/** Serializes with recipe edits and component/special changes; never removes relationships. */
export async function setRecipeArchived(prisma:PrismaClient,actor:SalesActor,id:string,archived:boolean){
 if(!can(actor,archived?'recipes.archive':'recipes.restore'))throw new RecipeFeatureError('Only Super Users can archive or restore recipes.');
 if(!id)throw new RecipeFeatureError('Choose a recipe.');
 return prisma.$transaction(async tx=>{
  await lockRecipeGraph(tx,actor.restaurantId);
  const [row]=await tx.$queryRaw<{id:string;archivedAt:Date|null}[]>(Prisma.sql`SELECT id,"archivedAt" FROM "Recipe" WHERE id=${id} AND "restaurantId"=${actor.restaurantId} FOR UPDATE`);
  if(!row)throw new RecipeFeatureError('This recipe is unavailable in your restaurant.');
  if(Boolean(row.archivedAt)===archived)return false;
  const [updated]=await tx.$queryRaw<{archivedAt:Date|null}[]>(Prisma.sql`UPDATE "Recipe" SET "archivedAt"=${archived?Prisma.sql`CURRENT_TIMESTAMP`:Prisma.sql`NULL`} WHERE id=${id} AND "restaurantId"=${actor.restaurantId} RETURNING "archivedAt"`);
  const before=JSON.stringify({archivedAt:row.archivedAt}),after=JSON.stringify({archivedAt:updated.archivedAt});
  await tx.$executeRaw(Prisma.sql`INSERT INTO "AuditLog"(id,"restaurantId","actorId",action,entity,"entityId",before,after,"createdAt") VALUES(${randomUUID()},${actor.restaurantId},${actor.id},${archived?'RECIPE_ARCHIVED':'RECIPE_RESTORED'},'Recipe',${id},${before}::jsonb,${after}::jsonb,NOW())`);
  return true;
 });
}
