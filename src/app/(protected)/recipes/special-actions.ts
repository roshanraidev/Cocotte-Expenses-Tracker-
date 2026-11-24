'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { requirePermission } from '@/lib/auth';
import { lockRecipeGraph, RecipeFeatureError, specialDates } from '@/lib/recipe-features';

async function specialsManager(){
 const user=await requirePermission('recipes.edit');
 if(user.role!=='SUPER_USER')throw new RecipeFeatureError('Only Super Users can manage weekly specials.');
 return user;
}

export async function saveWeeklySpecial(form: FormData) {
  const user = await specialsManager();
  const id = String(form.get('id') ?? ''), recipeId = String(form.get('recipeId') ?? '');
  const status = String(form.get('status') ?? 'DRAFT');
  if (!['DRAFT', 'PUBLISHED'].includes(status)) throw new RecipeFeatureError('Choose Draft or Publish.');
  const { startDate, endDate } = specialDates(form);
  await db().$transaction(async tx => {
    await lockRecipeGraph(tx, user.restaurantId);
    const rows = await tx.$queryRaw<{visible: boolean;archivedAt:Date|null}[]>(Prisma.sql`
      SELECT (r.visible AND t.visible AND r."archivedAt" IS NULL) AS visible,r."archivedAt" FROM "Recipe" r JOIN "RecipeType" t ON t.id=r."typeId" AND t."restaurantId"=r."restaurantId"
      WHERE r.id=${recipeId} AND r."restaurantId"=${user.restaurantId}`);
    if (!rows.length) throw new RecipeFeatureError('Choose an existing recipe from your restaurant.');
    if(rows[0].archivedAt){
      const existing=id?await tx.$queryRaw<{id:string}[]>(Prisma.sql`SELECT id FROM "WeeklySpecial" WHERE id=${id} AND "restaurantId"=${user.restaurantId} AND "recipeId"=${recipeId}`):[];
      if(status!=='DRAFT'||!existing.length)throw new RecipeFeatureError('Restore this archived recipe before adding or publishing a special.');
    }
    if (status === 'PUBLISHED' && !rows[0].visible) throw new RecipeFeatureError('Make the recipe and its category visible before publishing this special.');
    if (id) {
      const changed = await tx.$executeRaw(Prisma.sql`UPDATE "WeeklySpecial" SET "recipeId"=${recipeId},status=${status}::"WeeklySpecialStatus","startDate"=${startDate}::date,"endDate"=${endDate}::date,"updatedAt"=NOW() WHERE id=${id} AND "restaurantId"=${user.restaurantId}`);
      if (!changed) throw new RecipeFeatureError('This weekly special is unavailable. Reload Recipes.');
    } else {
      await tx.$executeRaw(Prisma.sql`INSERT INTO "WeeklySpecial"(id,"restaurantId","recipeId",status,"startDate","endDate","updatedAt") VALUES(${randomUUID()},${user.restaurantId},${recipeId},${status}::"WeeklySpecialStatus",${startDate}::date,${endDate}::date,NOW())`);
    }
    if(status==='PUBLISHED')await tx.$executeRaw(Prisma.sql`INSERT INTO "RecipeFeatureSettings"("restaurantId","weeklySpecialsEnabled") VALUES(${user.restaurantId},true) ON CONFLICT("restaurantId") DO UPDATE SET "weeklySpecialsEnabled"=true`);
  });
  revalidatePath('/recipes', 'layout');
}
export async function removeWeeklySpecial(form: FormData) {
  const user = await specialsManager();
  const id = String(form.get('id') ?? '');
  await db().$transaction(async tx=>{await lockRecipeGraph(tx,user.restaurantId);await tx.$executeRaw(Prisma.sql`DELETE FROM "WeeklySpecial" WHERE id=${id} AND "restaurantId"=${user.restaurantId}`);});
  revalidatePath('/recipes', 'layout');
}
export async function setWeeklySpecialsEnabled(form: FormData) {
  const user = await specialsManager();
  const enabled = form.get('enabled') === 'on';
  await db().$transaction(async tx=>{await lockRecipeGraph(tx,user.restaurantId);await tx.$executeRaw(Prisma.sql`INSERT INTO "RecipeFeatureSettings"("restaurantId","weeklySpecialsEnabled") VALUES(${user.restaurantId},${enabled}) ON CONFLICT("restaurantId") DO UPDATE SET "weeklySpecialsEnabled"=EXCLUDED."weeklySpecialsEnabled"`);});
  revalidatePath('/recipes', 'layout');
}
export async function specialFormAction(_: {error: string}, form: FormData): Promise<{error: string}> {
  try { await saveWeeklySpecial(form); return {error:''}; }
  catch (error) { if (error instanceof RecipeFeatureError) return {error:error.message}; throw error; }
}
