import 'server-only';
import { Prisma } from '@/generated/prisma/client';
import { db } from './db';
import { londonToday, validDateKey } from './dates';
import { recipes, type RecipeRow } from './recipes';

export class RecipeFeatureError extends Error {}
export type ComponentLink = { recipeId: string; componentId: string; position: number };
export type ComponentNode = { recipe: RecipeRow; children: ComponentNode[] };
export type SpecialRow = { id: string; recipeId: string; status: 'DRAFT' | 'PUBLISHED'; startDate: string | null; endDate: string | null; recipeName: string; recipeVisible: boolean };

// All graph writers serialize on this restaurant row. Concurrent edits cannot create an indirect loop.
export async function lockRecipeGraph(tx: Prisma.TransactionClient, restaurantId: string) {
  await tx.$queryRaw(Prisma.sql`SELECT id FROM "Restaurant" WHERE id=${restaurantId} FOR UPDATE`);
}
export async function componentLinks(restaurantId: string) {
  return db().$queryRaw<ComponentLink[]>(Prisma.sql`SELECT "recipeId","componentId",position FROM "RecipeComponent" WHERE "restaurantId"=${restaurantId} ORDER BY position,"componentId"`);
}
export async function replaceComponents(tx: Prisma.TransactionClient, restaurantId: string, recipeId: string, componentIds: string[]) {
  if (new Set(componentIds).size !== componentIds.length) throw new RecipeFeatureError('Each component recipe can only be added once.');
  if (componentIds.includes(recipeId)) throw new RecipeFeatureError('A recipe cannot link to itself.');
  if (componentIds.length) {
    const owned = await tx.$queryRaw<{id: string}[]>(Prisma.sql`SELECT id FROM "Recipe" WHERE "restaurantId"=${restaurantId} AND id IN (${Prisma.join(componentIds)})`);
    if (owned.length !== componentIds.length) throw new RecipeFeatureError('Choose existing component recipes from your restaurant.');
  }
  const edges = await tx.$queryRaw<ComponentLink[]>(Prisma.sql`SELECT "recipeId","componentId",position FROM "RecipeComponent" WHERE "restaurantId"=${restaurantId} AND "recipeId"<>${recipeId}`);
  const graph = new Map<string, string[]>();
  for (const edge of edges) graph.set(edge.recipeId, [...(graph.get(edge.recipeId) ?? []), edge.componentId]);
  const pending = [...componentIds], seen = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (id === recipeId) throw new RecipeFeatureError('These components create a circular recipe link. Remove the link that leads back to this recipe.');
    if (seen.has(id)) continue;
    seen.add(id); pending.push(...(graph.get(id) ?? []));
  }
  await tx.$executeRaw(Prisma.sql`DELETE FROM "RecipeComponent" WHERE "restaurantId"=${restaurantId} AND "recipeId"=${recipeId}`);
  for (const [position, componentId] of componentIds.entries()) {
    await tx.$executeRaw(Prisma.sql`INSERT INTO "RecipeComponent"("restaurantId","recipeId","componentId",position) VALUES(${restaurantId},${recipeId},${componentId},${position})`);
  }
}
export async function recipeComponents(restaurantId: string, recipeId: string, includeHidden = false): Promise<ComponentNode[]> {
  // Authorize each node before including its name, ingredients, method or allergens in the result.
  const allowed = new Map((await recipes(restaurantId, includeHidden)).map(r => [r.id, r]));
  if (!allowed.has(recipeId)) return [];
  const edges = await componentLinks(restaurantId);
  const graph = new Map<string, string[]>();
  for (const edge of edges) {
    if (allowed.has(edge.recipeId) && allowed.has(edge.componentId)) graph.set(edge.recipeId, [...(graph.get(edge.recipeId) ?? []), edge.componentId]);
  }
  function children(id: string, ancestors: Set<string>): ComponentNode[] {
    return (graph.get(id) ?? []).filter(child => !ancestors.has(child)).map(child => ({ recipe: allowed.get(child)!, children: children(child, new Set([...ancestors, child])) }));
  }
  return children(recipeId, new Set([recipeId]));
}
export function specialDates(form: FormData) {
  const startDate = String(form.get('startDate') ?? '').trim() || null;
  const endDate = String(form.get('endDate') ?? '').trim() || null;
  if ([startDate, endDate].some(date => date !== null && (!validDateKey(date) || date < '0001-01-01'))) throw new RecipeFeatureError('Use valid start and end dates.');
  if (startDate && endDate && endDate < startDate) throw new RecipeFeatureError('End date must be on or after start date.');
  return { startDate, endDate };
}
export async function weeklySpecials(restaurantId: string, includeDrafts = false, today = londonToday()) {
  const settings = await db().$queryRaw<{weeklySpecialsEnabled: boolean}[]>(Prisma.sql`SELECT "weeklySpecialsEnabled" FROM "RecipeFeatureSettings" WHERE "restaurantId"=${restaurantId}`);
  const enabled = settings[0]?.weeklySpecialsEnabled ?? false;
  if (!enabled && !includeDrafts) return { enabled, specials: [] as SpecialRow[] };
  const specials = await db().$queryRaw<SpecialRow[]>(Prisma.sql`
    SELECT s.id,s."recipeId",s.status,s."startDate"::text AS "startDate",s."endDate"::text AS "endDate",r.name AS "recipeName",(r.visible AND t.visible) AS "recipeVisible"
    FROM "WeeklySpecial" s JOIN "Recipe" r ON r.id=s."recipeId" AND r."restaurantId"=s."restaurantId"
    JOIN "RecipeType" t ON t.id=r."typeId" AND t."restaurantId"=r."restaurantId"
    WHERE s."restaurantId"=${restaurantId}
    ${includeDrafts ? Prisma.empty : Prisma.sql`AND s.status='PUBLISHED' AND r.visible=true AND t.visible=true AND (s."startDate" IS NULL OR s."startDate"<=${today}::date) AND (s."endDate" IS NULL OR s."endDate">=${today}::date)`}
    ORDER BY s."createdAt",s.id`);
  return { enabled, specials };
}
