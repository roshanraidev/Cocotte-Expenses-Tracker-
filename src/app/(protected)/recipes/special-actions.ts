'use server';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { Prisma } from '@/generated/prisma/client';
import { db } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { lockRecipeGraph, RecipeFeatureError, specialDates } from '@/lib/recipe-features';

export async function saveWeeklySpecial(form: FormData) {
  const user = await requireAdmin();
  const id = String(form.get('id') ?? ''), recipeId = String(form.get('recipeId') ?? '');
  const status = String(form.get('status') ?? 'DRAFT');
  if (!['DRAFT', 'PUBLISHED'].includes(status)) throw new RecipeFeatureError('Choose Draft or Publish.');
  const { startDate, endDate } = specialDates(form);
  await db().$transaction(async tx => {
    await lockRecipeGraph(tx, user.restaurantId);
    const rows = await tx.$queryRaw<{visible: boolean}[]>(Prisma.sql`
      SELECT (r.visible AND t.visible) AS visible FROM "Recipe" r JOIN "RecipeType" t ON t.id=r."typeId" AND t."restaurantId"=r."restaurantId"
      WHERE r.id=${recipeId} AND r."restaurantId"=${user.restaurantId}`);
    if (!rows.length) throw new RecipeFeatureError('Choose an existing recipe from your restaurant.');
    if (status === 'PUBLISHED' && !rows[0].visible) throw new RecipeFeatureError('Make the recipe and its category visible before publishing this special.');
    if (id) {
      const changed = await tx.$executeRaw(Prisma.sql`UPDATE "WeeklySpecial" SET "recipeId"=${recipeId},status=${status}::"WeeklySpecialStatus","startDate"=${startDate}::date,"endDate"=${endDate}::date,"updatedAt"=NOW() WHERE id=${id} AND "restaurantId"=${user.restaurantId}`);
      if (!changed) throw new RecipeFeatureError('This weekly special is unavailable. Reload Recipes.');
    } else {
      await tx.$executeRaw(Prisma.sql`INSERT INTO "WeeklySpecial"(id,"restaurantId","recipeId",status,"startDate","endDate","updatedAt") VALUES(${randomUUID()},${user.restaurantId},${recipeId},${status}::"WeeklySpecialStatus",${startDate}::date,${endDate}::date,NOW())`);
    }
  });
  revalidatePath('/recipes', 'layout');
}
export async function removeWeeklySpecial(form: FormData) {
  const user = await requireAdmin();
  const id = String(form.get('id') ?? '');
  await db().$executeRaw(Prisma.sql`DELETE FROM "WeeklySpecial" WHERE id=${id} AND "restaurantId"=${user.restaurantId}`);
  revalidatePath('/recipes', 'layout');
}
export async function setWeeklySpecialsEnabled(form: FormData) {
  const user = await requireAdmin();
  const enabled = form.get('enabled') === 'on';
  await db().$executeRaw(Prisma.sql`INSERT INTO "RecipeFeatureSettings"("restaurantId","weeklySpecialsEnabled") VALUES(${user.restaurantId},${enabled}) ON CONFLICT("restaurantId") DO UPDATE SET "weeklySpecialsEnabled"=EXCLUDED."weeklySpecialsEnabled"`);
  revalidatePath('/recipes', 'layout');
}
export async function specialFormAction(_: {error: string}, form: FormData): Promise<{error: string}> {
  try { await saveWeeklySpecial(form); return {error:''}; }
  catch (error) { if (error instanceof RecipeFeatureError) return {error:error.message}; throw error; }
}
