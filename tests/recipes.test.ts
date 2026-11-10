import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import type { Prisma } from '@/generated/prisma/client';

const mocks = vi.hoisted(() => ({ query: vi.fn(), execute: vi.fn(), transaction: vi.fn(), session: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => ({ value: 'a'.repeat(64) }) }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`redirect:${url}`); },
  notFound: () => { throw new Error('not found'); },
}));
vi.mock('@/lib/db', () => ({ db: () => ({
  $queryRaw: mocks.query, $executeRaw: mocks.execute,
  $transaction: mocks.transaction,
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
  await pg.exec(readFileSync('prisma/migrations/20261012120000_recipe_specials_components/migration.sql', 'utf8'));
  await pg.exec(`INSERT INTO "Restaurant" (id,name) VALUES ('restaurant','Test'),('other','Other');
    INSERT INTO "RecipeType" (id,"restaurantId",name,"updatedAt") VALUES ('type','restaurant','Test',now()),('other-type','other','Other',now());`);
  mocks.query.mockImplementation(async (sql: Prisma.Sql) => (await pg.query(sql.text, sql.values)).rows);
  mocks.execute.mockImplementation(async (sql: Prisma.Sql) => (await pg.query(sql.text, sql.values)).affectedRows);
  mocks.transaction.mockImplementation(async callback => pg.transaction(async tx => callback({
    $queryRaw: async (sql: Prisma.Sql) => (await tx.query(sql.text, sql.values)).rows,
    $executeRaw: async (sql: Prisma.Sql) => (await tx.query(sql.text, sql.values)).affectedRows,
  })));

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

it('uploads, keeps, replaces and removes stored photos with fresh URLs and uncached responses', async () => {
  const { GET } = await import('@/app/(protected)/recipes/[id]/image/route');
  const data = form('Photo workflow', 'Egg | 1 | Each');
  data.set('image', new File([new Uint8Array([1, 2, 3])], 'first.jpg', { type: 'image/jpeg' }));
  const id = await save(data);
  const image = () => GET(new Request('http://localhost/recipes/image'), { params: Promise.resolve({ id }) });
  const first = await recipe('restaurant', id, true);
  expect(first?.hasImage).toBe(true);
  expect(new Uint8Array(await (await image()).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  const editor = renderToStaticMarkup(await RecipeEditor({ searchParams: Promise.resolve({ id }) }));
  expect(editor).toContain('Recipe photo preview');
  expect(editor).toContain('Change Photo');
  expect(editor).toContain('Remove Photo');
  await save(form('Photo workflow', 'Egg | 2 | Each', id));
  expect(new Uint8Array(await (await image()).arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  const replacement = form('Photo workflow', '', id);
  replacement.set('image', new File([new Uint8Array([4, 5])], 'second.webp', { type: 'image/webp' }));
  await save(replacement);
  const updated = await recipe('restaurant', id, true);
  expect(updated?.imageVersion).not.toBe(first?.imageVersion);
  const response = await image();
  expect(response.headers.get('Content-Type')).toBe('image/webp');
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([4, 5]));
  const detail = renderToStaticMarkup(await RecipePage({ params: Promise.resolve({ id }) }));
  expect(detail).toContain(`/image?v=${encodeURIComponent(updated!.imageVersion)}`);
  const removal = form('Photo workflow', '', id);
  removal.set('removeImage', 'true');
  await save(removal);
  expect((await recipe('restaurant', id, true))?.hasImage).toBe(false);
  const stored = await pg.query('SELECT "imageBytes", "imageMime" FROM "Recipe" WHERE id=$1', [id]);
  expect(stored.rows[0]).toEqual({ imageBytes: null, imageMime: null });
  expect((await image()).status).toBe(404);
  expect((await image()).headers.get('Cache-Control')).toBe('private, no-store');
  expect(renderToStaticMarkup(await RecipePage({ params: Promise.resolve({ id }) }))).toContain('No image');
});

it.each([
  new File(['invalid'], 'bad.gif', { type: 'image/gif' }),
  new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }),
])('rejects unsupported or oversized photos without changing the recipe', async image => {
  const id = await save(form('Validation '+image.name, 'Egg | 1 | Each'));
  const update = form('Validation '+image.name, 'Changed | 2 | Each', id);
  update.set('image', image);
  await expect(saveRecipe(update)).rejects.toThrow('no larger than 5 MB');
  expect((await recipe('restaurant', id, true))?.ingredients[0].name).toBe('Egg');
});

it('preserves both legacy preparation sections in one editor and saves long numbered methods losslessly', async () => {
  const data = form('Legacy method', '');
  data.set('beforeService', '1. Chop onions.\n2. Prepare stock.');
  data.set('onOrder', '1. Cook.\n2. Serve.');
  const id = await save(data);
  const { preparationMethod } = await import('@/lib/recipe-method');
  const combined = preparationMethod((await recipe('restaurant', id, true))!);
  expect(combined).toBe('Before Service\n1. Chop onions.\n2. Prepare stock.\n\nOn Order\n1. Cook.\n2. Serve.');
  const editor = renderToStaticMarkup(await RecipeEditor({ searchParams: Promise.resolve({ id }) }));
  expect(editor).toContain('name="method"');
  expect(editor).toContain(combined);
  expect(editor).not.toContain('name="onOrder"');
  const update = form('Legacy method', '', id);
  update.set('method', combined);
  await save(update);
  const saved = (await recipe('restaurant', id, true))!;
  expect(preparationMethod(saved)).toBe(combined);
  expect(saved.onOrder).toBe('');
  const long = combined + '\n3. ' + 'Instructions '.repeat(1000);
  update.set('method', long);
  await save(update);
  expect(preparationMethod((await recipe('restaurant', id, true))!)).toBe(long);
});

it('supports all search results, visibility, category management and confirmed deletion with view-only permissions', async () => {
  const { recipes, recipeTypes } = await import('@/lib/recipes');
  const { saveRecipeType, deleteRecipeType, deleteRecipe } = await import('@/app/(protected)/recipes/actions');
  const { default: RecipesPage } = await import('@/app/(protected)/recipes/page');
  const { GET } = await import('@/app/(protected)/recipes/[id]/image/route');
  for (let i = 0; i < 13; i++) await save(form(`Searchable ${i}`, ''));
  const list = renderToStaticMarkup(await RecipesPage({ searchParams: Promise.resolve({ q: 'Searchable', type: 'type' }) }));
  expect((list.match(/class="recipe-card"/g) ?? [])).toHaveLength(13);
  const id = await save(form('Hidden workflow', ''));
  const hide = form('Hidden workflow', '', id);
  hide.delete('visible');
  await save(hide);
  expect(await recipe('restaurant', id)).toBeNull();
  expect(await recipe('restaurant', id, true)).not.toBeNull();
  expect((await recipes('restaurant')).some(r => r.id === id)).toBe(false);
  const category = new FormData();
  category.set('name', 'Workflow category'); category.set('visible', 'on');
  await saveRecipeType(category);
  const type = (await recipeTypes('restaurant', true)).find(t => t.name === 'Workflow category')!;
  category.set('id', type.id); category.delete('visible');
  await saveRecipeType(category);
  const hiddenTypeRecipe = form('Hidden category recipe', ''); hiddenTypeRecipe.set('typeId', type.id);
  const hiddenId = await save(hiddenTypeRecipe);
  expect(await recipe('restaurant', hiddenId)).toBeNull();
  mocks.session.mockResolvedValue({ user: { restaurantId: 'restaurant', role: 'CHEF', active: true }, expiresAt: new Date(Date.now() + 60000) });
  for (const action of [saveRecipe, deleteRecipe, saveRecipeType, deleteRecipeType]) {
    await expect(action(hide)).rejects.toThrow('redirect:/dashboard');
  }
  await expect(RecipePage({ params: Promise.resolve({ id }) })).rejects.toThrow('not found');
  expect((await GET(new Request('http://localhost'), { params: Promise.resolve({ id: hiddenId }) })).status).toBe(404);
  const generalList = renderToStaticMarkup(await RecipesPage({ searchParams: Promise.resolve({}) }));
  expect(generalList).not.toContain('Hidden workflow');
  expect(generalList).not.toContain('Hidden category recipe');
  expect(generalList).not.toContain('ADD RECIPE');
  mocks.session.mockResolvedValue({ user: { restaurantId: 'restaurant', role: 'SUPER_USER', active: true }, expiresAt: new Date(Date.now() + 60000) });
  await deleteRecipe(hide);
  expect(await recipe('restaurant', id, true)).toBeNull();
  await deleteRecipeType(category);
  expect(await recipe('restaurant', hiddenId, true)).toBeNull();
  expect((await recipeTypes('restaurant', true)).some(t => t.id === type.id)).toBe(false);
});

it('requires confirmation before submitting recipe and category deletion', async () => {
  const { default: ConfirmDelete } = await import('@/app/(protected)/recipes/confirm-delete');
  const confirm = vi.fn().mockReturnValue(false);
  vi.stubGlobal('window', { confirm });
  try {
    const button = ConfirmDelete({ message: 'Delete this recipe?' });
    const event = { preventDefault: vi.fn() };
    button.props.onClick(event);
    expect(confirm).toHaveBeenCalledWith('Delete this recipe?');
    expect(event.preventDefault).toHaveBeenCalledOnce();
    confirm.mockReturnValue(true);
    event.preventDefault.mockClear();
    button.props.onClick(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

it('supports many simultaneous published specials, drafts, unpublishing and feature enable/disable without copying recipes', async () => {
  const { saveWeeklySpecial, removeWeeklySpecial, setWeeklySpecialsEnabled } = await import('@/app/(protected)/recipes/special-actions');
  const { weeklySpecials } = await import('@/lib/recipe-features');
  const { default: WeeklySpecials } = await import('@/app/(protected)/recipes/weekly-specials');
  const ids = await Promise.all([save(form('Special chicken', 'Chicken | 1 | Each')), save(form('Special fish', 'Fish | 1 | Each'))]);
  const draftId = await save(form('Draft dish', ''));
  const create = (recipeId: string, status = 'PUBLISHED') => { const data = new FormData(); data.set('recipeId', recipeId); data.set('status', status); return data; };
  for (let i = 0; i < 15; i++) await saveWeeklySpecial(create(ids[i % 2]));
  await saveWeeklySpecial(create(draftId, 'DRAFT'));
  expect((await weeklySpecials('restaurant')).specials).toHaveLength(0);
  const enabled = new FormData(); enabled.set('enabled', 'on');
  await setWeeklySpecialsEnabled(enabled);
  expect((await weeklySpecials('restaurant')).specials).toHaveLength(15);
  const staff = renderToStaticMarkup(await WeeklySpecials({ restaurantId: 'restaurant', admin: false }));
  expect((staff.match(/class="recipe-card"/g) ?? [])).toHaveLength(15);
  expect(staff).not.toContain('Draft dish');
  expect(staff).not.toContain('Publish');
  expect(staff).not.toContain('Manage Specials');
  const management = renderToStaticMarkup(await WeeklySpecials({ restaurantId: 'restaurant', admin: true }));
  expect(management).toContain('Save Draft'); expect(management).toContain('Unpublish');
  expect(management).toContain('Draft dish');
  const special = (await weeklySpecials('restaurant', true)).specials[0];
  const unpublish = create(special.recipeId, 'DRAFT'); unpublish.set('id', special.id);
  await saveWeeklySpecial(unpublish);
  expect((await weeklySpecials('restaurant')).specials).toHaveLength(14);
  await removeWeeklySpecial(unpublish);
  expect((await weeklySpecials('restaurant', true)).specials.some(s => s.id === special.id)).toBe(false);
  expect(await recipe('restaurant', special.recipeId, true)).not.toBeNull();
  await setWeeklySpecialsEnabled(new FormData());
  expect(await WeeklySpecials({ restaurantId: 'restaurant', admin: false })).toBeNull();
  expect((await weeklySpecials('restaurant', true)).specials).toHaveLength(15);
  const { default: RecipesPage } = await import('@/app/(protected)/recipes/page');
  mocks.session.mockResolvedValue({ user: { restaurantId: 'restaurant', role: 'CHEF', active: true }, expiresAt: new Date(Date.now() + 60000) });
  expect(renderToStaticMarkup(await RecipesPage({searchParams:Promise.resolve({})}))).toContain('Special chicken');
  expect((await pg.query('SELECT id FROM "Recipe" WHERE name IN (\'Special chicken\',\'Special fish\',\'Draft dish\')')).rows).toHaveLength(3);
});

it('uses inclusive calendar dates, supports open-ended specials, rejects invalid dates and handles London midnight/DST', async () => {
  const { saveWeeklySpecial, setWeeklySpecialsEnabled, specialFormAction } = await import('@/app/(protected)/recipes/special-actions');
  const { weeklySpecials } = await import('@/lib/recipe-features');
  const { londonToday } = await import('@/lib/dates');
  const id = await save(form('Scheduled special', ''));
  const data = new FormData(); data.set('recipeId', id); data.set('status', 'PUBLISHED');
  data.set('startDate', '2026-10-05'); data.set('endDate', '2026-10-11');
  const enable = new FormData(); enable.set('enabled', 'on'); await setWeeklySpecialsEnabled(enable);
  await saveWeeklySpecial(data);
  const included = async (day: string) => (await weeklySpecials('restaurant', false, day)).specials.some(s => s.recipeId === id);
  expect(await included('2026-10-04')).toBe(false);
  expect(await included('2026-10-05')).toBe(true);
  expect(await included('2026-10-11')).toBe(true);
  expect(await included('2026-10-12')).toBe(false);
  data.set('endDate', '2026-10-04');
  expect((await specialFormAction({error:''}, data)).error).toContain('End date');
  data.set('startDate', '2026-02-30'); data.delete('endDate');
  await expect(saveWeeklySpecial(data)).rejects.toThrow('valid start and end dates');
  data.delete('startDate'); data.set('endDate', '2026-10-11'); await saveWeeklySpecial(data);
  expect(await included('2026-09-01')).toBe(true);
  data.delete('endDate'); data.set('startDate', '2026-10-12'); await saveWeeklySpecial(data);
  expect(await included('2026-12-01')).toBe(true);
  expect(londonToday(new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-25');
  expect(londonToday(new Date('2026-10-25T23:30:00Z'))).toBe('2026-10-25');
});

it('links, reorders and removes reusable recipes and shows nested methods and component-specific allergens', async () => {
  const { componentLinks, recipeComponents } = await import('@/lib/recipe-features');
  const root = await save(form('Component dish', 'Chicken | 1 | Each'));
  const sauceData = form('Mushroom sauce', 'Cream | 100 | Ml'); sauceData.set('allergens', 'Milk'); sauceData.set('method', '1. Reduce sauce.');
  const sauce = await save(sauceData);
  const stockData = form('Chicken stock', 'Celery | 2 | Each'); stockData.set('allergens', 'Celery'); stockData.set('method', '1. Simmer stock.');
  const stock = await save(stockData), side = await save(form('Potato puree', 'Potato | 100 | g'));
  const link = (id: string, name: string, components: string[], ingredients = '') => { const data = form(name, ingredients, id); data.set('componentsIncluded', 'true'); components.forEach(value => data.append('componentIds', value)); return data; };
  const sauceUpdate = link(sauce, 'Mushroom sauce', [stock], 'Cream | 100 | Ml'); sauceUpdate.set('allergens', 'Milk'); sauceUpdate.set('method', '1. Reduce sauce.'); await save(sauceUpdate);
  await save(link(root, 'Component dish', [sauce, side], 'Chicken | 1 | Each'));
  const tree = await recipeComponents('restaurant', root);
  expect(tree.map(n => n.recipe.id)).toEqual([sauce, side]);
  expect(tree[0].children[0].recipe.id).toBe(stock);
  const detail = renderToStaticMarkup(await RecipePage({params:Promise.resolve({id:root})}));
  for (const content of ['Components &amp; Preparations', 'Mushroom sauce', 'Chicken stock', 'Allergens in Mushroom sauce:', 'Milk', 'Celery', '1. Reduce sauce.', '1. Simmer stock.']) expect(detail).toContain(content);
  expect((await recipe('restaurant', root, true))?.ingredients).toEqual([{name:'Chicken',quantity:'1',unit:'Each'}]);
  await save(link(root, 'Component dish', [side, sauce]));
  expect((await componentLinks('restaurant')).filter(l => l.recipeId === root).map(l => l.componentId)).toEqual([side, sauce]);
  await save(link(root, 'Component dish', [side]));
  expect((await recipeComponents('restaurant', root)).map(n => n.recipe.id)).toEqual([side]);
  expect(await recipe('restaurant', sauce, true)).not.toBeNull();
  await save(link(root, 'Component dish', []));
  expect(await recipeComponents('restaurant', root)).toEqual([]);
});

it('rejects self links, duplicate links, direct and indirect loops and rolls back invalid saves', async () => {
  const { recipeComponents } = await import('@/lib/recipe-features');
  const { recipeFormAction } = await import('@/app/(protected)/recipes/actions');
  const a = await save(form('Cycle A', 'Keep | 1 | Each')), b = await save(form('Cycle B', '')), c = await save(form('Cycle C', ''));
  const update = (id: string, name: string, links: string[]) => { const data = form(name, 'Changed | 2 | Each', id); data.set('componentsIncluded', 'true'); links.forEach(value=>data.append('componentIds', value)); return data; };
  expect((await recipeFormAction({error:''}, update(a, 'Cycle A', [a]))).error).toContain('itself');
  expect((await recipe('restaurant', a, true))?.ingredients[0].name).toBe('Keep');
  await expect(saveRecipe(update(a, 'Cycle A', [b, b]))).rejects.toThrow('only be added once');
  await save(update(a, 'Cycle A', [b]));
  await expect(saveRecipe(update(b, 'Cycle B', [a]))).rejects.toThrow('circular');
  await save(update(b, 'Cycle B', [c]));
  await expect(saveRecipe(update(c, 'Cycle C', [a]))).rejects.toThrow('circular');
  expect((await recipeComponents('restaurant', a))[0].children[0].recipe.id).toBe(c);
  expect(await recipeComponents('restaurant', c)).toEqual([]);
  const newRecipe = form('Invalid new component', ''); newRecipe.set('componentsIncluded', 'true'); newRecipe.append('componentIds', 'missing-id');
  await expect(saveRecipe(newRecipe)).rejects.toThrow('existing component recipes');
  expect((await pg.query('SELECT id FROM "Recipe" WHERE name=\'Invalid new component\'')).rows).toHaveLength(0);
});

it('enforces restaurant ownership in actions, database foreign keys and nested read access', async () => {
  const { saveWeeklySpecial, removeWeeklySpecial, setWeeklySpecialsEnabled } = await import('@/app/(protected)/recipes/special-actions');
  const { weeklySpecials, recipeComponents } = await import('@/lib/recipe-features');
  const root = await save(form('Owned parent', ''));
  await pg.exec(`INSERT INTO "Recipe"(id,"restaurantId","typeId",name,"updatedAt") VALUES('foreign-recipe','other','other-type','Foreign secret',now())`);
  const links = form('Owned parent', '', root); links.set('componentsIncluded', 'true'); links.append('componentIds', 'foreign-recipe');
  await expect(saveRecipe(links)).rejects.toThrow('your restaurant');
  const special = new FormData(); special.set('recipeId', 'foreign-recipe'); special.set('status', 'PUBLISHED');
  await expect(saveWeeklySpecial(special)).rejects.toThrow('your restaurant');
  await expect(pg.exec(`INSERT INTO "RecipeComponent"("restaurantId","recipeId","componentId") VALUES('restaurant','${root}','foreign-recipe')`)).rejects.toThrow('foreign key');
  await expect(pg.exec(`INSERT INTO "WeeklySpecial"(id,"restaurantId","recipeId","updatedAt") VALUES('bad-special','restaurant','foreign-recipe',now())`)).rejects.toThrow('foreign key');
  special.set('recipeId', root); await saveWeeklySpecial(special);
  const owned = (await weeklySpecials('restaurant', true)).specials.find(s=>s.recipeId===root)!;
  special.set('id', owned.id);
  mocks.session.mockResolvedValue({user:{restaurantId:'other',role:'SUPER_USER',active:true},expiresAt:new Date(Date.now()+60000)});
  special.set('recipeId', 'foreign-recipe');
  await expect(saveWeeklySpecial(special)).rejects.toThrow('unavailable');
  await removeWeeklySpecial(special);
  expect((await weeklySpecials('restaurant', true)).specials.some(s=>s.id===owned.id)).toBe(true);
  expect(await recipeComponents('other', root, true)).toEqual([]);
  const disable = new FormData(); await setWeeklySpecialsEnabled(disable);
  expect((await weeklySpecials('restaurant', true)).enabled).toBe(true);
});

it('keeps staff view-only and excludes hidden components and their descendants, including hidden categories', async () => {
  const { saveWeeklySpecial, removeWeeklySpecial, setWeeklySpecialsEnabled, specialFormAction } = await import('@/app/(protected)/recipes/special-actions');
  const { recipeComponents, weeklySpecials } = await import('@/lib/recipe-features');
  const root = await save(form('Staff main dish', ''));
  const hiddenData = form('Secret sauce', 'Hidden ingredient | 1 | Each'); hiddenData.delete('visible'); hiddenData.set('allergens', 'Hidden allergen');
  const hidden = await save(hiddenData), nested = await save(form('Secret branch stock', '')), visible = await save(form('Visible component', ''));
  const link = (id: string, name: string, ids: string[], isVisible = true) => { const data = form(name, '', id); if(!isVisible)data.delete('visible'); data.set('componentsIncluded','true');ids.forEach(value=>data.append('componentIds',value));return data; };
  await save(link(hidden,'Secret sauce',[nested],false)); await save(link(root,'Staff main dish',[hidden,visible]));
  const special = new FormData(); special.set('recipeId',hidden);special.set('status','PUBLISHED');
  await expect(saveWeeklySpecial(special)).rejects.toThrow('visible before publishing');
  special.set('status','DRAFT');await saveWeeklySpecial(special);
  expect((await weeklySpecials('restaurant',false)).specials.some(s=>s.recipeId===hidden)).toBe(false);
  expect((await recipeComponents('restaurant',root,true)).map(n=>n.recipe.id)).toEqual([hidden,visible]);
  mocks.session.mockResolvedValue({user:{restaurantId:'restaurant',role:'CHEF',active:true},expiresAt:new Date(Date.now()+60000)});
  for(const action of [saveRecipe,saveWeeklySpecial,removeWeeklySpecial,setWeeklySpecialsEnabled])await expect(action(special)).rejects.toThrow('redirect:/dashboard');
  await expect(specialFormAction({error:''},special)).rejects.toThrow('redirect:/dashboard');
  await expect(RecipeEditor({searchParams:Promise.resolve({id:root})})).rejects.toThrow('redirect:/dashboard');
  const detail = renderToStaticMarkup(await RecipePage({params:Promise.resolve({id:root})}));
  expect(detail).toContain('Visible component');
  for(const secret of ['Secret sauce','Hidden ingredient','Hidden allergen','Secret branch stock'])expect(detail).not.toContain(secret);
  await pg.exec(`UPDATE "RecipeType" SET visible=false WHERE id='type'`);
  expect(await recipeComponents('restaurant',root)).toEqual([]);
  expect((await weeklySpecials('restaurant')).specials).toHaveLength(0);
  await pg.exec(`UPDATE "RecipeType" SET visible=true WHERE id='type'`);
});

it('removes special and component references gracefully when a referenced recipe or category is deleted', async () => {
  const { deleteRecipe, deleteRecipeType } = await import('@/app/(protected)/recipes/actions');
  const { saveWeeklySpecial } = await import('@/app/(protected)/recipes/special-actions');
  const { recipeComponents, weeklySpecials, componentLinks } = await import('@/lib/recipe-features');
  const root = await save(form('Deletion parent', 'Keep parent | 1 | Each'));
  const component = await save(form('Deletion sauce', '')), child = await save(form('Deletion stock', ''));
  const link = (id: string,name:string,ids:string[])=>{const data=form(name,'',id);data.set('componentsIncluded','true');ids.forEach(value=>data.append('componentIds',value));return data;};
  await save(link(root,'Deletion parent',[component]));await save(link(component,'Deletion sauce',[child]));
  const special=new FormData();special.set('recipeId',component);special.set('status','PUBLISHED');await saveWeeklySpecial(special);
  const removal=new FormData();removal.set('id',component);await deleteRecipe(removal);
  expect(await recipeComponents('restaurant',root,true)).toEqual([]);
  expect((await weeklySpecials('restaurant',true)).specials.some(s=>s.recipeId===component)).toBe(false);
  expect((await componentLinks('restaurant')).some(l=>l.recipeId===component||l.componentId===component)).toBe(false);
  expect(await recipe('restaurant',root,true)).not.toBeNull();expect(await recipe('restaurant',child,true)).not.toBeNull();
  await pg.exec(`INSERT INTO "RecipeType"(id,"restaurantId",name,"updatedAt") VALUES('deletion-category','restaurant','Deletion category',now())`);
  const categoryRecipe=form('Category component','');categoryRecipe.set('typeId','deletion-category');const categoryId=await save(categoryRecipe);
  await save(link(root,'Deletion parent',[categoryId]));special.set('recipeId',categoryId);await saveWeeklySpecial(special);
  removal.set('id','deletion-category');await deleteRecipeType(removal);
  expect(await recipeComponents('restaurant',root,true)).toEqual([]);
  expect((await weeklySpecials('restaurant',true)).specials.some(s=>s.recipeId===categoryId)).toBe(false);
  expect(await recipe('restaurant',root,true)).not.toBeNull();
});

it('keeps graph edits atomic when opposing component changes are submitted together', async () => {
  const { componentLinks } = await import('@/lib/recipe-features');
  const a = await save(form('Concurrent A', '')), b = await save(form('Concurrent B', ''));
  const data = (id:string,name:string,component:string) => {const result=form(name,'',id);result.set('componentsIncluded','true');result.append('componentIds',component);return result;};
  const results = await Promise.allSettled([saveRecipe(data(a,'Concurrent A',b)), saveRecipe(data(b,'Concurrent B',a))]);
  const messages = results.map(result=>result.status==='rejected'?String(result.reason):'');
  expect(messages.filter(message=>message.includes('redirect:/recipes'))).toHaveLength(1);
  expect(messages.filter(message=>message.includes('circular recipe link'))).toHaveLength(1);
  expect((await componentLinks('restaurant')).filter(link=>link.recipeId===a||link.recipeId===b)).toHaveLength(1);
});

it('applies the additive migration without changing existing recipes, photo bytes, ingredients or instructions', async () => {
  const existing = new PGlite();
  try {
    await existing.exec('CREATE TABLE "Restaurant"(id TEXT PRIMARY KEY,name TEXT NOT NULL)');
    await existing.exec(readFileSync('prisma/migrations/20260926193000_add_recipes/migration.sql','utf8'));
    await existing.exec(`INSERT INTO "Restaurant"(id,name) VALUES('legacy','Legacy'); INSERT INTO "RecipeType"(id,"restaurantId",name,"updatedAt") VALUES('legacy-type','legacy','Sauces',now());
      INSERT INTO "Recipe"(id,"restaurantId","typeId",name,"imageMime","imageBytes",ingredients,"beforeService","onOrder","updatedAt") VALUES('legacy-recipe','legacy','legacy-type','Original sauce','image/png',decode('010203','hex'),'[{"name":"Cream","quantity":"100","unit":"Ml"}]','Prepare sauce','Heat sauce',now())`);
    const before = (await existing.query('SELECT * FROM "Recipe"')).rows;
    await existing.exec(readFileSync('prisma/migrations/20261012120000_recipe_specials_components/migration.sql','utf8'));
    expect((await existing.query('SELECT * FROM "Recipe"')).rows).toEqual(before);
    expect((await existing.query('SELECT * FROM "WeeklySpecial"')).rows).toEqual([]);
    expect((await existing.query('SELECT * FROM "RecipeComponent"')).rows).toEqual([]);
  } finally {await existing.close();}
}, 30000);
