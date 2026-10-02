import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), session: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'a'.repeat(64) }) }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error('not found'); },
}));
vi.mock('@/lib/db', () => ({ db: () => ({
  $queryRaw: mocks.query, $executeRaw: mocks.execute,
  session: { findUnique: mocks.session },
}) }));
import { saveRecipe } from '@/app/(protected)/recipes/actions';
import { recipe } from '@/lib/recipes';
import RecipeEditor from '@/app/(protected)/recipes/edit/page';
import RecipePage from '@/app/(protected)/recipes/[id]/page';

// Run the actual action/read SQL against disposable, in-memory PostgreSQL.
const pg = new PGlite();
const example = `Fruit - Lemon | 2 | Each
Oil - Extra Virgin Olive | 250 | Ml
Mustard - Dijon | 30 | Grams
Mustard - Wholegrain | 75 | Grams
Salt - Maldon Sea Salt Flakes | 15 | Grams
Veg - Onions, Shallots | 100 | Gram
Oil - Rapeseed | 0.25 | Lt
Vinegar - Champagne | 200 | Ml`;
function form(name: string, ingredients: string, id?: string) {
  const data = new FormData();
  Object.entries({ name, ingredients, typeId: 'type', visible: 'on', ...(id ? { id } : {}) }).forEach(([key, value]) => data.set(key, value));
  return data;
}
async function save(data: FormData) {
  await expect(saveRecipe(data)).rejects.toThrow('redirect:/recipes');
  const result = await pg.query<{id: string}>('SELECT id FROM "Recipe" WHERE name=$1', [data.get('name')]);
  return result.rows[0].id;
}
beforeAll(async () => {
  await pg.exec('CREATE TABLE "Restaurant" (id TEXT PRIMARY KEY, name TEXT NOT NULL)');
  await pg.exec(readFileSync('prisma/migrations/20260926193000_add_recipes/migration.sql', 'utf8'));
  await pg.exec(`INSERT INTO "Restaurant" (id,name) VALUES ('restaurant','Test'),('other','Other');
    INSERT INTO "RecipeType" (id,"restaurantId",name,"updatedAt") VALUES ('type','restaurant','Test',now()),('other-type','other','Other',now());`);
  mocks.query.mockImplementation(async (sql: Prisma.Sql) => (await pg.query(sql.text, sql.values)).rows);
  mocks.execute.mockImplementation(async (sql: Prisma.Sql) => (await pg.query(sql.text, sql.values)).affectedRows);
}, 30000);
beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { id: 'admin', restaurantId: 'restaurant', role: 'SUPER_USER', active: true }, expiresAt: new Date(Date.now() + 60000) });
});
afterAll(async () => { await pg.close(); });

it('creates, updates, displays and reopens ingredients including decimals and punctuation', async () => {
  const id = await save(form('Example', `\n${example.replaceAll('\n', '\r\n')}\n\n`));
  const initial = await recipe('restaurant', id, true);
  expect(initial?.ingredients).toHaveLength(8);
  expect(initial?.ingredients[5]).toEqual({ name: 'Veg - Onions, Shallots', quantity: '100', unit: 'Gram' });
  expect(initial?.ingredients[6]).toEqual({ name: 'Oil - Rapeseed', quantity: '0.25', unit: 'Lt' });
  const edited = `${example}\nSugar | 12.5 | Grams`;
  await save(form('Example', edited, id));
  const editor = renderToStaticMarkup(await RecipeEditor({ searchParams: Promise.resolve({ id }) }));
  expect(editor).toContain('name="ingredients"');
  expect(editor).toContain(edited);
  const detail = renderToStaticMarkup(await RecipePage({ params: Promise.resolve({ id }) }));
  expect(detail).toContain('<td>Oil - Rapeseed</td><td>0.25</td><td>Lt</td>');
  expect(detail).toContain('<td>Sugar</td><td>12.5</td><td>Grams</td>');
});
it.each([101, 150])('preserves all %i valid lines on create and update', async count => {
  const lines = Array.from({ length: count }, (_, i) => ({ name: `Ingredient ${i} ${'x'.repeat(count === 101 ? 0 : 100)}`.trim(), quantity: '12.5', unit: 'Grams' }));
  const text = lines.map(i => `${i.name} | ${i.quantity} | ${i.unit}`).join('\n');
  const id = await save(form(`Long ${count}`, text));
  expect((await recipe('restaurant', id, true))?.ingredients).toEqual(lines);
  await save(form(`Long ${count}`, `${text}\nOil | 0.25 | Lt`, id));
  expect((await recipe('restaurant', id, true))?.ingredients).toEqual([...lines, { name: 'Oil', quantity: '0.25', unit: 'Lt' }]);
});
it('keeps general users view-only and restaurant boundaries intact', async () => {
  const id = await save(form('Protected', example));
  expect(await recipe('other', id, true)).toBeNull();
  const wrongType = form('Wrong type', example);
  wrongType.set('typeId', 'other-type');
  await expect(saveRecipe(wrongType)).rejects.toThrow('Choose a valid recipe type');
  mocks.session.mockResolvedValue({ user: { restaurantId: 'other', role: 'SUPER_USER', active: true }, expiresAt: new Date(Date.now() + 60000) });
  const crossRestaurant = form('Protected', 'Changed | 1 | Each', id);
  crossRestaurant.set('typeId', 'other-type');
  await expect(saveRecipe(crossRestaurant)).rejects.toThrow('redirect:/recipes');
  expect((await recipe('restaurant', id, true))?.ingredients).toHaveLength(8);
  mocks.session.mockResolvedValue({ user: { restaurantId: 'restaurant', role: 'CHEF', active: true }, expiresAt: new Date(Date.now() + 60000) });
  await expect(saveRecipe(form('Protected', '', id))).rejects.toThrow('redirect:/dashboard');
  await expect(RecipeEditor({ searchParams: Promise.resolve({ id }) })).rejects.toThrow('redirect:/dashboard');
  const detail = renderToStaticMarkup(await RecipePage({ params: Promise.resolve({ id }) }));
  expect(detail).toContain('Oil - Rapeseed');
  expect(detail).not.toContain('EDIT RECIPE');
});
